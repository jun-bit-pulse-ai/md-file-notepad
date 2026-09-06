import Foundation

/// A dependency-free, line-oriented Markdown block parser.
///
/// It deliberately stops at block level: inline spans (`**bold**`, links, code
/// spans) are handed to Foundation's `AttributedString(markdown:)` at render
/// time, which keeps this file small and the two layers independently testable.
public enum MarkdownParser {

    public static func parse(_ source: String) -> [MarkdownBlock] {
        let normalized = source.replacingOccurrences(of: "\r\n", with: "\n")
        return parseBlocks(normalized.components(separatedBy: "\n"))
    }

    /// Nesting limit for quotes and lists. Deeply pathological input should
    /// render oddly, never overflow the stack.
    private static let maxDepth = 16

    // MARK: - Block dispatch

    private static func parseBlocks(_ lines: [String], depth: Int = 0) -> [MarkdownBlock] {
        guard depth < maxDepth else {
            let text = lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            return text.isEmpty ? [] : [.paragraph(text: text)]
        }

        var blocks: [MarkdownBlock] = []
        var index = 0

        while index < lines.count {
            if isBlank(lines[index]) {
                index += 1
                continue
            }
            if let (block, next) = parseFencedCode(lines, from: index) {
                blocks.append(block)
                index = next
            } else if isThematicBreak(lines[index]) {
                blocks.append(.thematicBreak)
                index += 1
            } else if let block = parseHeading(lines[index]) {
                blocks.append(block)
                index += 1
            } else if let (block, next) = parseQuote(lines, from: index, depth: depth) {
                blocks.append(block)
                index = next
            } else if let (block, next) = parseTable(lines, from: index) {
                blocks.append(block)
                index = next
            } else if let (block, next) = parseList(lines, from: index, depth: depth) {
                blocks.append(block)
                index = next
            } else {
                let (block, next) = parseParagraph(lines, from: index)
                blocks.append(block)
                index = next
            }
        }
        return blocks
    }

    // MARK: - Leaf blocks

    private static func parseHeading(_ line: String) -> MarkdownBlock? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        let level = trimmed.prefix { $0 == "#" }.count
        guard (1...6).contains(level) else { return nil }

        let remainder = trimmed.dropFirst(level)
        guard remainder.isEmpty || remainder.first == " " else { return nil }

