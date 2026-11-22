import Combine
import Foundation
import FirebaseAppCheck
import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import FirebaseRemoteConfig

public enum FirebaseBootstrapState: Equatable, Sendable {
    case unconfigured(reason: String)
    case configuring
    case ready(uid: String?)
    case failed(message: String)
}

@MainActor
public final class FirebaseBootstrap: ObservableObject {
    public static let shared = FirebaseBootstrap()

    @Published public private(set) var state: FirebaseBootstrapState = .unconfigured(reason: "Not started")
    @Published public private(set) var config: HybridRemoteConfig = .default
    @Published public private(set) var warnings: [String] = []
    @Published public private(set) var isConfigured: Bool = false

    private init() {}

    public func configureIfPossible() async {
        guard !isConfigured else { return }

        if FirebaseApp.app() == nil {
            let localPath = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
                .appendingPathComponent("VeilBrief/GoogleService-Info.plist").path
            let plistPath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") ?? localPath
            guard let options = FirebaseOptions(contentsOfFile: plistPath) else {
                state = .unconfigured(reason: "GoogleService-Info.plist missing or invalid")
                warnings = ["Add your GoogleService-Info.plist to enable Firebase services."]
                return
            }

            #if DEBUG
            AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
            #endif
            FirebaseApp.configure(options: options)
        }

        state = .configuring

        isConfigured = true

        var resolvedUid: String? = Auth.auth().currentUser?.uid
        if resolvedUid == nil {
            do {
                let authResult = try await Auth.auth().signInAnonymously()
                resolvedUid = authResult.user.uid
            } catch {
                warnings.append("Anonymous sign-in unavailable: \(error.localizedDescription)")
            }
        }

        await refreshRemoteConfig()
        state = .ready(uid: resolvedUid)
    }

    public func refreshRemoteConfig() async {
        guard FirebaseApp.app() != nil else { return }
        let remoteConfig = RemoteConfig.remoteConfig()
        let settings = RemoteConfigSettings()
        settings.minimumFetchInterval = 0
        remoteConfig.configSettings = settings

        remoteConfig.setDefaults([
            "cloud_model_name": HybridRemoteConfig.default.cloudModelName as NSString,
            "cloud_fallback_model": HybridRemoteConfig.default.cloudFallbackModel as NSString,
            "default_inference_mode": HybridRemoteConfig.default.defaultInferenceMode.rawValue as NSString,
            "max_on_device_chars": NSNumber(value: HybridRemoteConfig.default.maxOnDeviceChars),
            "enforce_local_pii_shield": NSNumber(value: HybridRemoteConfig.default.enforceLocalPiiShield),
        ])

        do {
            _ = try await remoteConfig.fetchAndActivate()
        } catch {
            warnings.append("Using local Remote Config defaults: \(error.localizedDescription)")
        }

        let cloudModel = remoteConfig.configValue(forKey: "cloud_model_name").stringValue
        let fallbackModel = remoteConfig.configValue(forKey: "cloud_fallback_model").stringValue
        let modeRaw = remoteConfig.configValue(forKey: "default_inference_mode").stringValue
        let maxChars = remoteConfig.configValue(forKey: "max_on_device_chars").numberValue.intValue
        let enforceShield = remoteConfig.configValue(forKey: "enforce_local_pii_shield").boolValue

        config = HybridRemoteConfig(
            cloudModelName: RoutingPolicy.isSupportedCloudModel(cloudModel) ? cloudModel : HybridRemoteConfig.default.cloudModelName,
            cloudFallbackModel: RoutingPolicy.isSupportedCloudModel(fallbackModel) ? fallbackModel : HybridRemoteConfig.default.cloudFallbackModel,
            defaultInferenceMode: InferenceModePolicy(rawValue: modeRaw) ?? HybridRemoteConfig.default.defaultInferenceMode,
            maxOnDeviceChars: maxChars > 0 ? maxChars : HybridRemoteConfig.default.maxOnDeviceChars,
            enforceLocalPiiShield: enforceShield
        )
    }
}
