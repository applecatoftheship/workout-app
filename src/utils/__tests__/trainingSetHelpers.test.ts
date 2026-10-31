import { describe, expect, it } from 'vitest'
import { bulkFromSets } from '../trainingSetHelpers'

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
