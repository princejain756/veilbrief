// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "VeilBrief",
    platforms: [
        .iOS(.v18),
        .macOS(.v15),
    ],
    products: [
        .library(
            name: "VeilBriefCore",
            targets: ["VeilBriefCore"]
        ),
        .executable(
            name: "VeilBriefApp",
            targets: ["VeilBriefApp"]
        ),
    ],
    dependencies: [
        .package(
            url: "https://github.com/firebase/firebase-ios-sdk.git",
            from: "12.13.0"
        ),
    ],
    targets: [
        .target(
            name: "VeilBriefCore",
            dependencies: [
                .product(name: "FirebaseAILogic", package: "firebase-ios-sdk"),
                .product(name: "FirebaseAppCheck", package: "firebase-ios-sdk"),
                .product(name: "FirebaseAuth", package: "firebase-ios-sdk"),
                .product(name: "FirebaseCore", package: "firebase-ios-sdk"),
                .product(name: "FirebaseFirestore", package: "firebase-ios-sdk"),
                .product(name: "FirebaseRemoteConfig", package: "firebase-ios-sdk"),
            ],
            path: "Sources/VeilBriefCore"
        ),
        .executableTarget(
            name: "VeilBriefApp",
            dependencies: [
                "VeilBriefCore",
                .product(name: "FirebaseAppCheck", package: "firebase-ios-sdk"),
                .product(name: "FirebaseCore", package: "firebase-ios-sdk"),
            ],
            path: "Sources/VeilBriefApp"
        ),
        .testTarget(
            name: "VeilBriefCoreTests",
            dependencies: ["VeilBriefCore"],
            path: "Tests/VeilBriefCoreTests"
        ),
    ]
)
