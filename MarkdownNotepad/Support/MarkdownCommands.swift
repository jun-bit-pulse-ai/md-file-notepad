import MarkdownCore
import SwiftUI

struct MarkdownCommands: Commands {
    @FocusedValue(\.editorCommandAction) private var format
    @FocusedValue(\.viewModeSelection) private var viewMode

    var body: some Commands {
        CommandMenu("Format") {
            button(.bold, key: "b")
            button(.italic, key: "i")
            button(.strikethrough, key: "u", modifiers: [.command, .shift])
            button(.inlineCode, key: "e", modifiers: [.command, .control])
            button(.link, key: "k")

            Divider()

            button(.heading1, key: "1", modifiers: [.command, .control])
            button(.heading2, key: "2", modifiers: [.command, .control])
            button(.heading3, key: "3", modifiers: [.command, .control])

            Divider()

            button(.bulletList, key: "l", modifiers: [.command, .shift])
            button(.numberedList, key: "l", modifiers: [.command, .control])
            button(.taskList, key: "t", modifiers: [.command, .shift])
            button(.quote, key: "'", modifiers: [.command, .shift])
            button(.codeBlock, key: "e", modifiers: [.command, .shift])
            button(.horizontalRule, key: "-", modifiers: [.command, .shift])
        }

        CommandGroup(after: .toolbar) {
            Picker("View Mode", selection: viewModeBinding) {
                ForEach(ViewMode.allCases) { mode in
                    Text(mode.title).tag(mode)
                }
            }
            .pickerStyle(.inline)
            .disabled(viewMode == nil)
        }
    }

    private var viewModeBinding: Binding<ViewMode> {
        viewMode ?? .constant(.split)
    }

    private func button(
        _ command: EditorCommand,
        key: KeyEquivalent,
        modifiers: EventModifiers = .command
    ) -> some View {
        Button(command.title) { format?(command) }
            .keyboardShortcut(key, modifiers: modifiers)
            .disabled(format == nil)
    }
}
