import Testing
import MarkdownCore

@Suite("Selection formatting")
struct MarkdownFormatterTests {

    private func apply(_ command: EditorCommand, _ text: String, _ range: Range<Int>) -> MarkdownFormatter.Result {
        MarkdownFormatter.apply(command, to: text, selection: range)
    }

    @Test("Bold wraps the selection and keeps it selected")
    func bold() {
        let result = apply(.bold, "hello world", 6..<11)
        #expect(result.text == "hello **world**")
        #expect(result.selection == 8..<13)
    }

    @Test("Bold on an already-bold selection removes the markers")
    func boldToggleInside() {
        let result = apply(.bold, "**word**", 0..<8)
        #expect(result.text == "word")
        #expect(result.selection == 0..<4)
    }

    @Test("Bold unwraps when the markers sit just outside the selection")
    func boldToggleOutside() {
        let result = apply(.bold, "**word**", 2..<6)
        #expect(result.text == "word")
    }

    @Test("An empty selection inserts markers with the caret between them")
    func emptySelection() {
        let result = apply(.italic, "ab", 1..<1)
        #expect(result.text == "a**b")
        #expect(result.selection == 2..<2)
    }

    @Test("Link selects the url placeholder")
    func link() {
        let result = apply(.link, "click here", 6..<10)
        #expect(result.text == "click [here](url)")
        #expect(result.selection == 13..<16)
    }

    @Test("Line commands apply to every line the selection touches")
    func bulletListAcrossLines() {
        let result = apply(.bulletList, "one\ntwo", 1..<5)
        #expect(result.text == "- one\n- two")
    }

    @Test("Applying a line command twice removes it")
    func bulletListToggle() {
        let result = apply(.bulletList, "- one\n- two", 0..<11)
        #expect(result.text == "one\ntwo")
    }

    @Test("Headings replace an existing marker rather than stacking")
    func headingReplacesMarker() {
        let result = apply(.heading2, "- item", 0..<6)
        #expect(result.text == "## item")
    }

    @Test("Numbered lists renumber from one")
    func numberedList() {
        let result = apply(.numberedList, "a\nb\nc", 0..<5)
        #expect(result.text == "1. a\n2. b\n3. c")
    }

    @Test("Code block fences the selection and selects the body")
    func codeBlock() {
        let result = apply(.codeBlock, "let x = 1", 0..<9)
        #expect(result.text == "```\nlet x = 1\n```")
        #expect(result.selection == 4..<13)
    }

    @Test("Horizontal rule is appended below the current line")
    func horizontalRule() {
        let result = apply(.horizontalRule, "text", 4..<4)
        #expect(result.text == "text\n\n---")
    }

    @Test("Out-of-range selections are clamped instead of crashing")
    func clampsSelection() {
        let result = apply(.bold, "hi", 0..<99)
        #expect(result.text == "**hi**")
    }

    @Test("Heading 4 applies its marker to the current line")
    func heading4() {
        let result = apply(.heading4, "item", 0..<4)
        #expect(result.text == "#### item")
        #expect(result.selection == 0..<9)
    }

    @Test("Heading 5 applies its marker to the current line")
    func heading5() {
        let result = apply(.heading5, "item", 0..<4)
        #expect(result.text == "##### item")
        #expect(result.selection == 0..<10)
    }

    @Test("Heading 6 applies its marker to the current line")
    func heading6() {
        let result = apply(.heading6, "item", 0..<4)
        #expect(result.text == "###### item")
        #expect(result.selection == 0..<11)
    }

    @Test("Deep headings replace an existing heading marker rather than stacking")
    func deepHeadingReplacesHeadingMarker() {
        #expect(apply(.heading5, "### x", 0..<5).text == "##### x")
        #expect(apply(.heading4, "###### x", 0..<8).text == "#### x")
        #expect(apply(.heading6, "# x", 0..<3).text == "###### x")
    }

    @Test("Deep headings replace list and quote markers too")
    func deepHeadingReplacesListMarker() {
        #expect(apply(.heading4, "- item", 0..<6).text == "#### item")
        #expect(apply(.heading5, "> item", 0..<6).text == "##### item")
        #expect(apply(.heading6, "1. item", 0..<7).text == "###### item")
    }

    @Test("Applying a deep heading twice removes it")
    func deepHeadingToggle() {
        #expect(apply(.heading4, "#### x", 0..<6).text == "x")
        #expect(apply(.heading6, "###### x", 0..<8).text == "x")
    }

    @Test("Deep headings apply to every line the selection touches")
    func deepHeadingAcrossLines() {
        let result = apply(.heading4, "one\ntwo", 1..<5)
        #expect(result.text == "#### one\n#### two")
    }

    @Test("Deep headings round-trip through the parser")
    func deepHeadingsParse() {
        let levels: [(EditorCommand, Int)] = [(.heading4, 4), (.heading5, 5), (.heading6, 6)]
        for (command, level) in levels {
            let result = apply(command, "Title", 0..<5)
            let expected: [MarkdownBlock] = [.heading(level: level, text: "Title")]
            #expect(MarkdownParser.parse(result.text) == expected)
        }
    }

    @Test("Every heading level carries a title, a symbol and a line prefix")
    func headingMetadata() {
        let headings: [EditorCommand] = [
            .heading1, .heading2, .heading3, .heading4, .heading5, .heading6,
        ]
        for (index, command) in headings.enumerated() {
            let level = index + 1
            #expect(command.title == "Heading \(level)")
            #expect(command.linePrefix == String(repeating: "#", count: level) + " ")
            #expect(command.wrapper == nil)
            #expect(!command.symbol.isEmpty)
        }
    }

    @Test("Offsets count grapheme clusters, not UTF-16 units")
    func unicodeOffsets() {
        // The flag is one Character but four UTF-16 units, so a UTF-16-based
        // implementation would wrap the wrong span here.
        let result = apply(.bold, "🇯🇵 hello", 2..<7)
        #expect(result.text == "🇯🇵 **hello**")
        #expect(result.selection == 4..<9)
    }
}
