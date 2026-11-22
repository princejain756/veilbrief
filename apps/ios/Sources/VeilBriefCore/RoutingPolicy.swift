import Foundation

public enum InferenceModePolicy: String, Codable, CaseIterable, Sendable, Identifiable {
    case preferOnDevice = "prefer_on_device"
    case onlyOnDevice = "only_on_device"
    case preferInCloud = "prefer_in_cloud"
    case onlyInCloud = "only_in_cloud"

    public var id: String { rawValue }

    public var displayLabel: String {
        switch self {
        case .preferOnDevice: return "Prefer on-device"
        case .onlyOnDevice: return "On-device only"
        case .preferInCloud: return "Prefer cloud"
        case .onlyInCloud: return "Cloud only"
        }
    }
}

public enum RoutingReason: String, Codable, Sendable {
    case offlineOnlyOnDevice = "offline_only_on_device"
    case shortDocPreferOnDevice = "short_doc_prefer_on_device"
    case longDocCloudScrubbed = "long_doc_cloud_scrubbed"
    case pdfOrHeavyFallbackScrubbed = "pdf_or_heavy_fallback_scrubbed"
    case explicitOverride = "explicit_override"
}

public struct HybridRemoteConfig: Equatable, Codable, Sendable {
    public var cloudModelName: String
    public var cloudFallbackModel: String
    public var defaultInferenceMode: InferenceModePolicy
    public var maxOnDeviceChars: Int
    public var enforceLocalPiiShield: Bool

    public static let `default` = HybridRemoteConfig(
        cloudModelName: "gemini-3.5-flash-lite",
        cloudFallbackModel: "gemini-3.8-flash",
        defaultInferenceMode: .preferOnDevice,
        maxOnDeviceChars: 12_000,
        enforceLocalPiiShield: true
    )

    public init(
        cloudModelName: String,
        cloudFallbackModel: String,
        defaultInferenceMode: InferenceModePolicy,
        maxOnDeviceChars: Int,
        enforceLocalPiiShield: Bool
    ) {
        self.cloudModelName = cloudModelName
        self.cloudFallbackModel = cloudFallbackModel
        self.defaultInferenceMode = defaultInferenceMode
        self.maxOnDeviceChars = maxOnDeviceChars
        self.enforceLocalPiiShield = enforceLocalPiiShield
    }
}

public struct ExecutionRoute: Equatable, Sendable {
    public let mode: InferenceModePolicy
    public let targetCloudModel: String
    public let mustScrubForCloud: Bool
    public let reason: RoutingReason
}

public struct RoutingContext: Sendable {
    public let textLength: Int
    public let estimatedTokens: Int?
    public let isOffline: Bool
    public let isPdfOrHeavy: Bool
    public let requestedMode: InferenceModePolicy?

    public init(
        textLength: Int,
        estimatedTokens: Int? = nil,
        isOffline: Bool = false,
        isPdfOrHeavy: Bool = false,
        requestedMode: InferenceModePolicy? = nil
    ) {
        self.textLength = textLength
        self.estimatedTokens = estimatedTokens
        self.isOffline = isOffline
        self.isPdfOrHeavy = isPdfOrHeavy
        self.requestedMode = requestedMode
    }
}

public enum RoutingPolicy {
    public static let onDeviceTokenLimit = 9_216
    public static func estimateDocumentTokens(_ textLength: Int) -> Int {
        max(1, Int(ceil(Double(textLength) / 4.0)))
    }

    public static func isSupportedCloudModel(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed == "gemini-3.5-flash-lite" ||
            trimmed == "gemini-3.8-flash" ||
            trimmed == "gemini-4-hydrogen"
    }

    public static func cloudModelCandidates(from config: HybridRemoteConfig, primary: String) -> [String] {
        var unique: [String] = []
        for candidate in [
            primary,
            config.cloudFallbackModel,
            HybridRemoteConfig.default.cloudModelName,
            HybridRemoteConfig.default.cloudFallbackModel,
            "gemini-4-hydrogen",
        ] {
            let trimmed = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
            if isSupportedCloudModel(trimmed) && !unique.contains(trimmed) {
                unique.append(trimmed)
            }
        }
        return unique
    }

    public static func resolvedCloudModel(from config: HybridRemoteConfig, fallback: Bool = false) -> String {
        let candidate = fallback ? config.cloudFallbackModel : config.cloudModelName
        if isSupportedCloudModel(candidate) {
            return candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return fallback
            ? HybridRemoteConfig.default.cloudFallbackModel
            : HybridRemoteConfig.default.cloudModelName
    }

    public static func selectExecutionRoute(
        config: HybridRemoteConfig,
        context: RoutingContext
    ) -> ExecutionRoute {
        let shieldRequired = config.enforceLocalPiiShield

        if context.isOffline {
            return ExecutionRoute(
                mode: .onlyOnDevice,
                targetCloudModel: resolvedCloudModel(from: config),
                mustScrubForCloud: false,
                reason: .offlineOnlyOnDevice
            )
        }

        if let override = context.requestedMode {
            let requiresCloud = override != .onlyOnDevice
            return ExecutionRoute(
                mode: override,
                targetCloudModel: resolvedCloudModel(from: config),
                mustScrubForCloud: requiresCloud && shieldRequired,
                reason: .explicitOverride
            )
        }

        switch config.defaultInferenceMode {
        case .onlyOnDevice:
            return ExecutionRoute(
                mode: .onlyOnDevice,
                targetCloudModel: resolvedCloudModel(from: config),
                mustScrubForCloud: false,
                reason: .explicitOverride
            )
        case .onlyInCloud, .preferInCloud:
            return ExecutionRoute(
                mode: config.defaultInferenceMode,
                targetCloudModel: resolvedCloudModel(from: config),
                mustScrubForCloud: shieldRequired,
                reason: .explicitOverride
            )
        case .preferOnDevice:
            break
        }

        if context.isPdfOrHeavy {
            return ExecutionRoute(
                mode: .preferInCloud,
                targetCloudModel: resolvedCloudModel(from: config, fallback: true),
                mustScrubForCloud: shieldRequired,
                reason: .pdfOrHeavyFallbackScrubbed
            )
        }

        let estimated = context.estimatedTokens ?? estimateDocumentTokens(context.textLength)
        if context.textLength > config.maxOnDeviceChars || estimated > onDeviceTokenLimit {
            return ExecutionRoute(
                mode: .preferInCloud,
                targetCloudModel: resolvedCloudModel(from: config),
                mustScrubForCloud: shieldRequired,
                reason: .longDocCloudScrubbed
            )
        }

        return ExecutionRoute(
            mode: .preferOnDevice,
            targetCloudModel: resolvedCloudModel(from: config),
            mustScrubForCloud: shieldRequired,
            reason: .shortDocPreferOnDevice
        )
    }
}
