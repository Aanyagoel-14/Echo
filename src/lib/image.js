/*
 * Image → compact base64 data URL. The vision model needs the actual pixels, but
 * a raw phone photo (3–6 MB) blows past Vercel's request body limit and burns
 * tokens. So we downscale to a sane max edge and re-encode as JPEG before it ever
 * leaves the device — small enough to POST, sharp enough for the model to read.
 *
 * Everything degrades gracefully: if canvas/Image is unavailable or decoding
 * fails, we fall back to the raw file bytes, and if even that fails we return
 * null so the caller can carry on text-only.
 */

const MAX_EDGE = 1024 // longest side, in px — plenty for vision, tiny on the wire
const QUALITY = 0.8 // JPEG quality

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode failed'))
    img.src = src
  })
}

/**
 * Compress a File to a downscaled JPEG data URL (≤ MAX_EDGE on the long side).
 * Returns null if the input isn't usable as an image.
 */
export async function compressImage(file, { maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  if (!file) return null
  try {
    const raw = await readAsDataURL(file)
    if (typeof raw !== 'string') return null

    // No canvas (SSR/edge) — send the raw data URL untouched rather than nothing.
    if (typeof document === 'undefined') return raw

    const img = await loadImage(raw)
    const { width, height } = img
    if (!width || !height) return raw

    const scale = Math.min(1, maxEdge / Math.max(width, height))
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return raw
    ctx.drawImage(img, 0, 0, w, h)

    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    // Last-ditch: hand back the raw bytes if we can read them, else give up.
    try {
      const raw = await readAsDataURL(file)
      return typeof raw === 'string' ? raw : null
    } catch {
      return null
    }
  }
}
