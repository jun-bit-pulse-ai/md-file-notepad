import Testing
import MarkdownCore

@Suite("Fuzzy matching")
struct FuzzyMatchingTests {

    @Test("Matches a contiguous substring")
    func contiguous() throws {
        let match = try #require(Fuzzy.match(query: "note", target: "notes.md"))
        #expect(match.positions == [0, 1, 2, 3])
    }

    @Test("Matches a non-contiguous subsequence")
    func subsequence() throws {
        let match = try #require(Fuzzy.match(query: "nmd", target: "notes.md"))
        #expect(match.positions == [0, 6, 7])
    }

    @Test("Characters out of order do not match")
    func outOfOrder() {
        #expect(Fuzzy.match(query: "dmn", target: "notes.md") == nil)
    }

    @Test("A missing character does not match")
    func missingCharacter() {
        #expect(Fuzzy.match(query: "xyz", target: "notes.md") == nil)
    }

    @Test("Matching is case-insensitive")
    func caseInsensitive() {
        #expect(Fuzzy.match(query: "README", target: "readme.md") != nil)
        #expect(Fuzzy.match(query: "readme", target: "README.md") != nil)
    }

    @Test("An empty query matches anything with no positions")
    func emptyQuery() throws {
        let match = try #require(Fuzzy.match(query: "", target: "anything.md"))
        #expect(match == Fuzzy.Match(score: 0, positions: []))
    }

    @Test("Spaces in the query are ignored")
    func spacesIgnored() throws {
        let match = try #require(Fuzzy.match(query: "li pre", target: "livePreview.js"))
        #expect(match.positions == [0, 1, 4, 5, 6])
    }

    @Test("A query of only spaces behaves like an empty one")
    func blankQuery() throws {
        let match = try #require(Fuzzy.match(query: "   ", target: "anything.md"))
        #expect(match == Fuzzy.Match(score: 0, positions: []))
    }

    @Test("A missing target does not crash")
    func missingTarget() {
        #expect(Fuzzy.match(query: "a", target: nil) == nil)
    }
}

@Suite("Fuzzy scoring")
struct FuzzyScoringTests {

    private func best(_ query: String, _ items: [String]) -> String? {
        Fuzzy.rank(query: query, items: items).first?.key
    }

    @Test("Consecutive matches outrank scattered ones")
    func consecutiveWins() throws {
        let contiguous = try #require(Fuzzy.match(query: "note", target: "note.md")).score
        let scattered = try #require(Fuzzy.match(query: "note", target: "n-o-t-e.md")).score
        #expect(contiguous > scattered)
    }

    @Test("A filename match beats a directory match")
    func filenameOverDirectory() {
        #expect(best("report", ["report/index.md", "docs/report.md"]) == "docs/report.md")
    }

    @Test("Word starts are preferred over mid-word hits")
    func wordStartsPreferred() {
        #expect(best("lp", ["src/livePreview.js", "src/helpers.js"]) == "src/livePreview.js")
    }

    @Test("camelCase humps count as word starts")
    func camelCaseHumps() throws {
        let hump = try #require(Fuzzy.match(query: "lp", target: "livePreview.js")).score
        let midWord = try #require(Fuzzy.match(query: "lp", target: "lamp.js")).score
        #expect(hump > midWord)
    }

    @Test("An exact prefix of the filename wins")
    func exactPrefix() {
        #expect(best("menu", ["src/main/menu.js", "src/submenu-helper.js"]) == "src/main/menu.js")
    }

    @Test("Shorter paths win when otherwise equal")
    func shorterPaths() {
        #expect(best("a.md", ["a.md", "very/deep/nested/folder/a.md"]) == "a.md")
    }

    @Test("One long gap does not sink an otherwise good match")
    func boundedGapPenalty() throws {
        let target = "a" + String(repeating: "x", count: 60) + "b"
        let match = try #require(Fuzzy.match(query: "ab", target: target))
        #expect(match.score > -20)
    }
}

