import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from 'docx'

import { md } from './markdown.js'

/**
 * Word (.docx) export.
 *
 * Split in two on purpose: `parseBlocks` turns Markdown into plain
 * descriptor objects and has no dependency on the docx library, so the
 * mapping can be unit-tested directly. `buildDocument` is the thin layer
 * that turns those descriptors into Word structures.
 */

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
]

const MONO_FONT = 'Consolas'
const BODY_FONT = 'Calibri'
const CODE_FILL = 'F4F4F6'
const QUOTE_COLOR = '5A5A62'
const RULE_COLOR = 'D0D0D5'
const HIGHLIGHT_FILL = 'FFF3A3'
const LINK_COLOR = '0563C1'

/** Max image width in inches, so a large screenshot doesn't overflow the page. */
const MAX_IMAGE_INCHES = 6.0
const DPI = 96

/* -------------------------------------------------------------------- */
/* Markdown -> block descriptors                                         */
/* -------------------------------------------------------------------- */

function stripTags(html) {
  return String(html || '').replace(/<[^>]*>/g, '')
}

/**
 * Flattens an inline token's children into styled runs.
 * Nesting is tracked with counters so `**bold *and italic* **` works.
 */
function inlineRuns(children) {
  if (!Array.isArray(children)) return []

  const runs = []
  const depth = { bold: 0, italic: 0, strike: 0, highlight: 0 }
  let link = null

  const push = (extra) => {
    const run = {
      text: extra.text ?? '',
      bold: depth.bold > 0,
      italic: depth.italic > 0,
      strike: depth.strike > 0,
      highlight: depth.highlight > 0,
      code: Boolean(extra.code),
      ...(link ? { link } : {}),
      ...(extra.break ? { break: true } : {}),
      ...(extra.image ? { image: extra.image } : {}),
    }
    if (!run.text && !run.break && !run.image) return
    runs.push(run)
  }

  for (const token of children) {
    switch (token.type) {
      case 'strong_open': depth.bold++; break
      case 'strong_close': depth.bold--; break
      case 'em_open': depth.italic++; break
      case 'em_close': depth.italic--; break
      case 's_open': depth.strike++; break
      case 's_close': depth.strike--; break
      case 'mark_open': depth.highlight++; break
      case 'mark_close': depth.highlight--; break

      case 'link_open': link = token.attrGet('href') || null; break
      case 'link_close': link = null; break

      case 'text': push({ text: token.content }); break
      case 'code_inline': push({ text: token.content, code: true }); break
      // Word has no KaTeX; keep the source legible in a monospace run.
      case 'math_inline': push({ text: token.content, code: true }); break

      case 'softbreak': push({ text: ' ' }); break
      case 'hardbreak': push({ break: true }); break

      case 'image':
        push({
          text: token.content || token.attrGet('alt') || '',
          image: token.attrGet('src') || '',
        })
        break

      case 'html_inline':
        // The task-list plugin injects a checkbox here; the list item
        // already carries that state, so drop it.
        if (!/task-checkbox/.test(token.content)) push({ text: stripTags(token.content) })
        break

      default:
        break
    }
  }

  return runs
}

function cellAlignment(token) {
  const style = token.attrGet('style') || ''
  if (style.includes('center')) return 'center'
  if (style.includes('right')) return 'right'
  return 'left'
}

/** Reads a table out of the token stream, returning it and the end index. */
function parseTable(tokens, start) {
  const header = []
  const rows = []
  const alignments = []
  let current = null
  let inHeader = false
  let i = start

  for (; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type === 'table_close') break

    switch (token.type) {
      case 'thead_open': inHeader = true; break
      case 'thead_close': inHeader = false; break
      case 'tr_open': current = []; break
      case 'tr_close':
        if (current) (inHeader ? header : rows).push(current)
        current = null
        break
      case 'th_open':
      case 'td_open': {
        const inline = tokens[i + 1]
        const runs = inline && inline.type === 'inline' ? inlineRuns(inline.children) : []
        if (inHeader) alignments.push(cellAlignment(token))
        if (current) current.push(runs)
        break
      }
      default:
        break
    }
  }

  return { block: { type: 'table', header, rows, alignments }, end: i }
}

