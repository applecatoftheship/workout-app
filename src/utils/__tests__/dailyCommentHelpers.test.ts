import { describe, expect, it } from 'vitest'
import { buildDailySummaryText } from '../dailyCommentHelpers'
import type { DateString, MealLog, SoccerLog, SportLog, TrainingLog, Workout } from '../../types'

const DATE = '2026-09-12' as DateString

describe('buildDailySummaryText', () => {
  it('記録が無ければ「運動・食事の記録なし」', () => {
    expect(buildDailySummaryText([], [], [], [], DATE)).toBe('運動・食事の記録なし')
  })

  it('スポーツ記録があれば「スポーツ: 競技名（分数分）」を含む（Tier 4-2、2026年9月12日追加）', () => {
    const sportLogs: SportLog[] = [{ date: DATE, sportType: 'テニス', durationMinutes: 90 }]
    expect(buildDailySummaryText([], [], [], [], DATE, sportLogs)).toBe('スポーツ: テニス（90分）')
  })

  it('sportType=その他の場合はcustomSportNameを使う', () => {
    const sportLogs: SportLog[] = [{ date: DATE, sportType: 'その他', customSportName: 'ボルダリング', durationMinutes: 45 }]
    expect(buildDailySummaryText([], [], [], [], DATE, sportLogs)).toBe('スポーツ: ボルダリング（45分）')
  })

  it('他の記録種別と同時に存在する場合は「/」区切りで結合される', () => {
    const trainingLogs: TrainingLog[] = [
      { date: DATE, completed: true, exercises: [{ exerciseId: 'ex-1', orderIndex: 0, sets: [{ setNumber: 1, weight: 60, reps: 10, isWarmup: false }] }] },
    ]
    const sportLogs: SportLog[] = [{ date: DATE, sportType: 'バスケットボール', durationMinutes: 30 }]
    const result = buildDailySummaryText(trainingLogs, [], [], [], DATE, sportLogs)
    expect(result).toContain('スポーツ: バスケットボール（30分）')
    expect(result).toContain(' / ')
  })

  it('同じ日に複数のスポーツ記録がある場合は「／」区切りで全件連結される（2026年9月12日追加修正：1日複数件対応）', () => {
    const sportLogs: SportLog[] = [
      { id: 'sport-1', date: DATE, sportType: 'バスケットボール', durationMinutes: 60 },
      { id: 'sport-2', date: DATE, sportType: 'テニス', durationMinutes: 30 },
    ]
    expect(buildDailySummaryText([], [], [], [], DATE, sportLogs)).toBe('スポーツ: バスケットボール（60分）／テニス（30分）')
  })

  it('対象日以外のスポーツ記録は含まれない', () => {
    const sportLogs: SportLog[] = [{ date: '2026-09-11' as DateString, sportType: 'テニス', durationMinutes: 90 }]
    expect(buildDailySummaryText([], [], [], [], DATE, sportLogs)).toBe('運動・食事の記録なし')
  })

  it('sportLogs省略時は既存呼び出しと同じ結果になる（後方互換）', () => {
    const soccerLogs: SoccerLog[] = [{ date: DATE, activityType: '練習', durationMinutes: 60 }]
    const workouts: Workout[] = []
    const mealLogs: MealLog[] = []
    expect(buildDailySummaryText([], soccerLogs, workouts, mealLogs, DATE)).toBe('サッカー: 練習（60分）')
  })
})
