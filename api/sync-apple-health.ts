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
//   { "type": "workout", "start_time": string(ISO8601),
//     "apple_workout_id"?: string, "activity_type"?: string,
//     "end_time"?: string, "duration_seconds"?: number,
//     "distance_meters"?: number, "active_calories"?: number,
//     "avg_heart_rate"?: number }
//
// 【2026年8月27日改修】Apple純正Shortcutsの制約上、ワークアウトは当面
// type・distance_meters・start_timeの3項目のみが送られてくる運用に変更された。
// apple_workout_id・activity_type・end_time・duration_seconds・active_calories・
// avg_heart_rateはすべて任意項目として扱い、workouts.activity_type列の
// NOT NULL制約も解除するマイグレーションを別途用意した（supabase/migrations/
// 20260827010000_workouts_activity_type_nullable_DRAFT.sql、未実行）。
// あわせて、apple_workout_id（external_id）が無い場合の重複防止キーとして
// (user_id, start_time)の完全一致を代替に使うようhandleWorkoutを変更した
// （詳細は同関数内のコメント参照）。
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

type SleepPayload = {
  type: 'sleep'
  total_asleep_seconds: number
  start_time: string
}

type WorkoutPayload = {
  type: 'workout'
  start_time: string
  apple_workout_id?: string
  activity_type?: string
  end_time?: string
  duration_seconds?: number
  distance_meters?: number
  active_calories?: number
  avg_heart_rate?: number
}

type SyncPayload = SleepPayload | WorkoutPayload

class ValidationError extends Error {}

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

function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(new Date(value).getTime())
}

function validateSleepPayload(payload: Record<string, unknown>): asserts payload is SleepPayload {
  if (typeof payload.total_asleep_seconds !== 'number' || !Number.isFinite(payload.total_asleep_seconds)) {
    throw new ValidationError('total_asleep_seconds is required and must be a number')
  }
  if (!isValidIsoDate(payload.start_time)) {
    throw new ValidationError('start_time is required and must be a valid ISO8601 date string')
  }
}

