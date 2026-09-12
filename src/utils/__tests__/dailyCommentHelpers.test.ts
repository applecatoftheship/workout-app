import { describe, expect, it } from 'vitest'
import { buildDailySummaryText } from '../dailyCommentHelpers'
import type { DateString, MealLog, SportLog, TrainingLog, Workout } from '../../types'

const DATE = '2026-09-12' as DateString

// サッカー機能統合（2026年9月13日）：buildDailySummaryTextからsoccerLogs引数が
// 廃止されたため（サッカー・フットサルの記録はsportLogs経由でサマリーに含まれる）、
// シグネチャを(trainingLogs, workouts, mealLogs, date, sportLogs?)に合わせて更新した。
describe('buildDailySummaryText', () => {
  it('記録が無ければ「運動・食事の記録なし」', () => {
    expect(buildDailySummaryText([], [], [], DATE)).toBe('運動・食事の記録なし')
  })

  it('スポーツ記録があれば「スポーツ: 競技名（分数分）」を含む（Tier 4-2、2026年9月12日追加）', () => {
    const sportLogs: SportLog[] = [{ date: DATE, sportType: 'テニス', durationMinutes: 90 }]
    expect(buildDailySummaryText([], [], [], DATE, sportLogs)).toBe('スポーツ: テニス（90分）')
  })

  it('sportType=その他の場合はcustomSportNameを使う', () => {
    const sportLogs: SportLog[] = [{ date: DATE, sportType: 'その他', customSportName: 'ボルダリング', durationMinutes: 45 }]
    expect(buildDailySummaryText([], [], [], DATE, sportLogs)).toBe('スポーツ: ボルダリング（45分）')
  })

  it('他の記録種別と同時に存在する場合は「/」区切りで結合される', () => {
    const trainingLogs: TrainingLog[] = [
      { date: DATE, completed: true, exercises: [{ exerciseId: 'ex-1', orderIndex: 0, sets: [{ setNumber: 1, weight: 60, reps: 10, isWarmup: false }] }] },
    ]
    const sportLogs: SportLog[] = [{ date: DATE, sportType: 'バスケットボール', durationMinutes: 30 }]
    const result = buildDailySummaryText(trainingLogs, [], [], DATE, sportLogs)
    expect(result).toContain('スポーツ: バスケットボール（30分）')
    expect(result).toContain(' / ')
  })

  it('同じ日に複数のスポーツ記録がある場合は「／」区切りで全件連結される（2026年9月12日追加修正：1日複数件対応）', () => {
    const sportLogs: SportLog[] = [
      { id: 'sport-1', date: DATE, sportType: 'バスケットボール', durationMinutes: 60 },
      { id: 'sport-2', date: DATE, sportType: 'テニス', durationMinutes: 30 },
    ]
    expect(buildDailySummaryText([], [], [], DATE, sportLogs)).toBe('スポーツ: バスケットボール（60分）／テニス（30分）')
  })

  it('サッカー機能統合後は「サッカー」「フットサル」もスポーツ記録として扱われる（2026年9月13日）', () => {
    const sportLogs: SportLog[] = [{ date: DATE, sportType: 'フットサル', durationMinutes: 40 }]
    expect(buildDailySummaryText([], [], [], DATE, sportLogs)).toBe('スポーツ: フットサル（40分）')
  })

  it('対象日以外のスポーツ記録は含まれない', () => {
    const sportLogs: SportLog[] = [{ date: '2026-09-11' as DateString, sportType: 'テニス', durationMinutes: 90 }]
    expect(buildDailySummaryText([], [], [], DATE, sportLogs)).toBe('運動・食事の記録なし')
  })

  it('sportLogs省略時は既存呼び出しと同じ結果になる（後方互換）', () => {
    const workouts: Workout[] = [{ startTime: `${DATE}T09:00:00+09:00`, isPrimary: true, activityType: 'ランニング' }]
    const mealLogs: MealLog[] = []
    expect(buildDailySummaryText([], workouts, mealLogs, DATE)).toBe('ワークアウト: ランニング')
  })
})
