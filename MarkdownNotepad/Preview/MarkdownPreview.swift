import MarkdownCore
import SwiftUI

struct MarkdownPreview: View {
    let blocks: [MarkdownBlock]
    let fontSize: CGFloat

    var body: some View {
        ScrollView {
            BlockSequence(blocks: blocks, fontSize: fontSize)
                .frame(maxWidth: 720, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.horizontal, 28)
                .padding(.vertical, 24)
                .textSelection(.enabled)
        }
        .background(Color(nsColor: .textBackgroundColor))
    }
}

private struct BlockSequence: View {
    let blocks: [MarkdownBlock]
    let fontSize: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                BlockView(block: block, fontSize: fontSize)
            }
        }
    }
}

private struct BlockView: View {
    let block: MarkdownBlock
    let fontSize: CGFloat

    var body: some View {
        switch block {
        case let .heading(level, text):
            Text(InlineMarkdown.attributed(text, fontSize: headingSize(level)))
                .font(.system(size: headingSize(level), weight: level <= 2 ? .bold : .semibold))
                .padding(.top, level <= 2 ? 8 : 4)

        case let .paragraph(text):
            Text(InlineMarkdown.attributed(text, fontSize: fontSize))
                .font(.system(size: fontSize))
                .lineSpacing(fontSize * 0.32)
                .fixedSize(horizontal: false, vertical: true)

        case let .list(ordered, start, items):
            ListBlock(ordered: ordered, start: start, items: items, fontSize: fontSize)

        case let .quote(blocks):
            HStack(spacing: 12) {
                Rectangle()
                    .fill(Color.accentColor.opacity(0.5))
                    .frame(width: 3)
                BlockSequence(blocks: blocks, fontSize: fontSize)
                    .foregroundStyle(.secondary)
            }
            .fixedSize(horizontal: false, vertical: true)

        case let .code(language, code):
            CodeBlock(language: language, code: code, fontSize: fontSize)

        case let .table(table):
            TableBlock(table: table, fontSize: fontSize)

        case .thematicBreak:
            Divider().padding(.vertical, 6)
        }
    }

    private func headingSize(_ level: Int) -> CGFloat {
        let scales: [CGFloat] = [1.85, 1.5, 1.28, 1.12, 1.0, 0.92]
        return fontSize * scales[min(max(level, 1), 6) - 1]
    }
}

private struct ListBlock: View {
    let ordered: Bool
    let start: Int
    let items: [MarkdownListItem]
    let fontSize: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(items.enumerated()), id: \.offset) { offset, item in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    marker(for: item, at: offset)
                        .font(.system(size: fontSize, design: ordered ? .monospaced : .default))
                        .foregroundStyle(.secondary)
                        .frame(minWidth: fontSize * 1.2, alignment: .trailing)
                    BlockSequence(blocks: item.blocks, fontSize: fontSize)
                }
            }
        }
        .padding(.leading, 4)
    }

    @ViewBuilder
    private func marker(for item: MarkdownListItem, at offset: Int) -> some View {
        if let checked = item.checked {
            Image(systemName: checked ? "checkmark.square.fill" : "square")
                .foregroundStyle(checked ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(.secondary))
        } else if ordered {
            Text("\(start + offset).")
        } else {
            Text("•")
        }
    }
}

private struct CodeBlock: View {
    let language: String?
    let code: String
    let fontSize: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let language, !language.isEmpty {
                Text(language)
                    .font(.system(size: fontSize * 0.75, weight: .medium, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 5)
            }
            ScrollView(.horizontal) {
                Text(code)
                    .font(.system(size: fontSize * 0.92, design: .monospaced))
                    .textSelection(.enabled)
                    .padding(12)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.secondary.opacity(0.12), in: .rect(cornerRadius: 8))
    }
}

private struct TableBlock: View {
    let table: MarkdownTable
    let fontSize: CGFloat

    var body: some View {
        ScrollView(.horizontal) {
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
                GridRow {
                    ForEach(Array(table.header.enumerated()), id: \.offset) { column, cell in
                        cellText(cell, column: column)
                            .fontWeight(.semibold)
                    }
                }
                Divider().gridCellUnsizedAxes(.horizontal)
                ForEach(Array(table.rows.enumerated()), id: \.offset) { _, row in
                    GridRow {
                        ForEach(Array(row.enumerated()), id: \.offset) { column, cell in
                            cellText(cell, column: column)
                        }
                    }
                }
            }
            .padding(12)
        }
        .background(Color.secondary.opacity(0.08), in: .rect(cornerRadius: 8))
    }

    private func cellText(_ cell: String, column: Int) -> some View {
        Text(InlineMarkdown.attributed(cell, fontSize: fontSize))
            .font(.system(size: fontSize * 0.95))
            .frame(maxWidth: .infinity, alignment: alignment(for: column))
    }

    private func alignment(for column: Int) -> Alignment {
        switch table.alignments.indices.contains(column) ? table.alignments[column] : .none {
        case .center: .center
        case .right: .trailing
        case .left, .none: .leading
        }
    }
}
