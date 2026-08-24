/// <reference lib="webworker" />
// プッシュ通知実装 Phase 1a（2026年8月23日）：injectManifest戦略への切り替え。
// 既存のgenerateSW出力（dist/sw.js）と同等の内容（precacheAndRoute + NavigationRoute）
// を手書きし、全パスindex.htmlフォールバックを維持している。
// Phase 1b（2026年8月24日）：push・notificationclickハンドラを末尾に追加した。
// 上記のprecache/NavigationRoute部分は変更していない
// （検証は逆読み＋デプロイ後バイト比較、Phase 1aと同じ手法）。
// バナータップ時の既読化（2026年8月25日）：notificationclick内でSupabaseの
// notifications.is_readを更新する。src/api/client.tsはモジュール読み込み時に
// getDeviceId()（localStorage使用）を実行するため、localStorageを持たない
// Service Workerのグローバルスコープではそのままimportできない。そのため
// createClientを直接呼び、device_idはlocalStorageから読まずpushペイロードに
// 積まれた値（送信元のapi/send-reminder.tsが把握しているsubscription.device_id）
// をそのままx-device-idヘッダーに使う（既存クライアントの「global.headersに
// x-device-idを載せる」パターン自体は踏襲している）。
import { createClient } from '@supabase/supabase-js'
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
  notificationId?: string
  deviceId?: string
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
    data: { url: payload.url ?? '/', notificationId: payload.notificationId, deviceId: payload.deviceId },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

type NotificationClickData = { url?: string; notificationId?: string; deviceId?: string }

async function markNotificationReadFromServiceWorker(notificationId: string, deviceId: string): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { 'x-device-id': deviceId } },
  })

  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId)
  if (error) {
    console.error('通知の既読化に失敗しました', error)
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data as NotificationClickData | undefined
  const targetUrl = data?.url ?? '/'

  event.waitUntil(
    (async () => {
      if (data?.notificationId && data?.deviceId) {
        await markNotificationReadFromServiceWorker(data.notificationId, data.deviceId)
      }

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
