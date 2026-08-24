// プッシュ通知機能 Phase 1b（2026年8月24日）：Vercel Cron（vercel.json参照、
// 1日1回 UTC 12:00 = JST 21:00）から呼び出されるリマインダー送信関数。
//
// 【重要な前提・未確認事項】
// このファイルはSupabaseへservice_role権限で接続する必要がある
// （push_subscriptions/notificationsのRLSはx-device-idヘッダーで単一端末に
// 制限されるが、この関数は全端末を横断してACWR・ストリークを判定するため）。
// SUPABASE_URL・SUPABASE_SERVICE_ROLE_KEYがVercel環境変数に登録されている
// 前提で実装しているが、今回の指示ではVAPID系の3変数の登録のみ確認されており、
// この2つの登録有無は確認できていない（未登録の場合はデプロイ後に実行エラーに
// なるため、Johnさんに登録有無の確認をお願いしたい）。
//
// このアプリは認証未実装の単一ユーザー運用（training_logs等はDEFAULT_USER_ID
// 固定）だが、push_subscriptionsは端末単位（device_id）で複数登録されうる
// （同一人物が複数ブラウザ/端末で購読している状態を想定）。そのため、
// ACWR・ストリークの判定はDEFAULT_USER_ID分のデータで1回だけ行い、判定結果を
// 登録済みの全端末（push_subscriptionsの全行）に対して個別に重複チェック
// ・送信する設計にしている。
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { detectAcwrDangerNotification, detectStreakBrokenNotification, shouldCreateNotification } from '../src/utils/notificationHelpers.js'
import type { DailyCondition, DateString, MealLog, SoccerLog, TrainingLog } from '../src/types.js'

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000002'

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

type TrainingSetRow = { training_log_exercise_id: string; weight: number | null; reps: number | null }
type TrainingLogExerciseRow = { id: string; training_log_id: string }
type TrainingLogRow = { id: string; log_date: string }

async function fetchTrainingLogsForAcwr(supabase: SupabaseClient): Promise<TrainingLog[]> {
  const { data: logRows, error: logError } = await supabase
    .from('training_logs')
    .select('id, log_date')
    .eq('user_id', DEFAULT_USER_ID)
  if (logError) throw logError

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from('training_log_exercises')
    .select('id, training_log_id')
  if (exerciseError) throw exerciseError

  const { data: setRows, error: setError } = await supabase
    .from('training_sets')
    .select('training_log_exercise_id, weight, reps')
  if (setError) throw setError

  const exercises = exerciseRows as unknown as TrainingLogExerciseRow[]
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

async function fetchSoccerLogsForAcwr(supabase: SupabaseClient): Promise<SoccerLog[]> {
  const { data, error } = await supabase
    .from('soccer_logs')
    .select('log_date, activity_type, calories_burned')
    .eq('user_id', DEFAULT_USER_ID)
  if (error) throw error

  return (data as unknown as { log_date: string; activity_type: string; calories_burned: number | null }[]).map((row) => ({
    date: row.log_date as DateString,
    activityType: row.activity_type,
    caloriesBurned: row.calories_burned ?? undefined,
  }))
}

async function fetchMealLogsForStreak(supabase: SupabaseClient): Promise<MealLog[]> {
  const { data, error } = await supabase.from('meal_logs').select('log_date').eq('user_id', DEFAULT_USER_ID)
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

async function fetchDailyConditions(supabase: SupabaseClient): Promise<DailyCondition[]> {
  const { data, error } = await supabase
    .from('daily_conditions')
    .select('log_date, weight, sleep_hours, fatigue, muscle_soreness_level, muscle_soreness_location')
    .eq('user_id', DEFAULT_USER_ID)
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

  const [trainingLogs, soccerLogs, mealLogs, dailyConditions] = await Promise.all([
    fetchTrainingLogsForAcwr(supabase),
    fetchSoccerLogsForAcwr(supabase),
    fetchMealLogsForStreak(supabase),
    fetchDailyConditions(supabase),
  ])

  const todayCondition = dailyConditions.find((condition) => condition.date === targetDate)

  const candidates = [
    detectAcwrDangerNotification(trainingLogs, soccerLogs, targetDate, todayCondition?.muscleSorenessLevel, todayCondition?.muscleSorenessLocation),
    detectStreakBrokenNotification(trainingLogs, soccerLogs, mealLogs, dailyConditions, targetDate),
  ].filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)

  if (candidates.length === 0) {
    res.status(200).json({ sent: 0, reason: 'no candidates' })
    return
  }

  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, device_id, endpoint, p256dh, auth')
  if (subscriptionError) {
    res.status(500).json({ error: subscriptionError.message })
    return
  }

  const subscriptions = subscriptionRows as unknown as {
    id: string
    device_id: string
    endpoint: string
    p256dh: string | null
    auth: string | null
  }[]

  let sentCount = 0

  for (const subscription of subscriptions) {
    const { data: existingRows, error: existingError } = await supabase
      .from('notifications')
      .select('type, created_at')
      .eq('device_id', subscription.device_id)
    if (existingError) {
      console.error('notifications取得に失敗しました', existingError)
      continue
    }
    const existingNotifications = (existingRows as unknown as { type: string; created_at: string }[]).map((row) => ({
      type: row.type,
      createdAt: row.created_at,
    }))

    for (const candidate of candidates) {
      if (!shouldCreateNotification(existingNotifications, candidate.type, targetDate)) {
        continue
      }

      const { data: insertedRow, error: insertError } = await supabase
        .from('notifications')
        .insert({
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
        continue
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
        sentCount += 1
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', subscription.id)
        } else {
          console.error('push送信に失敗しました', error)
        }
      }
    }
  }

  res.status(200).json({ sent: sentCount, candidates: candidates.map((candidate) => candidate.type) })
}
