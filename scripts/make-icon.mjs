/**
 * Generates the application icon as a 1024x1024 PNG.
 *
 * There is no image tooling in the build environment and an icon is not
 * something to hand-maintain as binary anyway, so the artwork is described
 * here as geometry and rendered with signed-distance fields. The output is
 * deterministic: `test/icon.test.mjs` re-renders it and compares against the
 * committed file, so the PNG can never silently drift from this source.
 *
 * Run `npm run icon` after editing.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const SIZE = 1024

/* --------------------------------- artwork -------------------------------- */

const TILE = { radius: 230, top: [99, 102, 241], bottom: [55, 48, 163] }
const PAGE = { x: 296, y: 228, w: 432, h: 568, radius: 44, color: [255, 255, 255] }

// Heading bar, then three lines of body text, drawn as rounded bars.
const BARS = [
  { x: 356, y: 316, w: 236, h: 46, color: [79, 70, 229] },
  { x: 356, y: 424, w: 312, h: 30, color: [148, 163, 184] },
  { x: 356, y: 500, w: 312, h: 30, color: [148, 163, 184] },
  { x: 356, y: 576, w: 208, h: 30, color: [148, 163, 184] },
]

/* ------------------------------ sdf rendering ----------------------------- */

/** Signed distance from `(px, py)` to a rounded rectangle, negative inside. */
function roundedRectDistance(px, py, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2)
  const dx = Math.abs(px - (x + w / 2)) - (w / 2 - r)
  const dy = Math.abs(py - (y + h / 2)) - (h / 2 - r)
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
  return outside + Math.min(Math.max(dx, dy), 0) - r
}

/** Antialiased coverage for a distance in pixels. */
const coverage = (distance) => Math.min(1, Math.max(0, 0.5 - distance))

/** Paints `color` over `dst` (premultiplied by nothing; dst is straight RGBA). */
function over(dst, offset, color, alpha) {
  if (alpha <= 0) return
  const inv = 1 - alpha
  const da = dst[offset + 3] / 255
  const outA = alpha + da * inv
  for (let c = 0; c < 3; c++) {
    const src = color[c] * alpha
    const under = dst[offset + c] * da * inv
    dst[offset + c] = outA === 0 ? 0 : Math.round((src + under) / outA)
  }
  dst[offset + 3] = Math.round(outA * 255)
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

export function renderIcon(size = SIZE) {
  const s = size / SIZE // everything below is authored at 1024
  const pixels = new Uint8Array(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4
      const px = x + 0.5
      const py = y + 0.5

      const tile = coverage(
        roundedRectDistance(px, py, 0, 0, size, size, TILE.radius * s)
      )
      over(pixels, offset, mix(TILE.top, TILE.bottom, y / (size - 1)), tile)

      const page = coverage(
        roundedRectDistance(
          px,
          py,
          PAGE.x * s,
          PAGE.y * s,
          PAGE.w * s,
          PAGE.h * s,
          PAGE.radius * s
        )
      )
      over(pixels, offset, PAGE.color, page * tile)

      for (const bar of BARS) {
        const d = roundedRectDistance(
          px,
          py,
          bar.x * s,
          bar.y * s,
          bar.w * s,
          bar.h * s,
          (bar.h / 2) * s
        )
        over(pixels, offset, bar.color, coverage(d) * page * tile)
      }
    }
  }
  return pixels
}

/* ------------------------------- png encoding ----------------------------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

export function encodePng(pixels, size = SIZE) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour with alpha
  // 10..12: deflate, adaptive filtering, no interlace — all zero.

  // One filter byte (0 = none) per scanline. The artwork is smooth enough that
  // the extra passes a filter search would cost are not worth the few KB.
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1)
    raw[rowStart] = 0
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, rowStart + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export const iconPng = (size = SIZE) => encodePng(renderIcon(size), size)

/* ----------------------------------- cli ---------------------------------- */

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'build-resources',
    'icon.png'
  )
  const png = iconPng()
  writeFileSync(target, png)
  console.log(`wrote ${target} (${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(1)} KB)`)
}
