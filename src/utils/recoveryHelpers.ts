import type { DateString, MealLog, SoccerLog, TrainingLog } from '../types'
import type { RecoveryResult, RecoveryStatus, RecoveryWindowConfig } from '../types/recovery'
import { getPeriodRange, toDateKey } from './chartHelpers'

// リカバリー窓機能（スプリント4 Phase 2、2026年8月21日）：windowMinutes・
// targetProteinGrams・targetCarbGramsはユーザー設定UIが未実装のためハードコードの
// デフォルト値のみ（実装指示書スコープ外）。
export const DEFAULT_RECOVERY_WINDOW_CONFIG: RecoveryWindowConfig = {
  windowMinutes: 45,
  targetProteinGrams: 20,
  targetCarbGrams: 30,
}

// その日end_timeを持つセッションが1件も無い場合はcalculateDailyRecoveryResultsが
// 空配列を返す設計のため、この関数自体がRecoveryStatus='no_session'を返すことはない。
function calculateRecoveryForSession(
  sessionType: RecoveryResult['sessionType'],
  sessionDate: DateString,
  sessionEndTime: string,
  mealLogs: MealLog[],
  config: RecoveryWindowConfig,
  now: Date,
): RecoveryResult {
  const endMs = new Date(sessionEndTime).getTime()
  const windowEndMs = endMs + config.windowMinutes * 60_000
  const windowEndTime = new Date(windowEndMs).toISOString()

  // meal_logsは既にmeal_log_food_items由来のprotein/carbohydrates合計値
  // （src/api/mealLogs.tsのfetchMealLogs参照）を持っているため、ここで
  // 子テーブルへ再度問い合わせる必要はない。
  const matchedMeals = mealLogs.filter((meal) => {
    if (!meal.mealTime) {
      return false
    }
    const mealMs = new Date(meal.mealTime).getTime()
    return mealMs >= endMs && mealMs <= windowEndMs
  })

  const consumedProtein = matchedMeals.reduce((sum, meal) => sum + meal.protein, 0)
  const consumedCarbs = matchedMeals.reduce((sum, meal) => sum + meal.carbohydrates, 0)
  const matchedMealIds = matchedMeals.map((meal) => meal.id).filter((id): id is string => Boolean(id))

  const hasProtein = consumedProtein >= config.targetProteinGrams
  const hasCarbs = consumedCarbs >= config.targetCarbGrams

  let status: RecoveryStatus
  if (hasProtein && hasCarbs) {
    status = 'completed_full'
  } else if (hasProtein) {
    status = 'completed_protein_only'
  } else if (now.getTime() > windowEndMs) {
    status = 'missed'
  } else {
    status = 'active'
  }

  return {
    sessionType,
    sessionDate,
    sessionEndTime,
    windowEndTime,
    status,
    consumedProtein,
    consumedCarbs,
    matchedMealIds,
  }
}

/**
 * 指定日のトレーニング・サッカーそれぞれのセッション（end_timeが設定されている
 * もののみ対象。Phase 1実装前の記録はend_timeがNULLのため自動的に対象外になる）
 * に対してリカバリー窓判定を行う。該当セッションが1件も無い日は空配列を返す
 * （呼び出し側で「no_session」＝カード非表示として扱う）。
 * DBにはキャッシュせず、呼び出しのたびにtrainingLogs/soccerLogs/mealLogsから
 * 動的に計算する（ACWR・移動平均と同じ方針）。
 */
export function calculateDailyRecoveryResults(
  trainingLogs: TrainingLog[],
  soccerLogs: SoccerLog[],
  mealLogs: MealLog[],
  dateKey: DateString,
  now: Date,
  config: RecoveryWindowConfig = DEFAULT_RECOVERY_WINDOW_CONFIG,
): RecoveryResult[] {
  const results: RecoveryResult[] = []

  trainingLogs
    .filter((log) => log.date === dateKey && log.endTime)
    .forEach((log) => {
      results.push(calculateRecoveryForSession('workout', dateKey, log.endTime as string, mealLogs, config, now))
    })

  soccerLogs
    .filter((log) => log.date === dateKey && log.endTime)
    .forEach((log) => {
      results.push(calculateRecoveryForSession('soccer', dateKey, log.endTime as string, mealLogs, config, now))
    })

  return results
}

const ACHIEVED_STATUSES = new Set<RecoveryStatus>(['completed_full', 'completed_protein_only'])

/**
 * 週次サマリー（進捗グラフ画面）：今週（日〜土、chartHelpers.getPeriodRange('week')と
 * 同じ定義）の各日についてcalculateDailyRecoveryResultsを実行し、達成
 * （フル/プロテインのみ問わず）したセッション数と、no_session（該当セッション無し）の
 * 日を除いた全セッション数を集計する。ProgressGraph画面の期間タブ（1週間/1ヶ月/…）の
 * 選択状態には影響されず、常に「今週」固定で計算する（ACWRGaugeCard・目標ストリップと
 * 同じ「常にtodayString/今週基準」カードの考え方を踏襲）。
 */
export function calculateWeeklyRecoverySummary(
  trainingLogs: TrainingLog[],
  soccerLogs: SoccerLog[],
  mealLogs: MealLog[],
  today: Date,
  now: Date,
  config: RecoveryWindowConfig = DEFAULT_RECOVERY_WINDOW_CONFIG,
): { achievedCount: number; totalCount: number } {
  const { start, end } = getPeriodRange('week', today)
  const dateKeys: DateString[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    dateKeys.push(toDateKey(cursor) as DateString)
    cursor.setDate(cursor.getDate() + 1)
  }

  let achievedCount = 0
  let totalCount = 0

  dateKeys.forEach((dateKey) => {
    const results = calculateDailyRecoveryResults(trainingLogs, soccerLogs, mealLogs, dateKey, now, config)
    results.forEach((result) => {
      totalCount += 1
      if (ACHIEVED_STATUSES.has(result.status)) {
        achievedCount += 1
      }
    })
  })

  return { achievedCount, totalCount }
}
