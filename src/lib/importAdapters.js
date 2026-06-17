/*
 * Per-platform parsers for social-export files (upload-first import, see
 * docs/social-import-upload.md). Each adapter takes the raw file *text* and
 * returns a raw string[] of post text — captions / tweets / share commentary —
 * which the shared cleaner (postClean.js) turns into ≤4 voice samples. Pure
 * functions, no DOM — node-testable.
 *
 * There is NO single "profile.json": every platform exports a different format.
 *   - Instagram → JSON  (your_instagram_activity/media/posts_1.json) — caption in media[].title
 *   - X (Twitter) → .js  (data/tweets.js) — a `window.YTD.tweets.part0 = [ … ]` assignment; text in tweet.full_text
 *   - LinkedIn → CSV     (Shares.csv) — text in the ShareCommentary column
 * detectAndExtract() sniffs the content (the picker value is only a hint), so a
 * mislabeled pick still works.
 */

const codedError = (code, message) => {
  const err = new Error(message || code)
  err.code = code
  return err
}

// --- Instagram --------------------------------------------------------------

/*
 * Instagram's "Download your information" export double-encodes UTF-8: each byte
 * of a multi-byte character is stored as its own Latin-1 code point, so “I’ve”
 * arrives as “Iâ€™ve” (the bytes E2 80 99 of U+2019 shown as â € ™). Re-pack the
 * code points as bytes and decode them as UTF-8 to recover the original text.
 *
 * Guarded: we only attempt this when the mojibake signature is present AND every
 * code point fits in one byte (a genuine emoji, > 0xff, means the string is NOT
 * mojibake — leave it alone). If the re-packed bytes aren't valid UTF-8 we fall
 * back to the original, so clean exports pass through untouched.
 */
function fixMojibake(s) {
  if (typeof s !== 'string') return ''
  if (!/[Â-ÿ][-¿]/.test(s)) return s
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0xff) return s // real multi-byte char present → not mojibake
  }
  try {
    const bytes = Uint8Array.from(s, (ch) => ch.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return s
  }
}

export function parseInstagram(text) {
  const json = JSON.parse(text)
  // Modern posts_1.json is a top-level array of { media: [{ title }] }; some
  // exports wrap it under a key. Normalise to the array of post objects.
  const items = Array.isArray(json)
    ? json
    : Array.isArray(json?.media)
      ? [json]
      : Object.values(json || {}).find(Array.isArray) || []

  const raw = []
  for (const item of items) {
    const media = Array.isArray(item?.media) ? item.media : [item]
    // A carousel shares one caption (on the first media). Take the first
    // non-empty title per post so we don't repeat the caption per slide.
    let caption = ''
    for (const m of media) {
      if (typeof m?.title === 'string' && m.title.trim()) {
        caption = m.title
        break
      }
    }
    if (!caption && typeof item?.title === 'string') caption = item.title
    if (caption) raw.push(fixMojibake(caption))
  }
  return raw
}

// --- X (Twitter) ------------------------------------------------------------

export function parseX(text) {
  // data/tweets.js is JavaScript, not JSON: `window.YTD.tweets.part0 = [ … ]`.
  // Slice out the array literal and parse that.
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) {
    throw codedError('parse-error', 'Unrecognised X archive')
  }
  const arr = JSON.parse(text.slice(start, end + 1))
  if (!Array.isArray(arr)) throw codedError('parse-error', 'Unrecognised X archive')
  return arr
    .map((entry) => entry?.tweet?.full_text ?? entry?.tweet?.text ?? entry?.full_text ?? entry?.text)
    .filter((t) => typeof t === 'string' && t.trim())
}

// --- LinkedIn ---------------------------------------------------------------

/*
 * Minimal RFC-4180-ish CSV reader: handles quoted fields, escaped quotes (""),
 * and commas / newlines inside quotes. Enough for LinkedIn's Shares.csv.
 */
function parseCsv(text) {
  const s = String(text).replace(/\r\n?/g, '\n')
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f !== ''))
}

export function parseLinkedIn(text) {
  const rows = parseCsv(text)
  if (!rows.length) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = header.indexOf('sharecommentary')
  if (col === -1) return []
  return rows
    .slice(1)
    .map((r) => r[col])
    .filter((t) => typeof t === 'string' && t.trim())
}

// --- Detection + dispatch ---------------------------------------------------

const PARSERS = { instagram: parseInstagram, x: parseX, linkedin: parseLinkedIn }

/*
 * Decide which platform a file came from. Unambiguous content signatures win;
 * then the file extension; finally the picker hint. Returns a platform id or null.
 */
function detectPlatform(filename, text, hint) {
  const name = String(filename || '').toLowerCase()
  const head = text.slice(0, 5000)

  if (/window\.YTD\.|"full_text"\s*:/.test(head)) return 'x'
  if (/sharecommentary/i.test(head)) return 'linkedin'
  if (/"creation_timestamp"|"media"\s*:\s*\[/.test(head)) return 'instagram'

  if (name.endsWith('.csv')) return 'linkedin'
  if (name.endsWith('.js')) return 'x'
  if (name.endsWith('.json')) return 'instagram'

  return hint && PARSERS[hint] ? hint : null
}

/*
 * Parse an export file's text into raw post strings, auto-detecting the platform
 * (hint breaks ties). Throws Error with a stable `.code`:
 *   - unsupported-file: couldn't tell what platform / no parser
 *   - parse-error: the file didn't parse as its format
 */
export function detectAndExtract(filename, text, hint) {
  const platform = detectPlatform(filename, text, hint)
  if (!platform || !PARSERS[platform]) {
    throw codedError('unsupported-file', 'Unrecognised export file')
  }
  let raw
  try {
    raw = PARSERS[platform](text)
  } catch (e) {
    if (e?.code) throw e
    throw codedError('parse-error', 'Could not parse file')
  }
  return { platform, raw }
}
