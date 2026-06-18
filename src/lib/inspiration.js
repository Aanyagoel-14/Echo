/*
 * Inspiration persistence (the optional reference step). Reference *posts* the
 * creator loves are text, so they persist to localStorage like brand samples.
 * Reference *visuals* are images — kept in-session only: object URLs don't
 * survive a reload, and the actual image bytes belong server-side at the event,
 * not in localStorage. This is the one place that touches inspiration storage.
 */
const STORAGE_KEY = 'echo.inspiration.v1'

export const EMPTY_INSPIRATION = { refs: '', visuals: [] }

export function loadInspiration() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY_INSPIRATION }
    const parsed = JSON.parse(raw)
    // Visuals are never restored from storage — only the text refs persist.
    return { refs: typeof parsed.refs === 'string' ? parsed.refs : '', visuals: [] }
  } catch {
    return { ...EMPTY_INSPIRATION }
  }
}

export function saveInspirationRefs(refs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ refs: refs ?? '' }))
  } catch {
    // Private mode / quota — non-fatal; in-session state still works.
  }
}

// True once the creator has given Echo any reference to learn the vibe from.
export function hasInspiration({ refs, visuals } = {}) {
  return Boolean((refs && refs.trim()) || (visuals && visuals.length))
}
