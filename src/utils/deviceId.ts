// プッシュ通知機能（2026年8月24日）：認証未実装のこのアプリで、
// push_subscriptions・notificationsのRLSを「他の端末からは読み書きできない」
// 形で機能させるための端末識別子。localStorageに永続化し、初回アクセス時に
// 生成する。ログイン機能実装後もuser_idと併用できるようOR条件でRLSポリシーを
// 組んでいるため、この値自体を認証情報として扱う必要はない。
const DEVICE_ID_STORAGE_KEY = 'workout-app:device-id'

export function getDeviceId(): string {
  const stored = localStorage.getItem(DEVICE_ID_STORAGE_KEY)
  if (stored) {
    return stored
  }

  const generated = crypto.randomUUID()
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated)
  return generated
}