// 2026年8月27日改修：apple_workout_id・activity_type等はすべて任意項目に変更。
// start_timeのみ必須（重複防止・日付判定の両方で使うため）。
function validateWorkoutPayload(payload: Record<string, unknown>): asserts payload is WorkoutPayload {
  if (!isValidIsoDate(payload.start_time)) {
    throw new ValidationError('start_time is required and must be a valid ISO8601 date string')
  }
  const optionalStringFields = ['apple_workout_id', 'activity_type', 'end_time'] as const
  for (const field of optionalStringFields) {
    if (payload[field] !== undefined && typeof payload[field] !== 'string') {
      throw new ValidationError(`${field} must be a string if provided`)
    }
  }
  const optionalNumberFields = ['duration_seconds', 'distance_meters', 'active_calories', 'avg_heart_rate'] as const
  for (const field of optionalNumberFields) {
    if (payload[field] !== undefined && (typeof payload[field] !== 'number' || !Number.isFinite(payload[field]))) {
      throw new ValidationError(`${field} must be a number if provided`)
    }
  }
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

type WorkoutRow = { id: string; notes: string | null }

async function handleWorkout(supabase: SupabaseClient, userId: string, payload: WorkoutPayload): Promise<{ mergedManualId: string | null; selfDedupId: string | null }> {
  const workoutRow = {
    user_id: userId,
    external_id: payload.apple_workout_id ?? null,
    activity_type: payload.activity_type ?? null,
    start_time: payload.start_time,
    end_time: payload.end_time ?? null,
    duration_seconds: payload.duration_seconds ?? null,
    distance_meters: payload.distance_meters ?? null,
    active_calories: payload.active_calories ?? null,
    avg_heart_rate: payload.avg_heart_rate ?? null,
    is_primary: true,
    updated_at: new Date().toISOString(),
  }

  if (payload.apple_workout_id) {
    // apple_workout_idをexternal_idとしてupsert（完全重複防止。同じワークアウトの
    // 再送信を受けても行が増えない）。
    const mergedManualId = await mergeManualDataIfPresent(supabase, userId, payload)

    const { error: upsertError } = await supabase.from('workouts').upsert(workoutRow, { onConflict: 'external_id' })
    if (upsertError) {
      throw upsertError
    }

    return { mergedManualId, selfDedupId: null }
  }

  // 【2026年8月27日改修：apple_workout_id未指定時の代替重複防止キー】
  // external_idが無い場合、upsertのonConflict対象（unique制約）が使えないため、
  // 同一ユーザー・同一start_time（完全一致）・external_id IS NULLの既存行を
  // アプリ側で検索し、見つかればUPDATE、無ければINSERTする（DB側にDeferrable/
  // Partial Unique Indexを追加する案も検討したが、PostgRESTのupsert onConflictは
  // 列リストのみでWHERE句付きのPartial Unique Indexを正しく参照できないため
  // 見送った）。この完全一致チェックは「同じ同期イベントの再送」を検知する
  // ためのもので、下記の「同日・前後30分以内の手動データ統合」ロジック
  // （既存、external_idありのケースと共通）とは別の目的・別の照合条件である点に
  // 注意（前者はstart_time完全一致、後者は30分の許容窓を持つ）。
  const { data: selfDedupCandidates, error: selfDedupError } = await supabase
    .from('workouts')
    .select('id')
    .eq('user_id', userId)
    .is('external_id', null)
    .eq('start_time', payload.start_time)
    .limit(1)

  if (selfDedupError) {
    throw selfDedupError
  }

  const selfDedupMatch = (selfDedupCandidates as { id: string }[] | null)?.[0] ?? null

  if (selfDedupMatch) {
    const { error: updateError } = await supabase.from('workouts').update(workoutRow).eq('id', selfDedupMatch.id)
    if (updateError) {
      throw updateError
    }
    return { mergedManualId: null, selfDedupId: selfDedupMatch.id }
  }

  const mergedManualId = await mergeManualDataIfPresent(supabase, userId, payload)

  const { error: insertError } = await supabase.from('workouts').insert(workoutRow)
  if (insertError) {
    throw insertError
  }

  return { mergedManualId, selfDedupId: null }
}

// 「同日かつ開始時刻が前後30分以内」＝日付境界（JST暦日）とタイムスタンプの
// 前後30分窓の両方を満たす行、かつ手動データ（external_id IS NULL）のみが対象。
async function mergeManualDataIfPresent(supabase: SupabaseClient, userId: string, payload: WorkoutPayload): Promise<string | null> {
  const startTime = new Date(payload.start_time)
  const windowStart = new Date(startTime.getTime() - MERGE_WINDOW_MS).toISOString()
  const windowEnd = new Date(startTime.getTime() + MERGE_WINDOW_MS).toISOString()
  const dateKey = toJstDateKey(payload.start_time)
  const { startUtc: dayStart, endUtc: dayEnd } = jstDateRangeUtc(dateKey)

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

  const manualMatch = (manualCandidates as WorkoutRow[] | null)?.[0] ?? null
  if (!manualMatch) {
    return null
  }

  const nextNotes = manualMatch.notes ? `${manualMatch.notes}\n[自動連携により統合]` : '[自動連携により統合]'
  // is_primaryは自動データ側だけがtrueになるよう、統合される手動データ側は
  // 同じUPDATEでfalseに落とす（1ワークアウトにつきis_primary: trueが常に
  // 1件になるようにするための修正、2026年8月27日）。
  const { error: updateError } = await supabase
    .from('workouts')
    .update({ notes: nextNotes, is_primary: false, updated_at: new Date().toISOString() })
    .eq('id', manualMatch.id)
  if (updateError) {
    throw updateError
  }

  return manualMatch.id
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

  let payload: Record<string, unknown> | null | undefined
  try {
    payload = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Record<string, unknown> | null | undefined
  } catch (parseError) {
    console.error('Apple Health同期リクエストのJSONパースに失敗しました', parseError)
    res.status(400).json({ error: 'invalid JSON body' })
    return
  }

  if (!payload || (payload.type !== 'sleep' && payload.type !== 'workout')) {
    res.status(400).json({ error: 'invalid payload: type must be "sleep" or "workout"' })
    return
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    if (payload.type === 'sleep') {
      validateSleepPayload(payload)
      const result = await handleSleep(supabase, syncUserId, payload)
      res.status(200).json({ ok: true, type: 'sleep', ...result })
      return
    }

    validateWorkoutPayload(payload)
    const result = await handleWorkout(supabase, syncUserId, payload)
    res.status(200).json({ ok: true, type: 'workout', ...result })
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error('Apple Health同期リクエストのバリデーションに失敗しました', error)
      res.status(400).json({ error: 'invalid payload' })
      return
    }

    // 原因究明のための一時的な詳細エラーレスポンス（message/details/hint/code）は
    // Apple Health連携の稼働が安定したため撤去し、本来の汎用レスポンスに戻した
    // （2026年8月27日）。詳細はVercelのサーバーログ（console.error）側で確認する。
    console.error('Apple Health同期処理に失敗しました', error)
    res.status(500).json({ error: 'sync failed' })
  }
}
