import SwiftUI

@main
struct MarkdownNotepadApp: App {
    init() {
        AppSettings.registerDefaults()
    }

    var body: some Scene {
        DocumentGroup(newDocument: MarkdownDocument()) { file in
            ContentView(document: file.$document)
        }
        .commands {
            MarkdownCommands()
        }

        Settings {
            SettingsView()
        }
    }
}
