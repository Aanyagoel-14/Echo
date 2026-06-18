
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
    // functions (CP7) and the trend store, the one node-only (fs/process) lib
    // that backs them (its pure siblings in src/lib stay browser-safe).
    files: ['api/**/*.js', 'src/lib/trendStore.js'],
    languageOptions: { globals: globals.node },
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
