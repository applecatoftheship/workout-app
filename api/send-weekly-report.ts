// 週次ACWRインサイト機能（実装指示書、2026年8月25日）：Vercel Cron
// （vercel.json参照、毎週月曜7:00 JST）から呼び出される週次ACWRレポート送信関数。
// api/send-reminder.ts（1日1回のリマインダー）と同じVercel Serverless Function
// パターンを踏襲し、Supabaseへのデータ取得ヘルパー・push送信ロジックの構造も
// 意図的に重複させている（既存の送信済み・稼働中のsend-reminder.tsには一切
// 手を加えず、新規ファイルとして独立させることで影響範囲を最小化する判断）。
//
// 【重要・要確認：DEFAULT_USER_IDが本番運用と食い違っている可能性】
// このファイルはsend-reminder.tsに合わせて、per-userテーブルの取得を固定の
// プレースホルダーUUID（旧DEFAULT_USER_ID、アカウント/ログイン機能フェーズB
// 移行前の単一ユーザー運用時代の値）で絞り込んでいる。しかし2026年8月25日の
// アカウント/ログイン機能フェーズBで、training_logs等13テーブルのuser_id列は
// このプレースホルダー値から実際のauth.uid()（本物のユーザーUUID）へ全面的に
// 移行済みであり、このプレースホルダー値と一致する行はもう存在しない可能性が高い
// （src/api/client.tsのgetCurrentUserId・CLAUDE.mdの「アカウント/ログイン機能」
// 節参照）。同じ問題は既存のsend-reminder.tsにも既に存在しており（このファイル
// 作成時点で気づいた副次的な発見）、この2つの通知cronは本番切り替え後、
// 実際には対象ユーザーの記録を一件も取得できず無言で0件送信し続けている
// 可能性がある。今回の実装指示書はこの検証・修正を含んでいないため、パターンを
// 忠実に踏襲したうえで、この懸念を完了報告で別途明示的に報告する
// （推測で正しいUUIDに書き換えることはしない：正しい値が分からないため）。
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { calculateACWR } from '../src/utils/acwrHelpers.js'
import { getACWRInsight } from '../src/utils/acwrHelpers.js'
import { shouldCreateNotification } from '../src/utils/notificationHelpers.js'
import type { DailyCondition, DateString, SoccerLog, TrainingLog } from '../src/types.js'

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

// 実装指示書の5区分の文言をそのまま使用。getACWRInsight（acwrHelpers.ts）の
// tierと対応させ、数値算出・帯域判定ロジック自体はacwrHelpers.tsを再利用する
// （calculateACWRの結果からtierだけ取り出し、メッセージ文言はこのファイル固有
// のプッシュ通知用テキストとして別管理する。ダッシュボードのインサイト文言
// getACWRInsightのbodyとは文体・用途が異なるため意図的に別テキストにしている）。
function buildWeeklyReportMessage(acwr: number): { title: string; message: string } {
  const tier = getACWRInsight(acwr).tier
  const value = acwr.toFixed(2)

  const MESSAGE_BY_TIER: Record<typeof tier, string> = {
    optimal: `先週のACWRは${value}（最適）でした！理想的な負荷維持ができています。タップして詳細を確認`,
    recovery: `先週のACWRは${value}（リカバリー）でした。順調に疲労が抜けています。今週の計画をチェックしましょう`,
    unload: `先週のACWRは${value}（負荷低下）でした。コンディション維持のためトレーニング強度を見直しましょう`,
    surge: `先週のACWRは${value}（警戒）でした。急性負荷が高まっています。今週のリカバリー計画を確認してください`,
    spike: `⚠️【警告】先週のACWRが${value}（危険水域）に達しました。怪我リスクが高まっています。即座に調整方針を確認してください`,
  }

  return { title: '週次ACWRレポート', message: MESSAGE_BY_TIER[tier] }
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

  const [trainingLogs, soccerLogs, dailyConditions] = await Promise.all([
    fetchTrainingLogsForAcwr(supabase),
    fetchSoccerLogsForAcwr(supabase),
    fetchDailyConditions(supabase),
  ])

  const todayCondition = dailyConditions.find((condition) => condition.date === targetDate)
  const result = calculateACWR(trainingLogs, soccerLogs, targetDate, todayCondition?.muscleSorenessLevel, todayCondition?.muscleSorenessLocation)

  // フォールバック処理：データ不足（7日未満）でACWRが算出できない場合は
  // 送信すべき内容が無いため、空状態として何もせず正常終了する
  // （実装指示書「予期しないデータに遭遇した場合は空状態にフォールバック」の
  // プッシュ通知版としての解釈）。
  if (!result) {
    res.status(200).json({ sent: 0, reason: 'acwr not available (insufficient data)' })
    return
  }

  const { title, message } = buildWeeklyReportMessage(result.acwr)

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

    if (!shouldCreateNotification(existingNotifications, 'weekly_acwr_report', targetDate)) {
      continue
    }

    const { data: insertedRow, error: insertError } = await supabase
      .from('notifications')
      .insert({
        device_id: subscription.device_id,
        type: 'weekly_acwr_report',
        title,
        message,
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
        JSON.stringify({
          title,
          message,
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

  res.status(200).json({ sent: sentCount, acwr: result.acwr, tier: getACWRInsight(result.acwr).tier })
}
