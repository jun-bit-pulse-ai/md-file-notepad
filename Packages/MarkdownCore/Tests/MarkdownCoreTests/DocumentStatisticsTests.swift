import Testing
import MarkdownCore

@Suite("Document statistics")
struct DocumentStatisticsTests {

    @Test("Counts words, characters, and lines")
    func counts() {
        let stats = DocumentStatistics(text: "one two\nthree")
        #expect(stats.words == 3)
        #expect(stats.characters == 13)
        #expect(stats.lines == 2)
    }

    @Test("An empty document is one line with no words")
    func empty() {
        let stats = DocumentStatistics(text: "")
        #expect(stats.words == 0)
        #expect(stats.lines == 1)
        #expect(stats.readingMinutes == 1)
    }

    @Test("Reading time rounds up from 200 words per minute")
    func readingTime() {
        let text = Array(repeating: "word", count: 250).joined(separator: " ")
        #expect(DocumentStatistics(text: text).readingMinutes == 2)
    }
}
