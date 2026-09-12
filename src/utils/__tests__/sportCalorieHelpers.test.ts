import { describe, expect, it } from 'vitest'
import {
  OTHER_SPORT_TYPE,
  SPORT_MET_DEFAULT,
  SPORT_MET_VALUES,
  SPORT_TYPE_PRESETS,
  estimateMetFromRpe,
  resolvePresetMet,
  resolveSportMet,
} from '../sportCalorieHelpers'
import { estimateCaloriesBurned } from '../soccerCalorieHelpers'

describe('SPORT_TYPE_PRESETS / SPORT_MET_VALUES', () => {
  it('8プリセット全てにMET値が定義されている（サッカー機能統合、2026年9月13日追加分含む）', () => {
    expect(SPORT_TYPE_PRESETS.length).toBe(8)
    for (const preset of SPORT_TYPE_PRESETS) {
      expect(SPORT_MET_VALUES[preset]).toBeGreaterThan(0)
    }
  })

  it('プリセット値が一次情報の値と一致する', () => {
    expect(SPORT_MET_VALUES['バスケットボール']).toBe(8.0)
    expect(SPORT_MET_VALUES['テニス']).toBe(8.0)
    expect(SPORT_MET_VALUES['バレーボール']).toBe(6.0)
    expect(SPORT_MET_VALUES['卓球']).toBe(4.0)
    expect(SPORT_MET_VALUES['バドミントン']).toBe(9.0)
    expect(SPORT_MET_VALUES['野球・ソフトボール']).toBe(5.0)
  })

  it('サッカー・フットサルはsoccerCalorieHelpers.tsのAUTO_FILL_RATESと同じMET値を引き継ぐ（サッカー機能統合、2026年9月13日追加）', () => {
    expect(SPORT_MET_VALUES['サッカー']).toBe(9.5)
    expect(SPORT_MET_VALUES['フットサル']).toBe(8.0)
  })
})

describe('resolvePresetMet', () => {
  it('プリセットのMETを返す', () => {
    expect(resolvePresetMet('卓球')).toBe(4.0)
  })

  it('その他・未知の競技名はSPORT_MET_DEFAULT(6.0)', () => {
    expect(resolvePresetMet(OTHER_SPORT_TYPE)).toBe(SPORT_MET_DEFAULT)
    expect(resolvePresetMet('謎の競技')).toBe(SPORT_MET_DEFAULT)
    expect(SPORT_MET_DEFAULT).toBe(6.0)
  })
})

describe('estimateMetFromRpe（ACSM境界点に基づく近似補間モデル）', () => {
  it('制御点そのものは指定値と一致する', () => {
    expect(estimateMetFromRpe(1)).toBeCloseTo(2.0, 5)
    expect(estimateMetFromRpe(3)).toBeCloseTo(3.0, 5) // ACSM「中等度の開始点」
    expect(estimateMetFromRpe(6)).toBeCloseTo(6.5, 5) // ACSM「高強度の開始点」
    expect(estimateMetFromRpe(10)).toBeCloseTo(12.0, 5)
  })

  it('制御点の間は線形補間される', () => {
    expect(estimateMetFromRpe(2)).toBeCloseTo(2.5, 5) // (1,2.0)-(3,3.0)の中間
    expect(estimateMetFromRpe(4.5)).toBeCloseTo(4.75, 5) // (3,3.0)-(6,6.5)の中間
    expect(estimateMetFromRpe(8)).toBeCloseTo(9.25, 5) // (6,6.5)-(10,12.0)の中間
  })

  it('単調増加する（RPEが高いほどMETも高い）', () => {
    const values = Array.from({ length: 10 }, (_, i) => estimateMetFromRpe(i + 1))
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1])
    }
  })

  it('範囲外のRPEは1〜10にクランプする', () => {
    expect(estimateMetFromRpe(0)).toBeCloseTo(estimateMetFromRpe(1), 5)
    expect(estimateMetFromRpe(-5)).toBeCloseTo(estimateMetFromRpe(1), 5)
    expect(estimateMetFromRpe(11)).toBeCloseTo(estimateMetFromRpe(10), 5)
    expect(estimateMetFromRpe(100)).toBeCloseTo(estimateMetFromRpe(10), 5)
  })
})

describe('resolveSportMet（ハイブリッド方式：RPE入力があれば優先、無ければプリセット）', () => {
  it('RPEが入力されていればRPE換算のMETを優先する（プリセットのMETを無視する）', () => {
    expect(resolveSportMet('卓球', 6)).toBeCloseTo(6.5, 5)
    expect(resolveSportMet('バドミントン', 3)).toBeCloseTo(3.0, 5)
  })

  it('RPEがundefined/nullならプリセットのMETを使う', () => {
    expect(resolveSportMet('卓球', undefined)).toBe(4.0)
    expect(resolveSportMet('卓球', null)).toBe(4.0)
    expect(resolveSportMet(OTHER_SPORT_TYPE, undefined)).toBe(SPORT_MET_DEFAULT)
  })

  it('RPE=0でも「未入力」ではなく実値として扱う（0は1にクランプされる）', () => {
    // 0は「未入力」を表す値ではない（未入力はundefined/null）ため、
    // RPE経由の推定が使われる。
    expect(resolveSportMet('卓球', 0)).toBeCloseTo(estimateMetFromRpe(1), 5)
  })
})

describe('estimateCaloriesBurned との連携（新規の式を作らず既存を再利用することの確認）', () => {
  it('resolveSportMetの結果をそのままestimateCaloriesBurnedに渡して計算できる', () => {
    const met = resolveSportMet('バスケットボール', undefined) // 8.0
    // MET × 体重(kg) × 時間(h) × 1.05 = 8.0 × 70 × 1 × 1.05 = 588
    expect(estimateCaloriesBurned(met, 60, 70)).toBe(588)
  })
})
