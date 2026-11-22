import SwiftUI
import VeilBriefCore

@main
struct VeilBriefApp: App {
    @StateObject private var bootstrap = FirebaseBootstrap.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(bootstrap)
                .task {
                    await bootstrap.configureIfPossible()
                }
        }
    }
}
