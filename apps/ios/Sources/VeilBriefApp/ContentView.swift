import SwiftUI
import VeilBriefCore

struct ContentView: View {
    @EnvironmentObject private var bootstrap: FirebaseBootstrap

    @State private var selectedScenarioId: String = SampleLibrary.all.first?.id ?? "freelance-msa"
    @State private var inputText: String = SampleLibrary.all.first?.text ?? ""
    @State private var selectedMode: InferenceModePolicy = .preferOnDevice
    @State private var isOfflineMode: Bool = false
    @State private var maskAmounts: Bool = false
    @State private var showRedactedView: Bool = true
    @State private var isRunning: Bool = false
    @State private var errorMessage: String? = nil
    @State private var lastResult: HybridAuditRunResult? = nil
    @State private var auditHistory: [AuditHistoryEntry] = []

    private var liveShield: ShieldResult {
        PIIShield.shield(inputText, options: ShieldOptions(maskAmounts: maskAmounts))
    }

    private var activeRoute: ExecutionRoute {
        RoutingPolicy.selectExecutionRoute(
            config: bootstrap.config,
            context: RoutingContext(
                textLength: liveShield.scrubbed.count,
                isOffline: isOfflineMode,
                requestedMode: selectedMode
            )
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    statusHeader
                    kpiStrip
                    controlsSection
                    documentEditorSection
                    if let result = lastResult {
                        findingsSection(result)
                    }
                    historySection
                }
                .padding(16)
            }
            .navigationTitle("VeilBrief")
            .task {
                auditHistory = await HybridInferenceEngine.fetchRecentAudits()
            }
        }
    }

    private var statusHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                badge("Local PII Shield: \(liveShield.entities.count) tokens", tint: .green)
                badge(
                    isOfflineMode ? "Offline only on-device" : selectedMode.displayLabel,
                    tint: activeRoute.mode == .onlyOnDevice || activeRoute.mode == .preferOnDevice ? .teal : .blue
                )
                badge(firebaseStatusText, tint: bootstrap.isConfigured ? .green : .orange)
            }

            if !bootstrap.warnings.isEmpty {
                Text(bootstrap.warnings.joined(separator: " "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }

    private var kpiStrip: some View {
        LazyVGrid(
            columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())],
            spacing: 12
        ) {
            metricCard(
                label: "PII Tokens Replaced",
                value: "\(liveShield.entities.count)"
            )
            metricCard(
                label: "Raw Wire Bytes",
                value: activeRoute.mode == .onlyOnDevice ? "0 B" : "\(lastResult?.bytesSentOverWire ?? 0) B"
            )
            metricCard(
                label: "Last Latency",
                value: lastResult.map { "\($0.latencyMs) ms" } ?? "Ready"
            )
        }
    }

    private var controlsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(SampleLibrary.all) { sample in
                        Button(sample.title) {
                            selectedScenarioId = sample.id
                            inputText = sample.text
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(selectedScenarioId == sample.id ? .green : .secondary)
                    }
                }
            }

            HStack(spacing: 12) {
                Picker("Route", selection: $selectedMode) {
                    ForEach(InferenceModePolicy.allCases) { mode in
                        Text(mode.displayLabel).tag(mode)
                    }
                }
                .pickerStyle(.menu)

                Toggle("Offline", isOn: $isOfflineMode)
                Toggle("Mask amounts", isOn: $maskAmounts)
            }

            HStack(spacing: 12) {
                Button {
                    Task { await runAudit() }
                } label: {
                    if isRunning {
                        ProgressView()
                    } else {
                        Text("Run Hybrid Audit")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isRunning || inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                Picker("Preview", selection: $showRedactedView) {
                    Text("Redacted").tag(true)
                    Text("Original").tag(false)
                }
                .pickerStyle(.segmented)
            }
        }
        .padding(12)
        .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 12))
    }

    private var documentEditorSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(showRedactedView ? "Wire Payload Preview (Zero Raw PII)" : "Local Input Document")
                    .font(.headline)
                Spacer()
                Text("Cloud model: \(activeRoute.targetCloudModel)")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
            }

            if showRedactedView {
                ScrollView {
                    Text(liveShield.scrubbed)
                        .font(.system(.caption, design: .monospaced))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                }
                .frame(minHeight: 160, maxHeight: 240)
                .background(.background, in: RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(.separator, lineWidth: 1)
                )
            } else {
                TextEditor(text: $inputText)
                    .font(.system(.caption, design: .monospaced))
                    .frame(minHeight: 160, maxHeight: 240)
                    .padding(6)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(.separator, lineWidth: 1)
                    )
            }
        }
    }

    private func findingsSection(_ result: HybridAuditRunResult) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Audit Findings (\(result.output.riskLevel.uppercased()))")
                    .font(.headline)
                Spacer()
                badge("Source: \(result.inferenceSource.rawValue)", tint: .green)
            }

            Text(result.output.summary)
                .font(.subheadline)

            ForEach(result.output.redFlags) { flag in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(flag.title)
                            .font(.subheadline.bold())
                        Spacer()
                        Text(flag.severity)
                            .font(.caption.monospaced())
                    }
                    Text(flag.explanation)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(10)
                .background(.quaternary.opacity(0.3), in: RoundedRectangle(cornerRadius: 10))
            }
        }
        .padding(12)
        .background(.quaternary.opacity(0.25), in: RoundedRectangle(cornerRadius: 12))
    }

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Cross-Platform Scrubbed Audits")
                    .font(.headline)
                Spacer()
                Button("Refresh") {
                    Task {
                        auditHistory = await HybridInferenceEngine.fetchRecentAudits()
                    }
                }
                .font(.caption)
            }

            if auditHistory.isEmpty {
                Text("No persisted audit metadata yet. Only anonymized counts and red-flag labels sync to Firestore.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(auditHistory) { entry in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(entry.platform.uppercased()) | \(entry.inferenceSource)")
                                .font(.caption.monospaced())
                            Text("\(entry.summaryRedFlagCount) flags, \(entry.entityCount) PII tokens masked")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(entry.riskLevel.uppercased())
                            .font(.caption2.monospaced())
                    }
                    .padding(8)
                    .background(.quaternary.opacity(0.2), in: RoundedRectangle(cornerRadius: 8))
                }
            }
        }
    }

    private var firebaseStatusText: String {
        switch bootstrap.state {
        case .ready: return "App Check + Auth Ready"
        case .configuring: return "Connecting Firebase"
        case .unconfigured: return "Offline Local Mode"
        case .failed: return "Setup Error"
        }
    }

    private func badge(_ title: String, tint: Color) -> some View {
        Text(title)
            .font(.caption2.monospaced())
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tint.opacity(0.16), in: Capsule())
    }

    private func metricCard(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.headline.monospacedDigit())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(.quaternary.opacity(0.3), in: RoundedRectangle(cornerRadius: 10))
    }

    private func runAudit() async {
        isRunning = true
        errorMessage = nil
        defer { isRunning = false }

        do {
            let result = try await HybridInferenceEngine.runAudit(
                text: inputText,
                config: bootstrap.config,
                requestedMode: selectedMode,
                isOffline: isOfflineMode,
                maskAmounts: maskAmounts
            )
            lastResult = result
            auditHistory = await HybridInferenceEngine.fetchRecentAudits()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
