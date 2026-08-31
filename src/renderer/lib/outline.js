/**
 * Heading extraction for the outline sidebar.
 *
 * Deliberately independent of the CodeMirror syntax tree: the outline needs
 * to work on plain strings (exports, tests, files not currently open) and
 * only needs line-level accuracy.
 */

const ATX = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/
const SETEXT_UNDERLINE = /^(=+|-+)\s*$/
const FENCE = /^(\s{0,3})(`{3,}|~{3,})/

/** Strips inline markdown so the sidebar shows readable text, not syntax. */
function stripInline(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*\*|___)(.+?)\1/g, '$2')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/==(.+?)==/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
}

/** GitHub-compatible anchor slugs, used for export and outline links. */
function slugify(text) {
  return stripInline(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
}

/**
 * Returns headings as `{ level, text, slug, line, from }`, where `line` is
 * 1-based and `from` is the document offset of the line start.
 *
 * Fenced code blocks are skipped so a `# comment` inside a shell snippet
 * never shows up as a heading.
 */
function extractOutline(doc) {
  if (!doc) return []
  const lines = doc.split('\n')
  const headings = []
  const slugCounts = new Map()

  let offset = 0
  let fence = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineStart = offset
    offset += line.length + 1

    const fenceMatch = FENCE.exec(line)
    if (fence) {
      // Only a fence of the same character and at least equal length closes.
      if (
        fenceMatch &&
        fenceMatch[2][0] === fence[0] &&
        fenceMatch[2].length >= fence.length
      ) {
        fence = null
      }
      continue
    }
    if (fenceMatch) {
      fence = fenceMatch[2]
      continue
    }

    let level = 0
    let rawText = ''

    const atx = ATX.exec(line)
    if (atx) {
      level = atx[1].length
      rawText = atx[2]
    } else if (
      i > 0 &&
      SETEXT_UNDERLINE.test(line) &&
      lines[i - 1].trim() &&
      !ATX.test(lines[i - 1]) &&
      // A setext underline can't follow a list item or blockquote marker.
      !/^\s{0,3}([*+-]|\d+[.)]|>)\s/.test(lines[i - 1])
    ) {
      level = line.trim().startsWith('=') ? 1 : 2
      rawText = lines[i - 1]
      const previous = headings[headings.length - 1]
      // The heading belongs to the previous line, not the underline.
      const text = stripInline(rawText)
      if (previous && previous.line === i) continue
      headings.push(
        makeHeading(level, text, i, lineStart - (lines[i - 1].length + 1), slugCounts)
      )
      continue
    }

    if (!level) continue
    const text = stripInline(rawText)
    if (!text) continue
    headings.push(makeHeading(level, text, i + 1, lineStart, slugCounts))
  }

  return headings
}

function makeHeading(level, text, line, from, slugCounts) {
  const base = slugify(text) || 'section'
  const seen = slugCounts.get(base) || 0
  slugCounts.set(base, seen + 1)
  return {
    level,
    text,
    slug: seen ? `${base}-${seen}` : base,
    line,
    from: Math.max(0, from),
  }
}

/**
 * Nests a flat heading list into a tree. Handles skipped levels (an h3
 * directly under an h1) by attaching to the nearest shallower heading.
 */
function toTree(headings) {
  const root = []
  const stack = []
  for (const heading of headings) {
    const node = { ...heading, children: [] }
    while (stack.length && stack[stack.length - 1].level >= node.level) {
      stack.pop()
    }
    if (stack.length) stack[stack.length - 1].children.push(node)
    else root.push(node)
    stack.push(node)
  }
  return root
}

/** The heading that contains a given line, for highlighting in the sidebar. */
function activeHeadingIndex(headings, line) {
  let active = -1
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].line <= line) active = i
    else break
  }
  return active
}

export { activeHeadingIndex, extractOutline, slugify, stripInline, toTree }
