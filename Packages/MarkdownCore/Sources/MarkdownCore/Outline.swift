import Foundation

/// A heading discovered by `Outline.extract`.
public struct OutlineHeading: Equatable, Sendable {
    /// `1...6`, from the number of leading `#` or from the setext underline.
    public var level: Int
    /// The heading text with inline markup removed, ready to show as-is.
    public var text: String
    /// Anchor-style slug, made unique within the document it came from.
    public var slug: String
    /// 1-based line number of the heading text itself.
    ///
    /// For a setext heading this is the text line, not the underline below it,
    /// because that is where a reader expects the cursor to land.
    public var line: Int
    /// Offset of the start of `line`, counted in `Character`s to match
    /// `MarkdownFormatter.Result.selection` rather than UTF-16 units.
    public var from: Int

    public init(level: Int, text: String, slug: String, line: Int, from: Int) {
        self.level = level
        self.text = text
        self.slug = slug
        self.line = line
        self.from = from
    }
}

/// One heading plus the headings nested beneath it.
public struct OutlineNode: Equatable, Sendable {
    public var heading: OutlineHeading
    public var children: [OutlineNode]

    public init(heading: OutlineHeading, children: [OutlineNode]) {
        self.heading = heading
        self.children = children
    }
}

/// Heading extraction for an outline sidebar, ported from the Electron app's
/// `src/renderer/lib/outline.js` so both front-ends agree on slugs and nesting.
///
/// Deliberately independent of `MarkdownParser`: the outline needs to work on
/// plain strings (exports, tests, files that are not open in an editor) and
/// only needs line-level accuracy plus an offset to scroll to. Reusing the
/// block parser would mean rebuilding a whole document tree — and losing the
/// line numbers — to answer "which heading am I in?".
///
/// Its scanner therefore carries its own small amount of block-level knowledge
/// (ATX, setext, fenced code), which is why nothing here imports anything but
/// Foundation.
public enum Outline {

    // MARK: - Extraction

    /// Headings in document order.
    ///
    /// `source` is optional so a caller with no document loaded gets an empty
    /// outline instead of having to special-case it.
    ///
    /// Fenced code blocks are skipped, so a `# comment` inside a shell snippet
    /// never shows up as a heading.
    public static func extract(_ source: String?) -> [OutlineHeading] {
        guard let source, !source.isEmpty else { return [] }

        let lines = source.components(separatedBy: "\n")
        var headings: [OutlineHeading] = []
        var slugCounts: [String: Int] = [:]
        var offset = 0
        var openFence: (marker: Character, length: Int)?

        for (index, line) in lines.enumerated() {
            let lineStart = offset
            offset += line.count + 1

            let fence = fenceMarker(line)
            if let open = openFence {
                // Only a fence of the same character and at least equal length
                // closes, so a ``` inside a ```` block stays code.
                if let fence, fence.marker == open.marker, fence.length >= open.length {
                    openFence = nil
                }
                continue
            }
            if let fence {
                openFence = fence
                continue
            }

            if let atx = atxHeading(line) {
                let text = stripInline(atx.text)
                // `#` and `##   ` carry no title; they are not outline entries.
                guard !text.isEmpty else { continue }
                headings.append(
                    makeHeading(
                        level: atx.level, text: text, line: index + 1, from: lineStart,
                        slugCounts: &slugCounts))
                continue
            }

            // A setext underline describes the line above it.
            guard index > 0,
                let level = setextLevel(line),
                isSetextSubject(lines[index - 1])
            else { continue }

            let subject = lines[index - 1]
            let subjectLine = index  // 1-based number of `lines[index - 1]`
            // Guards against emitting the same line twice when a heading has
            // already claimed it.
            if headings.last?.line == subjectLine { continue }
            headings.append(
                makeHeading(
                    level: level, text: stripInline(subject), line: subjectLine,
                    from: lineStart - (subject.count + 1), slugCounts: &slugCounts))
        }

        return headings
    }

