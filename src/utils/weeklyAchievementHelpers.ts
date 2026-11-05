import type { Goals } from '../api/goals'
import type { DailyCondition, DateString, MealLog } from '../types'

// 週間達成率リング（2026年11月6日）：ホーム画面「今週の記録」の日ごとの達成率。
// 達成の定義（このチャットで決めたもの）：
//   1. カロリー：その日の摂取カロリーが目標の80〜120%
//   2. たんぱく質：その日の摂取量が目標の90%以上
//   3. 体調：その日の体調（体重・睡眠など）を記録した
//   4. トレーニング：予定がある日だけ対象。トレーニング・ワークアウト・スポーツのいずれかを記録した
// 達成率＝達成した項目数 ÷ 対象の項目数（トレーニングは予定が無い日は数えない）。
// 未来の日と、数えられる項目が1つも無い日は対象外（null）。
// 目標は月ごとに持つため、渡された目標（goals.yearMonth）と違う月の日、または目標が0（未設定）の
// 場合は、カロリー・たんぱく質を項目に入れない。予定が分からない（取得前・取得失敗）日は
// hasSchedule に null を渡し、トレーニングを項目に入れない。

export const CALORIE_MIN_RATIO = 0.8
export const CALORIE_MAX_RATIO = 1.2
export const PROTEIN_MIN_RATIO = 0.9

export type DailyAchievementItem = {
  key: 'calories' | 'protein' | 'condition' | 'training'
  label: string
  achieved: boolean
}

export type DailyAchievement = {
  /** 0〜100 */
  percent: number
  items: DailyAchievementItem[]
}

export function calculateDailyAchievement(params: {
  date: DateString
  today: DateString
  mealLogs: MealLog[]
  dailyConditions: DailyCondition[]
  goals: Goals
  /** 体調記録を読み込めているか（読み込めていなければ体調を数えない） */
  conditionKnown?: boolean
  hasSchedule: boolean | null
  hasTrainingRecord: boolean
}): DailyAchievement | null {
  const { date, today, mealLogs, dailyConditions, goals, hasSchedule, hasTrainingRecord, conditionKnown = true } = params
  if (date > today) {
    return null
  }

  const dayMeals = mealLogs.filter((log) => log.date === date)
  const calories = dayMeals.reduce((sum, log) => sum + log.calories, 0)
  const protein = dayMeals.reduce((sum, log) => sum + log.protein, 0)

  const isGoalMonth = date.slice(0, 7) === goals.yearMonth
  const items: DailyAchievementItem[] = []
  if (isGoalMonth && goals.dailyCalorieGoal > 0) {
    items.push({
      key: 'calories',
      label: 'カロリー（目標の80〜120%）',
      achieved: calories >= goals.dailyCalorieGoal * CALORIE_MIN_RATIO && calories <= goals.dailyCalorieGoal * CALORIE_MAX_RATIO,
    })
  }
  if (isGoalMonth && goals.dailyProteinGoal > 0) {
    items.push({
      key: 'protein',
      label: 'たんぱく質（目標の90%以上）',
      achieved: protein >= goals.dailyProteinGoal * PROTEIN_MIN_RATIO,
    })
  }
  if (conditionKnown) {
    items.push({
      key: 'condition',
      label: '体調の記録',
      achieved: dailyConditions.some((condition) => condition.date === date),
    })
  }
  if (hasSchedule === true) {
    items.push({ key: 'training', label: '予定したトレーニング', achieved: hasTrainingRecord })
  }

  if (items.length === 0) {
    // 数えられる項目が無い（目標・体調・予定のどれも分からない）日は表示しない
    return null
  }
  const achievedCount = items.filter((item) => item.achieved).length
  return { percent: Math.round((achievedCount / items.length) * 100), items }
}
