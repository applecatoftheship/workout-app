// プッシュ通知機能 Phase 1b（2026年8月24日）：Vercel Cron（vercel.json参照、
// 1日1回 UTC 12:00 = JST 21:00）から呼び出されるリマインダー送信関数。
//
// 【重要な前提・未確認事項】
// このファイルはSupabaseへservice_role権限で接続する必要がある
// （push_subscriptions/notificationsのRLSはx-device-idヘッダーで単一端末に
// 制限されるが、この関数は全端末を横断してACWR・ストリークを判定するため）。
// SUPABASE_URL・SUPABASE_SERVICE_ROLE_KEYがVercel環境変数に登録されている
// 前提で実装している。
//
// 【UUID不整合修正（2026年8月25日）】
// 従来はDEFAULT_USER_ID（旧・単一ユーザー運用時代のプレースホルダーUUID）で
// per-userテーブルを固定絞り込みしていたが、2026年8月25日のアカウント/ログイン
// 機能フェーズBでuser_idは実際のauth.uid()へ全面移行済みのため、この固定値を
// 参照する実装は本番でuser_idが一致する行が無く、無言で0件送信になっていた
// 可能性が高い（実装指示書の完了報告で報告済みの発見）。本修正では
// push_subscriptions.user_idから実際に購読が存在するuser_id一覧を取得し、
// ユーザーごとにACWR・ストリーク判定→そのユーザー自身の購読端末へのみ送信する
// 設計に変更した。push_subscriptions.user_idは2026年8月24日のテーブル新設時点で
// スキーマ上は既に存在したが、書き込み側（src/api/pushSubscriptions.ts）が
// 未設定だったため実際には全行NULLだった。src/api/pushSubscriptions.tsも
// 併せて修正済み（user_idを書き込むように変更）だが、既存の購読は再度
// Settings画面でプッシュ通知トグルをON/OFFし直すまでuser_id=NULLのままのため、
// 本修正後も既存端末が実際に通知を受け取るには再購読が必要な点に注意
// （完了報告で別途明示）。
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { detectAcwrDangerNotification, detectStreakBrokenNotification, shouldCreateNotification } from '../src/utils/notificationHelpers.js'
import type { NotificationCandidate } from '../src/utils/notificationHelpers.js'
import type { DailyCondition, DateString, MealLog, SoccerLog, TrainingLog } from '../src/types.js'

function todayInJst(): DateString {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return `${year}-${month}-${day}` as DateString
}

type SubscriptionRow = {
  id: string
  user_id: string | null
  device_id: string
  endpoint: string
  p256dh: string | null
  auth: string | null
}

async function fetchSubscriptionsGroupedByUser(supabase: SupabaseClient): Promise<Map<string, SubscriptionRow[]>> {
  const { data, error } = await supabase.from('push_subscriptions').select('id, user_id, device_id, endpoint, p256dh, auth')
  if (error) throw error

  const rows = data as unknown as SubscriptionRow[]
  const grouped = new Map<string, SubscriptionRow[]>()

  // user_idがNULLの行（旧実装時代に登録されたまま未再購読の端末等）は、どの
  // ユーザーの判定結果を送るべきか特定できないため対象から除外する
  // （推測でDEFAULT_USER_ID相当を割り当て直すことはしない）。
  for (const row of rows) {
    if (!row.user_id) continue
    const list = grouped.get(row.user_id) ?? []
    list.push(row)
    grouped.set(row.user_id, list)
  }

  return grouped
}

type TrainingSetRow = { training_log_exercise_id: string; weight: number | null; reps: number | null }
type TrainingLogExerciseRow = { id: string; training_log_id: string }
type TrainingLogRow = { id: string; log_date: string }

async function fetchTrainingLogsForAcwr(supabase: SupabaseClient, userId: string): Promise<TrainingLog[]> {
  const { data: logRows, error: logError } = await supabase
    .from('training_logs')
    .select('id, log_date')
    .eq('user_id', userId)
  if (logError) throw logError

  const logIds = (logRows as unknown as TrainingLogRow[]).map((log) => log.id)
  if (logIds.length === 0) {
    return []
  }

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from('training_log_exercises')
    .select('id, training_log_id')
    .in('training_log_id', logIds)
  if (exerciseError) throw exerciseError

  const exercises = exerciseRows as unknown as TrainingLogExerciseRow[]
  const exerciseIds = exercises.map((exercise) => exercise.id)

  const { data: setRows, error: setError } = exerciseIds.length
    ? await supabase.from('training_sets').select('training_log_exercise_id, weight, reps').in('training_log_exercise_id', exerciseIds)
    : { data: [] as TrainingSetRow[], error: null }
  if (setError) throw setError

  const sets = setRows as unknown as TrainingSetRow[]

  // ACWRの負荷計算（acwrHelpers.calculateDailyLoadMap）はexerciseId・orderIndex
  // を参照しないため、日次のΣ(weight×reps)を計算できる最小限の形だけ組み立てる。
  return (logRows as unknown as TrainingLogRow[]).map((log) => {
    const logExerciseIds = exercises.filter((exercise) => exercise.training_log_id === log.id).map((exercise) => exercise.id)
    const logSets = sets
      .filter((set) => logExerciseIds.includes(set.training_log_exercise_id))
      .map((set, index) => ({ setNumber: index + 1, weight: set.weight ?? undefined, reps: set.reps ?? undefined, isWarmup: false }))

    return {
      date: log.log_date as DateString,
      completed: true,
      exercises: [{ exerciseId: '', orderIndex: 0, sets: logSets }],
    }
  })
}

