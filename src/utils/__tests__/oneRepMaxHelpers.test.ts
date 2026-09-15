import { describe, expect, it } from 'vitest'
import { calculateEstimated1RM } from '../prHelpers'
import { calculateOneRepMaxTrend, calculatePersonalBests, listLoggedExercises } from '../oneRepMaxHelpers'
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

describe('calculateOneRepMaxTrend', () => {
  it('記録が無ければ空配列を返す', () => {
    expect(calculateOneRepMaxTrend([], 'ex-1')).toEqual([])
  })

  it('日ごとの最良セットの推定1RMを日付昇順で返す', () => {
    const logs: TrainingLog[] = [
      buildLog('2026-08-21', [buildExercise('ex-1', [buildSet(70, 8)])]),
      buildLog('2026-08-20', [buildExercise('ex-1', [buildSet(60, 10), buildSet(80, 5)])]),
    ]
    expect(calculateOneRepMaxTrend(logs, 'ex-1')).toEqual([
      { date: '2026-08-20', value: calculateEstimated1RM(80, 5) },
      { date: '2026-08-21', value: calculateEstimated1RM(70, 8) },
    ])
  })

  it('別種目のセットは含めない', () => {
    const logs: TrainingLog[] = [buildLog('2026-08-20', [buildExercise('ex-2', [buildSet(200, 10)])])]
    expect(calculateOneRepMaxTrend(logs, 'ex-1')).toEqual([])
  })

  it('weight/repsが未入力または0以下のセットは除外する', () => {
    const logs: TrainingLog[] = [
      buildLog('2026-08-20', [
        buildExercise('ex-1', [buildSet(undefined, 10), buildSet(50, 0), buildSet(0, 10)]),
      ]),
    ]
    expect(calculateOneRepMaxTrend(logs, 'ex-1')).toEqual([])
  })

  it('記録が1件しかない種目でもエラーにならず1点の配列を返す', () => {
    const logs: TrainingLog[] = [buildLog('2026-08-20', [buildExercise('ex-1', [buildSet(60, 10)])])]
    expect(calculateOneRepMaxTrend(logs, 'ex-1')).toEqual([{ date: '2026-08-20', value: calculateEstimated1RM(60, 10) }])
  })
})

describe('listLoggedExercises', () => {
  it('記録が無ければ空配列を返す', () => {
    expect(listLoggedExercises([])).toEqual([])
  })

  it('有効なセットを持つ種目のみ、直近実施日の降順で返す', () => {
    const logs: TrainingLog[] = [
      buildLog('2026-08-10', [buildExercise('ex-1', [buildSet(60, 10)], 'ベンチプレス')]),
      buildLog('2026-08-20', [buildExercise('ex-2', [buildSet(100, 5)], 'スクワット')]),
    ]
    expect(listLoggedExercises(logs)).toEqual([
      { exerciseId: 'ex-2', exerciseName: 'スクワット', lastPerformedDate: '2026-08-20' },
      { exerciseId: 'ex-1', exerciseName: 'ベンチプレス', lastPerformedDate: '2026-08-10' },
    ])
  })

  it('有効なセットが1つも無い種目は除外する', () => {
    const logs: TrainingLog[] = [buildLog('2026-08-20', [buildExercise('ex-1', [buildSet(undefined, undefined)], '未入力種目')])]
    expect(listLoggedExercises(logs)).toEqual([])
  })

  it('exercise名が未解決の場合はフォールバック名を使う', () => {
    const logs: TrainingLog[] = [buildLog('2026-08-20', [buildExercise('ex-1', [buildSet(60, 10)])])]
    expect(listLoggedExercises(logs)[0].exerciseName).toBe('種目')
  })

  it('同じ種目が複数日にまたがる場合は最新の実施日のみを保持する', () => {
    const logs: TrainingLog[] = [
      buildLog('2026-08-10', [buildExercise('ex-1', [buildSet(60, 10)], 'ベンチプレス')]),
      buildLog('2026-08-25', [buildExercise('ex-1', [buildSet(65, 10)], 'ベンチプレス')]),
    ]
    const result = listLoggedExercises(logs)
    expect(result).toHaveLength(1)
    expect(result[0].lastPerformedDate).toBe('2026-08-25')
  })
})

describe('calculatePersonalBests', () => {
  it('記録が無ければ空配列を返す', () => {
    expect(calculatePersonalBests([])).toEqual([])
  })

  it('種目ごとの現在の自己ベストと、その値に最初に到達した日付を返す', () => {
    const logs: TrainingLog[] = [
      buildLog('2026-08-01', [buildExercise('ex-1', [buildSet(60, 10)], 'ベンチプレス')]),
      buildLog('2026-08-15', [buildExercise('ex-1', [buildSet(70, 10)], 'ベンチプレス')]),
    ]
    const results = calculatePersonalBests(logs)
    expect(results).toEqual([
      { exerciseId: 'ex-1', exerciseName: 'ベンチプレス', best1RM: calculateEstimated1RM(70, 10), achievedDate: '2026-08-15' },
    ])
  })

  it('同じ値を後日再度記録しても、達成日は最初に到達した日のまま更新しない', () => {
    const logs: TrainingLog[] = [
      buildLog('2026-08-01', [buildExercise('ex-1', [buildSet(100, 10)], 'スクワット')]),
      buildLog('2026-09-01', [buildExercise('ex-1', [buildSet(100, 10)], 'スクワット')]),
    ]
    const results = calculatePersonalBests(logs)
    expect(results[0].achievedDate).toBe('2026-08-01')
  })

  it('達成日の新しい順（降順）にソートして返す', () => {
    const logs: TrainingLog[] = [
      buildLog('2026-08-01', [buildExercise('ex-1', [buildSet(60, 10)], 'ベンチプレス')]),
      buildLog('2026-08-20', [buildExercise('ex-2', [buildSet(100, 5)], 'スクワット')]),
      buildLog('2026-08-10', [buildExercise('ex-3', [buildSet(40, 8)], 'ショルダープレス')]),
    ]
    const results = calculatePersonalBests(logs)
    expect(results.map((entry) => entry.exerciseId)).toEqual(['ex-2', 'ex-3', 'ex-1'])
  })

  it('weight/repsが未入力または0以下のセットは除外する', () => {
    const logs: TrainingLog[] = [
      buildLog('2026-08-01', [buildExercise('ex-1', [buildSet(undefined, 10), buildSet(50, 0)], 'ベンチプレス')]),
    ]
    expect(calculatePersonalBests(logs)).toEqual([])
  })

  it('exercise名が未解決の場合はフォールバック名を使う', () => {
    const logs: TrainingLog[] = [buildLog('2026-08-01', [buildExercise('ex-1', [buildSet(60, 10)])])]
    expect(calculatePersonalBests(logs)[0].exerciseName).toBe('種目')
  })
})
