import { describe, expect, it } from 'vitest'
import { bulkFromSets, detailedSetsFromBulk, isUniformSets } from '../trainingSetHelpers'

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
