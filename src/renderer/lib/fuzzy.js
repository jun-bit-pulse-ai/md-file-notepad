/**
 * Fuzzy subsequence matching for the Quick Open palette.
 *
 * A query matches if its characters appear in order in the target, not
 * necessarily adjacently — so "srclp" finds "src/renderer/editor/livePreview.js".
 * Scoring favours matches that a human would consider "the obvious one":
 * consecutive runs, word starts, and the filename over the directory path.
 */

const SCORE = {
  /** Each matched character is worth this much on its own. */
  base: 1,
  /** Added for a character immediately after the previous match. */
  consecutive: 8,
  /** Added when the match starts a word (after /, -, _, ., space, or a case bump). */
  wordStart: 10,
  /** Added when the match lands in the basename rather than the directory. */
  inBasename: 6,
  /** Added when the character matches case exactly. */
  caseMatch: 2,
  /** Subtracted per skipped character between matches, capped below. */
  gap: 1,
  /** Most a single gap can cost, so one long jump doesn't sink a good match. */
  maxGapPenalty: 12,
  /** Added when the whole query matches from the very start of the basename. */
  prefix: 20,
}

const WORD_BOUNDARIES = new Set(['/', '\\', '-', '_', '.', ' ', ':'])

function isWordStart(target, index) {
  if (index === 0) return true
  const previous = target[index - 1]
  if (WORD_BOUNDARIES.has(previous)) return true
  // camelCase bump: "livePreview" -> P starts a word.
  return (
    previous === previous.toLowerCase() && target[index] !== target[index].toLowerCase()
  )
}

/**
 * Matches `query` against `target`.
 * Returns `{ score, positions }` or null when the query isn't a subsequence.
 * An empty query matches everything with a score of 0.
 */
function fuzzyMatch(query, target) {
  if (typeof target !== 'string') return null
  if (!query) return { score: 0, positions: [] }

  const haystack = target
  const lowerQuery = query.toLowerCase()
  const lowerTarget = haystack.toLowerCase()

  const basenameStart = haystack.lastIndexOf('/') + 1
  const positions = []

  let score = 0
  let targetIndex = 0
  let previousMatch = -1

  for (let q = 0; q < lowerQuery.length; q++) {
    const char = lowerQuery[q]
    if (char === ' ') continue

    const found = lowerTarget.indexOf(char, targetIndex)
    if (found === -1) return null

    positions.push(found)
    score += SCORE.base

    if (previousMatch !== -1) {
      if (found === previousMatch + 1) {
        score += SCORE.consecutive
      } else {
        score -= Math.min(SCORE.maxGapPenalty, (found - previousMatch - 1) * SCORE.gap)
      }
    }

    if (isWordStart(haystack, found)) score += SCORE.wordStart
    if (found >= basenameStart) score += SCORE.inBasename
    if (haystack[found] === query[q]) score += SCORE.caseMatch

    previousMatch = found
    targetIndex = found + 1
  }

  // Reward an exact prefix of the filename — the case people expect first.
  const basename = lowerTarget.slice(basenameStart)
  if (basename.startsWith(lowerQuery.replace(/ /g, ''))) score += SCORE.prefix

  // Prefer shorter targets when scores are otherwise close.
  score -= Math.min(10, Math.floor(haystack.length / 20))

  return { score, positions }
}

/**
 * Ranks `items` against a query, best first.
 * `keyFn` extracts the string to match; ties break on that string so the
 * order is stable rather than dependent on the input order.
 */
function rankItems(query, items, keyFn = (item) => item) {
  const results = []

  for (const item of items || []) {
    const key = keyFn(item)
    const match = fuzzyMatch(query, key)
    if (!match) continue
    results.push({ item, key, ...match })
  }

  results.sort(
    (a, b) =>
      b.score - a.score || a.key.length - b.key.length || a.key.localeCompare(b.key)
  )
  return results
}

/**
 * Splits a string into `{ text, matched }` segments for highlighting,
 * merging adjacent matched characters into one run.
 */
function highlightSegments(text, positions) {
  if (!positions || !positions.length) return [{ text, matched: false }]

  const marked = new Set(positions)
  const segments = []
  let buffer = ''
  let bufferMatched = marked.has(0)

  for (let i = 0; i < text.length; i++) {
    const matched = marked.has(i)
    if (matched !== bufferMatched && buffer) {
      segments.push({ text: buffer, matched: bufferMatched })
      buffer = ''
    }
    bufferMatched = matched
    buffer += text[i]
  }
  if (buffer) segments.push({ text: buffer, matched: bufferMatched })

  return segments
}

export { fuzzyMatch, highlightSegments, rankItems, SCORE }
