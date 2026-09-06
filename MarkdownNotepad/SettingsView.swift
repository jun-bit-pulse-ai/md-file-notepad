import SwiftUI

struct SettingsView: View {
    @AppStorage(SettingsKey.editorFontSize) private var editorFontSize = 14.0
    @AppStorage(SettingsKey.previewFontSize) private var previewFontSize = 15.0
    @AppStorage(SettingsKey.defaultViewMode) private var defaultViewMode = ViewMode.split.rawValue
    @AppStorage(SettingsKey.showStatusBar) private var showStatusBar = true

    var body: some View {
        Form {
            Section("Appearance") {
                LabeledContent("Editor text size") {
                    Stepper(value: $editorFontSize, in: AppSettings.fontSizeRange, step: 1) {
                        Text("\(Int(editorFontSize)) pt")
                            .monospacedDigit()
                    }
                }
                LabeledContent("Preview text size") {
                    Stepper(value: $previewFontSize, in: AppSettings.fontSizeRange, step: 1) {
                        Text("\(Int(previewFontSize)) pt")
                            .monospacedDigit()
                    }
                }
            }

            Section("Layout") {
                Picker("New windows open in", selection: $defaultViewMode) {
                    ForEach(ViewMode.allCases) { mode in
                        Text(mode.title).tag(mode.rawValue)
                    }
                }
                Toggle("Show status bar", isOn: $showStatusBar)
            }
        }
        .formStyle(.grouped)
        .frame(width: 420)
        .scenePadding()
    }
}

#Preview {
    SettingsView()
}
