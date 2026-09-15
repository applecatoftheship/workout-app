import { describe, expect, it } from 'vitest'
import { calculateTotalVolume, formatTrainingVolume } from '../trainingVolumeSummaryHelpers'
import type { TrainingLog, TrainingLogExercise, TrainingSet } from '../../types'

function buildSet(weight?: number, reps?: number): TrainingSet {
  return { setNumber: 1, weight, reps, isWarmup: false }
}

function buildExercise(exerciseId: string, sets: TrainingSet[]): TrainingLogExercise {
  return { exerciseId, orderIndex: 0, sets }
}

function buildLog(date: string, exercises: TrainingLogExercise[]): TrainingLog {
  return { date: date as TrainingLog['date'], exercises, completed: true }
}

describe('calculateTotalVolume', () => {
  it('記録が無ければ0を返す', () => {
    expect(calculateTotalVolume([])).toBe(0)
  })

  it('全セットのΣ(重量×回数)を合計する', () => {
    const logs: TrainingLog[] = [
      buildLog('2026-08-20', [buildExercise('ex-1', [buildSet(60, 10), buildSet(80, 5)])]),
      buildLog('2026-08-21', [buildExercise('ex-2', [buildSet(40, 12)])]),
    ]
    // 60*10=600, 80*5=400, 40*12=480 -> 合計1480
    expect(calculateTotalVolume(logs)).toBe(1480)
  })

  it('weight/repsが未入力のセットは0として扱う（エラーにしない）', () => {
    const logs: TrainingLog[] = [buildLog('2026-08-20', [buildExercise('ex-1', [buildSet(undefined, 10), buildSet(60, undefined)])])]
    expect(calculateTotalVolume(logs)).toBe(0)
  })

  it('複数種目・複数日にまたがる場合も正しく合算する', () => {
    const logs: TrainingLog[] = [
      buildLog('2026-08-20', [
        buildExercise('ex-1', [buildSet(60, 10)]),
        buildExercise('ex-2', [buildSet(20, 15)]),
      ]),
    ]
    // 600 + 300 = 900
    expect(calculateTotalVolume(logs)).toBe(900)
  })
})

describe('formatTrainingVolume', () => {
  it('0以下は"0kg"', () => {
    expect(formatTrainingVolume(0)).toBe('0kg')
    expect(formatTrainingVolume(-100)).toBe('0kg')
  })

  it('1000kg未満はkg表記（四捨五入）', () => {
    expect(formatTrainingVolume(480)).toBe('480kg')
    expect(formatTrainingVolume(999.6)).toBe('1000kg')
  })

  it('1000kg以上はトン表記（小数第1位）', () => {
    expect(formatTrainingVolume(1000)).toBe('1.0トン')
    expect(formatTrainingVolume(10234)).toBe('10.2トン')
    expect(formatTrainingVolume(1250)).toBe('1.3トン')
  })

  it('NaN・Infinityは"0kg"にフォールバックする', () => {
    expect(formatTrainingVolume(Number.NaN)).toBe('0kg')
    expect(formatTrainingVolume(Number.POSITIVE_INFINITY)).toBe('0kg')
  })
})
