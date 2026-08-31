import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

import { renderIcon, encodePng, SIZE } from '../scripts/make-icon.mjs'

const ICON = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'build-resources',
  'icon.png'
)

/** Minimal PNG reader: returns the header fields and the raw scanline bytes. */
function decode(file) {
  const buf = fs.readFileSync(file)
  assert.deepEqual(
    [...buf.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    'PNG signature'
  )

  const chunks = {}
  const idat = []
  let offset = 8
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const data = buf.subarray(offset + 8, offset + 8 + length)
    if (type === 'IDAT') idat.push(data)
    else chunks[type] = data
    offset += length + 12
  }

  const ihdr = chunks.IHDR
  return {
    width: ihdr.readUInt32BE(0),
    height: ihdr.readUInt32BE(4),
    bitDepth: ihdr[8],
    colorType: ihdr[9],
    interlace: ihdr[12],
    scanlines: inflateSync(Buffer.concat(idat)),
    bytes: buf.length,
  }
}

test('the committed icon is a 1024x1024 RGBA PNG', () => {
  const png = decode(ICON)
  assert.equal(png.width, SIZE)
  assert.equal(png.height, SIZE)
  assert.equal(png.bitDepth, 8)
  assert.equal(png.colorType, 6, 'truecolour with alpha')
  assert.equal(png.interlace, 0, 'electron-builder cannot read interlaced icons')
})

test('the committed icon matches what make-icon.mjs renders', () => {
  // Compared as pixels rather than bytes: zlib output is allowed to differ
  // between Node versions, the artwork is not.
  const expected = renderIcon()
  const { scanlines } = decode(ICON)
  const stride = SIZE * 4 + 1

  assert.equal(scanlines.length, SIZE * stride, 'one filter byte per scanline')
  for (let y = 0; y < SIZE; y++) {
    assert.equal(scanlines[y * stride], 0, `row ${y} uses the "none" filter`)
    const row = scanlines.subarray(y * stride + 1, (y + 1) * stride)
    const want = Buffer.from(expected.buffer, y * SIZE * 4, SIZE * 4)
    if (!row.equals(want)) {
      assert.fail(`row ${y} differs — run "npm run icon" to regenerate the icon`)
    }
  }
})

test('the icon is opaque in the middle and transparent in the corners', () => {
  const pixels = renderIcon()
  const at = (x, y) => pixels[(y * SIZE + x) * 4 + 3]
  assert.equal(at(SIZE / 2, SIZE / 2), 255, 'centre is filled')
  assert.equal(at(2, 2), 0, 'the rounded corner is cut out')
  assert.equal(at(SIZE - 3, 2), 0)
})

test('encoding is deterministic', () => {
  assert.ok(encodePng(renderIcon()).equals(encodePng(renderIcon())))
})
