import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

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
  ],
  server: {
    // Expose the dev server on the local network (unused for PWA testing).
    host: true,
  },
})
