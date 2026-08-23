import { describe, expect, it } from 'vitest'
import { calculateAdjustedGoals, getMatchDayStatus, MD_ADJUSTMENT_TABLE } from '../periodizationHelpers'
import type { TrainingSchedule } from '../../types'

function matchSchedule(scheduledDate: string, status: TrainingSchedule['status'] = 'scheduled'): TrainingSchedule {
  return {
    id: 'm1',
    userId: 'u',
    scheduledDate: scheduledDate as TrainingSchedule['scheduledDate'],
    templateId: null,
    title: '試合',
    emoji: '⚽',
    status,
    scheduleType: 'match',
  }
}

describe('getMatchDayStatus', () => {
  it('試合予定が無ければnull', () => {
    expect(getMatchDayStatus([], '2026-08-23')).toBeNull()
  })

  it('scheduleType!==matchの予定は対象外', () => {
    const schedules: TrainingSchedule[] = [{ ...matchSchedule('2026-08-23'), scheduleType: 'practice' }]
    expect(getMatchDayStatus(schedules, '2026-08-23')).toBeNull()
  })

  it('cancelledの試合予定は対象外', () => {
    const schedules = [matchSchedule('2026-08-23', 'cancelled')]
    expect(getMatchDayStatus(schedules, '2026-08-23')).toBeNull()
  })

  describe('MD-3〜MD+1の期間区分の境界日', () => {
    const match = matchSchedule('2026-08-23')

    it('試合の4日前はnull（範囲外）', () => {
      expect(getMatchDayStatus([match], '2026-08-19')).toBeNull()
    })
    it('試合の3日前はMD-3', () => {
      expect(getMatchDayStatus([match], '2026-08-20')).toBe('MD-3')
    })
    it('試合の2日前はMD-2', () => {
      expect(getMatchDayStatus([match], '2026-08-21')).toBe('MD-2')
    })
    it('試合の1日前はMD-1', () => {
      expect(getMatchDayStatus([match], '2026-08-22')).toBe('MD-1')
    })
    it('試合当日はMD', () => {
      expect(getMatchDayStatus([match], '2026-08-23')).toBe('MD')
    })
    it('試合の1日後はMD+1', () => {
      expect(getMatchDayStatus([match], '2026-08-24')).toBe('MD+1')
    })
    it('試合の2日後はnull（範囲外）', () => {
      expect(getMatchDayStatus([match], '2026-08-25')).toBeNull()
    })
  })

  it('複数の試合予定がある場合、targetDateに最も近い試合を採用する', () => {
    const schedules = [matchSchedule('2026-08-10'), matchSchedule('2026-08-23')]
    expect(getMatchDayStatus(schedules, '2026-08-22')).toBe('MD-1')
  })
})

describe('calculateAdjustedGoals', () => {
  const baseGoals = {
    dailyCalorieGoal: 2500,
    dailyProteinGoal: 180,
    dailyFatGoal: 70,
    dailyCarbohydrateGoal: 250,
  }

  it('mdStatusがnullの場合は補正せず設定値をそのまま返す（バグ修正済みの逆算しない仕様）', () => {
    const result = calculateAdjustedGoals(baseGoals, null)
    expect(result).toEqual({
      statusLabel: '',
      calorieTarget: 2500,
      proteinTarget: 180,
      carbsTarget: 250, // 逆算した265gではなく設定値の250gのまま
      fatTarget: 70,
      isAdjusted: false,
    })
  })

  it('MD（試合当日）は energy×1.25 / protein×1.0 / fat×0.7 で補正し、炭水化物は残余エネルギーから逆算する', () => {
    const result = calculateAdjustedGoals(baseGoals, 'MD')
    const expectedCalorie = Math.round(2500 * 1.25) // 3125
    const expectedProtein = Math.round(180 * 1.0) // 180
    const expectedFat = Math.round(70 * 0.7) // 49
    const expectedCarbs = Math.round((expectedCalorie - (expectedProtein * 4 + expectedFat * 9)) / 4)

    expect(result.isAdjusted).toBe(true)
    expect(result.statusLabel).toBe('MD')
    expect(result.calorieTarget).toBe(expectedCalorie)
    expect(result.proteinTarget).toBe(expectedProtein)
    expect(result.fatTarget).toBe(expectedFat)
    expect(result.carbsTarget).toBe(expectedCarbs)
  })

  it.each(Object.keys(MD_ADJUSTMENT_TABLE))('%sはisAdjusted=trueで補正倍率テーブル通りに算出する', (status) => {
    const ratio = MD_ADJUSTMENT_TABLE[status]
    const result = calculateAdjustedGoals(baseGoals, status)
    expect(result.isAdjusted).toBe(true)
    expect(result.calorieTarget).toBe(Math.round(baseGoals.dailyCalorieGoal * ratio.energy))
    expect(result.proteinTarget).toBe(Math.round(baseGoals.dailyProteinGoal * ratio.protein))
    expect(result.fatTarget).toBe(Math.round(baseGoals.dailyFatGoal * ratio.fat))
  })

  it('未知のmdStatus文字列は補正テーブルに無いため未補正扱いになる', () => {
    const result = calculateAdjustedGoals(baseGoals, 'MD-99')
    expect(result.isAdjusted).toBe(false)
    expect(result.carbsTarget).toBe(baseGoals.dailyCarbohydrateGoal)
  })

  it('残余エネルギーが負になる場合は炭水化物を0未満にしない', () => {
    // カロリー目標を極端に低くし、タンパク質・脂質だけでカロリーを超過させる
    const extremeGoals = { dailyCalorieGoal: 100, dailyProteinGoal: 180, dailyFatGoal: 70, dailyCarbohydrateGoal: 250 }
    const result = calculateAdjustedGoals(extremeGoals, 'MD')
    expect(result.carbsTarget).toBe(0)
  })
})
