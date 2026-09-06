import SwiftUI

/// Renders inline Markdown spans with Foundation's Markdown parser, then fixes
/// up the intents SwiftUI's `Text` does not style on its own (code spans).
enum InlineMarkdown {

    @MainActor
    static func attributed(_ source: String, fontSize: CGFloat) -> AttributedString {
        var options = AttributedString.MarkdownParsingOptions()
        options.interpretedSyntax = .inlineOnlyPreservingWhitespace
        options.failurePolicy = .returnPartiallyParsedIfPossible

        var result = (try? AttributedString(markdown: source, options: options))
            ?? AttributedString(source)

        let codeRanges = result.runs.compactMap { run -> Range<AttributedString.Index>? in
            guard let intent = run.inlinePresentationIntent, intent.contains(.code) else { return nil }
            return run.range
        }
        for range in codeRanges {
            result[range].font = .system(size: fontSize * 0.92, design: .monospaced)
            result[range].backgroundColor = Color.secondary.opacity(0.15)
        }
        return result
    }
}
