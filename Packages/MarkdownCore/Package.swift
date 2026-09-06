// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "MarkdownCore",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "MarkdownCore", targets: ["MarkdownCore"])
    ],
    targets: [
        .target(name: "MarkdownCore")
    ]
)
