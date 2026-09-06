import Foundation

/// Pure text transformations behind the Format menu.
///
/// Kept free of SwiftUI so the behaviour can be unit-tested directly: every
/// command maps `(text, selection)` to a new `(text, selection)` pair.
public enum MarkdownFormatter {

    public struct Result: Equatable, Sendable {
        public var text: String
        /// Selection to restore, expressed as UTF-16-free character offsets.
        public var selection: Range<Int>

        public init(text: String, selection: Range<Int>) {
            self.text = text
            self.selection = selection
        }
    }

    public static func apply(_ command: EditorCommand, to text: String, selection: Range<Int>) -> Result {
        let range = clamp(selection, in: text)

        if let wrapper = command.wrapper {
            return wrap(text, range: range, with: wrapper)
        }
        if let prefix = command.linePrefix {
            return prefixLines(text, range: range, with: prefix, exclusive: command != .quote)
        }
        switch command {
        case .link: return insertLink(text, range: range)
        case .numberedList: return numberLines(text, range: range)
        case .codeBlock: return fence(text, range: range)
        case .horizontalRule: return insertBlock(text, range: range, block: "---")
        default: return Result(text: text, selection: range)
        }
    }

    // MARK: - Inline

    private static func wrap(_ text: String, range: Range<Int>, with marker: String) -> Result {
        let selected = substring(text, range)
        let markerCount = marker.count

        // Toggle off when the selection is already wrapped.
        if selected.hasPrefix(marker), selected.hasSuffix(marker), selected.count >= markerCount * 2 {
            let inner = String(selected.dropFirst(markerCount).dropLast(markerCount))
            return Result(
                text: replacing(text, range, with: inner),
                selection: range.lowerBound..<(range.lowerBound + inner.count)
            )
        }
        // Or when the markers sit just outside it.
        if let outer = surroundingMarkerRange(text, range: range, marker: marker) {
            let inner = substring(text, range)
            return Result(
                text: replacing(text, outer, with: inner),
                selection: outer.lowerBound..<(outer.lowerBound + inner.count)
            )
        }

        let replacement = marker + selected + marker
        let start = range.lowerBound + markerCount
        return Result(
            text: replacing(text, range, with: replacement),
            selection: start..<(start + selected.count)
        )
    }

    private static func surroundingMarkerRange(
        _ text: String,
        range: Range<Int>,
        marker: String
    ) -> Range<Int>? {
        let markerCount = marker.count
        let outer = (range.lowerBound - markerCount)..<(range.upperBound + markerCount)
        guard outer.lowerBound >= 0, outer.upperBound <= text.count else { return nil }
        let candidate = substring(text, outer)
        guard candidate.hasPrefix(marker), candidate.hasSuffix(marker) else { return nil }
        return outer
    }

    private static func insertLink(_ text: String, range: Range<Int>) -> Result {
        let selected = substring(text, range)
        let label = selected.isEmpty ? "text" : selected
        let replacement = "[\(label)](url)"
        // Select the "url" placeholder so it can be typed over immediately.
        let urlStart = range.lowerBound + label.count + 3
        return Result(
            text: replacing(text, range, with: replacement),
            selection: urlStart..<(urlStart + 3)
        )
    }

    // MARK: - Line-based

    private static func prefixLines(
        _ text: String,
        range: Range<Int>,
        with prefix: String,
        exclusive: Bool
    ) -> Result {
        transformLines(text, range: range) { lines in
            let alreadyApplied = lines.allSatisfy { $0.hasPrefix(prefix) }
            return lines.map { line in
                if alreadyApplied { return String(line.dropFirst(prefix.count)) }
                var stripped = line
                if exclusive { stripped = removeLeadingMarkers(stripped) }
                return prefix + stripped
            }
        }
    }

    private static func numberLines(_ text: String, range: Range<Int>) -> Result {
        transformLines(text, range: range) { lines in
            let alreadyApplied = lines.allSatisfy {
                $0.range(of: "^\\d+\\. ", options: .regularExpression) != nil
            }
            return lines.enumerated().map { index, line in
                if alreadyApplied,
                   let marker = line.range(of: "^\\d+\\. ", options: .regularExpression) {
                    return String(line[marker.upperBound...])
                }
                return "\(index + 1). " + removeLeadingMarkers(line)
            }
        }
    }

    /// Strips any existing heading / list / quote marker so commands replace
    /// rather than stack (`- # - item`).
    private static func removeLeadingMarkers(_ line: String) -> String {
        var result = line
        let patterns = ["^#{1,6} ", "^> ", "^- \\[[ xX]\\] ", "^[-*+] ", "^\\d+\\. "]
        var changed = true
        while changed {
            changed = false
            for pattern in patterns {
                if let match = result.range(of: pattern, options: .regularExpression) {
                    result.removeSubrange(match)
                    changed = true
                }
            }
        }
        return result
    }

    private static func transformLines(
        _ text: String,
        range: Range<Int>,
        _ transform: ([String]) -> [String]
    ) -> Result {
        let block = lineRange(containing: range, in: text)
        let original = substring(text, block).components(separatedBy: "\n")
        let updated = transform(original).joined(separator: "\n")
        return Result(
            text: replacing(text, block, with: updated),
            selection: block.lowerBound..<(block.lowerBound + updated.count)
        )
    }

    private static func fence(_ text: String, range: Range<Int>) -> Result {
        let selected = substring(text, range)
        let body = selected.isEmpty ? "" : selected
        let replacement = "```\n\(body)\n```"
        let bodyStart = range.lowerBound + 4
        return Result(
            text: replacing(text, range, with: replacement),
            selection: bodyStart..<(bodyStart + body.count)
        )
    }

    private static func insertBlock(_ text: String, range: Range<Int>, block: String) -> Result {
        let line = lineRange(containing: range, in: text)
        let existing = substring(text, line)
        let replacement = existing.isEmpty ? block : existing + "\n\n" + block
        let end = line.lowerBound + replacement.count
        return Result(text: replacing(text, line, with: replacement), selection: end..<end)
    }

    // MARK: - Offset helpers

    /// Expands `range` to cover whole lines.
    private static func lineRange(containing range: Range<Int>, in text: String) -> Range<Int> {
        let characters = Array(text)
        var start = min(range.lowerBound, characters.count)
        var end = min(range.upperBound, characters.count)

        while start > 0, characters[start - 1] != "\n" { start -= 1 }
        while end < characters.count, characters[end] != "\n" { end += 1 }
        return start..<max(start, end)
    }

    private static func clamp(_ range: Range<Int>, in text: String) -> Range<Int> {
        let count = text.count
        let lower = max(0, min(range.lowerBound, count))
        let upper = max(lower, min(range.upperBound, count))
        return lower..<upper
    }

    private static func substring(_ text: String, _ range: Range<Int>) -> String {
        guard let bounds = stringRange(text, range) else { return "" }
        return String(text[bounds])
    }

    private static func replacing(_ text: String, _ range: Range<Int>, with replacement: String) -> String {
        guard let bounds = stringRange(text, range) else { return text }
        return text.replacingCharacters(in: bounds, with: replacement)
    }

    private static func stringRange(_ text: String, _ range: Range<Int>) -> Range<String.Index>? {
        guard range.lowerBound >= 0, range.upperBound <= text.count else { return nil }
        guard let start = text.index(text.startIndex, offsetBy: range.lowerBound, limitedBy: text.endIndex),
              let end = text.index(text.startIndex, offsetBy: range.upperBound, limitedBy: text.endIndex)
        else { return nil }
        return start..<end
    }
}
