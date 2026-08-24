/// <reference lib="webworker" />
// プッシュ通知実装 Phase 1a（2026年8月23日）：injectManifest戦略への切り替え。
// 既存のgenerateSW出力（dist/sw.js）と同等の内容（precacheAndRoute + NavigationRoute）
// を手書きし、全パスindex.htmlフォールバックを維持している。
// Phase 1b（2026年8月24日）：push・notificationclickハンドラを末尾に追加した。
// 上記のprecache/NavigationRoute部分は変更していない
// （検証は逆読み＋デプロイ後バイト比較、Phase 1aと同じ手法）。
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

// ここから下がPhase 1bで追加したプッシュ通知ハンドラ。上記の既存コードは変更していない。

type PushPayload = {
  title?: string
  message?: string
  url?: string
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {}
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {}
  } catch {
    payload = { message: event.data ? event.data.text() : undefined }
  }

  const title = payload.title ?? 'ワークアウトアプリ'
  const options: NotificationOptions = {
    body: payload.message ?? '',
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    data: { url: payload.url ?? '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data as { url?: string } | undefined)?.url ?? '/'

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existingClient = windowClients.find((client): client is WindowClient => 'focus' in client)

      if (existingClient) {
        await existingClient.focus()
        if ('navigate' in existingClient) {
          await existingClient.navigate(targetUrl)
        }
        return
      }

      await self.clients.openWindow(targetUrl)
    })(),
  )
})
