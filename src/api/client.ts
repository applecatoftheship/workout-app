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
