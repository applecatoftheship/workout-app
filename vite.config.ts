import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // プッシュ通知実装 Phase 1a（2026年8月23日）：pushイベントハンドラを
      // 追加できるようgenerateSWからinjectManifestへ切り替えた。
      // src/sw.tsが実際のService Workerソース（precacheAndRoute等は手書き）。
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifestFilename: 'manifest.webmanifest',
      includeAssets: ['favicon.svg', 'icons/*.svg', 'icons/splash/*.png'],
      devOptions: {
        enabled: true,
        type: 'module',
      },
      manifest: {
        name: 'Workout App',
        short_name: 'Workout App',
        description: 'ワークアウト記録と進捗管理を行うシンプルなPWAです。',
        lang: 'ja',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#111827',
        icons: [
          {
            src: '/icons/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
})
