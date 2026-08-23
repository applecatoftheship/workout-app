/// <reference lib="webworker" />
// プッシュ通知実装 Phase 1a：injectManifest戦略への切り替え最小検証（2026年8月23日）。
// 既存のgenerateSW出力（dist/sw.js）と同等の内容（precacheAndRoute + NavigationRoute）
// のみを手書きし、全パスindex.htmlフォールバックが維持されることを確認する。
// pushイベントハンドラはPhase 1bで追加予定のためまだ含めない。
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))
