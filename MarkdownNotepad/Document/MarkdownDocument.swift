import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    /// The system-declared type for `.md` / `.markdown` files.
    static let markdownText = UTType(importedAs: "net.daringfireball.markdown")
}

struct MarkdownDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.markdownText, .plainText]
    static let writableContentTypes: [UTType] = [.markdownText, .plainText]

    var text: String

    init(text: String = MarkdownDocument.starterText) {
        self.text = text
    }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        // Markdown is UTF-8 by convention; fall back to a lossy decode rather
        // than refusing to open a file the user can see in Finder.
        self.text = String(data: data, encoding: .utf8) ?? String(decoding: data, as: UTF8.self)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(text.utf8))
    }
}

extension MarkdownDocument {
    static let starterText = """
    # Untitled

    Write Markdown on the left, see it rendered on the right.

    - **Bold**, *italic*, `code`, and [links](https://commonmark.org)
    - Task lists:
      - [x] Parse blocks
      - [ ] Write something worth reading

    > Use the Format menu, or ⌘B / ⌘I / ⌘K, to style the selection.

    """
}
