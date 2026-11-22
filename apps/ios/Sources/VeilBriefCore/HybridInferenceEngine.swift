import Foundation
import FirebaseAILogic
import FirebaseAuth
import FirebaseCore
import FirebaseFirestore

public enum InferenceSourceLabel: String, Codable, Sendable {
    case onDevice = "on_device"
    case inCloud = "in_cloud"
    case localOnly = "local_shield_only"
}

public struct AuditRedFlag: Identifiable, Codable, Equatable, Sendable {
    public var id: String { "\(title)-\(severity)" }
    public let title: String
    public let severity: String
    public let explanation: String
}

public struct RecommendedEdit: Identifiable, Codable, Equatable, Sendable {
    public var id: String { title }
    public let title: String
    public let currentText: String
    public let suggestedText: String
    public let rationale: String
}

public struct ParsedAuditOutput: Codable, Equatable, Sendable {
    public let riskLevel: String
    public let summary: String
    public let redFlags: [AuditRedFlag]
    public let recommendedEdits: [RecommendedEdit]
}

public struct HybridAuditRunResult: Equatable, Sendable {
    public let route: ExecutionRoute
    public let inferenceSource: InferenceSourceLabel
    public let shield: ShieldResult
    public let output: ParsedAuditOutput
    public let rawWireText: String
    public let bytesSentOverWire: Int
    public let latencyMs: Int
    public let persistedAuditId: String?
}

public struct AuditHistoryEntry: Identifiable, Equatable, Sendable {
    public let id: String
    public let platform: String
    public let inferenceSource: String
    public let riskLevel: String
    public let entityCount: Int
    public let summaryRedFlagCount: Int
    public let createdAtDescription: String
}

public enum HybridInferenceError: Error, LocalizedError, Sendable {
    case firebaseNotConfigured
    case onDeviceUnavailable

    public var errorDescription: String? {
        switch self {
        case .firebaseNotConfigured:
            return "Firebase is not configured yet. Add GoogleService-Info.plist to run Firebase AI Logic."
        case .onDeviceUnavailable:
            return "On-device inference requires iOS 26 or macOS 26 and Apple Intelligence."
        }
    }
}

public enum HybridInferenceEngine {
    public static func runAudit(
        text: String,
        config: HybridRemoteConfig,
        requestedMode: InferenceModePolicy? = nil,
        isOffline: Bool = false,
        maskAmounts: Bool = false,
        persistToFirestore: Bool = true
    ) async throws -> HybridAuditRunResult {
        let startTime = Date()
        let shield = PIIShield.shield(text, options: ShieldOptions(maskAmounts: maskAmounts))

        try PIIShield.assertNoRawPii(scrubbed: shield.scrubbed, entities: shield.entities)

        let route = RoutingPolicy.selectExecutionRoute(
            config: config,
            context: RoutingContext(
                textLength: text.utf16.count,
                isOffline: isOffline,
                isPdfOrHeavy: false,
                requestedMode: requestedMode
            )
        )

        let wirePrompt = buildScrubbedPrompt(scrubbedText: shield.scrubbed)
        let bytesSent = wirePrompt.utf8.count

        guard FirebaseApp.app() != nil else {
            throw HybridInferenceError.firebaseNotConfigured
        }

        let ai = FirebaseAI.firebaseAI(backend: .googleAI())

        let candidates = route.mode == .onlyOnDevice
            ? [route.targetCloudModel]
            : RoutingPolicy.cloudModelCandidates(from: config, primary: route.targetCloudModel)

        var rawResponse = "{}"
        var detectedSource: InferenceSourceLabel = .inCloud
        var modelUsed = route.targetCloudModel
        let systemModelName = "apple-foundation-models-system-language-model"
        var lastError: Error? = nil

        for (index, cloudCandidate) in candidates.enumerated() {
            do {
                if #available(iOS 26.0, macOS 26.0, *), route.mode != .onlyInCloud {
                    let session: GenerativeModelSession
                    switch route.mode {
                    case .onlyOnDevice:
                        session = ai.generativeModelSession(model: .systemModel())
                    case .preferOnDevice:
                        session = ai.generativeModelSession(
                            model: .hybridModel(
                                primary: .systemModel(),
                                secondary: .geminiModel(name: cloudCandidate)
                            )
                        )
                    case .preferInCloud:
                        session = ai.generativeModelSession(
                            model: .hybridModel(
                                primary: .geminiModel(name: cloudCandidate),
                                secondary: .systemModel()
                            )
                        )
                    case .onlyInCloud:
                        session = ai.generativeModelSession(model: .geminiModel(name: cloudCandidate))
                    }
                    let response = try await session.respond(to: wirePrompt)
                    rawResponse = response.content
                    let reportedModel = response.rawResponse.modelVersion
                    detectedSource = route.mode == .onlyOnDevice || reportedModel == systemModelName ? .onDevice : .inCloud
                    modelUsed = detectedSource == .onDevice ? systemModelName : cloudCandidate
                } else {
                    guard route.mode != .onlyOnDevice else {
                        throw HybridInferenceError.onDeviceUnavailable
                    }
                    let model = ai.generativeModel(modelName: cloudCandidate)
                    let response = try await model.generateContent(wirePrompt)
                    rawResponse = response.text ?? "{}"
                    detectedSource = .inCloud
                    modelUsed = cloudCandidate
                }
                lastError = nil
                break
            } catch {
                lastError = error
                let hasNext = index + 1 < candidates.count
                if !hasNext || route.mode == .onlyOnDevice || !isTransientCloudError(error) {
                    throw error
                }
            }
        }