    private static func makeHeading(
        level: Int, text: String, line: Int, from: Int, slugCounts: inout [String: Int]
    ) -> OutlineHeading {
        var base = slugify(text)
        if base.isEmpty { base = "section" }
        let seen = slugCounts[base] ?? 0
        slugCounts[base] = seen + 1
        return OutlineHeading(
            level: level,
            text: text,
            slug: seen == 0 ? base : "\(base)-\(seen)",
            line: line,
            from: max(0, from))
    }

    // MARK: - Nesting

    /// Nests a flat heading list into a tree.
    ///
    /// Skipped levels are tolerated: an h3 directly under an h1 attaches to
    /// that h1 rather than growing an empty h2 in between.
    public static func tree(_ headings: [OutlineHeading]) -> [OutlineNode] {
        var index = 0

        // Levels run 1...6, so 0 is a parent no real heading can be a sibling
        // of, and recursion is bounded by the six levels.
        func nest(deeperThan parentLevel: Int) -> [OutlineNode] {
            var nodes: [OutlineNode] = []
            while index < headings.count, headings[index].level > parentLevel {
                let heading = headings[index]
                index += 1
                nodes.append(
                    OutlineNode(heading: heading, children: nest(deeperThan: heading.level)))
            }
            return nodes
        }

        return nest(deeperThan: 0)
    }

    /// The index of the heading that contains `line`, or `-1` for a line above
    /// the first heading.
    public static func activeHeadingIndex(_ headings: [OutlineHeading], line: Int) -> Int {
        var active = -1
        for (index, heading) in headings.enumerated() {
            if heading.line <= line { active = index } else { break }
        }
        return active
    }

    // MARK: - Text

