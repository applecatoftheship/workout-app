import { supabase, getCurrentUserId } from './client'

export type PushSubscriptionInput = {
  deviceId: string
  endpoint: string
  p256dh: string | null
  auth: string | null
}

// 週次ACWR機能のUUID不整合修正（2026年8月25日）の一環：push_subscriptions.user_id列は
// 2026年8月24日の新設時点でスキーマ上は既に用意されていたが（supabase/migrations/
// 20260824000000_push_notifications.sql参照）、書き込み側のこの関数がuser_idを
// 一切設定していなかったため、実際には全行user_id=NULLのまま運用されていた。
// api/send-reminder.ts・api/send-weekly-report.tsをDEFAULT_USER_ID固定参照から
// 「push_subscriptions.user_idごとにループする」設計へ変更する以上、この関数が
// user_idを書き込まない限りその再設計は機能しない（全件user_id=NULLで対象0件になる）
// ため、今回の指示書には明記が無いが併せて修正した（本ファイルはSettings.tsx経由
// でのみ呼ばれ、Settings.tsxはAuthGateの内側＝ログイン後のみ到達するため、
// getCurrentUserId()は常に解決できる）。
export async function upsertPushSubscription(input: PushSubscriptionInput): Promise<void> {
  const userId = await getCurrentUserId()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      device_id: input.deviceId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )

  if (error) {
    throw error
  }
}

export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)

  if (error) {
    throw error
  }
}