@Suite("Fuzzy ranking")
struct FuzzyRankingTests {

    private struct Entry: Equatable {
        var relativePath: String
    }

    @Test("Ranking returns best-first and drops non-matches")
    func bestFirst() {
        let ranked = Fuzzy.rank(query: "alpha", items: ["alpha.md", "beta.md", "alphabet.md"])
        #expect(ranked.count == 2)
        #expect(ranked.first?.key == "alpha.md")
    }

    @Test("Ranking supports a key function over objects")
    func keyFunction() {
        let items = [Entry(relativePath: "docs/notes.md"), Entry(relativePath: "src/main.js")]
        let ranked = Fuzzy.rank(query: "notes", items: items, key: { $0.relativePath })
        #expect(ranked.count == 1)
        #expect(ranked.first?.item == Entry(relativePath: "docs/notes.md"))
    }

    @Test("An empty query keeps every item")
    func emptyQueryKeepsAll() {
        #expect(Fuzzy.rank(query: "", items: ["a.md", "b.md", "c.md"]).count == 3)
    }

    @Test("Ranking is stable for equal scores")
    func stableOrder() {
        let items = ["b.md", "a.md"]
        let first = Fuzzy.rank(query: "md", items: items).map { $0.key }
        let second = Fuzzy.rank(query: "md", items: Array(items.reversed())).map { $0.key }
        #expect(first == second)
        #expect(first == ["a.md", "b.md"])
    }

    @Test("Ranking tolerates missing input")
    func missingInput() {
        #expect(Fuzzy.rank(query: "x", items: nil).isEmpty)
        #expect(Fuzzy.rank(query: "x", items: []).isEmpty)
    }
}

@Suite("Fuzzy highlighting")
struct FuzzyHighlightingTests {

    @Test("Segments mark the matched characters")
    func marksMatches() {
        let segments = Fuzzy.highlightSegments(text: "notes.md", positions: [0, 1, 2, 3])
        #expect(segments == [
            Fuzzy.Segment(text: "note", matched: true),
            Fuzzy.Segment(text: "s.md", matched: false),
        ])
    }

    @Test("Adjacent characters merge into one run")
    func mergesRuns() {
        let segments = Fuzzy.highlightSegments(text: "abcdef", positions: [0, 1, 4, 5])
        #expect(segments == [
            Fuzzy.Segment(text: "ab", matched: true),
            Fuzzy.Segment(text: "cd", matched: false),
            Fuzzy.Segment(text: "ef", matched: true),
        ])
    }

    @Test("Segments round-trip the original text")
    func roundTrip() throws {
        let text = "src/renderer/livePreview.js"
        let match = try #require(Fuzzy.match(query: "lp", target: text))
        let joined = Fuzzy.highlightSegments(text: text, positions: match.positions)
            .map(\.text)
            .joined()
        #expect(joined == text)
    }

    @Test("No positions returns one plain segment")
    func noPositions() {
        #expect(Fuzzy.highlightSegments(text: "abc", positions: []) == [
            Fuzzy.Segment(text: "abc", matched: false)
        ])
    }
}

@Suite("Fuzzy grapheme clusters")
struct FuzzyGraphemeTests {

    @Test("Positions count grapheme clusters, not UTF-16 units")
    func positionsAreCharacterOffsets() throws {
        // The flag is one Character but four UTF-16 units, so a UTF-16-based
        // index would report "b" at 5 rather than 2.
        let target = "a🇯🇵b.md"
        let match = try #require(Fuzzy.match(query: "ab", target: target))
        #expect(match.positions == [0, 2])
    }

    @Test("Highlighting splits on grapheme clusters")
    func highlightingSplitsOnCharacters() {
        let segments = Fuzzy.highlightSegments(text: "a🇯🇵b", positions: [0, 1])
        #expect(segments == [
            Fuzzy.Segment(text: "a🇯🇵", matched: true),
            Fuzzy.Segment(text: "b", matched: false),
        ])
    }
}
