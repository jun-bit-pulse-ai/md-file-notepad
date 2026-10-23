import Foundation

/// Document statistics for the status bar.
///
/// `words` counts what a writer means by "words", not what splitting on
/// whitespace returns: Markdown syntax — fenced and inline code, link
/// targets, images, heading/list/quote markers, emphasis markers, HTML tags
/// and comments, table pipes and delimiter rows — is stripped before
/// counting. `characters`, `charactersNoSpaces` and `lines` measure the raw
/// source.
///
/// The semantics mirror the Electron implementation in
/// `src/renderer/lib/stats.js`, whose behaviour `test/stats.test.mjs`
/// enumerates, so both front ends report the same numbers for the same
/// document.
public struct DocumentStatistics: Equatable, Sendable {
    /// Words of prose, with Markdown syntax removed first.
    public var words: Int
    /// Characters of the raw source, Markdown markers included.
    public var characters: Int
    /// Characters of the raw source, whitespace excluded.
    public var charactersNoSpaces: Int
    /// Lines of the raw source. An empty document has none.
    public var lines: Int

    /// The reading speed `readingMinutes` assumes.
    public static let wordsPerMinute = 200

    /// Rounded up, so a short note reads as "1 min". A document with no
    /// prose reads as 0.
    public var readingMinutes: Int {
        guard words > 0 else { return 0 }
        return max(1, Int((Double(words) / Double(Self.wordsPerMinute)).rounded(.up)))
    }

    public init(text: String) {
        characters = text.count
        charactersNoSpaces = text.reduce(into: 0) { total, character in
            if !character.isWhitespace { total += 1 }
        }
        lines = text.isEmpty ? 0 : text.components(separatedBy: "\n").count
        words = Self.countWords(in: Self.plainText(from: text))
    }
}

// MARK: - Prose extraction

extension DocumentStatistics {

    /// Markdown removals, in the order `toPlainText` in `stats.js` applies
    /// them. The order matters: fences go before inline code, images before
    /// links, and emphasis from the longest marker to the shortest.
    private static let proseRules: [(pattern: String, template: String)] = [
        // Fenced code blocks.
        (#"(?m)^```[\s\S]*?^```"#, " "),
        (#"(?m)^~~~[\s\S]*?^~~~"#, " "),
        // Inline code.
        (#"`[^`\n]*`"#, " "),
        // Images: dropped entirely; alt text isn't prose the author is writing.
        (#"!\[[^\]]*\]\([^)]*\)"#, " "),
        // Links: keep the label, drop the target.
        (#"\[([^\]]*)\]\([^)]*\)"#, "$1"),
        (#"\[([^\]]*)\]\[[^\]]*\]"#, "$1"),
        // Reference definitions.
        (#"(?m)^\s*\[[^\]]+\]:.*$"#, " "),
        // HTML comments and tags.
        (#"<!--[\s\S]*?-->"#, " "),
        (#"</?[a-zA-Z][^>]*>"#, " "),
        // Block markers.
        (#"(?m)^\s{0,3}#{1,6}\s+"#, ""),
        (#"(?m)^\s{0,3}>\s?"#, ""),
        (#"(?m)^\s{0,3}([*+-]|\d+[.)])\s+"#, ""),
        (#"(?m)^\s{0,3}\[[ xX]\]\s+"#, ""),
        (#"(?m)^\s{0,3}([-*_]\s*){3,}$"#, " "),
        // Inline markers.
        (#"(\*\*\*|___)(.+?)\1"#, "$2"),
        (#"(\*\*|__)(.+?)\1"#, "$2"),
        (#"(\*|_)(.+?)\1"#, "$2"),
        (#"~~(.+?)~~"#, "$1"),
        (#"==(.+?)=="#, "$1"),
        // Table pipes and delimiter rows.
        (#"\|"#, " "),
        (#"(?m)^\s*:?-{3,}:?\s*$"#, " "),
    ]

    /// Strips the Markdown that shouldn't inflate the word count.
    public static func plainText(from markdown: String) -> String {
        guard !markdown.isEmpty else { return "" }
        var text = markdown
        for rule in proseRules {
            text = text.replacingOccurrences(
                of: rule.pattern,
                with: rule.template,
                options: .regularExpression
            )
        }
        return text
    }
}

// MARK: - Word counting

extension DocumentStatistics {

    /// Joiners that keep a compound like "well-known" or "can't" as one word.
    private static let wordJoiners: Set<Character> = [
        "-", "\u{2011}", "\u{2013}", "\u{2019}", "'",
    ]

    /// Counts runs of letters and digits, merging runs that a single joiner
    /// glues to the preceding word. Markdown rules that leave `---` or `|`
    /// behind therefore contribute nothing.
    public static func countWords(in text: String) -> Int {
        var count = 0
        var insideWord = false
        var previousWasWord = false
        var pendingJoiner = false

        for character in text {
            if character.isLetter || character.isNumber {
                if !insideWord && !(pendingJoiner && previousWasWord) { count += 1 }
                insideWord = true
                previousWasWord = true
                pendingJoiner = false
            } else if wordJoiners.contains(character) {
                insideWord = false
                pendingJoiner = true
            } else {
                insideWord = false
                previousWasWord = false
                pendingJoiner = false
            }
        }
        return count
    }
}