    /// Inline markup to unwrap, in the order the Electron version applies it:
    /// the three-marker emphasis rules have to run before the shorter ones, or
    /// `***very***` would lose a star instead of its emphasis.
    private static let inlineMarkup: [(pattern: String, template: String)] = [
        (#"!\[([^\]]*)\]\([^)]*\)"#, "$1"),
        (#"\[([^\]]*)\]\([^)]*\)"#, "$1"),
        (#"\[([^\]]*)\]\[[^\]]*\]"#, "$1"),
        (#"`([^`]+)`"#, "$1"),
        (#"(\*\*\*|___)(.+?)\1"#, "$2"),
        (#"(\*\*|__)(.+?)\1"#, "$2"),
        (#"(\*|_)(.+?)\1"#, "$2"),
        (#"~~(.+?)~~"#, "$1"),
        (#"==(.+?)=="#, "$1"),
        (#"<[^>]+>"#, ""),
    ]

    /// Strips inline markup so a sidebar shows readable text, not syntax.
    ///
    /// Each rule keeps its capture group, so the words inside the markers
    /// survive: `***very*** ~~old~~ ==new==` becomes `very old new`.
    public static func stripInline(_ text: String) -> String {
        var result = text
        for rule in inlineMarkup {
            result = result.replacingOccurrences(
                of: rule.pattern, with: rule.template, options: .regularExpression)
        }
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// GitHub-compatible anchor slugs, used for export and outline links.
    ///
    /// Letters and numbers of any script are kept, so `Ünïcode Tïtle` stays
    /// `ünïcode-tïtle` instead of being flattened to ASCII.
    public static func slugify(_ text: String) -> String {
        let lowered = stripInline(text).lowercased()
        let kept = String(
            lowered.filter { $0.isLetter || $0.isNumber || $0.isWhitespace || $0 == "-" })

        var slug = ""
        var pendingSeparator = false
        for character in kept.trimmingCharacters(in: .whitespacesAndNewlines) {
            if character.isWhitespace {
                pendingSeparator = true
                continue
            }
            if pendingSeparator {
                slug.append("-")
                pendingSeparator = false
            }
            slug.append(character)
        }
        return slug
    }

    // MARK: - Line scanning

    /// `/^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/`: returns the level and the title,
    /// which is empty for a bare `#`. Seven or more hashes are not a heading.
    private static func atxHeading(_ line: String) -> (level: Int, text: String)? {
        let hashes = line.prefix(while: { $0 == "#" }).count
        guard (1...6).contains(hashes) else { return nil }

        let remainder = line.dropFirst(hashes)
        // A space is required, so `#tag` is a tag and `C#` stays prose.
        guard let separator = remainder.first, separator.isWhitespace else { return nil }
        return (hashes, droppingClosingHashes(remainder.drop(while: { $0.isWhitespace })))
    }

    /// Drops a closing `## Section ##` sequence and any trailing whitespace.
    ///
    /// The hashes have to be preceded by whitespace to count, which is what
    /// keeps the `#` in `# C#` attached to its word.
    private static func droppingClosingHashes(_ text: Substring) -> String {
        let characters = Array(text)

        var end = characters.count
        while end > 0, characters[end - 1].isWhitespace { end -= 1 }

        var hashStart = end
        while hashStart > 0, characters[hashStart - 1] == "#" { hashStart -= 1 }

        if hashStart < end {
            var separatorStart = hashStart
            while separatorStart > 0, characters[separatorStart - 1].isWhitespace {
                separatorStart -= 1
            }
            if separatorStart < hashStart { return String(characters[0..<separatorStart]) }
        }
        return String(characters[0..<end])
    }

    /// `/^(=+|-+)\s*$/`: `=` underlines an h1, `-` an h2.
    private static func setextLevel(_ line: String) -> Int? {
        guard let first = line.first, first == "=" || first == "-" else { return nil }
        let rest = line.drop(while: { $0 == first })
        guard rest.allSatisfy({ $0.isWhitespace }) else { return nil }
        return first == "=" ? 1 : 2
    }

    /// Whether `line` can be the text of a setext heading: it needs content,
    /// and an ATX heading, a list item or a quote is already something else —
    /// which is what stops `- item` over `---` from becoming a heading.
    private static func isSetextSubject(_ line: String) -> Bool {
        guard !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        guard atxHeading(line) == nil else { return false }
        return !startsWithListOrQuoteMarker(line)
    }

    /// `/^\s{0,3}([*+-]|\d+[.)]|>)\s/`
    private static func startsWithListOrQuoteMarker(_ line: String) -> Bool {
        let characters = Array(line)

        var index = 0
        while index < characters.count, characters[index].isWhitespace { index += 1 }
        // Four spaces in is indented code, not a list.
        guard index <= 3, index < characters.count else { return false }

        let marker = characters[index]
        var next = index + 1
        if marker == "*" || marker == "+" || marker == "-" || marker == ">" {
            // A one-character marker.
        } else if marker.isASCII, marker.isNumber {
            while next < characters.count, characters[next].isASCII, characters[next].isNumber {
                next += 1
            }
            guard next < characters.count, characters[next] == "." || characters[next] == ")"
            else { return false }
            next += 1
        } else {
            return false
        }

        guard next < characters.count, characters[next].isWhitespace else { return false }
        return true
    }

    /// `/^(\s{0,3})(`{3,}|~{3,})/`: the opening or closing marker of a fenced
    /// code block, with the character and length a close has to match.
    private static func fenceMarker(_ line: String) -> (marker: Character, length: Int)? {
        var index = line.startIndex
        var indent = 0
        while index < line.endIndex, line[index].isWhitespace {
            indent += 1
            if indent > 3 { return nil }
            index = line.index(after: index)
        }
        guard index < line.endIndex else { return nil }

        let marker = line[index]
        guard marker == "`" || marker == "~" else { return nil }
        let length = line[index...].prefix(while: { $0 == marker }).count
        guard length >= 3 else { return nil }
        return (marker, length)
    }
}
