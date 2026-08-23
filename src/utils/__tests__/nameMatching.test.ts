import { describe, expect, it } from 'vitest'
import { findMostSimilarName, matchByNameWithFallback, NAME_SIMILARITY_THRESHOLD } from '../nameMatching'

describe('findMostSimilarName', () => {
  it('候補が無ければnull', () => {
    expect(findMostSimilarName([], 'ベンチプレス')).toBeNull()
  })

  it('完全一致は類似度1', () => {
    const result = findMostSimilarName([{ name: 'ベンチプレス' }], 'ベンチプレス', 0)
    expect(result?.similarity).toBe(1)
  })

  it('既定のしきい値は0.6', () => {
    expect(NAME_SIMILARITY_THRESHOLD).toBe(0.6)
  })

  describe('類似度しきい値0.6の境界（0.59/0.60/0.61）', () => {
    // 10文字同士で4文字だけ異なる（編集距離4、レーベンシュタイン距離は
    // 同じ長さの文字列同士の置換のみの差分では差分文字数と一致する）ペアを使い、
    // 類似度 = 1 - 4/10 = 0.6 ちょうどになる名前ペアを固定で用意する。
    const base = { name: 'abcdWXYZij' } // 'abcdefghij'から4文字置換
    const rawName = 'abcdefghij'

    it('類似度0.6ちょうどのペアで、しきい値0.59なら一致する', () => {
      const result = findMostSimilarName([base], rawName, 0.59)
      expect(result).not.toBeNull()
      expect(result!.similarity).toBeCloseTo(0.6)
    })

    it('類似度0.6ちょうどのペアで、しきい値0.60（同値）でも一致する（>=判定）', () => {
      const result = findMostSimilarName([base], rawName, 0.6)
      expect(result).not.toBeNull()
      expect(result!.similarity).toBeCloseTo(0.6)
    })

    it('類似度0.6ちょうどのペアで、しきい値0.61なら一致しない', () => {
      const result = findMostSimilarName([base], rawName, 0.61)
      expect(result).toBeNull()
    })
  })

  it('複数候補の中から最も類似度の高い1件のみを返す', () => {
    const items = [{ name: 'クランチ' }, { name: 'クランチ台' }, { name: '全く違う名前' }]
    const result = findMostSimilarName(items, 'クランチ台')
    expect(result?.item.name).toBe('クランチ台')
    expect(result?.similarity).toBe(1)
  })
})

describe('matchByNameWithFallback', () => {
  it('完全一致を優先する', () => {
    const items = [{ name: 'ベンチプレス' }, { name: 'ベンチプレス（バーベル）' }]
    expect(matchByNameWithFallback(items, 'ベンチプレス')?.name).toBe('ベンチプレス')
  })

  it('完全一致が無ければ末尾の括弧書きを除去して再マッチする', () => {
    const items = [{ name: 'ショルダープレス' }]
    expect(matchByNameWithFallback(items, 'ショルダープレス（バーベル）')?.name).toBe('ショルダープレス')
  })

  it('括弧書き除去後も一致しなければundefined', () => {
    const items = [{ name: 'ベンチプレス' }]
    expect(matchByNameWithFallback(items, '存在しない種目（バーベル）')).toBeUndefined()
  })
})
