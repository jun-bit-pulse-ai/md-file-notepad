import MarkdownCore
import SwiftUI

struct ContentView: View {
    @Binding var document: MarkdownDocument

    @AppStorage(SettingsKey.editorFontSize) private var editorFontSize = 14.0
    @AppStorage(SettingsKey.previewFontSize) private var previewFontSize = 15.0
    @AppStorage(SettingsKey.defaultViewMode) private var defaultViewMode = ViewMode.split.rawValue
    @AppStorage(SettingsKey.showStatusBar) private var showStatusBar = true

    @State private var viewMode: ViewMode?
    @State private var selection: TextSelection?
    @State private var blocks: [MarkdownBlock] = []
    @State private var parseTask: Task<Void, Never>?

    private var mode: ViewMode {
        viewMode ?? ViewMode(rawValue: defaultViewMode) ?? .split
    }

    var body: some View {
        VStack(spacing: 0) {
            content
            if showStatusBar {
                Divider()
                StatusBar(statistics: DocumentStatistics(text: document.text))
            }
        }
        .frame(minWidth: 640, minHeight: 420)
        .toolbar { toolbarContent }
        .task(id: document.text) { await reparse() }
        .focusedSceneValue(\.editorCommandAction) { command in
            apply(command)
        }
        .focusedSceneValue(\.viewModeSelection, Binding(
            get: { mode },
            set: { viewMode = $0 }
        ))
    }

    @ViewBuilder
    private var content: some View {
        switch mode {
        case .editor:
            editor
        case .preview:
            preview
        case .split:
            HSplitView {
                editor.frame(minWidth: 280)
                preview.frame(minWidth: 280)
            }
        }
    }

    private var editor: some View {
        EditorView(text: $document.text, selection: $selection, fontSize: editorFontSize)
    }

    private var preview: some View {
        MarkdownPreview(blocks: blocks, fontSize: previewFontSize)
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItemGroup {
            ForEach(FormatBarCommands.primary) { command in
                Button {
                    apply(command)
                } label: {
                    Label(command.title, systemImage: command.symbol)
                }
                .help(command.title)
            }
        }
        ToolbarItem {
            Picker("View", selection: Binding(get: { mode }, set: { viewMode = $0 })) {
                ForEach(ViewMode.allCases) { option in
                    Label(option.title, systemImage: option.symbol).tag(option)
                }
            }
            .pickerStyle(.segmented)
            .labelStyle(.iconOnly)
        }
    }

    // MARK: - Behaviour

    private func apply(_ command: EditorCommand) {
        let offsets = selection?.characterOffsets(in: document.text)
            ?? document.text.count..<document.text.count
        let result = MarkdownFormatter.apply(command, to: document.text, selection: offsets)
        document.text = result.text
        selection = TextSelection.from(offsets: result.selection, in: result.text)
    }

    private func reparse() async {
        // Debounce so a fast typist is not re-parsing on every keystroke.
        try? await Task.sleep(for: .milliseconds(120))
        guard !Task.isCancelled else { return }
        let source = document.text
        let parsed = await Task.detached(priority: .userInitiated) {
            MarkdownParser.parse(source)
        }.value
        guard !Task.isCancelled else { return }
        blocks = parsed
    }
}

private enum FormatBarCommands {
    static let primary: [EditorCommand] = [.bold, .italic, .inlineCode, .link, .bulletList, .quote]
}

private struct StatusBar: View {
    let statistics: DocumentStatistics

    var body: some View {
        HStack(spacing: 16) {
            Text("\(statistics.words) words")
            Text("\(statistics.characters) characters")
            Text("\(statistics.lines) lines")
            Spacer()
            Text("\(statistics.readingMinutes) min read")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
        .background(.bar)
    }
}
