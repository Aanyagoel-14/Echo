import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import generateHandler from './api/generate.js'
import trendsHandler from './api/trends.js'
import harvestHandler from './api/trends-harvest.js'
import auditHandler from './api/audit.js'

/*
 * Dev-only: serve the api/* serverless functions locally so the full flow
 * (Capture → Results, plus the Feature 1 trend endpoints) works under
 * `vite dev` with no Vercel CLI/login. Production runs these SAME handlers as
 * Vercel functions — this plugin just mounts them as dev middleware, so there's
 * one implementation and zero drift. Only applies in `serve`; never touches the
 * production build.
 */
// Vite's dev server hands us a raw Node req/res; the Vercel handler expects a
// parsed body, a `req.query` object, and Express-style res helpers. This bridge
// supplies all three so a handler runs identically here and on Vercel.
function bridge(handler) {
  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      let raw = ''
      try {
        for await (const chunk of req) raw += chunk
        req.body = raw ? JSON.parse(raw) : {}
      } catch {
        req.body = {}
      }
    } else {
      req.body = {}
    }
    // Mirror Vercel's req.query. Connect strips the mounted route prefix but
    // keeps the query string on req.url, so the search params survive.
    try {
      req.query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams)
    } catch {
      req.query = {}
    }
    res.status = (code) => ((res.statusCode = code), res)
    res.json = (obj) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(obj))
      return res
    }
    await handler(req, res)
  }
}

function devApi() {
  // Longer paths first: connect matches by prefix, so /api/trends-harvest must
  // be registered before /api/trends (though their prefixes don't actually
  // collide — '-' isn't a path separator — order is a safe habit).
  const routes = {
    '/api/generate': generateHandler,
    '/api/audit': auditHandler,
    '/api/trends-harvest': harvestHandler,
    '/api/trends': trendsHandler,
  }
  return {
    name: 'echo-dev-api',
    apply: 'serve',
    configureServer(server) {
      for (const [path, handler] of Object.entries(routes)) {
        server.middlewares.use(path, bridge(handler))
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['echo-icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Echo — your creator digital twin',
        short_name: 'Echo',
        description:
          'One input becomes a full multi-platform content kit: a Reel, an Instagram carousel, and an X thread — in your brand voice.',
        theme_color: '#0B0B0F',
        background_color: '#0B0B0F',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        // Never serve the SPA shell for /api/* — let those hit the function (CP7).
        navigateFallbackDenylist: [/^\/api\//],
      },
      // The PWA is tested on the deployed HTTPS URL, not the local dev server.
      devOptions: { enabled: false },
    }),
    devApi(),
  ],
  server: {
    // Expose the dev server on the local network (unused for PWA testing).
    host: true,
  },
})
