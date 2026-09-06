import SwiftUI

enum ViewMode: String, CaseIterable, Identifiable {
    case editor, split, preview

    var id: Self { self }

    var title: String {
        switch self {
        case .editor: "Editor"
        case .split: "Split"
        case .preview: "Preview"
        }
    }

    var symbol: String {
        switch self {
        case .editor: "square.lefthalf.filled"
        case .split: "rectangle.split.2x1"
        case .preview: "doc.richtext"
        }
    }
}

enum SettingsKey {
    static let editorFontSize = "editorFontSize"
    static let previewFontSize = "previewFontSize"
    static let defaultViewMode = "defaultViewMode"
    static let showStatusBar = "showStatusBar"
}

/// Shared defaults, kept in one place so the Settings scene and the editor
/// cannot drift apart on key names or fallbacks.
enum AppSettings {
    static let fontSizeRange: ClosedRange<Double> = 9...32

    static func registerDefaults() {
        UserDefaults.standard.register(defaults: [
            SettingsKey.editorFontSize: 14.0,
            SettingsKey.previewFontSize: 15.0,
            SettingsKey.defaultViewMode: ViewMode.split.rawValue,
            SettingsKey.showStatusBar: true,
        ])
    }
}
