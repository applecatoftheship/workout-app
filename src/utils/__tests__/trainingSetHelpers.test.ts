import { describe, expect, it } from 'vitest'
import { bulkFromSets, fillRowFromPrevious } from '../trainingSetHelpers'

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

describe('fillRowFromPrevious（セットの完了チェック）', () => {
  it('空欄の重量・回数を前回値で埋める', () => {
    expect(fillRowFromPrevious({ weight: '', reps: '' }, { weight: 60, reps: 10 })).toEqual({ weight: '60', reps: '10' })
  })
  it('入力済みの値は前回値で上書きしない', () => {
    expect(fillRowFromPrevious({ weight: '65', reps: '' }, { weight: 60, reps: 10 })).toEqual({ weight: '65', reps: '10' })
  })
  it('前回値が無い欄は空欄のまま', () => {
    expect(fillRowFromPrevious({ weight: '', reps: '8' }, null)).toEqual({ weight: '', reps: '8' })
    expect(fillRowFromPrevious({ weight: '', reps: '' }, { weight: null, reps: 5 })).toEqual({ weight: '', reps: '5' })
  })
  it('行のほかの項目（key・done）は保つ', () => {
    expect(fillRowFromPrevious({ key: 'a', done: false, weight: '', reps: '' }, { weight: 1, reps: 2 })).toEqual({ key: 'a', done: false, weight: '1', reps: '2' })
  })
})
