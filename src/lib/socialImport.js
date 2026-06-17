/*
 * Social import — the single seam between the UI and the data source (the one
 * rule: everything downstream consumes { platform, handle, posts: string[] } and
 * never changes; only this file knows where that shape comes from). See
 * docs/social-import-upload.md.
 *
 * Upload-first: the creator uploads the posts file they exported from a platform
 * (Instagram / X / LinkedIn). We parse it IN THE BROWSER (importAdapters.js),
 * clean it into a few voice samples, and hand back { platform, handle, posts }.
 * No OAuth, no API, no server — the file never leaves the device.
 */
import { cleanPosts } from './postClean'
import { detectAndExtract } from './importAdapters'

export const IMPORT_PLATFORMS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'x', label: 'X' },
  { id: 'linkedin', label: 'LinkedIn' },
]

const codedError = (code, message) => {
  const err = new Error(message || code)
  err.code = code
  return err
}

// Sanity cap. Exports are text-only and tiny next to this; the bound just stops
// the browser choking if someone picks the wrong, enormous file.
const MAX_BYTES = 50 * 1024 * 1024

// Read a File as a UTF-8 string via the browser FileReader.
function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(codedError('read-error', 'Could not read that file.'))
    reader.readAsText(file)
  })
}

/*
 * Parse an uploaded export file into cleaned voice samples. `platformHint` is the
 * picker selection — the adapter sniffs the file content and the hint only breaks
 * ties, so a mislabeled pick still works. Throws Error with a stable `.code`
 * (read-error, too-large, unsupported-file, parse-error, no-posts) so the UI can
 * map it to friendly copy. `handle` is best-effort (exports rarely carry one).
 */
export async function importFromFile(file, platformHint) {
  if (!file) throw codedError('read-error', 'No file selected.')
  if (file.size > MAX_BYTES) {
    throw codedError('too-large', 'That file is larger than expected.')
  }
  const text = await readFileText(file)
  const { platform, raw } = detectAndExtract(file.name, text, platformHint)
  const posts = cleanPosts(raw)
  if (!posts.length) throw codedError('no-posts', 'No usable posts found in that file.')
  return { platform, handle: null, posts }
}