/**
 * Converts Markdown into an array of block descriptors.
 *
 * Every block is a plain object, which keeps this function pure and makes
 * the Markdown-to-Word mapping straightforward to assert on in tests.
 */
function parseBlocks(markdown) {
  const tokens = md.parse(markdown || '', {})
  const blocks = []

  /** Open lists, outermost first. */
  const lists = []
  /** Set when a list item has opened but its first paragraph hasn't landed. */
  let pendingItem = null
  let quoteDepth = 0
  let orderedInstance = 0

  const listContext = () => (lists.length ? lists[lists.length - 1] : null)

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    switch (token.type) {
      case 'heading_open': {
        const inline = tokens[i + 1]
        blocks.push({
          type: 'heading',
          level: Math.min(6, Math.max(1, Number(token.tag.slice(1)) || 1)),
          runs: inline ? inlineRuns(inline.children) : [],
        })
        i += 2
        break
      }

      case 'paragraph_open': {
        const inline = tokens[i + 1]
        const runs = inline && inline.type === 'inline' ? inlineRuns(inline.children) : []
        const list = listContext()

        // A paragraph holding nothing but an image becomes a block image.
        const onlyImage =
          runs.length === 1 && runs[0].image && !runs[0].text.trim().includes('\n')

        if (pendingItem && list) {
          blocks.push({
            type: 'list-item',
            ordered: list.ordered,
            level: list.level,
            instance: list.instance,
            checked: pendingItem.checked,
            runs,
          })
          pendingItem = null
        } else if (onlyImage && !list) {
          blocks.push({ type: 'image', src: runs[0].image, alt: runs[0].text })
        } else {
          blocks.push({
            type: 'paragraph',
            quote: quoteDepth > 0,
            indent: list ? list.level + 1 : 0,
            runs,
          })
        }
        i += 2
        break
      }

      case 'bullet_list_open':
        lists.push({ ordered: false, level: lists.length, instance: 0 })
        break

      case 'ordered_list_open':
        // A fresh instance per top-level list so numbering restarts.
        if (!lists.length) orderedInstance++
        lists.push({ ordered: true, level: lists.length, instance: orderedInstance })
        break

      case 'bullet_list_close':
      case 'ordered_list_close':
        lists.pop()
        break

      case 'list_item_open': {
        const cls = token.attrGet('class') || ''
        pendingItem = {
          checked: cls.includes('task-done')
            ? true
            : cls.includes('task-item')
              ? false
              : null,
        }
        break
      }

      case 'list_item_close':
        pendingItem = null
        break

      case 'blockquote_open': quoteDepth++; break
      case 'blockquote_close': quoteDepth--; break

      case 'fence':
      case 'code_block':
        blocks.push({
          type: 'code',
          language: (token.info || '').trim().split(/\s+/)[0] || '',
          code: token.content.replace(/\n$/, ''),
        })
        break

      case 'math_block':
        blocks.push({ type: 'code', language: 'math', code: token.content.trim() })
        break

      case 'hr':
        blocks.push({ type: 'hr' })
        break

      case 'table_open': {
        const { block, end } = parseTable(tokens, i)
        blocks.push(block)
        i = end
        break
      }

      default:
        break
    }
  }

  return blocks
}

/* -------------------------------------------------------------------- */
/* Images                                                                */
/* -------------------------------------------------------------------- */

const IMAGE_SIGNATURES = [
  { type: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'gif', bytes: [0x47, 0x49, 0x46] },
  { type: 'bmp', bytes: [0x42, 0x4d] },
]

/** Word needs the format up front; sniff it rather than trusting the extension. */
function detectImageType(data) {
  if (!data || data.length < 4) return null
  for (const { type, bytes } of IMAGE_SIGNATURES) {
    if (bytes.every((byte, index) => data[index] === byte)) return type
  }
  return null
}

