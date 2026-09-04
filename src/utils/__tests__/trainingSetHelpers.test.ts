import { describe, expect, it } from 'vitest'
import {
  bulkFromSets,
  buildGhostPlaceholders,
  detailedSetsFromBulk,
  isUniformSets,
  resolveInitialBulk,
  shouldResetBulkForExercise,
} from '../trainingSetHelpers'

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

describe('resolveInitialBulk（一括モードの初期値：前回記録あり/なしで切り替え）', () => {
  const empty = { sets: '', reps: '', weight: '' }

  it('新規追加 かつ 前回記録なし かつ 未入力：空欄を汎用既定値 3/10 で埋める（従来挙動を維持）', () => {
    expect(resolveInitialBulk(false, true, empty, false)).toEqual({ sets: '3', reps: '10', weight: '' })
  })

  it('新規追加 かつ 前回記録あり：null を返す（空欄のまま前回値をゴースト表示させる）', () => {
    expect(resolveInitialBulk(true, true, empty, false)).toBeNull()
  })

  it('編集時（isNewExercise=false）：null（ゴースト非表示・実値表示のまま）', () => {
    expect(resolveInitialBulk(false, false, empty, false)).toBeNull()
    expect(resolveInitialBulk(true, false, empty, false)).toBeNull()
  })

  it('ユーザーが既に手入力済み：null（3/10 で上書きしない）', () => {
    expect(resolveInitialBulk(false, true, { sets: '5', reps: '', weight: '' }, true)).toBeNull()
  })

  it('既に値が入っている欄はそのまま、空欄だけを 3/10 で埋める', () => {
    expect(resolveInitialBulk(false, true, { sets: '4', reps: '', weight: '50' }, false)).toEqual({
      sets: '4',
      reps: '10',
      weight: '50',
    })
  })
})

describe('shouldResetBulkForExercise（種目切替時に一括モード入力をリセットするか）', () => {
  it('種目名を打鍵中で id が null：リセットしない（入力値を保持）', () => {
    expect(shouldResetBulkForExercise(null, 'ex-A')).toBe(false)
    expect(shouldResetBulkForExercise(null, null)).toBe(false)
  })

  it('直近でリセットした種目と同じ id：リセットしない（打ち直して同じ種目に戻った）', () => {
    expect(shouldResetBulkForExercise('ex-A', 'ex-A')).toBe(false)
  })

  it('別の種目が確定した：リセットする', () => {
    expect(shouldResetBulkForExercise('ex-B', 'ex-A')).toBe(true)
  })

  it('最初の種目選択（直近リセットが無い状態）：リセットする', () => {
    expect(shouldResetBulkForExercise('ex-A', null)).toBe(true)
  })

  it('再現シナリオ：種目確定 → 誤字を打って id=null → 打ち直して同じ id に戻る、の一連で入力を保持', () => {
    // 1. ベンチプレス(ex-A)を選択 → リセット（lastReset は ex-A に）
    expect(shouldResetBulkForExercise('ex-A', null)).toBe(true)
    // 2. 名前欄を打鍵して一時的に未一致（id=null） → 保持
    expect(shouldResetBulkForExercise(null, 'ex-A')).toBe(false)
    // 3. 打ち直して "ベンチプレス" に戻る（id=ex-A） → 保持（lastReset と同一）
    expect(shouldResetBulkForExercise('ex-A', 'ex-A')).toBe(false)
  })
})
