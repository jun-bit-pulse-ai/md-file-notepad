import Foundation

/// Fuzzy subsequence matching for a Quick Open palette.
///
/// A query matches when its characters appear in order in the target, not
/// necessarily adjacently — so `"srclp"` finds `"src/renderer/editor/livePreview.js"`.
/// Scoring favours the match a human would call "the obvious one": consecutive
/// runs, word starts, and the filename over the directory path.
///
/// Every offset this type reports — `Match.positions`, the indices accepted by
/// ``highlightSegments(text:positions:)`` — counts grapheme clusters, matching
/// the character offsets used elsewhere in MarkdownCore.
public enum Fuzzy {

    /// A successful match: how good it is, and which characters it consumed.
    public struct Match: Equatable, Sendable {
        public var score: Int
        /// Character offsets in the target, ascending.
        public var positions: [Int]

        public init(score: Int, positions: [Int]) {
            self.score = score
            self.positions = positions
        }
    }

    /// One item that matched, carried alongside its key and match.
    public struct Ranked<Item> {
        public var item: Item
        /// The string the item was matched on.
        public var key: String
        public var score: Int
        public var positions: [Int]

        public init(item: Item, key: String, score: Int, positions: [Int]) {
            self.item = item
            self.key = key
            self.score = score
            self.positions = positions
        }
    }

    /// A run of characters that is either part of the match or isn't.
    public struct Segment: Equatable, Sendable {
        public var text: String
        public var matched: Bool

        public init(text: String, matched: Bool) {
            self.text = text
            self.matched = matched
        }
    }

    // MARK: - Weights

    /// Each matched character is worth this much on its own.
    private static let base = 1
    /// Added for a character immediately after the previous match.
    private static let consecutive = 8
    /// Added when the match starts a word (after a boundary or a case bump).
    private static let wordStart = 10
    /// Added when the match lands in the basename rather than the directory.
    private static let inBasename = 6
    /// Added when the character matches case exactly.
    private static let caseMatch = 2
    /// Subtracted per skipped character between matches, capped below.
    private static let gap = 1
    /// Most a single gap can cost, so one long jump doesn't sink a good match.
    private static let maxGapPenalty = 12
    /// Added when the whole query matches from the very start of the basename.
    private static let prefix = 20
    /// Ceiling on the penalty that prefers shorter targets.
    private static let maxLengthPenalty = 10

    private static let wordBoundaries: Set<Character> = ["/", "\\", "-", "_", ".", " ", ":"]

    // MARK: - Matching

    /// Matches `query` against `target`.
    ///
    /// Returns `nil` when the query isn't a subsequence of the target, or when
    /// there is no target at all. An empty query — or one made only of spaces —
    /// matches everything with a score of 0 and no positions. Matching ignores
    /// case, and spaces in the query are skipped rather than looked for.
    public static func match(query: String, target: String?) -> Match? {
        guard let target else { return nil }

        let queryCharacters = Array(query.filter { $0 != " " })
        if queryCharacters.isEmpty { return Match(score: 0, positions: []) }

        let characters = Array(target)
        // Lowercased per character so comparisons stay grapheme-cluster safe.
        let loweredTarget = characters.map { $0.lowercased() }
        let loweredQuery = queryCharacters.map { $0.lowercased() }

        let basenameStart = characters.lastIndex(of: "/").map { $0 + 1 } ?? 0

        var positions: [Int] = []
        positions.reserveCapacity(loweredQuery.count)
        var score = 0
        var targetIndex = 0
        var previousMatch = -1

        for (queryIndex, lowerCharacter) in loweredQuery.enumerated() {
            guard let found = indexOf(lowerCharacter, in: loweredTarget, from: targetIndex) else {
                return nil
            }

            positions.append(found)
            score += base

            if previousMatch != -1 {
                if found == previousMatch + 1 {
                    score += consecutive
                } else {
                    score -= min(maxGapPenalty, (found - previousMatch - 1) * gap)
                }
            }

            if isWordStart(characters, at: found) { score += wordStart }
            if found >= basenameStart { score += inBasename }
            if characters[found] == queryCharacters[queryIndex] { score += caseMatch }

            previousMatch = found
            targetIndex = found + 1
        }

        // Reward an exact prefix of the filename — the case people expect first.
        let basename = loweredTarget[basenameStart...]
        if basename.count >= loweredQuery.count,
           Array(basename.prefix(loweredQuery.count)) == loweredQuery {
            score += prefix
        }

        // Prefer shorter targets when scores are otherwise close.
        score -= min(maxLengthPenalty, characters.count / 20)

        return Match(score: score, positions: positions)
    }

