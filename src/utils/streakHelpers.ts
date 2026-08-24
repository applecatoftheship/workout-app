import type { DailyCondition, DateString, MealLog, SoccerLog, TrainingLog } from '../types.js'
import { toDateKey } from './chartHelpers.js'

// 記録更新演出機能（PR・連続記録、2026年8月21日）：ストリーク（連続記録日数）の節目。
// 7/30/100/365日、365日以降は100日ごと（465, 565, ...）。
const STREAK_BASE_MILESTONES = [7, 30, 100, 365]

export function isStreakMilestone(days: number): boolean {
  if (STREAK_BASE_MILESTONES.includes(days)) return true
  return days > 365 && (days - 365) % 100 === 0
}

// training_logs・soccer_logs・meal_logs・daily_conditionsのlog_dateをOR結合し、
// 重複除去した「記録がある日」の集合を作る。
function collectLogDates(
  trainingLogs: TrainingLog[],
  soccerLogs: SoccerLog[],
  mealLogs: MealLog[],
  dailyConditions: DailyCondition[],
): Set<DateString> {
  const dates = new Set<DateString>()
  trainingLogs.forEach((log) => dates.add(log.date))
  soccerLogs.forEach((log) => dates.add(log.date))
  mealLogs.forEach((log) => dates.add(log.date))
  dailyConditions.forEach((log) => dates.add(log.date))
  return dates
}

// todayから遡って連続で「記録がある日」が続く日数を数える。4テーブルいずれかに
// 該当日のlog_dateが1件でもあれば「記録がある日」とみなす（OR結合）。
export function calculateCurrentStreak(
  trainingLogs: TrainingLog[],
  soccerLogs: SoccerLog[],
  mealLogs: MealLog[],
  dailyConditions: DailyCondition[],
  today: Date,
): number {
  const dates = collectLogDates(trainingLogs, soccerLogs, mealLogs, dailyConditions)
  let streak = 0
  const cursor = new Date(today)
  while (dates.has(toDateKey(cursor) as DateString)) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}
