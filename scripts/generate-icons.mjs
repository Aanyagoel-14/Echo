// Renders the brand SVG (public/echo-icon.svg) into the PNG icon sizes the
// PWA manifest + iOS need. Re-run with `npm run icons` after changing the SVG.
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(resolve(root, 'public/echo-icon.svg'))

const targets = [
  { size: 192, file: 'pwa-192x192.png' },
  { size: 512, file: 'pwa-512x512.png' },
  { size: 512, file: 'maskable-512x512.png' },
  { size: 180, file: 'apple-touch-icon-180x180.png' },
]

for (const { size, file } of targets) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(resolve(root, 'public', file))
  console.log('generated public/' + file)
}
