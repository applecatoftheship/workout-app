import { describe, expect, it } from 'vitest'
import { detectAcwrDangerNotification, detectStreakBrokenNotification, shouldCreateNotification } from '../notificationHelpers'
import { toDateKey } from '../chartHelpers'
import type { DailyCondition, DateString, MealLog, SoccerLog, TrainingLog } from '../../types'

const TODAY = new Date(2026, 7, 24) // 2026-08-24

function dateAt(offsetDaysAgo: number): DateString {
  const d = new Date(TODAY)
  d.setDate(d.getDate() - offsetDaysAgo)
  return toDateKey(d) as DateString
}

const TODAY_KEY = dateAt(0)

describe('shouldCreateNotification', () => {
  it('既存通知が無ければtrue', () => {
    expect(shouldCreateNotification([], 'acwr_danger', TODAY_KEY)).toBe(true)
  })

  it('同タイプ・同日の通知が既にあればfalse', () => {
    const existing = [{ type: 'acwr_danger', createdAt: `${TODAY_KEY}T09:00:00.000Z` }]
    expect(shouldCreateNotification(existing, 'acwr_danger', TODAY_KEY)).toBe(false)
  })

  it('同タイプでも別日の通知ならtrue', () => {
    const existing = [{ type: 'acwr_danger', createdAt: `${dateAt(1)}T09:00:00.000Z` }]
    expect(shouldCreateNotification(existing, 'acwr_danger', TODAY_KEY)).toBe(true)
  })

  it('同日でも別タイプの通知ならtrue', () => {
    const existing = [{ type: 'streak_broken', createdAt: `${TODAY_KEY}T09:00:00.000Z` }]
    expect(shouldCreateNotification(existing, 'acwr_danger', TODAY_KEY)).toBe(true)
  })
})

describe('detectAcwrDangerNotification', () => {
  // 負荷スコア = min(100, 総挙上量(kg) / 100) のため、weight=総挙上量・reps=1で
  // スコアを直接指定できる（acwrHelpers.test.tsと同じ手法）。
  function trainingLogWithVolume(offsetDaysAgo: number, volume: number): TrainingLog {
    return {
      date: dateAt(offsetDaysAgo),
      completed: true,
      exercises: [
        {
          exerciseId: 'ex-1',
          orderIndex: 0,
          sets: [{ setNumber: 1, weight: volume, reps: 1, isWarmup: false }],
        },
      ],
    }
  }

  it('データ不足（7日未満）ならnull', () => {
    const logs = [trainingLogWithVolume(0, 1000)]
    expect(detectAcwrDangerNotification(logs, [], TODAY_KEY, undefined, undefined)).toBeNull()
  })

  it('ACWR=1.5ちょうどは「>1.5」に該当しないためnull（境界値）', () => {
    // 直近7日=スコア90、それ以前21日=スコア50 -> ACWR = 4*90/(90+150) = 1.5
    const recent = Array.from({ length: 7 }, (_, i) => trainingLogWithVolume(i, 9000))
    const older = Array.from({ length: 21 }, (_, i) => trainingLogWithVolume(7 + i, 5000))
    const logs = [...recent, ...older]
    expect(detectAcwrDangerNotification(logs, [], TODAY_KEY, undefined, undefined)).toBeNull()
  })

  it('ACWR>1.5なら通知候補を返す', () => {
    const recent = Array.from({ length: 7 }, (_, i) => trainingLogWithVolume(i, 10000))
    const older = Array.from({ length: 21 }, (_, i) => trainingLogWithVolume(7 + i, 1000))
    const logs = [...recent, ...older]

    const result = detectAcwrDangerNotification(logs, [], TODAY_KEY, undefined, undefined)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('acwr_danger')
    expect(result!.message).toContain('ACWR')
  })
})

describe('detectStreakBrokenNotification', () => {
  function trainingLog(date: string): TrainingLog {
    return { date: date as TrainingLog['date'], exercises: [], completed: true }
  }
  function soccerLog(date: string): SoccerLog {
    return { date: date as SoccerLog['date'], activityType: '練習' }
  }
  function mealLog(date: string): MealLog {
    return {
      date: date as MealLog['date'],
      mealType: 'lunch',
      foods: ['卵'],
      calories: 100,
      protein: 10,
      fat: 5,
      carbohydrates: 10,
    }
  }
  function condition(date: string): DailyCondition {
    return { date: date as DailyCondition['date'], weight: 70, sleepHours: 7, fatigue: 3 }
  }

  it('今日も記録があれば途切れていないためnull', () => {
    const logs = [trainingLog(TODAY_KEY), trainingLog(dateAt(1)), trainingLog(dateAt(2))]
    expect(detectStreakBrokenNotification(logs, [], [], [], TODAY_KEY)).toBeNull()
  })

  it('昨日以前も記録が無ければ（ストリーク自体が0）null', () => {
    expect(detectStreakBrokenNotification([], [], [], [], TODAY_KEY)).toBeNull()
  })

  it('昨日までのストリークが今日途切れていれば通知候補を返す', () => {
    const logs = [trainingLog(dateAt(1)), trainingLog(dateAt(2)), trainingLog(dateAt(3))]
    const result = detectStreakBrokenNotification(logs, [], [], [], TODAY_KEY)

    expect(result).not.toBeNull()
    expect(result!.type).toBe('streak_broken')
    expect(result!.message).toContain('3日間')
  })

  it('4テーブルいずれかの記録でストリークが継続していればOR結合で判定する', () => {
    const soccerLogs = [soccerLog(dateAt(1))]
    const mealLogs = [mealLog(dateAt(2))]
    const dailyConditions = [condition(dateAt(3))]

    const result = detectStreakBrokenNotification([], soccerLogs, mealLogs, dailyConditions, TODAY_KEY)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('streak_broken')
  })
})