        var text = remainder.trimmingCharacters(in: .whitespaces)
        // Strip an optional closing sequence ("## Title ##") without eating "C#".
        if let closing = text.range(of: " #+$", options: .regularExpression) {
            text.removeSubrange(closing)
        } else if !text.isEmpty, text.allSatisfy({ $0 == "#" }) {
            text = ""
        }
        return .heading(level: level, text: text.trimmingCharacters(in: .whitespaces))
    }

    private static func isThematicBreak(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard let marker = trimmed.first, "-*_".contains(marker) else { return false }
        let stripped = trimmed.filter { $0 != " " }
        return stripped.count >= 3 && stripped.allSatisfy { $0 == marker }
    }

    private static func parseFencedCode(_ lines: [String], from start: Int) -> (MarkdownBlock, Int)? {
        let opener = lines[start].trimmingCharacters(in: .whitespaces)
        guard let fence = opener.first, fence == "`" || fence == "~" else { return nil }
        let fenceLength = opener.prefix { $0 == fence }.count
        guard fenceLength >= 3 else { return nil }

        let info = opener.dropFirst(fenceLength).trimmingCharacters(in: .whitespaces)
        // An info string with a backtick is not a valid opener per CommonMark.
        guard fence == "~" || !info.contains("`") else { return nil }

        let indent = leadingSpaces(lines[start])
        var body: [String] = []
        var index = start + 1

        while index < lines.count {
            let candidate = lines[index].trimmingCharacters(in: .whitespaces)
            if candidate.count >= fenceLength, candidate.allSatisfy({ $0 == fence }) {
                index += 1
                break
            }
            body.append(stripIndent(lines[index], upTo: indent))
            index += 1
        }

        let language = info.isEmpty ? nil : String(info.split(separator: " ").first ?? "")
        return (.code(language: language, code: body.joined(separator: "\n")), index)
    }

    private static func parseParagraph(_ lines: [String], from start: Int) -> (MarkdownBlock, Int) {
        var collected: [String] = []
        var index = start

        while index < lines.count {
            let line = lines[index]
            if isBlank(line) { break }
            if index > start, startsNewBlock(lines, at: index) { break }
            collected.append(line.trimmingCharacters(in: .whitespaces))
            index += 1
        }
        return (.paragraph(text: collected.joined(separator: "\n")), index)
    }

    /// Lines that interrupt an open paragraph.
    private static func startsNewBlock(_ lines: [String], at index: Int) -> Bool {
        let line = lines[index]
        if parseHeading(line) != nil { return true }
        if isThematicBreak(line) { return true }
        if parseFencedCode(lines, from: index) != nil { return true }
        if line.trimmingCharacters(in: .whitespaces).hasPrefix(">") { return true }
        if let marker = listMarker(line), marker.indent <= 3 { return true }
        return false
    }

    // MARK: - Container blocks

    private static func parseQuote(_ lines: [String], from start: Int, depth: Int) -> (MarkdownBlock, Int)? {
        guard leadingSpaces(lines[start]) <= 3,
              lines[start].trimmingCharacters(in: .whitespaces).hasPrefix(">") else { return nil }

        var inner: [String] = []
        var index = start

        while index < lines.count {
            let trimmed = lines[index].trimmingCharacters(in: .whitespaces)
            guard trimmed.hasPrefix(">") else { break }
            var content = String(trimmed.dropFirst())
            if content.hasPrefix(" ") { content.removeFirst() }
            inner.append(content)
            index += 1
        }
        return (.quote(blocks: parseBlocks(inner, depth: depth + 1)), index)
    }

    private struct ListMarker {
        var indent: Int
        var ordered: Bool
        var number: Int
        var contentOffset: Int
    }

    private static func listMarker(_ line: String) -> ListMarker? {
        let indent = leadingSpaces(line)
        let rest = line.dropFirst(indent)

        if let bullet = rest.first, "-*+".contains(bullet) {
            let after = rest.dropFirst()
            guard after.isEmpty || after.first == " " else { return nil }
            return ListMarker(indent: indent, ordered: false, number: 1, contentOffset: indent + 2)
        }

        let digits = rest.prefix { $0.isNumber }
        guard !digits.isEmpty, digits.count <= 9 else { return nil }
        let afterDigits = rest.dropFirst(digits.count)
        guard let delimiter = afterDigits.first, delimiter == "." || delimiter == ")" else { return nil }
        let afterDelimiter = afterDigits.dropFirst()
        guard afterDelimiter.isEmpty || afterDelimiter.first == " " else { return nil }

        return ListMarker(
            indent: indent,
            ordered: true,
            number: Int(digits) ?? 1,
            contentOffset: indent + digits.count + 2
        )
    }

    private static func parseList(_ lines: [String], from start: Int, depth: Int) -> (MarkdownBlock, Int)? {
        guard let first = listMarker(lines[start]), first.indent <= 3 else { return nil }

        let ordered = first.ordered
        var items: [MarkdownListItem] = []
        var itemLines: [String]?
        var contentOffset = first.contentOffset
        var checked: Bool?
        var index = start

        while index < lines.count {
            let line = lines[index]

            if isBlank(line) {
                guard index + 1 < lines.count, !isBlank(lines[index + 1]) else { break }
                let next = lines[index + 1]
                let continuesItem = leadingSpaces(next) >= contentOffset
                let startsSibling = listMarker(next).map { $0.indent < contentOffset } ?? false
                guard continuesItem || startsSibling else { break }
                itemLines?.append("")
                index += 1
                continue
            }

            if let marker = listMarker(line), itemLines == nil || marker.indent < contentOffset {
                guard marker.ordered == ordered else { break }
                if let pending = itemLines {
                    items.append(MarkdownListItem(checked: checked, blocks: parseBlocks(pending, depth: depth + 1)))
                }
                contentOffset = marker.contentOffset
                var content = dropMarker(line, count: marker.contentOffset)
                checked = taskMarker(&content)
                itemLines = [content]
                index += 1
                continue
            }

            guard itemLines != nil else { break }
            itemLines?.append(stripIndent(line, upTo: contentOffset))
            index += 1
        }

        if let pending = itemLines {
            items.append(MarkdownListItem(checked: checked, blocks: parseBlocks(pending, depth: depth + 1)))
        }
        guard !items.isEmpty else { return nil }
        return (.list(ordered: ordered, start: first.number, items: items), index)
    }

    /// Strips a leading `[ ]` / `[x]` task marker, reporting the checked state.
    private static func taskMarker(_ content: inout String) -> Bool? {
        let lowered = content.lowercased()
        if lowered.hasPrefix("[ ]") || lowered.hasPrefix("[x]") {
            let checked = lowered.hasPrefix("[x]")
            content = String(content.dropFirst(3))
            if content.hasPrefix(" ") { content.removeFirst() }
            return checked
        }
        return nil
    }

    // MARK: - Tables

    private static func parseTable(_ lines: [String], from start: Int) -> (MarkdownBlock, Int)? {
        guard start + 1 < lines.count, lines[start].contains("|") else { return nil }
        guard let alignments = parseDelimiterRow(lines[start + 1]) else { return nil }

        let header = splitRow(lines[start])
        guard header.count == alignments.count else { return nil }

        var rows: [[String]] = []
        var index = start + 2

        while index < lines.count, !isBlank(lines[index]), lines[index].contains("|") {
            var cells = splitRow(lines[index])
            if cells.count < header.count {
                cells += Array(repeating: "", count: header.count - cells.count)
            }
            rows.append(Array(cells.prefix(header.count)))
            index += 1
        }

        let table = MarkdownTable(header: header, alignments: alignments, rows: rows)
        return (.table(table), index)
    }

    private static func parseDelimiterRow(_ line: String) -> [MarkdownTable.Alignment]? {
        let cells = splitRow(line)
        guard !cells.isEmpty else { return nil }

        var alignments: [MarkdownTable.Alignment] = []
        for cell in cells {
            guard cell.contains("-"),
                  cell.allSatisfy({ $0 == "-" || $0 == ":" }) else { return nil }
            switch (cell.hasPrefix(":"), cell.hasSuffix(":")) {
            case (true, true): alignments.append(.center)
            case (true, false): alignments.append(.left)
            case (false, true): alignments.append(.right)
            case (false, false): alignments.append(.none)
            }
        }
        return alignments
    }

    private static func splitRow(_ line: String) -> [String] {
        var trimmed = line.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("|") { trimmed.removeFirst() }
        if trimmed.hasSuffix("|") { trimmed.removeLast() }
        return trimmed.components(separatedBy: "|").map { $0.trimmingCharacters(in: .whitespaces) }
    }

    // MARK: - Line helpers

    private static func isBlank(_ line: String) -> Bool {
        line.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private static func leadingSpaces(_ line: String) -> Int {
        var count = 0
        for character in line {
            if character == " " { count += 1 }
            else if character == "\t" { count += 4 }
            else { break }
        }
        return count
    }

    /// Removes a list marker by character count, unlike `stripIndent`, which
    /// only consumes leading whitespace.
    private static func dropMarker(_ line: String, count: Int) -> String {
        String(line.dropFirst(min(count, line.count)))
    }

    private static func stripIndent(_ line: String, upTo limit: Int) -> String {
        var remaining = limit
        var result = Substring(line)
        while remaining > 0, let first = result.first, first == " " || first == "\t" {
            remaining -= (first == "\t" ? 4 : 1)
            result = result.dropFirst()
        }
        return String(result)
    }
}
