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

  it('同日複数セッションはそれぞれの窓に対応する食事のみで独立判定される', () => {
    // workout: 18:00終了(窓18:00-18:45) / soccer: 09:00終了(窓09:00-09:45)
    const workoutMeal = meal('2026-08-23T18:20:00.000Z', 25, 35) // workoutの窓内のみ
    const soccerMeal = meal('2026-08-23T09:10:00.000Z', 25, 35) // soccerの窓内のみ

    const results = calculateDailyRecoveryResults(
      [workoutLog(END_TIME)],
      [soccerLog('2026-08-23T09:00:00.000Z')],
      [workoutMeal, soccerMeal],
      DATE,
      new Date('2026-08-23T18:30:00.000Z'),
    )

    const workoutResult = results.find((r) => r.sessionType === 'workout')!
    const soccerResult = results.find((r) => r.sessionType === 'soccer')!

    // それぞれ自分の窓の食事のみ計上し、相手の食事は計上しない
    expect(workoutResult.status).toBe('completed_full')
    expect(workoutResult.consumedProtein).toBe(25)
    expect(soccerResult.status).toBe('completed_full')
    expect(soccerResult.consumedProtein).toBe(25)
    // 相手の窓の食事を二重計上していないこと（両方合算されると50になってしまう）
    expect(workoutResult.consumedCarbs).toBe(35)
    expect(soccerResult.consumedCarbs).toBe(35)
  })

  it('windowMinutesの境界：食事は窓の終了ちょうどまでを含む（44分/45分/46分）', () => {
    // sessionEndTime=18:00、食事は45分後の18:45ちょうど
    const mealAt45Min = meal('2026-08-23T18:45:00.000Z', 25, 35)
    const now = new Date('2026-08-23T19:00:00.000Z') // 全窓終了後

    const at44 = calculateDailyRecoveryResults([workoutLog(END_TIME)], [], [mealAt45Min], DATE, now, {
      ...DEFAULT_RECOVERY_WINDOW_CONFIG,
      windowMinutes: 44,
    })
    const at45 = calculateDailyRecoveryResults([workoutLog(END_TIME)], [], [mealAt45Min], DATE, now, {
      ...DEFAULT_RECOVERY_WINDOW_CONFIG,
      windowMinutes: 45,
    })
    const at46 = calculateDailyRecoveryResults([workoutLog(END_TIME)], [], [mealAt45Min], DATE, now, {
      ...DEFAULT_RECOVERY_WINDOW_CONFIG,
      windowMinutes: 46,
    })

    expect(at44[0].consumedProtein).toBe(0) // 窓(44分)を過ぎているため対象外
    expect(at44[0].status).toBe('missed')
    expect(at45[0].consumedProtein).toBe(25) // 窓終了ちょうど(45分)は含む
    expect(at45[0].status).toBe('completed_full')
    expect(at46[0].consumedProtein).toBe(25) // 窓内(46分)で余裕を持って含む
    expect(at46[0].status).toBe('completed_full')
  })

  it('タンパク質しきい値の境界（19.9g/20g/20.1g）', () => {
    const now = new Date('2026-08-23T18:30:00.000Z') // 窓終了前(activeとの区別のため)
    const build = (protein: number) =>
      calculateDailyRecoveryResults(
        [workoutLog(END_TIME)],
        [],
        [meal('2026-08-23T18:20:00.000Z', protein, 30)], // 炭水化物は常に達成させ、タンパク質のみ変化させる
        DATE,
        now,
      )[0]

    expect(build(19.9).status).toBe('active') // P未達・C達成でもcompleted系にはならない
    expect(build(20).status).toBe('completed_full') // ちょうど閾値は達成扱い（>=）
    expect(build(20.1).status).toBe('completed_full')
  })

  it('炭水化物しきい値の境界（29.9g/30g/30.1g）', () => {
    const now = new Date('2026-08-23T18:30:00.000Z')
    const build = (carbohydrates: number) =>
      calculateDailyRecoveryResults(
        [workoutLog(END_TIME)],
        [],
        [meal('2026-08-23T18:20:00.000Z', 20, carbohydrates)], // タンパク質は常に達成させる
        DATE,
        now,
      )[0]

    expect(build(29.9).status).toBe('completed_protein_only') // C未達だがP達成
    expect(build(30).status).toBe('completed_full') // ちょうど閾値は達成扱い（>=）
    expect(build(30.1).status).toBe('completed_full')
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
