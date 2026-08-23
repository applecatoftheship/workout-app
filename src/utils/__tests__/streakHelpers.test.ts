import { describe, expect, it } from 'vitest'
import { calculateCurrentStreak, isStreakMilestone } from '../streakHelpers'
import type { DailyCondition, MealLog, SoccerLog, TrainingLog } from '../../types'

describe('isStreakMilestone', () => {
  it('7/30/100/365日は節目', () => {
    expect(isStreakMilestone(7)).toBe(true)
    expect(isStreakMilestone(30)).toBe(true)
    expect(isStreakMilestone(100)).toBe(true)
    expect(isStreakMilestone(365)).toBe(true)
  })

  it('365日を超えたら100日ごとに節目', () => {
    expect(isStreakMilestone(465)).toBe(true)
    expect(isStreakMilestone(565)).toBe(true)
  })

  it('節目に該当しない日数はfalse', () => {
    expect(isStreakMilestone(8)).toBe(false)
    expect(isStreakMilestone(29)).toBe(false)
    expect(isStreakMilestone(400)).toBe(false)
    expect(isStreakMilestone(466)).toBe(false)
    expect(isStreakMilestone(0)).toBe(false)
  })

  it('各節目の前後1日を確認する（境界値）', () => {
    // 7日
    expect(isStreakMilestone(6)).toBe(false)
    expect(isStreakMilestone(7)).toBe(true)
    expect(isStreakMilestone(8)).toBe(false)
    // 30日
    expect(isStreakMilestone(29)).toBe(false)
    expect(isStreakMilestone(30)).toBe(true)
    expect(isStreakMilestone(31)).toBe(false)
    // 100日
    expect(isStreakMilestone(99)).toBe(false)
    expect(isStreakMilestone(100)).toBe(true)
    expect(isStreakMilestone(101)).toBe(false)
    // 365日
    expect(isStreakMilestone(364)).toBe(false)
    expect(isStreakMilestone(365)).toBe(true)
    expect(isStreakMilestone(366)).toBe(false)
    // 365日超の100日刻み最初の節目（465日）
    expect(isStreakMilestone(464)).toBe(false)
    expect(isStreakMilestone(465)).toBe(true)
    expect(isStreakMilestone(466)).toBe(false)
  })
})

describe('calculateCurrentStreak', () => {
  const today = new Date(2026, 7, 23) // 2026-08-23

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

  it('記録が1件も無ければ0', () => {
    expect(calculateCurrentStreak([], [], [], [], today)).toBe(0)
  })

  it('連続した記録日数をカウントする', () => {
    const logs = [trainingLog('2026-08-23'), trainingLog('2026-08-22'), trainingLog('2026-08-21')]
    expect(calculateCurrentStreak(logs, [], [], [], today)).toBe(3)
  })

  it('記録が途切れた時点でカウントを止める', () => {
    // 08-20が抜けている
    const logs = [trainingLog('2026-08-23'), trainingLog('2026-08-22'), trainingLog('2026-08-19')]
    expect(calculateCurrentStreak(logs, [], [], [], today)).toBe(2)
  })

  it('4テーブルいずれかに記録があればOR結合でカウントする', () => {
    const trainingLogs = [trainingLog('2026-08-23')]
    const soccerLogs = [soccerLog('2026-08-22')]
    const mealLogs = [mealLog('2026-08-21')]
    const dailyConditions = [condition('2026-08-20')]

    expect(calculateCurrentStreak(trainingLogs, soccerLogs, mealLogs, dailyConditions, today)).toBe(4)
  })

  it('当日に記録が無ければ0を返す', () => {
    const logs = [trainingLog('2026-08-22'), trainingLog('2026-08-21')]
    expect(calculateCurrentStreak(logs, [], [], [], today)).toBe(0)
  })
})
