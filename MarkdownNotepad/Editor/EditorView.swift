import SwiftUI

struct EditorView: View {
    @Binding var text: String
    @Binding var selection: TextSelection?
    let fontSize: CGFloat

    var body: some View {
        TextEditor(text: $text, selection: $selection)
            .textEditorStyle(.plain)
            .font(.system(size: fontSize, design: .monospaced))
            .lineSpacing(fontSize * 0.28)
            .scrollContentBackground(.hidden)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color(nsColor: .textBackgroundColor))
            .accessibilityLabel("Markdown source")
    }
}

extension TextSelection {
    /// The selection as character offsets into `text`, for `MarkdownFormatter`.
    func characterOffsets(in text: String) -> Range<Int> {
        let range: Range<String.Index>
        switch indices {
        case let .selection(selected):
            range = selected
        case let .multiSelection(set):
            // Multi-cursor editing collapses to the outermost span; formatting
            // several disjoint ranges at once is not supported yet.
            guard let first = set.ranges.first, let last = set.ranges.last else {
                return text.count..<text.count
            }
            range = first.lowerBound..<last.upperBound
        @unknown default:
            return text.count..<text.count
        }

        let lower = text.distance(from: text.startIndex, to: range.lowerBound)
        let upper = text.distance(from: text.startIndex, to: range.upperBound)
        return lower..<upper
    }

    /// Rebuilds a selection from character offsets, clamped to `text`.
    static func from(offsets: Range<Int>, in text: String) -> TextSelection {
        let count = text.count
        let lower = max(0, min(offsets.lowerBound, count))
        let upper = max(lower, min(offsets.upperBound, count))

        let start = text.index(text.startIndex, offsetBy: lower)
        let end = text.index(text.startIndex, offsetBy: upper)
        return lower == upper ? TextSelection(insertionPoint: start) : TextSelection(range: start..<end)
    }
}
