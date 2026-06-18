/*
 * Theme persistence + application (the light/dark toggle). Light is the default
 * (the redesign); dark is opt-in and remembered across launches. This is the one
 * place that touches the theme so screens never poke <html> or localStorage
 * directly — mirrors how brandVoice.js owns voice storage.
 *
 * The actual palette flip lives in index.css (html[data-theme='dark']); here we
 * just set the attribute + keep the iOS/Android status-bar color in sync, and an
 * inline script in index.html applies the saved theme before first paint.
 */
import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'echo.theme.v1'

// Matches --color-bg per theme so the mobile status bar blends with the app.
const THEME_COLOR = { light: '#f4f6f9', dark: '#0b0b0f' }

export function loadTheme() {
  try {
    const t = localStorage.getItem(STORAGE_KEY)
    return t === 'dark' || t === 'light' ? t : 'light'
  } catch {
    // Private mode / blocked storage — default light, in-memory toggle still works.
    return 'light'
  }
}

export function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light'
  document.documentElement.dataset.theme = t
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[t])
}

function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Non-fatal; the in-memory theme still applies for this session.
  }
}

/*
 * The toggle's state owner. Applies + persists on every change, so the attribute
 * the pre-paint script set is kept authoritative once React mounts.
 */
export function useTheme() {
  const [theme, setTheme] = useState(loadTheme)

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

  const toggle = useCallback(
    () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    [],
  )

  return { theme, toggle }
}