        if let lastError {
            throw lastError
        }

        let parsed = parseAuditResponse(from: rawResponse)
        let riskLevel = parsed.riskLevel.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let scrubbedOutput = ParsedAuditOutput(
            riskLevel: ["low", "medium", "high", "critical"].contains(riskLevel) ? riskLevel : "medium",
            summary: parsed.summary,
            redFlags: parsed.redFlags,
            recommendedEdits: parsed.recommendedEdits
        )
        let rehydratedOutput = rehydrateAudit(scrubbedOutput, tokenMap: shield.tokenMap)
        let latencyMs = Int(Date().timeIntervalSince(startTime) * 1000)

        var auditId: String? = nil
        if persistToFirestore && !isOffline {
            auditId = await persistScrubbedAudit(
                inferenceSource: detectedSource,
                modelUsed: modelUsed,
                latencyMs: latencyMs,
                shield: shield,
                scrubbedOutput: scrubbedOutput
            )
        }

        return HybridAuditRunResult(
            route: route,
            inferenceSource: detectedSource,
            shield: shield,
            output: rehydratedOutput,
            rawWireText: wirePrompt,
            bytesSentOverWire: detectedSource == .inCloud ? bytesSent : 0,
            latencyMs: latencyMs,
            persistedAuditId: auditId
        )
    }

    public static func fetchRecentAudits() async -> [AuditHistoryEntry] {
        guard FirebaseApp.app() != nil, let uid = Auth.auth().currentUser?.uid else {
            return []
        }

        do {
            let snapshot = try await Firestore.firestore()
                .collection("users")
                .document(uid)
                .collection("audits")
                .order(by: "createdAt", descending: true)
                .limit(to: 15)
                .getDocuments()

            return snapshot.documents.map { doc in
                let data = doc.data()
                let pii = data["pii"] as? [String: Any]
                let flags = data["redFlags"] as? [[String: Any]] ?? []
                let timestamp = (data["createdAt"] as? Timestamp)?.dateValue()
                let formatter = RelativeDateTimeFormatter()
                let when = timestamp.map { formatter.localizedString(for: $0, relativeTo: Date()) } ?? "Just now"

                return AuditHistoryEntry(
                    id: doc.documentID,
                    platform: (data["platform"] as? String) ?? "unknown",
                    inferenceSource: (data["inferenceSource"] as? String) ?? "unknown",
                    riskLevel: (data["riskLevel"] as? String) ?? "medium",
                    entityCount: (data["piiEntitiesCount"] as? Int) ?? (pii?["entityCount"] as? Int) ?? 0,
                    summaryRedFlagCount: flags.count,
                    createdAtDescription: when
                )
            }
        } catch {
            return []
        }
    }

    private static func isTransientCloudError(_ error: Error) -> Bool {
        let lower = error.localizedDescription.lowercased()
        return lower.contains("500") ||
            lower.contains("503") ||
            lower.contains("429") ||
            lower.contains("high demand") ||
            lower.contains("overloaded") ||
            lower.contains("unavailable")
    }

    private static func buildScrubbedPrompt(scrubbedText: String) -> String {
        """
        You are a careful contract and invoice auditor. Treat bracketed placeholders like [PERSON_1], [EMAIL_1], [PHONE_1], [TAX_ID_1], [ACCOUNT_1], [ADDRESS_1] as opaque tokens and keep them unchanged in any quote.
        Return ONLY valid JSON with keys:
        - "riskLevel": one of "low", "medium", "high", "critical"
        - "summary": 1-2 sentences summarizing findings without inventing personal identifiers
        - "redFlags": array of { "title", "severity", "explanation" }
        - "recommendedEdits": array of { "title", "currentText", "suggestedText", "rationale" }

        DOCUMENT:
        \(scrubbedText)
        """
    }

    private static func parseAuditResponse(from raw: String) -> ParsedAuditOutput {
        let cleaned = raw
            .replacingOccurrences(of: "```json", with: "")
            .replacingOccurrences(of: "```", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if let data = cleaned.data(using: .utf8),
           let decoded = try? JSONDecoder().decode(ParsedAuditOutput.self, from: data) {
            return decoded
        }

        if let start = cleaned.firstIndex(of: "{"),
           let end = cleaned.lastIndex(of: "}"),
           let data = String(cleaned[start...end]).data(using: .utf8),
           let decoded = try? JSONDecoder().decode(ParsedAuditOutput.self, from: data) {
            return decoded
        }

        return ParsedAuditOutput(
            riskLevel: "medium",
            summary: cleaned.isEmpty ? "Completed audit." : cleaned,
            redFlags: [],
            recommendedEdits: []
        )
    }

    private static func rehydrateAudit(_ output: ParsedAuditOutput, tokenMap: [String: String]) -> ParsedAuditOutput {
        ParsedAuditOutput(
            riskLevel: output.riskLevel,
            summary: PIIShield.rehydrate(output.summary, tokenMap: tokenMap),
            redFlags: output.redFlags.map { flag in
                AuditRedFlag(
                    title: PIIShield.rehydrate(flag.title, tokenMap: tokenMap),
                    severity: flag.severity,
                    explanation: PIIShield.rehydrate(flag.explanation, tokenMap: tokenMap)
                )
            },
            recommendedEdits: output.recommendedEdits.map { edit in
                RecommendedEdit(
                    title: PIIShield.rehydrate(edit.title, tokenMap: tokenMap),
                    currentText: PIIShield.rehydrate(edit.currentText, tokenMap: tokenMap),
                    suggestedText: PIIShield.rehydrate(edit.suggestedText, tokenMap: tokenMap),
                    rationale: PIIShield.rehydrate(edit.rationale, tokenMap: tokenMap)
                )
            }
        )
    }

    private static func persistScrubbedAudit(
        inferenceSource: InferenceSourceLabel,
        modelUsed: String,
        latencyMs: Int,
        shield: ShieldResult,
        scrubbedOutput: ParsedAuditOutput
    ) async -> String? {
        guard let uid = Auth.auth().currentUser?.uid else { return nil }

        let originals = Set(shield.entities.map(\.original)).sorted { $0.count > $1.count }
        func sanitize(_ value: String) -> String {
            var safe = value
            for original in originals {
                safe = safe.replacingOccurrences(of: original, with: "[REDACTED]", options: .caseInsensitive)
            }
            return PIIShield.redactTokens(in: PIIShield.shield(safe).scrubbed)
        }

        let safeFlags = scrubbedOutput.redFlags.map { flag in
            [
                "title": sanitize(flag.title),
                "severity": sanitize(flag.severity),
                "explanation": sanitize(flag.explanation),
            ]
        }

        #if os(macOS)
        let platform = "macos"
        #else
        let platform = "ios"
        #endif

        let payload: [String: Any] = [
            "platform": platform,
            "inferenceSource": inferenceSource.rawValue,
            "modelUsed": modelUsed,
            "riskLevel": scrubbedOutput.riskLevel,
            "summary": sanitize(scrubbedOutput.summary),
            "redFlags": safeFlags,
            "piiEntitiesCount": shield.entities.count,
            "latencyMs": latencyMs,
            "createdAt": FieldValue.serverTimestamp(),
        ]

        do {
            let ref = try await Firestore.firestore()
                .collection("users")
                .document(uid)
                .collection("audits")
                .addDocument(data: payload)
            return ref.documentID
        } catch {
            return nil
        }
    }
}