/** Fits an image inside the page's text column, never enlarging it. */
function scaleImage(width, height, maxInches = MAX_IMAGE_INCHES) {
  const maxWidth = maxInches * DPI
  if (!width || !height) return { width: Math.round(maxWidth), height: Math.round(maxWidth * 0.6) }
  if (width <= maxWidth) return { width: Math.round(width), height: Math.round(height) }
  const ratio = maxWidth / width
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) }
}

/**
 * Replaces image blocks with their bytes and display size.
 * `loadImage(src)` should resolve `{data, width, height}` or null; anything
 * that fails to load degrades to a caption paragraph rather than vanishing.
 */
async function resolveImages(blocks, loadImage) {
  if (typeof loadImage !== 'function') return blocks

  const resolved = []
  for (const block of blocks) {
    if (block.type !== 'image') {
      resolved.push(block)
      continue
    }
    let loaded = null
    try {
      loaded = await loadImage(block.src)
    } catch {
      loaded = null
    }
    const imageType = loaded && detectImageType(loaded.data)
    if (loaded && loaded.data && imageType) {
      resolved.push({
        ...block,
        data: loaded.data,
        imageType,
        ...scaleImage(loaded.width, loaded.height),
      })
    } else {
      resolved.push({
        type: 'paragraph',
        quote: false,
        indent: 0,
        missingImage: true,
        runs: [{ text: `[image: ${block.alt || block.src}]`, italic: true, code: false }],
      })
    }
  }
  return resolved
}

/* -------------------------------------------------------------------- */
/* Block descriptors -> Word                                             */
/* -------------------------------------------------------------------- */

function toTextRun(run) {
  const options = {
    text: run.text,
    bold: run.bold || undefined,
    italics: run.italic || undefined,
    strike: run.strike || undefined,
    font: run.code ? MONO_FONT : undefined,
    size: run.code ? 20 : undefined,
    shading: run.highlight
      ? { type: ShadingType.CLEAR, fill: HIGHLIGHT_FILL }
      : run.code
        ? { type: ShadingType.CLEAR, fill: CODE_FILL }
        : undefined,
  }
  if (run.break) options.break = 1
  return new TextRun(options)
}

function toChildren(runs) {
  const children = []
  for (const run of runs || []) {
    if (run.link) {
      children.push(
        new ExternalHyperlink({
          children: [new TextRun({ ...textRunOptions(run), style: 'Hyperlink' })],
          link: run.link,
        })
      )
    } else {
      children.push(toTextRun(run))
    }
  }
  return children
}

function textRunOptions(run) {
  return {
    text: run.text,
    bold: run.bold || undefined,
    italics: run.italic || undefined,
    strike: run.strike || undefined,
    color: LINK_COLOR,
    underline: {},
  }
}

function tableCell(runs, alignment) {
  return new TableCell({
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        alignment:
          alignment === 'center'
            ? AlignmentType.CENTER
            : alignment === 'right'
              ? AlignmentType.RIGHT
              : AlignmentType.LEFT,
        children: toChildren(runs),
      }),
    ],
  })
}

function buildTable(block) {
  const rows = []

  if (block.header.length) {
    for (const headerRow of block.header) {
      rows.push(
        new TableRow({
          tableHeader: true,
          children: headerRow.map((runs, index) =>
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: CODE_FILL },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [
                new Paragraph({
                  alignment:
                    block.alignments[index] === 'center'
                      ? AlignmentType.CENTER
                      : block.alignments[index] === 'right'
                        ? AlignmentType.RIGHT
                        : AlignmentType.LEFT,
                  children: toChildren(runs.map((run) => ({ ...run, bold: true }))),
                }),
              ],
            })
          ),
        })
      )
    }
  }

  for (const row of block.rows) {
    rows.push(
      new TableRow({
        children: row.map((runs, index) => tableCell(runs, block.alignments[index])),
      })
    )
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  })
}

