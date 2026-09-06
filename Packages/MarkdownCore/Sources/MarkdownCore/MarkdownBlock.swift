import Foundation

/// A parsed top-level construct in a Markdown document.
///
/// The model is intentionally small: it covers the CommonMark subset plus the
/// GitHub extensions (tables, task lists, strikethrough) that people actually
/// type in a notepad. Inline syntax inside `text` payloads is left as raw
/// Markdown and rendered later by `InlineMarkdown`.
public indirect enum MarkdownBlock: Equatable, Sendable {
    case heading(level: Int, text: String)
    case paragraph(text: String)
    case list(ordered: Bool, start: Int, items: [MarkdownListItem])
    case quote(blocks: [MarkdownBlock])
    case code(language: String?, code: String)
    case table(MarkdownTable)
    case thematicBreak
}

public struct MarkdownListItem: Equatable, Sendable {
    /// `nil` for a plain bullet, `false`/`true` for `- [ ]` / `- [x]`.
    public var checked: Bool?
    public var blocks: [MarkdownBlock]

    public init(checked: Bool?, blocks: [MarkdownBlock]) {
        self.checked = checked
        self.blocks = blocks
    }
}

public struct MarkdownTable: Equatable, Sendable {
    public enum Alignment: Equatable, Sendable {
        case none, left, center, right
    }

    public var header: [String]
    public var alignments: [Alignment]
    public var rows: [[String]]

    public init(header: [String], alignments: [Alignment], rows: [[String]]) {
        self.header = header
        self.alignments = alignments
        self.rows = rows
    }
}