    private static func indexOf(
        _ lowerCharacter: String,
        in loweredTarget: [String],
        from start: Int
    ) -> Int? {
        var index = start
        while index < loweredTarget.count {
            if loweredTarget[index] == lowerCharacter { return index }
            index += 1
        }
        return nil
    }

    private static func isWordStart(_ characters: [Character], at index: Int) -> Bool {
        if index == 0 { return true }
        let previous = characters[index - 1]
        if wordBoundaries.contains(previous) { return true }
        // camelCase bump: "livePreview" -> P starts a word.
        let current = characters[index]
        return previous.lowercased() == String(previous)
            && current.lowercased() != String(current)
    }

    // MARK: - Ranking

    /// Ranks `items` against a query, best first, dropping everything that
    /// doesn't match.
    ///
    /// `key` extracts the string to match on. Ties break on that string — first
    /// its length, then its contents — so the order depends on the items rather
    /// than on the order they arrived in.
    public static func rank<Item>(
        query: String,
        items: [Item]?,
        key: (Item) -> String
    ) -> [Ranked<Item>] {
        guard let items else { return [] }

        var matched: [(offset: Int, ranked: Ranked<Item>)] = []
        for (offset, item) in items.enumerated() {
            let itemKey = key(item)
            guard let result = match(query: query, target: itemKey) else { continue }
            matched.append((
                offset: offset,
                ranked: Ranked(
                    item: item,
                    key: itemKey,
                    score: result.score,
                    positions: result.positions
                )
            ))
        }

        return matched.sorted { lhs, rhs in
            if lhs.ranked.score != rhs.ranked.score { return lhs.ranked.score > rhs.ranked.score }
            let lhsCount = lhs.ranked.key.count
            let rhsCount = rhs.ranked.key.count
            if lhsCount != rhsCount { return lhsCount < rhsCount }
            if lhs.ranked.key != rhs.ranked.key { return lhs.ranked.key < rhs.ranked.key }
            return lhs.offset < rhs.offset
        }.map { $0.ranked }
    }

    /// Ranks strings against a query, matching on the strings themselves.
    public static func rank(query: String, items: [String]?) -> [Ranked<String>] {
        rank(query: query, items: items, key: { $0 })
    }

    // MARK: - Highlighting

    /// Splits `text` into matched and unmatched runs, merging adjacent
    /// characters of the same kind into one segment.
    ///
    /// The segments always concatenate back to `text`. With no positions the
    /// result is a single unmatched segment holding the whole string.
    public static func highlightSegments(text: String, positions: [Int]) -> [Segment] {
        if positions.isEmpty { return [Segment(text: text, matched: false)] }

        let marked = Set(positions)
        var segments: [Segment] = []
        var buffer = ""
        var bufferMatched = marked.contains(0)

        for (index, character) in text.enumerated() {
            let matched = marked.contains(index)
            if matched != bufferMatched, !buffer.isEmpty {
                segments.append(Segment(text: buffer, matched: bufferMatched))
                buffer = ""
            }
            bufferMatched = matched
            buffer.append(character)
        }
        if !buffer.isEmpty { segments.append(Segment(text: buffer, matched: bufferMatched)) }

        return segments
    }
}

extension Fuzzy.Ranked: Equatable where Item: Equatable {}
extension Fuzzy.Ranked: Sendable where Item: Sendable {}