async function fetchSoccerLogsForAcwr(supabase: SupabaseClient, userId: string): Promise<SoccerLog[]> {
  const { data, error } = await supabase
    .from('soccer_logs')
    .select('log_date, activity_type, calories_burned')
    .eq('user_id', userId)
  if (error) throw error

  return (data as unknown as { log_date: string; activity_type: string; calories_burned: number | null }[]).map((row) => ({
    date: row.log_date as DateString,
    activityType: row.activity_type,
    caloriesBurned: row.calories_burned ?? undefined,
  }))
}

async function fetchMealLogsForStreak(supabase: SupabaseClient, userId: string): Promise<MealLog[]> {
  const { data, error } = await supabase.from('meal_logs').select('log_date').eq('user_id', userId)
  if (error) throw error

  return (data as unknown as { log_date: string }[]).map((row) => ({
    date: row.log_date as DateString,
    mealType: 'other',
    foods: [],
    calories: 0,
    protein: 0,
    fat: 0,
    carbohydrates: 0,
  }))
}

async function fetchDailyConditions(supabase: SupabaseClient, userId: string): Promise<DailyCondition[]> {
  const { data, error } = await supabase
    .from('daily_conditions')
    .select('log_date, weight, sleep_hours, fatigue, muscle_soreness_level, muscle_soreness_location')
    .eq('user_id', userId)
  if (error) throw error

  return (
    data as unknown as {
      log_date: string
      weight: number | null
      sleep_hours: number | null
      fatigue: number | null
      muscle_soreness_level: DailyCondition['muscleSorenessLevel'] | null
      muscle_soreness_location: DailyCondition['muscleSorenessLocation'] | null
    }[]
  ).map((row) => ({
    date: row.log_date as DateString,
    weight: row.weight ?? 0,
    sleepHours: row.sleep_hours ?? 0,
    fatigue: (row.fatigue ?? 3) as DailyCondition['fatigue'],
    muscleSorenessLevel: row.muscle_soreness_level ?? 'none',
    muscleSorenessLocation: row.muscle_soreness_location ?? 'none',
  }))
}

async function sendToSubscription(
  supabase: SupabaseClient,
  subscription: SubscriptionRow,
  candidate: NotificationCandidate,
  targetDate: DateString,
): Promise<boolean> {
  const { data: existingRows, error: existingError } = await supabase
    .from('notifications')
    .select('type, created_at')
    .eq('device_id', subscription.device_id)
  if (existingError) {
    console.error('notifications取得に失敗しました', existingError)
    return false
  }
  const existingNotifications = (existingRows as unknown as { type: string; created_at: string }[]).map((row) => ({
    type: row.type,
    createdAt: row.created_at,
  }))

  if (!shouldCreateNotification(existingNotifications, candidate.type, targetDate)) {
    return false
  }

  const { data: insertedRow, error: insertError } = await supabase
    .from('notifications')
    .insert({
      user_id: subscription.user_id,
      device_id: subscription.device_id,
      type: candidate.type,
      title: candidate.title,
      message: candidate.message,
      is_read: false,
    })
    .select('id')
    .single()
  if (insertError) {
    console.error('notifications insertに失敗しました', insertError)
    return false
  }
  const notificationId = (insertedRow as { id: string }).id

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh ?? '', auth: subscription.auth ?? '' },
      },
      // notificationId・deviceIdはsrc/sw.tsのnotificationclickハンドラで
      // 既読化更新（notifications.update）を行うために必要。Service Workerは
      // localStorageを使えずgetDeviceId()を呼べないため、送信側で判明している
      // subscription.device_idをそのままペイロードに含める。
      JSON.stringify({
        title: candidate.title,
        message: candidate.message,
        url: '/',
        notificationId,
        deviceId: subscription.device_id,
      }),
    )
    return true
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    if (statusCode === 404 || statusCode === 410) {
      await supabase.from('push_subscriptions').delete().eq('id', subscription.id)
    } else {
      console.error('push送信に失敗しました', error)
    }
    return false
  }
}

export default async function handler(req: { headers: Record<string, string | string[] | undefined> }, res: {
  status: (code: number) => { json: (body: unknown) => void }
}) {
  // Vercel Cronの推奨パターン：CRON_SECRETを設定している場合のみ検証する
  // （未設定の場合は今回のスコープ外として素通しする。設定を推奨）。
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.authorization
    if (authHeader !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    res.status(500).json({ error: 'missing required environment variables' })
    return
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const targetDate = todayInJst()
  const subscriptionsByUser = await fetchSubscriptionsGroupedByUser(supabase)

  let sentCount = 0
  const sentTypesByUser: Record<string, string[]> = {}

  for (const [userId, subscriptions] of subscriptionsByUser) {
    const [trainingLogs, soccerLogs, mealLogs, dailyConditions] = await Promise.all([
      fetchTrainingLogsForAcwr(supabase, userId),
      fetchSoccerLogsForAcwr(supabase, userId),
      fetchMealLogsForStreak(supabase, userId),
      fetchDailyConditions(supabase, userId),
    ])

    const todayCondition = dailyConditions.find((condition) => condition.date === targetDate)

    const candidates = [
      detectAcwrDangerNotification(trainingLogs, soccerLogs, targetDate, todayCondition?.muscleSorenessLevel, todayCondition?.muscleSorenessLocation),
      detectStreakBrokenNotification(trainingLogs, soccerLogs, mealLogs, dailyConditions, targetDate),
    ].filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)

    if (candidates.length === 0) {
      continue
    }

    for (const subscription of subscriptions) {
      for (const candidate of candidates) {
        const sent = await sendToSubscription(supabase, subscription, candidate, targetDate)
        if (sent) {
          sentCount += 1
          sentTypesByUser[userId] = [...(sentTypesByUser[userId] ?? []), candidate.type]
        }
      }
    }
  }

  res.status(200).json({ sent: sentCount, userCount: subscriptionsByUser.size, sentTypesByUser })
}
