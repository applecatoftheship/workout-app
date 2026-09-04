import { describe, expect, it } from 'vitest'
import { isUncategorizedFoodCategory, UNCATEGORIZED_CHIP_LABEL } from '../foodCategoryHelpers'

describe('isUncategorizedFoodCategory', () => {
  it('null / undefined / 空白のみ は「未分類」扱い', () => {
    expect(isUncategorizedFoodCategory(null)).toBe(true)
    expect(isUncategorizedFoodCategory(undefined)).toBe(true)
    expect(isUncategorizedFoodCategory('')).toBe(true)
    expect(isUncategorizedFoodCategory('   ')).toBe(true)
  })

  it('「その他」＋「未分類」の表記ゆれをまとめて「未分類」扱い（重複チップの統合）', () => {
    expect(isUncategorizedFoodCategory('その他・未分類')).toBe(true)
    expect(isUncategorizedFoodCategory('その他 / 未分類')).toBe(true)
    expect(isUncategorizedFoodCategory('その他/未分類')).toBe(true)
    expect(isUncategorizedFoodCategory('未分類・その他')).toBe(true)
  })

  it('単独の「その他」「未分類」や通常カテゴリは統合しない', () => {
    expect(isUncategorizedFoodCategory('その他')).toBe(false)
    expect(isUncategorizedFoodCategory('未分類')).toBe(false)
    expect(isUncategorizedFoodCategory('主食')).toBe(false)
    expect(isUncategorizedFoodCategory('肉・魚')).toBe(false)
  })

  it('チップの表示ラベルは「その他・未分類」に統一', () => {
    expect(UNCATEGORIZED_CHIP_LABEL).toBe('その他・未分類')
  })
})
