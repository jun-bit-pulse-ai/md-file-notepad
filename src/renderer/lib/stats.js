/**
 * Document statistics for the status bar.
 *
 * Counts what a writer means by "words", not what `split(' ')` returns:
 * markdown syntax, code fences, URLs in links and HTML tags are excluded.
 */

const WORDS_PER_MINUTE = 220

/** Uses Intl.Segmenter where available so CJK text counts characters, not runs. */
const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : null

/** Removes markdown that shouldn't inflate the word count. */
function toPlainText(markdown) {
  if (!markdown) return ''
  return (
    markdown
      // Fenced and indented code blocks.
      .replace(/^```[\s\S]*?^```/gm, ' ')
      .replace(/^~~~[\s\S]*?^~~~/gm, ' ')
      // Inline code.
      .replace(/`[^`\n]*`/g, ' ')
      // Images: drop entirely; alt text isn't prose the author is writing.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      // Links: keep the label, drop the target.
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
      // Reference definitions.
      .replace(/^\s*\[[^\]]+\]:.*$/gm, ' ')
      // HTML tags and comments.
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
      // Block and inline markers.
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s{0,3}([*+-]|\d+[.)])\s+/gm, '')
      .replace(/^\s{0,3}\[[ xX]\]\s+/gm, '')
      .replace(/^\s{0,3}([-*_]\s*){3,}$/gm, ' ')
      .replace(/(\*\*\*|___)(.+?)\1/g, '$2')
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/(\*|_)(.+?)\1/g, '$2')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/==(.+?)==/g, '$1')
      // Table pipes.
      .replace(/\|/g, ' ')
      .replace(/^\s*:?-{3,}:?\s*$/gm, ' ')
  )
}

/** Joiners that keep a compound like "well-known" as a single word. */
const WORD_JOINERS = new Set(['-', '‑', '–', '’', "'"])

function countWords(text) {
  if (!text || !text.trim()) return 0
  if (segmenter) {
    // Segmenter splits on hyphens (UAX #29); writers don't. Merge segments
    // that a joiner glues to the preceding word so both code paths agree.
    let count = 0
    let previousWasWord = false
    let pendingJoiner = false

    for (const { segment, isWordLike } of segmenter.segment(text)) {
      if (isWordLike) {
        if (!(pendingJoiner && previousWasWord)) count++
        previousWasWord = true
        pendingJoiner = false
      } else if (WORD_JOINERS.has(segment)) {
        pendingJoiner = true
      } else {
        previousWasWord = false
        pendingJoiner = false
      }
    }
    return count
  }
  const matches = text.match(/[\p{L}\p{N}'’-]+/gu)
  return matches ? matches.length : 0
}

/**
 * Returns counts for the status bar. `selection` (when non-empty) is
 * measured instead of the whole document, matching how editors report
 * "N of M words selected".
 */
function computeStats(markdown, selection = '') {
  const target = selection && selection.length ? selection : markdown || ''
  const plain = toPlainText(target)
  const words = countWords(plain)
  const characters = target.length
  const charactersNoSpaces = target.replace(/\s/g, '').length
  const lines = (markdown || '').length ? (markdown || '').split('\n').length : 0
  const paragraphs = plain
    .split(/\n\s*\n/)
    .filter((block) => block.trim().length > 0).length
  const readingMinutes = Math.max(words > 0 ? 1 : 0, Math.round(words / WORDS_PER_MINUTE))

  return {
    words,
    characters,
    charactersNoSpaces,
    lines,
    paragraphs,
    readingMinutes,
    isSelection: Boolean(selection && selection.length),
  }
}

/** "1,204 words · 5 min read" — the string shown in the status bar. */
function formatStats(stats) {
  const number = (n) => n.toLocaleString()
  const parts = [`${number(stats.words)} ${stats.words === 1 ? 'word' : 'words'}`]
  parts.push(`${number(stats.characters)} chars`)
  if (stats.readingMinutes > 0) parts.push(`${stats.readingMinutes} min read`)
  return (stats.isSelection ? 'Selection: ' : '') + parts.join('  ·  ')
}

export { computeStats, countWords, formatStats, toPlainText, WORDS_PER_MINUTE }
