import Foundation

/// A source-level formatting action applied to the editor's current selection.
public enum EditorCommand: Hashable, CaseIterable, Identifiable, Sendable {
    case bold, italic, strikethrough, inlineCode, link
    case heading1, heading2, heading3
    case bulletList, numberedList, taskList, quote, codeBlock, horizontalRule

    public var id: Self { self }

    public var title: String {
        switch self {
        case .bold: "Bold"
        case .italic: "Italic"
        case .strikethrough: "Strikethrough"
        case .inlineCode: "Inline Code"
        case .link: "Link"
        case .heading1: "Heading 1"
        case .heading2: "Heading 2"
        case .heading3: "Heading 3"
        case .bulletList: "Bulleted List"
        case .numberedList: "Numbered List"
        case .taskList: "Task List"
        case .quote: "Block Quote"
        case .codeBlock: "Code Block"
        case .horizontalRule: "Horizontal Rule"
        }
    }

    public var symbol: String {
        switch self {
        case .bold: "bold"
        case .italic: "italic"
        case .strikethrough: "strikethrough"
        case .inlineCode: "chevron.left.forwardslash.chevron.right"
        case .link: "link"
        case .heading1: "textformat.size.larger"
        case .heading2: "textformat.size"
        case .heading3: "textformat.size.smaller"
        case .bulletList: "list.bullet"
        case .numberedList: "list.number"
        case .taskList: "checklist"
        case .quote: "text.quote"
        case .codeBlock: "curlybraces.square"
        case .horizontalRule: "minus"
        }
    }

    /// Characters placed on both sides of the selection, if this is a wrapping command.
    public var wrapper: String? {
        switch self {
        case .bold: "**"
        case .italic: "*"
        case .strikethrough: "~~"
        case .inlineCode: "`"
        default: nil
        }
    }

    /// Prefix added to every line the selection touches, if this is a line command.
    public var linePrefix: String? {
        switch self {
        case .heading1: "# "
        case .heading2: "## "
        case .heading3: "### "
        case .bulletList: "- "
        case .taskList: "- [ ] "
        case .quote: "> "
        default: nil
        }
    }
}
