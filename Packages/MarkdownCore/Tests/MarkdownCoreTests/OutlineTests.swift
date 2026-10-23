import Testing

import MarkdownCore

/// Mirrors `test/outline.test.mjs` so the Swift outline and the Electron one
/// cannot drift apart.
@Suite("Outline")
struct OutlineTests {

    /// `from` is a `Character` offset, so slicing is spelled out once here.
    private func slice(_ document: String, from: Int, length: Int) -> String {
        let start = document.index(document.startIndex, offsetBy: from)
        return String(document[start..<document.index(start, offsetBy: length)])
    }

    @Test("Extracts ATX headings with levels and 1-based line numbers")
    func atxHeadings() {
        let document = ["# Title", "", "text", "## Section", "### Sub"].joined(separator: "\n")
        let outline = Outline.extract(document)

        #expect(outline.count == 3)
        #expect(outline.map(\.level) == [1, 2, 3])
        #expect(outline.map(\.text) == ["Title", "Section", "Sub"])
        #expect(outline.map(\.line) == [1, 4, 5])
    }

    @Test("Offsets point at the start of the heading line")
    func offsets() {
        let document = "# One\n\n## Two"
        let outline = Outline.extract(document)

        #expect(slice(document, from: outline[0].from, length: 5) == "# One")
        #expect(slice(document, from: outline[1].from, length: 6) == "## Two")
    }

    @Test("Offsets count characters, not UTF-16 units")
    func offsetsCountCharacters() {
        let document = "🎉 party\n\n# One"
        let outline = Outline.extract(document)

        #expect(outline[0].from == 9)
        #expect(slice(document, from: outline[0].from, length: 5) == "# One")
    }

    @Test("Ignores # inside fenced code blocks")
    func fencedCode() {
        let document = [
            "# Real",
            "",
            "```bash",
            "# not a heading",
            "echo hi",
            "```",
            "",
            "## Also real",
        ].joined(separator: "\n")

        #expect(Outline.extract(document).map(\.text) == ["Real", "Also real"])
    }

    @Test("A fence only closes on a matching marker of at least equal length")
    func fenceLength() {
        let document = ["````", "```", "# still code", "````", "# heading"]
            .joined(separator: "\n")

        #expect(Outline.extract(document).map(\.text) == ["heading"])
    }

    @Test("Handles tilde fences")
    func tildeFences() {
        let document = ["~~~", "# hidden", "~~~", "# shown"].joined(separator: "\n")

        #expect(Outline.extract(document).map(\.text) == ["shown"])
    }

    @Test("Supports setext headings")
    func setextHeadings() {
        let document = ["Title", "=====", "", "Section", "-------"].joined(separator: "\n")
        let outline = Outline.extract(document)

        #expect(outline.map(\.level) == [1, 2])
        #expect(outline.map(\.text) == ["Title", "Section"])
        // The heading is the text line, not the underline.
        #expect(outline.map(\.line) == [1, 4])
        #expect(slice(document, from: outline[0].from, length: 5) == "Title")
    }

    @Test("A list item followed by dashes is not a setext heading")
    func listIsNotSetext() {
        #expect(Outline.extract("- item\n---").isEmpty)
    }

    @Test("Strips inline markup from heading text")
    func stripsInlineMarkup() {
        let outline = Outline.extract("# A **bold** and `code` [link](http://x.com) title")

        #expect(outline[0].text == "A bold and code link title")
    }

    @Test("Drops trailing closing hashes")
    func closingHashes() {
        #expect(Outline.extract("## Section ##")[0].text == "Section")
    }

    @Test("Ignores headings with no text")
    func emptyHeadings() {
        #expect(Outline.extract("#\n##   \n# Real").map(\.text) == ["Real"])
    }

    @Test("Slugs are unique within a document")
    func uniqueSlugs() {
        let outline = Outline.extract("# Setup\n## Setup\n### Setup")

        #expect(outline.map(\.slug) == ["setup", "setup-1", "setup-2"])
    }

    @Test("Slugify matches common anchor conventions")
    func slugifyConventions() {
        #expect(Outline.slugify("Hello, World!") == "hello-world")
        #expect(Outline.slugify("  Spaced   Out  ") == "spaced-out")
        #expect(Outline.slugify("Ünïcode Tïtle") == "ünïcode-tïtle")
    }

    @Test("stripInline removes emphasis without eating inner text")
    func stripInlineEmphasis() {
        #expect(Outline.stripInline("***very*** ~~old~~ ==new==") == "very old new")
    }

    @Test("Tree nests headings and tolerates skipped levels")
    func nesting() {
        let roots = Outline.tree(Outline.extract("# A\n### B\n## C\n# D"))

        #expect(roots.count == 2)
        #expect(roots[0].heading.text == "A")
        // An h3 under an h1 attaches to the h1, and so does the h2 after it.
        #expect(roots[0].children.map(\.heading.text) == ["B", "C"])
        #expect(roots[0].children.allSatisfy({ $0.children.isEmpty }))
        #expect(roots[1].heading.text == "D")
        #expect(roots[1].children.isEmpty)
    }

    @Test("activeHeadingIndex finds the heading containing a line")
    func activeHeading() {
        let outline = Outline.extract("# A\n\ntext\n\n## B\n\nmore")

        #expect(Outline.activeHeadingIndex(outline, line: 1) == 0)
        #expect(Outline.activeHeadingIndex(outline, line: 3) == 0)
        #expect(Outline.activeHeadingIndex(outline, line: 5) == 1)
        #expect(Outline.activeHeadingIndex(outline, line: 7) == 1)
    }

    @Test("activeHeadingIndex returns -1 above the first heading")
    func activeHeadingAboveFirst() {
        #expect(Outline.activeHeadingIndex(Outline.extract("intro\n\n# A"), line: 1) == -1)
    }

    @Test("Empty and missing documents produce no headings")
    func emptyDocuments() {
        #expect(Outline.extract("").isEmpty)
        #expect(Outline.extract(nil).isEmpty)
    }
}
