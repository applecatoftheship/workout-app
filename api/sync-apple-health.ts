// Apple Health連携 Task1（実装指示書、2026年8月27日）：外部（Apple Health側の
// 同期クライアント・ショートカット等）からのWebhook的な呼び出しを受け付ける
// エンドポイント。api/send-reminder.tsと同じくservice_roleでSupabaseへ接続する
// Vercel Serverless Functionパターンを踏襲している。
//
// 【認証】ユーザーの実セッションを持たない外部呼び出しのため、リクエストヘッダー
// x-webhook-secretを環境変数APPLE_HEALTH_SYNC_SECRETと比較して認証する
// （Vercel Cronのbearerトークン検証と同種の共有シークレット方式）。
//
// 【ユーザー特定】このアプリは実質単一ユーザー運用のため、環境変数
// APPLE_HEALTH_SYNC_USER_IDに対象ユーザーの実UUIDを直接設定する方式とした。
// 【複数ユーザー対応時はこの変数をシークレット⇔user_idのルックアップ
// （例：ユーザーごとに異なるwebhookシークレットを発行し、シークレットから
// 対応するuser_idをテーブル検索する）に置き換えること。】
//
// 【リクエストボディの形状（このファイルの実装で定義。指示書に明示の
// JSONスキーマが無かったため、以下の形を仮定して実装した — 実際の送信元
// （ショートカット／コンパニオンアプリ等）の実装に合わせて調整が必要な場合は
// このファイルのSyncPayload型を変更すること）】
//
//   { "type": "sleep", "total_asleep_seconds": number, "start_time": string(ISO8601) }
//   { "type": "workout", "apple_workout_id": string, "activity_type": string,
//     "start_time": string(ISO8601), "end_time"?: string(ISO8601),
//     "duration_seconds"?: number, "distance_meters"?: number,
//     "active_calories"?: number, "avg_heart_rate"?: number }
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

type SleepPayload = {
  type: 'sleep'
  total_asleep_seconds: number
  start_time: string
}

type WorkoutPayload = {
  type: 'workout'
  apple_workout_id: string
  activity_type: string
  start_time: string
  end_time?: string
  duration_seconds?: number
  distance_meters?: number
  active_calories?: number
  avg_heart_rate?: number
}

type SyncPayload = SleepPayload | WorkoutPayload

const MERGE_WINDOW_MS = 30 * 60 * 1000 // 手動データとの統合判定：開始時刻の前後30分

function toJstDateKey(isoString: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(isoString))
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return `${year}-${month}-${day}`
}

function jstDateRangeUtc(dateKey: string): { startUtc: string; endUtc: string } {
  // dateKey（JSTの暦日、YYYY-MM-DD）のJST 00:00〜24:00をUTC ISO文字列に変換する。
  // JSTは常にUTC+9固定（サマータイムなし）のため、単純な9時間オフセット計算で足りる。
  const startUtc = new Date(`${dateKey}T00:00:00+09:00`).toISOString()
  const endUtc = new Date(`${dateKey}T00:00:00+09:00`)
  endUtc.setUTCDate(endUtc.getUTCDate() + 1)
  return { startUtc, endUtc: endUtc.toISOString() }
}

async function handleSleep(supabase: SupabaseClient, userId: string, payload: SleepPayload): Promise<{ synced: string }> {
  // 小数点第1位で丸める（指示書通り）。今回はsleep_hoursのみを対象とし、
  // HRV・安静時心拍数・就寝/起床時刻は指示書の通りスコープ外として無視する。
  const sleepHours = Math.round((payload.total_asleep_seconds / 3600) * 10) / 10
  const logDate = toJstDateKey(payload.start_time)

  // onConflict対象の(user_id, log_date)以外のカラムを含めないことで、既存の
  // 手入力データ（weight・fatigue・notes等）を上書きしない（PostgRESTのupsertは
  // 渡したカラムのみをDO UPDATE SETするため）。
  const { error } = await supabase
    .from('daily_conditions')
    .upsert({ user_id: userId, log_date: logDate, sleep_hours: sleepHours }, { onConflict: 'user_id,log_date' })

  if (error) {
    throw error
  }

  return { synced: logDate }
}

