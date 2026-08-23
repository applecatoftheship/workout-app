import { describe, expect, it } from 'vitest'
import {
  calculateDailyRecoveryResults,
  calculateWeeklyRecoverySummary,
  DEFAULT_RECOVERY_WINDOW_CONFIG,
} from '../recoveryHelpers'
import type { MealLog, SoccerLog, TrainingLog } from '../../types'

const DATE = '2026-08-23' as const
const END_TIME = '2026-08-23T18:00:00.000Z' // config.windowMinutes=45 -> 窓終了18:45

function workoutLog(endTime?: string): TrainingLog {
  return { date: DATE, exercises: [], completed: true, endTime }
}
function soccerLog(endTime?: string): SoccerLog {
  return { date: DATE, activityType: '練習', endTime }
}
function meal(mealTime: string, protein: number, carbohydrates: number): MealLog {
  return { date: DATE, mealType: 'lunch', foods: ['プロテイン'], calories: 200, protein, fat: 5, carbohydrates, mealTime }
}

describe('calculateDailyRecoveryResults', () => {
  it('該当日にend_time付きのセッションが無ければ空配列', () => {
    const results = calculateDailyRecoveryResults([workoutLog(undefined)], [], [], DATE, new Date(END_TIME))
    expect(results).toEqual([])
  })

  it('窓内でP・C両方の目標を満たせばcompleted_full', () => {
    const meals = [meal('2026-08-23T18:20:00.000Z', 25, 35)]
    const results = calculateDailyRecoveryResults([workoutLog(END_TIME)], [], meals, DATE, new Date('2026-08-23T18:30:00.000Z'))

    expect(results).toHaveLength(1)
    expect(results[0].sessionType).toBe('workout')
    expect(results[0].status).toBe('completed_full')
    expect(results[0].consumedProtein).toBe(25)
    expect(results[0].consumedCarbs).toBe(35)
  })

  it('タンパク質のみ目標達成の場合はcompleted_protein_only', () => {
    const meals = [meal('2026-08-23T18:20:00.000Z', 25, 10)]
    const results = calculateDailyRecoveryResults([workoutLog(END_TIME)], [], meals, DATE, new Date('2026-08-23T18:30:00.000Z'))

    expect(results[0].status).toBe('completed_protein_only')
  })

  it('窓が終了する前で未達成ならactive', () => {
    const results = calculateDailyRecoveryResults([workoutLog(END_TIME)], [], [], DATE, new Date('2026-08-23T18:30:00.000Z'))
    expect(results[0].status).toBe('active')
  })

  it('窓が終了した後で未達成ならmissed', () => {
    const results = calculateDailyRecoveryResults([workoutLog(END_TIME)], [], [], DATE, new Date('2026-08-23T19:00:00.000Z'))
    expect(results[0].status).toBe('missed')
  })

  it('窓の外の食事はカウントしない', () => {
    // 窓は18:00〜18:45。18:50の食事は対象外。
    const meals = [meal('2026-08-23T18:50:00.000Z', 25, 35)]
    const results = calculateDailyRecoveryResults([workoutLog(END_TIME)], [], meals, DATE, new Date('2026-08-23T19:00:00.000Z'))

    expect(results[0].consumedProtein).toBe(0)
    expect(results[0].status).toBe('missed')
  })

  it('training・soccer両方end_time付きなら2件返す', () => {
    const results = calculateDailyRecoveryResults(
      [workoutLog(END_TIME)],
      [soccerLog(END_TIME)],
      [],
      DATE,
      new Date('2026-08-23T18:30:00.000Z'),
    )
    expect(results).toHaveLength(2)
    expect(results.map((r) => r.sessionType).sort()).toEqual(['soccer', 'workout'])
  })
})

describe('calculateWeeklyRecoverySummary', () => {
  it('今週分のセッションのうち達成した件数と総件数を集計する', () => {
    // todayと同じ日付のセッションは、getPeriodRange('week', today)が
    // 必ずtodayを含む範囲を返す仕様上、常に今週の集計対象に含まれる
    const today = new Date(2026, 7, 23)
    const now = new Date('2026-08-23T20:00:00.000Z')

    const achievedMeals = [meal('2026-08-23T18:20:00.000Z', 25, 35)]
    const trainingLogs = [workoutLog(END_TIME)]
    const soccerLogs = [soccerLog('2026-08-23T10:00:00.000Z')] // 窓終了後、食事なし -> missed

    const summary = calculateWeeklyRecoverySummary(trainingLogs, soccerLogs, achievedMeals, today, now)

    expect(summary.totalCount).toBe(2)
    expect(summary.achievedCount).toBe(1)
  })

  it('セッションが無い週はtotalCount=0・achievedCount=0', () => {
    const today = new Date(2026, 7, 23)
    const now = new Date('2026-08-23T20:00:00.000Z')
    const summary = calculateWeeklyRecoverySummary([], [], [], today, now)
    expect(summary).toEqual({ achievedCount: 0, totalCount: 0 })
  })
})

describe('DEFAULT_RECOVERY_WINDOW_CONFIG', () => {
  it('既定値は45分・タンパク質20g・炭水化物30g', () => {
    expect(DEFAULT_RECOVERY_WINDOW_CONFIG).toEqual({
      windowMinutes: 45,
      targetProteinGrams: 20,
      targetCarbGrams: 30,
    })
  })
})
