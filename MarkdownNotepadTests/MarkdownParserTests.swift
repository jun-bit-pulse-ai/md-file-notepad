import Testing
import MarkdownCore

@Suite("Markdown block parser")
struct MarkdownParserTests {

    @Test("ATX headings capture level and text")
    func headings() {
        #expect(MarkdownParser.parse("# Title") == [.heading(level: 1, text: "Title")])
        #expect(MarkdownParser.parse("### Deep ###") == [.heading(level: 3, text: "Deep")])
        #expect(MarkdownParser.parse("####### Too deep") == [.paragraph(text: "####### Too deep")])
    }

    @Test("A hash without a space is not a heading")
    func hashWithoutSpace() {
        #expect(MarkdownParser.parse("#NotAHeading") == [.paragraph(text: "#NotAHeading")])
    }

    @Test("Closing hashes are only stripped when they are a suffix run")
    func headingKeepsSharpInName() {
        #expect(MarkdownParser.parse("# C# notes") == [.heading(level: 1, text: "C# notes")])
    }

    @Test("Paragraphs keep soft line breaks and split on blank lines")
    func paragraphs() {
        let blocks = MarkdownParser.parse("one\ntwo\n\nthree")
        #expect(blocks == [.paragraph(text: "one\ntwo"), .paragraph(text: "three")])
    }

    @Test("Fenced code keeps its body verbatim and records the language")
    func fencedCode() {
        let source = """
        ```swift
        let x = 1

        print(x)
        ```
        """
        #expect(MarkdownParser.parse(source) == [
            .code(language: "swift", code: "let x = 1\n\nprint(x)")
        ])
    }

    @Test("An unterminated fence runs to the end of the document")
    func unterminatedFence() {
        #expect(MarkdownParser.parse("```\nstill code") == [.code(language: nil, code: "still code")])
    }

    @Test("Markdown inside a fence is not parsed as blocks")
    func fenceShieldsMarkdown() {
        #expect(MarkdownParser.parse("```\n# not a heading\n```") == [
            .code(language: nil, code: "# not a heading")
        ])
    }

    @Test("Thematic breaks win over bullet lists")
    func thematicBreak() {
        #expect(MarkdownParser.parse("---") == [.thematicBreak])
        #expect(MarkdownParser.parse("* * *") == [.thematicBreak])
        #expect(MarkdownParser.parse("--") == [.paragraph(text: "--")])
    }

    @Test("Bullet lists collect one item per marker")
    func bulletList() {
        let blocks = MarkdownParser.parse("- one\n- two")
        #expect(blocks == [
            .list(ordered: false, start: 1, items: [
                MarkdownListItem(checked: nil, blocks: [.paragraph(text: "one")]),
                MarkdownListItem(checked: nil, blocks: [.paragraph(text: "two")]),
            ])
        ])
    }

    @Test("Ordered lists remember their starting number")
    func orderedListStart() {
        let blocks = MarkdownParser.parse("3. three\n4. four")
        guard case let .list(ordered, start, items) = blocks.first else {
            Issue.record("expected a list, got \(String(describing: blocks.first))")
            return
        }
        #expect(ordered)
        #expect(start == 3)
        #expect(items.count == 2)
    }

    @Test("Emphasis at the start of a line is not a bullet")
    func emphasisIsNotABullet() {
        #expect(MarkdownParser.parse("**bold**") == [.paragraph(text: "**bold**")])
    }

    @Test("Indented markers nest instead of becoming siblings")
    func nestedList() {
        let blocks = MarkdownParser.parse("- outer\n  - inner")
        let expected: [MarkdownBlock] = [
            .list(ordered: false, start: 1, items: [
                MarkdownListItem(checked: nil, blocks: [
                    .paragraph(text: "outer"),
                    .list(ordered: false, start: 1, items: [
                        MarkdownListItem(checked: nil, blocks: [.paragraph(text: "inner")])
                    ]),
                ])
            ])
        ]
        #expect(blocks == expected)
    }

    @Test("Task markers set the checked state and are stripped from the text")
    func taskList() {
        let blocks = MarkdownParser.parse("- [x] done\n- [ ] todo")
        guard case let .list(_, _, items) = blocks.first else {
            Issue.record("expected a list")
            return
        }
        #expect(items.map(\.checked) == [true, false])
        #expect(items.first?.blocks == [.paragraph(text: "done")])
    }

    @Test("Block quotes are parsed recursively")
    func quote() {
        #expect(MarkdownParser.parse("> # inside") == [
            .quote(blocks: [.heading(level: 1, text: "inside")])
        ])
    }

    @Test("Tables read alignments from the delimiter row")
    func table() {
        let source = """
        | a | b | c |
        | :- | :-: | -: |
        | 1 | 2 | 3 |
        """
        let expected = MarkdownTable(
            header: ["a", "b", "c"],
            alignments: [.left, .center, .right],
            rows: [["1", "2", "3"]]
        )
        #expect(MarkdownParser.parse(source) == [.table(expected)])
    }

    @Test("A pipe line without a delimiter row stays a paragraph")
    func pipeParagraph() {
        #expect(MarkdownParser.parse("a | b") == [.paragraph(text: "a | b")])
    }

    @Test("Short rows are padded to the header width")
    func raggedTableRow() {
        let blocks = MarkdownParser.parse("| a | b |\n| - | - |\n| 1 |")
        guard case let .table(table) = blocks.first else {
            Issue.record("expected a table")
            return
        }
        #expect(table.rows == [["1", ""]])
    }

    @Test("CRLF input parses the same as LF")
    func windowsLineEndings() {
        #expect(MarkdownParser.parse("# a\r\n\r\nb") == MarkdownParser.parse("# a\n\nb"))
    }

    @Test("A bare marker with no content yields an empty item")
    func emptyListItem() {
        // Regression: the item's first line used to keep its "- " marker and
        // re-parse as a list of itself until the stack ran out.
        #expect(MarkdownParser.parse("-") == [
            .list(ordered: false, start: 1, items: [
                MarkdownListItem(checked: nil, blocks: [])
            ])
        ])
    }

    @Test("Pathologically deep nesting terminates instead of overflowing")
    func deepNesting() {
        let lists = (0..<400)
            .map { String(repeating: " ", count: $0 * 2) + "- item" }
            .joined(separator: "\n")
        #expect(!MarkdownParser.parse(lists).isEmpty)

        let quotes = String(repeating: "> ", count: 400) + "deep"
        #expect(!MarkdownParser.parse(quotes).isEmpty)
    }

    @Test("An empty document produces no blocks")
    func empty() {
        #expect(MarkdownParser.parse("").isEmpty)
        #expect(MarkdownParser.parse("\n\n   \n").isEmpty)
    }
}
