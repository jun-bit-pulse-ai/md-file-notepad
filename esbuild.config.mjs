import esbuild from 'esbuild'
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const outdir = path.join(root, 'build')
const watch = process.argv.includes('--watch')

/** Copies the renderer shell next to the bundle so build/ is self-contained. */
async function copyStatic() {
  await mkdir(outdir, { recursive: true })
  await copyFile(
    path.join(root, 'src/renderer/index.html'),
    path.join(outdir, 'index.html')
  )
}

const options = {
  entryPoints: [path.join(root, 'src/renderer/index.js')],
  bundle: true,
  outdir,
  entryNames: 'renderer',
  assetNames: 'fonts/[name]',
  format: 'iife',
  platform: 'browser',
  target: ['chrome128'],
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
  loader: {
    '.woff': 'file',
    '.woff2': 'file',
    '.ttf': 'file',
  },
}

await copyStatic()

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log('[esbuild] watching for changes...')
} else {
  await esbuild.build(options)
}
