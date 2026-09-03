import { describe, expect, it } from 'vitest'
import {
  CARDIO_ACTIVITY_TYPES,
  calculateCardioAutoValues,
  isCardioActivity,
  resolveCardioRates,
} from '../workoutCalorieHelpers'

describe('CARDIO_RATES / isCardioActivity / resolveCardioRates', () => {
  it('3種目（ウォーキング・ランニング・サイクリング）を持つ', () => {
    expect(CARDIO_ACTIVITY_TYPES).toEqual(['ウォーキング', 'ランニング', 'サイクリング'])
  })

  it('対応種目は true、非対応は false', () => {
    expect(isCardioActivity('ランニング')).toBe(true)
    expect(isCardioActivity('ベンチプレス')).toBe(false)
    expect(isCardioActivity('水泳')).toBe(false)
  })

  it('resolveCardioRates は既知種目の MET/ペースを返す', () => {
    expect(resolveCardioRates('ウォーキング')).toEqual({ met: 4.3, paceKmh: 5.6 })
    expect(resolveCardioRates('サイクリング')).toEqual({ met: 6.8, paceKmh: 20.0 })
    expect(resolveCardioRates('不明')).toBeNull()
  })
})

describe('calculateCardioAutoValues', () => {
  it('ランニング60分・体重70kg：距離8.0km / カロリー ≒ MET×体重×時間×1.05', () => {
    const result = calculateCardioAutoValues('ランニング', 60, 70)
    expect(result).not.toBeNull()
    expect(result?.distanceKm).toBe(8.0) // 8.0km/h × 1h
    expect(result?.calories).toBe(Math.round(8.3 * 70 * 1 * 1.05)) // 610
  })

  it('ウォーキング30分・体重60kg', () => {
    const result = calculateCardioAutoValues('ウォーキング', 30, 60)
    expect(result?.distanceKm).toBe(2.8) // 5.6 × 0.5
    expect(result?.calories).toBe(Math.round(4.3 * 60 * 0.5 * 1.05)) // 135
  })

  it('サイクリング90分・体重75kg', () => {
    const result = calculateCardioAutoValues('サイクリング', 90, 75)
    expect(result?.distanceKm).toBe(30) // 20 × 1.5
    expect(result?.calories).toBe(Math.round(6.8 * 75 * 1.5 * 1.05)) // 803
  })

  it('時間0以下・非数値・非対応種目は null', () => {
    expect(calculateCardioAutoValues('ランニング', 0, 70)).toBeNull()
    expect(calculateCardioAutoValues('ランニング', -10, 70)).toBeNull()
    expect(calculateCardioAutoValues('ランニング', Number.NaN, 70)).toBeNull()
    expect(calculateCardioAutoValues('水泳', 60, 70)).toBeNull()
  })
})
