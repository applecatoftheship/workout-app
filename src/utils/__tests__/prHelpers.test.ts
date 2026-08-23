import { describe, expect, it } from 'vitest'
import { calculateEstimated1RM, calculateMaxEstimated1RM, detectPersonalRecords } from '../prHelpers'
import type { TrainingLog, TrainingLogExercise, TrainingSet } from '../../types'

function buildSet(weight?: number, reps?: number): TrainingSet {
  return { setNumber: 1, weight, reps, isWarmup: false }
}

function buildExercise(exerciseId: string, sets: TrainingSet[], exerciseName?: string): TrainingLogExercise {
  return {
    exerciseId,
    orderIndex: 0,
    sets,
    exercise: exerciseName ? { name: exerciseName, bodyPart: '胸', isPreset: true } : undefined,
  }
}

function buildLog(date: string, exercises: TrainingLogExercise[]): TrainingLog {
  return { date: date as TrainingLog['date'], exercises, completed: true }
}

describe('calculateEstimated1RM', () => {
  it('Epley式で1RMを算出する（0.5kg単位で四捨五入）', () => {
    expect(calculateEstimated1RM(60, 10)).toBe(80)
  })

  it('端数は0.5kg単位に丸められる', () => {
    // 100 * (1 + 1/30) = 103.333... -> 103.5
    expect(calculateEstimated1RM(100, 1)).toBe(103.5)
  })

  it('reps=0でも数式通りweightそのものを返す', () => {
    expect(calculateEstimated1RM(100, 0)).toBe(100)
  })
})

describe('calculateMaxEstimated1RM', () => {
  it('記録が無ければ0を返す', () => {
    expect(calculateMaxEstimated1RM([], 'ex-1')).toBe(0)
  })

  it('対象種目の全セットから最大推定1RMを算出する', () => {
    const logs: TrainingLog[] = [
      buildLog('2026-08-20', [buildExercise('ex-1', [buildSet(60, 10), buildSet(80, 5)])]),
      buildLog('2026-08-21', [buildExercise('ex-1', [buildSet(70, 8)])]),
    ]
    // 60,10 -> 80 / 80,5 -> 93.5 / 70,8 -> 88.7 (実際は端数丸め) のうち最大を採用
    const max = calculateMaxEstimated1RM(logs, 'ex-1')
    expect(max).toBe(calculateEstimated1RM(80, 5))
  })

  it('weight/repsが未入力または0以下のセットは除外する', () => {
    const logs: TrainingLog[] = [
      buildLog('2026-08-20', [
        buildExercise('ex-1', [buildSet(undefined, 10), buildSet(50, 0), buildSet(0, 10), buildSet(60, 10)]),
      ]),
    ]
    expect(calculateMaxEstimated1RM(logs, 'ex-1')).toBe(calculateEstimated1RM(60, 10))
  })

  it('別種目のセットは計算に含めない', () => {
    const logs: TrainingLog[] = [buildLog('2026-08-20', [buildExercise('ex-2', [buildSet(200, 10)])])]
    expect(calculateMaxEstimated1RM(logs, 'ex-1')).toBe(0)
  })
})

describe('detectPersonalRecords', () => {
  it('過去記録が存在しない（初回記録）種目はPR演出の対象外', () => {
    const savedExercises = [buildExercise('ex-1', [buildSet(60, 10)], 'ベンチプレス')]
    const results = detectPersonalRecords([], savedExercises)
    expect(results).toEqual([])
  })

  it('過去最高推定1RMを上回った場合のみPRとして検出する', () => {
    const pastLogs: TrainingLog[] = [buildLog('2026-08-10', [buildExercise('ex-1', [buildSet(60, 10)])])]
    const savedExercises = [buildExercise('ex-1', [buildSet(70, 10)], 'ベンチプレス')]

    const results = detectPersonalRecords(pastLogs, savedExercises)

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      exerciseId: 'ex-1',
      exerciseName: 'ベンチプレス',
      before: calculateEstimated1RM(60, 10),
      after: calculateEstimated1RM(70, 10),
    })
  })

  it('過去最高推定1RM以下の場合はPRとして検出しない', () => {
    const pastLogs: TrainingLog[] = [buildLog('2026-08-10', [buildExercise('ex-1', [buildSet(100, 10)])])]
    const savedExercises = [buildExercise('ex-1', [buildSet(60, 10)], 'ベンチプレス')]

    expect(detectPersonalRecords(pastLogs, savedExercises)).toEqual([])
  })

  it('exercise名が未解決の場合はフォールバック名を使う', () => {
    const pastLogs: TrainingLog[] = [buildLog('2026-08-10', [buildExercise('ex-1', [buildSet(60, 10)])])]
    const savedExercises = [buildExercise('ex-1', [buildSet(70, 10)])]

    const results = detectPersonalRecords(pastLogs, savedExercises)
    expect(results[0].exerciseName).toBe('種目')
  })

  it('複数種目を保存した場合、PRを達成した種目のみ結果に含める', () => {
    const pastLogs: TrainingLog[] = [
      buildLog('2026-08-10', [buildExercise('ex-1', [buildSet(60, 10)]), buildExercise('ex-2', [buildSet(100, 10)])]),
    ]
    const savedExercises = [
      buildExercise('ex-1', [buildSet(70, 10)], 'ベンチプレス'),
      buildExercise('ex-2', [buildSet(90, 10)], 'スクワット'),
    ]

    const results = detectPersonalRecords(pastLogs, savedExercises)
    expect(results).toHaveLength(1)
    expect(results[0].exerciseId).toBe('ex-1')
  })
})
