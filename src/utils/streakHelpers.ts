import type { DailyCondition, DateString, MealLog, SportLog, TrainingLog } from '../types.js'
import { toDateKey } from './chartHelpers.js'

// 記録更新演出機能（PR・連続記録、2026年8月21日）：ストリーク（連続記録日数）の節目。
// 7/30/100/365日、365日以降は100日ごと（465, 565, ...）。
const STREAK_BASE_MILESTONES = [7, 30, 100, 365]

export function isStreakMilestone(days: number): boolean {
  if (STREAK_BASE_MILESTONES.includes(days)) return true
  return days > 365 && (days - 365) % 100 === 0
}

// training_logs・meal_logs・daily_conditions・sport_logsのlog_dateをOR結合し、
// 重複除去した「記録がある日」の集合を作る。sport_logsはユーザーが能動的に記録する
// 活動のため、training_logsと同様に「記録した日」としてカウントする
// （Tier 4-2：競技の拡張、2026年9月12日追加。health_metricsのような自動計測値
// テーブルとは異なる扱い）。
// サッカー機能統合（2026年9月13日）：soccerLogs引数を廃止（サッカー・フットサルの
// 記録はsportLogs経由でカウントされるようになったため）。
function collectLogDates(
  trainingLogs: TrainingLog[],
  mealLogs: MealLog[],
  dailyConditions: DailyCondition[],
  sportLogs: SportLog[] = [],
): Set<DateString> {
  const dates = new Set<DateString>()
  trainingLogs.forEach((log) => dates.add(log.date))
  mealLogs.forEach((log) => dates.add(log.date))
  dailyConditions.forEach((log) => dates.add(log.date))
  sportLogs.forEach((log) => dates.add(log.date))
  return dates
}

// todayから遡って連続で「記録がある日」が続く日数を数える。4テーブルいずれかに
// 該当日のlog_dateが1件でもあれば「記録がある日」とみなす（OR結合）。
// sportLogsは末尾に追加（省略時は空配列、既存呼び出しとの後方互換）。
// サッカー機能統合（2026年9月13日）：soccerLogs引数を廃止。
export function calculateCurrentStreak(
  trainingLogs: TrainingLog[],
  mealLogs: MealLog[],
  dailyConditions: DailyCondition[],
  today: Date,
  sportLogs: SportLog[] = [],
): number {
  const dates = collectLogDates(trainingLogs, mealLogs, dailyConditions, sportLogs)
  let streak = 0
  const cursor = new Date(today)
  while (dates.has(toDateKey(cursor) as DateString)) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}
