// 週次ACWRインサイト機能（実装指示書、2026年8月25日）：Vercel Cron
// （vercel.json参照、毎週月曜7:00 JST）から呼び出される週次ACWRレポート送信関数。
// api/send-reminder.ts（1日1回のリマインダー）と同じVercel Serverless Function
// パターンを踏襲し、Supabaseへのデータ取得ヘルパー・push送信ロジックの構造も
// 意図的に重複させている（既存ファイルには手を加えず独立させることで影響範囲を
// 最小化する判断。両ファイルとも同じ理由でuser_idごとのグルーピングロジックを
// 個別に持つ）。
//
// 【UUID不整合修正（2026年8月25日）】
// 初版はsend-reminder.tsに合わせて固定プレースホルダーUUID（DEFAULT_USER_ID）で
// 絞り込んでいたが、これは2026年8月25日のアカウント/ログイン機能フェーズBで
// 実際のauth.uid()へ全面移行済みの値であり、本番で該当行が無く無言で0件送信に
// なる懸念があった。send-reminder.tsと同じ修正（push_subscriptions.user_idから
// 実購読ユーザー一覧を取得し、ユーザーごとに算出→そのユーザー自身の端末へのみ
// 送信）を適用済み。push_subscriptions.user_idの書き込み自体（src/api/
// pushSubscriptions.ts）・既存端末の再購読が必要な点もsend-reminder.tsと同じ
// （詳細はsend-reminder.tsの同箇所コメント参照）。
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { calculateACWR, getACWRInsight } from '../src/utils/acwrHelpers.js'
import { shouldCreateNotification } from '../src/utils/notificationHelpers.js'
import type { ACWRInsightTier } from '../src/utils/acwrHelpers.js'
import type { DailyCondition, DateString, SoccerLog, TrainingLog } from '../src/types.js'

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

// 実装指示書の5区分の文言をそのまま使用。getACWRInsight（acwrHelpers.ts）の
// tierと対応させ、数値算出・帯域判定ロジック自体はacwrHelpers.tsを再利用する。
function buildWeeklyReportMessage(acwr: number): { title: string; message: string } {
  const tier = getACWRInsight(acwr).tier
  const value = acwr.toFixed(2)

  const MESSAGE_BY_TIER: Record<ACWRInsightTier, string> = {
    optimal: `先週のACWRは${value}（最適）でした！理想的な負荷維持ができています。タップして詳細を確認`,
    recovery: `先週のACWRは${value}（リカバリー）でした。順調に疲労が抜けています。今週の計画をチェックしましょう`,
    unload: `先週のACWRは${value}（負荷低下）でした。コンディション維持のためトレーニング強度を見直しましょう`,
    surge: `先週のACWRは${value}（警戒）でした。急性負荷が高まっています。今週のリカバリー計画を確認してください`,
    spike: `⚠️【警告】先週のACWRが${value}（危険水域）に達しました。怪我リスクが高まっています。即座に調整方針を確認してください`,
  }

  return { title: '週次ACWRレポート', message: MESSAGE_BY_TIER[tier] }
}

async function sendToSubscription(
  supabase: SupabaseClient,
  subscription: SubscriptionRow,
  content: { title: string; message: string },
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

  if (!shouldCreateNotification(existingNotifications, 'weekly_acwr_report', targetDate)) {
    return false
  }

  const { data: insertedRow, error: insertError } = await supabase
    .from('notifications')
    .insert({
      user_id: subscription.user_id,
      device_id: subscription.device_id,
      type: 'weekly_acwr_report',
      title: content.title,
      message: content.message,
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
      JSON.stringify({
        title: content.title,
        message: content.message,
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
  const resultByUser: Record<string, { acwr: number; tier: string } | { skipped: string }> = {}

  for (const [userId, subscriptions] of subscriptionsByUser) {
    const [trainingLogs, soccerLogs, dailyConditions] = await Promise.all([
      fetchTrainingLogsForAcwr(supabase, userId),
      fetchSoccerLogsForAcwr(supabase, userId),
      fetchDailyConditions(supabase, userId),
    ])

    const todayCondition = dailyConditions.find((condition) => condition.date === targetDate)
    const result = calculateACWR(trainingLogs, soccerLogs, targetDate, todayCondition?.muscleSorenessLevel, todayCondition?.muscleSorenessLocation)

    // フォールバック処理：データ不足（7日未満）でACWRが算出できないユーザーは
    // 送信すべき内容が無いため、そのユーザーだけスキップして次のユーザーへ進む。
    if (!result) {
      resultByUser[userId] = { skipped: 'acwr not available (insufficient data)' }
      continue
    }

    const content = buildWeeklyReportMessage(result.acwr)
    resultByUser[userId] = { acwr: result.acwr, tier: getACWRInsight(result.acwr).tier }

    for (const subscription of subscriptions) {
      const sent = await sendToSubscription(supabase, subscription, content, targetDate)
      if (sent) {
        sentCount += 1
      }
    }
  }

  res.status(200).json({ sent: sentCount, userCount: subscriptionsByUser.size, resultByUser })
}
