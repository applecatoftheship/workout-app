import { describe, expect, it } from 'vitest'
import type { Goals } from '../../api/goals'
import type { DailyCondition, MealLog } from '../../types'
import { calculateDailyAchievement } from '../weeklyAchievementHelpers'

const goals: Goals = {
  yearMonth: '2026-11',
  targetWeight: 70,
  targetSleepHours: 7,
  weeklyTrainingGoal: 3,
  monthlyTrainingGoal: 12,
  dailyCalorieGoal: 2000,
  dailyProteinGoal: 100,
  dailyFatGoal: 60,
  dailyCarbohydrateGoal: 250,
}

function meal(date: string, calories: number, protein: number): MealLog {
  return { date: date as MealLog['date'], mealType: 'lunch', foods: [], calories, protein, fat: 0, carbohydrates: 0 }
}

const condition = { date: '2026-11-04' } as unknown as DailyCondition

describe('calculateDailyAchievement', () => {
  it('未来の日は null', () => {
    expect(
      calculateDailyAchievement({
        date: '2026-11-07',
        today: '2026-11-06',
        mealLogs: [],
        dailyConditions: [],
        goals,
        hasSchedule: true,
        hasTrainingRecord: false,
      }),
    ).toBeNull()
  })

  it('予定の無い日は3項目で計算する（カロリー・たんぱく質を食事の合計で判定）', () => {
    const result = calculateDailyAchievement({
      date: '2026-11-04',
      today: '2026-11-06',
      mealLogs: [meal('2026-11-04', 900, 50), meal('2026-11-04', 900, 45), meal('2026-11-05', 2000, 100)],
      dailyConditions: [condition],
      goals,
      hasSchedule: false,
      hasTrainingRecord: false,
    })
    expect(result?.items.map((item) => [item.key, item.achieved])).toEqual([
      ['calories', true],
      ['protein', true],
      ['condition', true],
    ])
    expect(result?.percent).toBe(100)
  })

  it('予定のある日はトレーニングを加えた4項目で計算する', () => {
    const result = calculateDailyAchievement({
      date: '2026-11-04',
      today: '2026-11-06',
      mealLogs: [meal('2026-11-04', 2500, 80)],
      dailyConditions: [],
      goals,
      hasSchedule: true,
      hasTrainingRecord: true,
    })
    // カロリー125%（範囲外）・たんぱく質80%（不足）・体調なし・トレーニングあり → 1/4
    expect(result?.percent).toBe(25)
    expect(result?.items).toHaveLength(4)
  })

  it('カロリーは80%と120%ちょうどを達成に含める', () => {
    const at = (calories: number) =>
      calculateDailyAchievement({
        date: '2026-11-04',
        today: '2026-11-06',
        mealLogs: [meal('2026-11-04', calories, 0)],
        dailyConditions: [],
        goals,
        hasSchedule: false,
        hasTrainingRecord: false,
      })?.items[0].achieved
    expect([at(1599), at(1600), at(2400), at(2401)]).toEqual([false, true, true, false])
  })

  it('目標と違う月の日・目標が0の項目は数えず、予定が分からない日はトレーニングを数えない', () => {
    const base = { today: '2026-11-06' as const, dailyConditions: [condition], hasTrainingRecord: false }
    const otherMonth = calculateDailyAchievement({ ...base, date: '2026-10-31', mealLogs: [], goals, hasSchedule: null })
    expect(otherMonth?.items.map((item) => item.key)).toEqual(['condition'])
    const zeroGoal = calculateDailyAchievement({
      ...base,
      date: '2026-11-04',
      mealLogs: [],
      goals: { ...goals, dailyCalorieGoal: 0 },
      hasSchedule: null,
    })
    expect(zeroGoal?.items.map((item) => item.key)).toEqual(['protein', 'condition'])
  })

  it('体調記録を読み込めていない日は体調を数えず、数えられる項目が1つも無ければ null', () => {
    const base = { today: '2026-11-06' as const, mealLogs: [], dailyConditions: [], hasTrainingRecord: false, conditionKnown: false }
    const withGoals = calculateDailyAchievement({ ...base, date: '2026-11-04', goals, hasSchedule: null })
    expect(withGoals?.items.map((item) => item.key)).toEqual(['calories', 'protein'])
    expect(calculateDailyAchievement({ ...base, date: '2026-11-04', goals: { ...goals, yearMonth: '' }, hasSchedule: null })).toBeNull()
  })
})
