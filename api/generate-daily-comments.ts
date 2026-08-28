// AIコンディショニングアドバイザー：前日分のAIコメント自動生成cron（2026年8月29日新設）。
//
// 【背景】従来はConditionForm.tsx（体調記録画面）で「その日」の体調記録画面を
// 開いた時点で自動生成していたが、これだと記録が出揃う前（トレーニング・食事等が
// 未入力の段階）で生成されてしまい内容が薄くなる問題があった。この問題を解消する
// ため、自動生成トリガーはsrc/hooks/useDailyAiComment.tsから撤去し（同時期の変更）、
// 代わりにこのcronが毎日1回、「前日」（記録が出揃っているはずの日）分をユーザーごとに
// 自動生成する。api/send-reminder.ts・api/send-weekly-report.tsと同じVercel Cron
// パターン（vercel.json参照）。
//
// 【実行時刻】毎日05:00 JST（vercel.jsonでは "0 20 * * *" = UTC 20:00）。サーバー側の
// 「日付」判定は本プロジェクト全体でJST基準（Asia/Tokyo）に統一されているため
// （api/send-weekly-report.tsのtodayInJst()等と同じ方式）、これに合わせた。深夜の
// 遅い記録（23時台等）にも確実に間に合い、かつ朝には生成済みになっている時間帯として
// 05:00 JSTを選定（John承認済み）。
//
// 【対象ユーザーの抽出方法】api/send-reminder.ts・api/send-weekly-report.tsは
// push_subscriptions.user_idから「通知の購読者」を全ユーザー一覧として使っている。
// しかしAIコメント生成はdaily_conditions行そのものに紐づく機能であり、プッシュ通知を
// 有効化していないユーザーも対象から漏らすべきではない。そのため、このcronは
// daily_conditionsから「log_date = 前日 かつ ai_comment が未生成（null）」の行を
// 直接抽出する方式にした。これにより対象ユーザーの選定と重複生成防止（要件）を
// 1クエリで同時に満たしている。
//
// 【重複実装についての方針】per-userのデータ取得関数（fetchTrainingLogsForAcwr等）は
// api/send-reminder.ts・api/send-weekly-report.tsの同名関数とほぼ同型だが、あえて
// 個別に実装している（既存2ファイルが「既存ファイルには手を加えず独立させることで
// 影響範囲を最小化する」という理由で意図的に重複させている前例を踏襲。詳細は
// 各ファイル冒頭のコメント参照）。一方、Gemini呼び出し本体（プロンプト生成・API
// 呼び出し・フォールバック文言）は、プロンプト文言の食い違いを防ぐため
// api/_lib/dailyCommentGeneration.tsに切り出しapi/generate-daily-comment.tsと共有する。
//
// 【ACWR計算のための慢性負荷ウィンドウ】calculateACWR（src/utils/acwrHelpers.ts）は
// 対象日から遡って最大28日分の負荷データを必要とする。トレーニング・サッカー・
// ワークアウトの各データはこの28日レンジに絞って取得するが、daily_conditions
// （体重の直近値参照、calculateDailyLoadMapのfindRecentWeightOnOrBefore用）は
// 期間を絞らずユーザーの全履歴を取得する（src/hooks/useDailyAiComment.tsの
// クライアント側実装と同じ理由：体重記録に28日を超える空白がある場合でも直近の
// 実測値を正しく参照するため）。
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateACWR } from '../src/utils/acwrHelpers.js'
import { buildDailySummaryText } from '../src/utils/dailyCommentHelpers.js'
import { generateDailyCommentViaGemini } from './_lib/dailyCommentGeneration.js'
import type { DailyCondition, DateString, MealLog, SoccerLog, TrainingLog, Workout } from '../src/types.js'

const CHRONIC_WINDOW_DAYS = 28

function yesterdayInJst(): DateString {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(yesterday)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return `${year}-${month}-${day}` as DateString
}

