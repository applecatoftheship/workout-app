import { describe, expect, it } from 'vitest'
import type { FoodItem } from '../../types'
import { formatDishAmountLabel, resolveDishItemUnit } from '../dishHelpers'

function makeFoodItem(overrides: Partial<FoodItem>): FoodItem {
  return {
    id: 'f1',
    name: '卵',
    servingAmount: 1,
    servingUnit: '個',
    calories: 76,
    protein: 6.2,
    fat: 5.2,
    carbohydrates: 0.2,
    ...overrides,
  }
}

describe('resolveDishItemUnit', () => {
  it('食材を選ぶと、その食材の serving_unit に固定される（ユーザーは単位を選べない）', () => {
    expect(resolveDishItemUnit(makeFoodItem({ servingUnit: '個' }))).toBe('個')
    expect(resolveDishItemUnit(makeFoodItem({ servingUnit: '大さじ' }))).toBe('大さじ')
    expect(resolveDishItemUnit(makeFoodItem({ servingUnit: '缶' }))).toBe('缶')
  })

  it('編集時、既存 dish_food_items.unit が食材の serving_unit と違っても serving_unit を優先する', () => {
    // 旧データで unit='g' だが、食材（卵）の基準単位は '個'
    expect(resolveDishItemUnit(makeFoodItem({ servingUnit: '個' }), 'g')).toBe('個')
  })

  it('食材が見つからない（論理削除済み等）場合は fallback → g の順', () => {
    expect(resolveDishItemUnit(undefined, 'パック')).toBe('パック')
    expect(resolveDishItemUnit(undefined)).toBe('g')
    expect(resolveDishItemUnit(makeFoodItem({ servingUnit: '  ' }), '')).toBe('g')
  })
})

describe('formatDishAmountLabel', () => {
  it('量入力欄のラベルに食材ごとの実際の単位を出す（g前提をやめる）', () => {
    expect(formatDishAmountLabel('個')).toBe('量（単位: 個）')
    expect(formatDishAmountLabel('g')).toBe('量（単位: g）')
  })
})