function buildBlock(block) {
  switch (block.type) {
    case 'heading':
      return new Paragraph({
        heading: HEADING_LEVELS[block.level - 1],
        spacing: { before: 240, after: 120 },
        children: toChildren(block.runs),
      })

    case 'paragraph':
      return new Paragraph({
        spacing: { after: 160 },
        indent: block.quote
          ? { left: convertInchesToTwip(0.4) }
          : block.indent
            ? { left: convertInchesToTwip(0.3 * block.indent) }
            : undefined,
        border: block.quote
          ? { left: { style: BorderStyle.SINGLE, size: 12, color: RULE_COLOR, space: 12 } }
          : undefined,
        children: toChildren(
          block.quote
            ? block.runs.map((run) => ({ ...run, italic: true }))
            : block.runs
        ),
        ...(block.quote ? { style: undefined } : {}),
      })

    case 'list-item': {
      const prefix =
        block.checked === null
          ? []
          : [{ text: block.checked ? '☒ ' : '☐ ', code: false }]
      const runs = [...prefix, ...block.runs]
      return new Paragraph({
        spacing: { after: 60 },
        ...(block.ordered
          ? { numbering: { reference: 'md-ordered', level: block.level, instance: block.instance } }
          : { bullet: { level: block.level } }),
        children: toChildren(runs),
      })
    }

    case 'code': {
      const lines = block.code.split('\n')
      return new Paragraph({
        spacing: { before: 120, after: 160 },
        shading: { type: ShadingType.CLEAR, fill: CODE_FILL },
        indent: { left: convertInchesToTwip(0.15) },
        children: lines.map(
          (line, index) =>
            new TextRun({
              text: line || ' ',
              font: MONO_FONT,
              size: 19,
              break: index === 0 ? undefined : 1,
            })
        ),
      })
    }

    case 'hr':
      return new Paragraph({
        spacing: { before: 200, after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE_COLOR, space: 1 } },
        children: [],
      })

    case 'image':
      return new Paragraph({
        spacing: { before: 120, after: 160 },
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: block.imageType,
            data: block.data,
            transformation: { width: block.width, height: block.height },
          }),
        ],
      })

    case 'table':
      return buildTable(block)

    default:
      return new Paragraph({ children: [] })
  }
}

/** Word needs an explicit numbering definition for ordered lists. */
const NUMBERING_CONFIG = {
  config: [
    {
      reference: 'md-ordered',
      levels: [0, 1, 2, 3, 4].map((level) => ({
        level,
        format: LevelFormat.DECIMAL,
        text: `%${level + 1}.`,
        alignment: AlignmentType.START,
        style: {
          paragraph: {
            indent: {
              left: convertInchesToTwip(0.35 * (level + 1)),
              hanging: convertInchesToTwip(0.25),
            },
          },
        },
      })),
    },
  ],
}

function buildDocument(blocks, { title = 'Untitled' } = {}) {
  return new Document({
    title,
    creator: 'Notepad MD',
    description: 'Exported from Notepad MD',
    numbering: NUMBERING_CONFIG,
    styles: {
      default: {
        document: { run: { font: BODY_FONT, size: 22 }, paragraph: { spacing: { line: 300 } } },
      },
      characterStyles: [
        {
          id: 'Hyperlink',
          name: 'Hyperlink',
          basedOn: 'DefaultParagraphFont',
          run: { color: LINK_COLOR, underline: {} },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } },
        },
        children: blocks.map(buildBlock),
      },
    ],
  })
}

/**
 * Full pipeline: Markdown in, .docx bytes out.
 * `loadImage` is optional; without it images become caption text.
 */
async function markdownToDocx(markdown, { title = 'Untitled', loadImage } = {}) {
  const blocks = await resolveImages(parseBlocks(markdown), loadImage)
  const document = buildDocument(blocks, { title })
  return Packer.toArrayBuffer(document)
}

export {
  buildDocument,
  detectImageType,
  inlineRuns,
  markdownToDocx,
  parseBlocks,
  resolveImages,
  scaleImage,
}