function addDaysToDateKey(dateKey: DateString, days: number): DateString {
  const date = new Date(`${dateKey}T00:00:00`)
  date.setDate(date.getDate() + days)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}` as DateString
}

type PendingRow = { user_id: string | null; log_date: string }

// log_date = targetDate かつ ai_comment が未生成の行のみを抽出する（対象ユーザーの
// 選定と重複生成防止を1クエリで兼ねる。詳細は本ファイル冒頭コメント参照）。
async function fetchPendingUserIds(supabase: SupabaseClient, targetDate: DateString): Promise<string[]> {
  const { data, error } = await supabase
    .from('daily_conditions')
    .select('user_id, log_date')
    .eq('log_date', targetDate)
    .is('ai_comment', null)
  if (error) throw error

  return (data as unknown as PendingRow[])
    .map((row) => row.user_id)
    .filter((userId): userId is string => userId !== null)
}

type TrainingSetRow = { training_log_exercise_id: string; weight: number | null; reps: number | null }
type TrainingLogExerciseRow = { id: string; training_log_id: string }
type TrainingLogRow = { id: string; log_date: string }

async function fetchTrainingLogsForAcwr(
  supabase: SupabaseClient,
  userId: string,
  startDate: DateString,
  endDate: DateString,
): Promise<TrainingLog[]> {
  const { data: logRows, error: logError } = await supabase
    .from('training_logs')
    .select('id, log_date')
    .eq('user_id', userId)
    .gte('log_date', startDate)
    .lte('log_date', endDate)
  if (logError) throw logError

  const logs = logRows as unknown as TrainingLogRow[]
  const logIds = logs.map((log) => log.id)
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

  return logs.map((log) => {
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

async function fetchSoccerLogsForAcwr(
  supabase: SupabaseClient,
  userId: string,
  startDate: DateString,
  endDate: DateString,
): Promise<SoccerLog[]> {
  const { data, error } = await supabase
    .from('soccer_logs')
    .select('log_date, activity_type, calories_burned')
    .eq('user_id', userId)
    .gte('log_date', startDate)
    .lte('log_date', endDate)
  if (error) throw error

  return (data as unknown as { log_date: string; activity_type: string; calories_burned: number | null }[]).map((row) => ({
    date: row.log_date as DateString,
    activityType: row.activity_type,
    caloriesBurned: row.calories_burned ?? undefined,
  }))
}

// workouts.start_timeはtimestamptzのため、JST基準の暦日範囲をUTC境界に変換してから
// 絞り込む（src/api/workouts.tsのjstDateRangeToUtcと同じ変換方式）。
function jstDateRangeToUtc(startDate: DateString, endDate: DateString): { startUtc: string; endUtc: string } {
  const startUtc = new Date(`${startDate}T00:00:00+09:00`).toISOString()
  const endUtc = new Date(`${endDate}T00:00:00+09:00`)
  endUtc.setUTCDate(endUtc.getUTCDate() + 1)
  return { startUtc, endUtc: endUtc.toISOString() }
}

async function fetchWorkoutsForAcwr(
  supabase: SupabaseClient,
  userId: string,
  startDate: DateString,
  endDate: DateString,
): Promise<Workout[]> {
  const { startUtc, endUtc } = jstDateRangeToUtc(startDate, endDate)
  const { data, error } = await supabase
    .from('workouts')
    .select('start_time, distance_meters, is_primary')
    .eq('user_id', userId)
    .eq('is_primary', true)
    .gte('start_time', startUtc)
    .lt('start_time', endUtc)
  if (error) throw error

  return (data as unknown as { start_time: string; distance_meters: number | null; is_primary: boolean }[]).map((row) => ({
    startTime: row.start_time,
    distanceMeters: row.distance_meters ?? undefined,
    isPrimary: row.is_primary,
  }))
}

// daily_conditionsは期間を絞らずユーザーの全履歴を取得する（本ファイル冒頭コメント
// 「ACWR計算のための慢性負荷ウィンドウ」参照）。列構成はapi/send-reminder.tsの
// fetchDailyConditionsと同一。
async function fetchAllDailyConditions(supabase: SupabaseClient, userId: string): Promise<DailyCondition[]> {
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

// meal_logs.calories等は列として存在せず、meal_log_food_items（食材ごとの確定
// スナップショット）の合算で求める（src/api/mealLogs.tsのfetchMealLogsと同じ集計
// パターン）。dailySummary生成にはfoods（食材名一覧）は不要なため取得しない。
async function fetchMealLogsForDate(supabase: SupabaseClient, userId: string, targetDate: DateString): Promise<MealLog[]> {
  const { data: logRows, error: logError } = await supabase
    .from('meal_logs')
    .select('id, log_date')
    .eq('user_id', userId)
    .eq('log_date', targetDate)
  if (logError) throw logError

  const logs = logRows as unknown as { id: string; log_date: string }[]
  if (logs.length === 0) {
    return []
  }

  const logIds = logs.map((log) => log.id)
  const { data: linkRows, error: linkError } = await supabase
    .from('meal_log_food_items')
    .select('meal_log_id, calories, protein, fat, carbohydrates')
    .in('meal_log_id', logIds)
  if (linkError) throw linkError

  const links = linkRows as unknown as {
    meal_log_id: string
    calories: number | null
    protein: number | null
    fat: number | null
    carbohydrates: number | null
  }[]

  return logs.map((log) => {
    const totals = links
      .filter((link) => link.meal_log_id === log.id)
      .reduce(
        (acc, link) => ({
          calories: acc.calories + (link.calories ?? 0),
          protein: acc.protein + (link.protein ?? 0),
          fat: acc.fat + (link.fat ?? 0),
          carbohydrates: acc.carbohydrates + (link.carbohydrates ?? 0),
        }),
        { calories: 0, protein: 0, fat: 0, carbohydrates: 0 },
      )

    return {
      date: log.log_date as DateString,
      mealType: 'other',
      foods: [],
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein),
      fat: Math.round(totals.fat),
      carbohydrates: Math.round(totals.carbohydrates),
    }
  })
}

export default async function handler(
  req: { headers: Record<string, string | string[] | undefined> },
  res: { status: (code: number) => { json: (body: unknown) => void } },
) {
  // Vercel Cronの推奨パターン：CRON_SECRETを設定している場合のみ検証する
  // （api/send-reminder.tsと同じ方式）。
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
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'missing required environment variables' })
    return
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const targetDate = yesterdayInJst()
  const chronicStartKey = addDaysToDateKey(targetDate, -(CHRONIC_WINDOW_DAYS - 1))

  let pendingUserIds: string[]
  try {
    pendingUserIds = await fetchPendingUserIds(supabase, targetDate)
  } catch (error) {
    console.error('daily_conditions（前日分・ai_comment未生成）の取得に失敗しました', error)
    res.status(500).json({ error: 'failed to fetch pending daily_conditions' })
    return
  }

  let generatedCount = 0
  let skippedCount = 0

  for (const userId of pendingUserIds) {
    try {
      const [trainingLogs, soccerLogs, workouts, mealLogs, dailyConditions] = await Promise.all([
        fetchTrainingLogsForAcwr(supabase, userId, chronicStartKey, targetDate),
        fetchSoccerLogsForAcwr(supabase, userId, chronicStartKey, targetDate),
        fetchWorkoutsForAcwr(supabase, userId, chronicStartKey, targetDate),
        fetchMealLogsForDate(supabase, userId, targetDate),
        fetchAllDailyConditions(supabase, userId),
      ])

      const targetCondition = dailyConditions.find((condition) => condition.date === targetDate)
      if (!targetCondition) {
        // fetchPendingUserIdsで存在確認済みのはずだが、念のため取得できなかった
        // 場合はスキップする（安全側のガード）。
        skippedCount++
        continue
      }

      const acwrResult = calculateACWR(
        trainingLogs,
        soccerLogs,
        targetDate,
        targetCondition.muscleSorenessLevel,
        targetCondition.muscleSorenessLocation,
        workouts,
        dailyConditions,
      )
      const dailySummary = buildDailySummaryText(trainingLogs, soccerLogs, workouts, mealLogs, targetDate)

      const generated = await generateDailyCommentViaGemini({
        acwr: acwrResult?.acwr ?? null,
        acwrStatus: acwrResult?.status ?? null,
        sleepHours: targetCondition.sleepHours,
        fatigueLevel: targetCondition.fatigue,
        dailySummary,
      })

      if (!generated.shouldPersist) {
        // Gemini呼び出し自体が失敗/未設定（定型文フォールバック）の場合は保存しない
        // （api/generate-daily-comment.tsと同じ方針）。翌日以降のcronはこの日付を
        // 対象としないため、この日の分は手動再生成ボタン（過去日でも動作するよう
        // 2026年8月29日に拡張済み）が唯一のリトライ手段になる。
        skippedCount++
        continue
      }

      const { error: upsertError } = await supabase
        .from('daily_conditions')
        .upsert({ user_id: userId, log_date: targetDate, ai_comment: generated.text }, { onConflict: 'user_id,log_date' })

      if (upsertError) {
        console.error(`daily_conditions.ai_commentの保存に失敗しました（userId: ${userId}）`, upsertError)
        skippedCount++
        continue
      }

      generatedCount++
    } catch (error) {
      console.error(`ユーザー${userId}のAIコメント生成処理でエラーが発生しました`, error)
      skippedCount++
    }
  }

  res.status(200).json({ targetDate, pendingCount: pendingUserIds.length, generatedCount, skippedCount })
}