async function handleWorkout(supabase: SupabaseClient, userId: string, payload: WorkoutPayload): Promise<{ mergedManualId: string | null }> {
  const startTime = new Date(payload.start_time)
  const windowStart = new Date(startTime.getTime() - MERGE_WINDOW_MS).toISOString()
  const windowEnd = new Date(startTime.getTime() + MERGE_WINDOW_MS).toISOString()
  const dateKey = toJstDateKey(payload.start_time)
  const { startUtc: dayStart, endUtc: dayEnd } = jstDateRangeUtc(dateKey)

  // 「同日かつ開始時刻が前後30分以内」＝日付境界（JST暦日）とタイムスタンプの
  // 前後30分窓の両方を満たす行、かつ手動データ（external_id IS NULL）のみが対象。
  const { data: manualCandidates, error: manualError } = await supabase
    .from('workouts')
    .select('id, notes')
    .eq('user_id', userId)
    .is('external_id', null)
    .gte('start_time', dayStart)
    .lt('start_time', dayEnd)
    .gte('start_time', windowStart)
    .lte('start_time', windowEnd)
    .limit(1)

  if (manualError) {
    throw manualError
  }

  const manualMatch = (manualCandidates as { id: string; notes: string | null }[] | null)?.[0] ?? null
  let mergedManualId: string | null = null

  if (manualMatch) {
    const nextNotes = manualMatch.notes ? `${manualMatch.notes}\n[自動連携により統合]` : '[自動連携により統合]'
    // is_primaryは自動データ側（このあとupsertする新規行）だけがtrueになるよう、
    // 統合される手動データ側は同じUPDATEでfalseに落とす（1ワークアウトにつき
    // is_primary: trueが常に1件になるようにするための修正、2026年8月27日）。
    const { error: updateError } = await supabase
      .from('workouts')
      .update({ notes: nextNotes, is_primary: false, updated_at: new Date().toISOString() })
      .eq('id', manualMatch.id)
    if (updateError) {
      throw updateError
    }
    mergedManualId = manualMatch.id
  }

  // apple_workout_idをexternal_idとしてupsert（完全重複防止。同じワークアウトの
  // 再送信を受けても行が増えない）。is_primary: trueで自動データ自身は常に登録する
  // （手動データとの統合有無に関わらず、指示書の指定通り）。
  const { error: upsertError } = await supabase.from('workouts').upsert(
    {
      user_id: userId,
      external_id: payload.apple_workout_id,
      activity_type: payload.activity_type,
      start_time: payload.start_time,
      end_time: payload.end_time ?? null,
      duration_seconds: payload.duration_seconds ?? null,
      distance_meters: payload.distance_meters ?? null,
      active_calories: payload.active_calories ?? null,
      avg_heart_rate: payload.avg_heart_rate ?? null,
      is_primary: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'external_id' },
  )

  if (upsertError) {
    throw upsertError
  }

  return { mergedManualId }
}

export default async function handler(
  req: { headers: Record<string, string | string[] | undefined>; body: unknown; method?: string },
  res: { status: (code: number) => { json: (body: unknown) => void } },
) {
  if (req.method && req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const webhookSecret = process.env.APPLE_HEALTH_SYNC_SECRET
  const syncUserId = process.env.APPLE_HEALTH_SYNC_USER_ID
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!webhookSecret || !syncUserId || !supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'missing required environment variables' })
    return
  }

  const providedSecret = req.headers['x-webhook-secret']
  if (providedSecret !== webhookSecret) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  const payload = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as SyncPayload | null | undefined

  if (!payload || (payload.type !== 'sleep' && payload.type !== 'workout')) {
    res.status(400).json({ error: 'invalid payload: type must be "sleep" or "workout"' })
    return
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    if (payload.type === 'sleep') {
      const result = await handleSleep(supabase, syncUserId, payload)
      res.status(200).json({ ok: true, type: 'sleep', ...result })
      return
    }

    const result = await handleWorkout(supabase, syncUserId, payload)
    res.status(200).json({ ok: true, type: 'workout', ...result })
  } catch (error) {
    console.error('Apple Health同期処理に失敗しました', error)
    res.status(500).json({ error: 'sync failed' })
  }
}
