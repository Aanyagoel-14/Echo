
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Server-only code runs in Node, not the browser/React — give it Node
    // globals and skip the React-only fast-refresh rule. Covers the serverless
    // functions (CP7) and the node-only (fs/process) libs that back them — the
    // trend store and harvest sources (which read the Instagram worker file),
    // the model provider seam (which reads creds from process.env), and the rate
    // limiter (process.env tunables + in-memory counters). Their pure siblings
    // in src/lib stay browser-safe.
    files: [
      'api/**/*.js',
      'src/lib/trendStore.js',
      'src/lib/trendSources.js',
      'src/lib/llm.js',
      'src/lib/rateLimit.js',
    ],
    languageOptions: { globals: globals.node },
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
