import Foundation
import Testing
import MarkdownCore

/// These mirror `test/stats.test.mjs`, which covers the Electron
/// implementation the counting semantics come from. A case added there
/// belongs here too, and with the same expected numbers.
@Suite("Document statistics")
struct DocumentStatisticsTests {

    @Test("Counts words, characters, and lines")
    func counts() {
        let stats = DocumentStatistics(text: "one two\nthree")
        #expect(stats.words == 3)
        #expect(stats.characters == 13)
        #expect(stats.charactersNoSpaces == 11)
        #expect(stats.lines == 2)
    }

    @Test("An empty document has no words, no lines, and no reading time")
    func empty() {
        let stats = DocumentStatistics(text: "")
        #expect(stats.words == 0)
        #expect(stats.characters == 0)
        #expect(stats.charactersNoSpaces == 0)
        #expect(stats.lines == 0)
        #expect(stats.readingMinutes == 0)
    }

    @Test("Whitespace alone is no prose")
    func whitespaceOnly() {
        let stats = DocumentStatistics(text: "   ")
        #expect(stats.words == 0)
        #expect(stats.characters == 3)
        #expect(stats.charactersNoSpaces == 0)
        #expect(stats.lines == 1)
        #expect(stats.readingMinutes == 0)
    }

    @Test("Reading time rounds up from 200 words per minute")
    func readingTime() {
        let text = Array(repeating: "word", count: 250).joined(separator: " ")
        #expect(DocumentStatistics(text: text).readingMinutes == 2)
    }

    @Test("Reading time rounds up from zero for any prose")
    func readingTimeRoundsUp() {
        #expect(DocumentStatistics(text: "word").readingMinutes == 1)
    }

    @Test("Hyphenated and apostrophed words count once")
    func joinedWords() {
        #expect(DocumentStatistics(text: "well-known can't").words == 2)
    }

    @Test("Fenced code blocks are excluded from prose")
    func backtickFences() {
        let doc = ["Real words here", "", "```js", "const a = 1", "```"]
            .joined(separator: "\n")
        #expect(DocumentStatistics(text: doc).words == 3)
    }

    @Test("Tilde fences are excluded too")
    func tildeFences() {
        let doc = ["Prose here", "", "~~~", "const a = 1", "~~~"]
            .joined(separator: "\n")
        #expect(DocumentStatistics(text: doc).words == 2)
    }

    @Test("Inline code is excluded")
    func inlineCode() {
        #expect(DocumentStatistics(text: "Use `npm install` now").words == 2)
    }

    @Test("Link labels count but URLs do not")
    func inlineLinks() {
        let stats = DocumentStatistics(text: "See [the docs](https://example.com/a/b/c)")
        #expect(stats.words == 3)
    }

    @Test("Reference links keep their label and drop the definition")
    func referenceLinks() {
        let doc = ["See [the docs][docs].", "", "[docs]: https://example.com/a/b/c"]
            .joined(separator: "\n")
        #expect(DocumentStatistics(text: doc).words == 3)
    }

    @Test("Images do not inflate the count")
    func images() {
        let stats = DocumentStatistics(text: "![a picture of a cat](cat.png)")
        #expect(stats.words == 0)
        #expect(stats.readingMinutes == 0)
    }

    @Test("Heading, list and quote markers are stripped")
    func blockMarkers() {
        let doc = ["# Title", "- one", "- two", "1. three", "> quoted"]
            .joined(separator: "\n")
        #expect(DocumentStatistics(text: doc).words == 5)
    }

    @Test("Task list checkboxes are stripped")
    func taskList() {
        let doc = ["- [x] Wire up the editor", "- [ ] Ship the DMG"]
            .joined(separator: "\n")
        #expect(DocumentStatistics(text: doc).words == 7)
    }

    @Test("A thematic break is not a word")
    func thematicBreak() {
        let stats = DocumentStatistics(text: "---")
        #expect(stats.words == 0)
        #expect(stats.lines == 1)
        #expect(stats.characters == 3)
    }

    @Test("Emphasis markers do not split words")
    func emphasis() {
        let stats = DocumentStatistics(text: "**bold** *italic* ~~struck~~ ==marked==")
        #expect(stats.words == 4)
    }

    @Test("Strong emphasis markers are stripped")
    func strongEmphasis() {
        #expect(DocumentStatistics(text: "***very bold*** ___also bold___").words == 4)
    }

    @Test("HTML tags and comments are removed")
    func html() {
        #expect(DocumentStatistics(text: "<div>inside</div><!-- hidden -->").words == 1)
    }

    @Test("Table pipes and delimiter rows are ignored")
    func tables() {
        let doc = ["| a | b |", "| --- | --- |", "| c | d |"].joined(separator: "\n")
        #expect(DocumentStatistics(text: doc).words == 4)
    }

    @Test("Character counts measure the raw source")
    func rawCharacters() {
        let stats = DocumentStatistics(text: "**hi**")
        #expect(stats.words == 1)
        #expect(stats.characters == 6)
        #expect(stats.charactersNoSpaces == 6)
    }

    @Test("Spaces are excluded from charactersNoSpaces")
    func charactersNoSpaces() {
        let stats = DocumentStatistics(text: "a b c")
        #expect(stats.characters == 5)
        #expect(stats.charactersNoSpaces == 3)
    }

    @Test("Line count follows the raw document")
    func lines() {
        #expect(DocumentStatistics(text: "one\ntwo\nthree").lines == 3)
        #expect(DocumentStatistics(text: "").lines == 0)
    }

    @Test("plainText leaves ordinary prose alone")
    func plainTextLeavesProse() {
        let plain = DocumentStatistics.plainText(from: "Just a sentence.")
        #expect(plain.trimmingCharacters(in: .whitespacesAndNewlines) == "Just a sentence.")
    }

    @Test("countWords ignores text without letters or digits")
    func countWordsDirectly() {
        #expect(DocumentStatistics.countWords(in: "one two three") == 3)
        #expect(DocumentStatistics.countWords(in: "") == 0)
        #expect(DocumentStatistics.countWords(in: "   ") == 0)
        #expect(DocumentStatistics.countWords(in: "--- | ---") == 0)
    }
}
