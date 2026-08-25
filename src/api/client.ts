import { createClient } from '@supabase/supabase-js'
import { getDeviceId } from '../utils/deviceId'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// プッシュ通知機能（2026年8月24日）：push_subscriptions・notificationsの
// RLSポリシーがx-device-idヘッダーで端末を識別するため、全リクエストに
// 自動付与する（src/utils/deviceId.ts参照）。他テーブルのRLSは
// `using (true)`のままのため、このヘッダーの有無は影響しない。
export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    global: {
      headers: { 'x-device-id': getDeviceId() },
    },
  }
)

// アカウント/ログイン機能 フェーズA（2026年8月25日）：per-userテーブルのAPI関数は
// 固定プレースホルダーDEFAULT_USER_ID（旧00000000-0000-0000-0000-000000000002）を
// 直接参照する代わりに、この関数でログイン中のセッションからuser.idを取得する。
// 未ログイン時は呼び出し元がProtected Route（AuthGate）で既にブロックされている
// 前提のため、ここではnullチェック失敗時にエラーを投げるだけに留める。
export async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    throw new Error('ログインが必要です')
  }
  return data.user.id
}
