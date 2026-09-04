import { describe, expect, it } from 'vitest'
import { bulkFromSets, buildGhostPlaceholders, detailedSetsFromBulk, isUniformSets } from '../trainingSetHelpers'

describe('isUniformSets', () => {
  it('0件はfalse（一括モードへの切替を無効化するため）', () => {
    expect(isUniformSets([])).toBe(false)
  })

  it('1件のみは常にtrue', () => {
    expect(isUniformSets([{ weight: 60, reps: 10 }])).toBe(true)
  })

  it('全セット同一値ならtrue', () => {
    expect(
      isUniformSets([
        { weight: 60, reps: 10 },
        { weight: 60, reps: 10 },
        { weight: 60, reps: 10 },
      ]),
    ).toBe(true)
  })

  it('重量だけ異なる場合はfalse', () => {
    expect(
      isUniformSets([
        { weight: 60, reps: 10 },
        { weight: 62.5, reps: 10 },
      ]),
    ).toBe(false)
  })

  it('回数だけ異なる場合はfalse', () => {
    expect(
      isUniformSets([
        { weight: 60, reps: 10 },
        { weight: 60, reps: 8 },
      ]),
    ).toBe(false)
  })

  it('nullと数値が混在する場合はfalse', () => {
    expect(
      isUniformSets([
        { weight: 60, reps: null },
        { weight: 60, reps: 10 },
      ]),
    ).toBe(false)
  })

  it('全セットnullは同一値としてtrue', () => {
    expect(
      isUniformSets([
        { weight: null, reps: null },
        { weight: null, reps: null },
      ]),
    ).toBe(true)
  })
})

describe('bulkFromSets', () => {
  it('セット数と1セット目の値を返す', () => {
    expect(
      bulkFromSets([
        { weight: 60, reps: 10 },
        { weight: 60, reps: 10 },
        { weight: 60, reps: 10 },
      ]),
    ).toEqual({ setsCount: 3, weight: 60, reps: 10 })
  })

  it('不均一でも1セット目の値を代表値として返す', () => {
    expect(
      bulkFromSets([
        { weight: 60, reps: 10 },
        { weight: 65, reps: 8 },
      ]),
    ).toEqual({ setsCount: 2, weight: 60, reps: 10 })
  })

  it('0件はセット数0・値nullを返す', () => {
    expect(bulkFromSets([])).toEqual({ setsCount: 0, weight: null, reps: null })
  })
})

describe('detailedSetsFromBulk', () => {
  it('指定したセット数分、同一値のセットを生成する', () => {
    expect(detailedSetsFromBulk(3, 60, 10)).toEqual([
      { weight: 60, reps: 10 },
      { weight: 60, reps: 10 },
      { weight: 60, reps: 10 },
    ])
  })

  it('セット数0は空配列を返す', () => {
    expect(detailedSetsFromBulk(0, 60, 10)).toEqual([])
  })

  it('セット数が負の値でも空配列を返す', () => {
    expect(detailedSetsFromBulk(-1, 60, 10)).toEqual([])
  })

  it('値がnullでもセット数分生成する', () => {
    expect(detailedSetsFromBulk(2, null, null)).toEqual([
      { weight: null, reps: null },
      { weight: null, reps: null },
    ])
  })
})

describe('buildGhostPlaceholders（トレーニング記録のゴースト入力）', () => {
  const prevUniform = [
    { weight: 80, reps: 8 },
    { weight: 80, reps: 8 },
    { weight: 80, reps: 8 },
  ]
  const prevVaried = [
    { weight: 100, reps: 5 },
    { weight: 90, reps: 6 },
    { weight: 80, reps: 8 },
  ]

  it('編集時（isNewExercise=false）は null（ゴースト入力を適用しない）', () => {
    expect(buildGhostPlaceholders(prevUniform, false)).toBeNull()
  })

  it('前回記録が無い（null / 空配列）場合は null', () => {
    expect(buildGhostPlaceholders(null, true)).toBeNull()
    expect(buildGhostPlaceholders(undefined, true)).toBeNull()
    expect(buildGhostPlaceholders([], true)).toBeNull()
  })

  it('新規追加 かつ 前回記録あり：bulk は代表値、detailed は全セットを文字列で返す', () => {
    expect(buildGhostPlaceholders(prevUniform, true)).toEqual({
      bulk: { setsCount: '3', weight: '80', reps: '8' },
      detailed: [
        { reps: '8', weight: '80' },
        { reps: '8', weight: '80' },
        { reps: '8', weight: '80' },
      ],
    })
  })

  it('セットごとに値が異なる場合：bulk は1セット目、detailed は各セットの実値', () => {
    const result = buildGhostPlaceholders(prevVaried, true)
    expect(result?.bulk).toEqual({ setsCount: '3', weight: '100', reps: '5' })
    expect(result?.detailed).toEqual([
      { reps: '5', weight: '100' },
      { reps: '6', weight: '90' },
      { reps: '8', weight: '80' },
    ])
  })

  it('weight / reps が null のセットは空文字列にする', () => {
    expect(buildGhostPlaceholders([{ weight: null, reps: null }], true)).toEqual({
      bulk: { setsCount: '1', weight: '', reps: '' },
      detailed: [{ reps: '', weight: '' }],
    })
  })
})
