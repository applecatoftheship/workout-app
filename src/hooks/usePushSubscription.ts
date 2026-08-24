import { useCallback } from 'react'
import { deletePushSubscriptionByEndpoint, upsertPushSubscription } from '../api/pushSubscriptions'
import { getDeviceId } from '../utils/deviceId'

// プッシュ通知機能 Phase 1b（2026年8月24日）。
// VAPID公開鍵はクライアントにも必要なため、サーバー専用のVAPID_PUBLIC_KEYとは別に
// VITE_VAPID_PUBLIC_KEY（Viteのビルド時にクライアントバンドルへ埋め込まれる、
// import.meta.env.VITE_接頭辞の環境変数）がVercelに登録されている前提。
// 公開鍵はその名の通り公開情報のため、クライアントに露出しても問題ない。
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function usePushSubscription() {
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return false
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return false
    }

    const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
    if (!vapidPublicKey) {
      console.error('VITE_VAPID_PUBLIC_KEYが未設定のため、プッシュ通知を購読できません')
      return false
    }

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      })

      const json = subscription.toJSON()
      if (!json.endpoint) {
        return false
      }

      await upsertPushSubscription({
        deviceId: getDeviceId(),
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh ?? null,
        auth: json.keys?.auth ?? null,
      })

      return true
    } catch (error) {
      console.error('プッシュ通知の購読に失敗しました', error)
      return false
    }
  }, [])

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!('serviceWorker' in navigator)) {
      return
    }

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      return
    }

    const endpoint = subscription.endpoint
    await subscription.unsubscribe()
    await deletePushSubscriptionByEndpoint(endpoint)
  }, [])

  // 設定画面のトグル初期表示用（購読済みかどうかをブラウザ側の状態から確認する。
  // DB側ではなくpushManager.getSubscription()を正とする。DBへの保存が何らかの
  // 理由で失敗していても、ブラウザ側が実際に購読中であればトグルはONで表示したい
  // ため）。
  const checkIsSubscribed = useCallback(async (): Promise<boolean> => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return false
    }

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return subscription !== null
  }, [])

  return { subscribe, unsubscribe, checkIsSubscribed }
}
