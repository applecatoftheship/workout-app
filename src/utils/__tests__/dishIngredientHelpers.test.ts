import { describe, expect, it } from 'vitest'
import {
  buildDishIngredientPrompt,
  matchDishIngredientSuggestions,
  parseDishIngredientSuggestions,
  resolveDraftAmount,
} from '../dishIngredientHelpers'
import type { FoodItem } from '../../types'

function makeFoodItem(overrides: Partial<FoodItem> & { name: string }): FoodItem {
  return {
    id: `food-${overrides.name}`,
    name: overrides.name,
    servingAmount: overrides.servingAmount ?? 100,
    servingUnit: overrides.servingUnit ?? 'g',
    calories: overrides.calories ?? 100,
    protein: overrides.protein ?? 10,
    fat: overrides.fat ?? 5,
    carbohydrates: overrides.carbohydrates ?? 5,
    category: overrides.category ?? null,
    emoji: overrides.emoji ?? null,
  }
}

describe('buildDishIngredientPrompt', () => {
  it('料理名を含み、JSON配列形式を要求する', () => {
    const prompt = buildDishIngredientPrompt('親子丼')
    expect(prompt).toContain('親子丼')
    expect(prompt).toContain('[{"name": "食材名", "grams": 数値}, ...]')
  })
})

describe('parseDishIngredientSuggestions', () => {
  it('素のJSON配列をパースする', () => {
    expect(parseDishIngredientSuggestions('[{"name":"鶏もも肉","grams":120},{"name":"玉ねぎ","grams":50}]')).toEqual([
      { name: '鶏もも肉', grams: 120 },
      { name: '玉ねぎ', grams: 50 },
    ])
  })

  it('```json コードフェンスや前後の説明文を剥がす', () => {
    const raw = 'はい、以下が推定です。\n```json\n[{"name":"米","grams":150}]\n```\nご確認ください。'
    expect(parseDishIngredientSuggestions(raw)).toEqual([{ name: '米', grams: 150 }])
  })

  it('grams が文字列や単位付きでも数値化する / name の別名キーも拾う', () => {
    expect(parseDishIngredientSuggestions('[{"ingredient":"しょうゆ","grams":"15g"},{"name":"みりん","amount":"10"}]')).toEqual([
      { name: 'しょうゆ', grams: 15 },
      { name: 'みりん', grams: 10 },
    ])
  })

  it('name が空・grams が0以下/非数値の項目は除外する', () => {
    expect(
      parseDishIngredientSuggestions('[{"name":"","grams":10},{"name":"塩","grams":0},{"name":"卵","grams":-5},{"name":"米","grams":150}]'),
    ).toEqual([{ name: '米', grams: 150 }])
  })

  it('JSONとしてパースできない・配列でない場合は null', () => {
    expect(parseDishIngredientSuggestions('材料が思いつきませんでした')).toBeNull()
    expect(parseDishIngredientSuggestions('{"name":"米","grams":150}')).toBeNull()
    expect(parseDishIngredientSuggestions('')).toBeNull()
  })

  it('パースはできたが有効項目ゼロなら空配列（null ではない）', () => {
    expect(parseDishIngredientSuggestions('[{"foo":"bar"}]')).toEqual([])
  })
})

describe('matchDishIngredientSuggestions', () => {
  const foodItems = [
    makeFoodItem({ name: '鶏もも肉' }),
    makeFoodItem({ name: '玉ねぎ' }),
    makeFoodItem({ name: 'ほうれん草' }),
    makeFoodItem({ name: 'たまご', servingUnit: '個', servingAmount: 1 }),
  ]

  it('完全一致した食材は matched に入る', () => {
    const result = matchDishIngredientSuggestions([{ name: '玉ねぎ', grams: 50 }], foodItems)
    expect(result[0].matched?.name).toBe('玉ねぎ')
    expect(result[0].similar).toBeNull()
  })

  it('一致しない食材は matched=null、似ている候補が similar に入る', () => {
    // "ほうれんそう"（ひらがな）は "ほうれん草" と類似度が高い（約0.67）
    const result = matchDishIngredientSuggestions([{ name: 'ほうれんそう', grams: 50 }], foodItems)
    expect(result[0].matched).toBeNull()
    expect(result[0].similar?.item.name).toBe('ほうれん草')
    expect(result[0].similar?.similarity).toBeGreaterThanOrEqual(0.6)
  })

  it('全く無関係な食材は matched も similar も null', () => {
    const result = matchDishIngredientSuggestions([{ name: 'マグロの刺身', grams: 80 }], foodItems)
    expect(result[0].matched).toBeNull()
    expect(result[0].similar).toBeNull()
  })
})

describe('resolveDraftAmount', () => {
  it('グラム系の単位ならAIのグラム値をそのまま使う', () => {
    expect(resolveDraftAmount({ servingAmount: 100, servingUnit: 'g' }, 120)).toBe(120)
    expect(resolveDraftAmount({ servingAmount: 100, servingUnit: 'ml' }, 200)).toBe(200)
    expect(resolveDraftAmount({ servingAmount: 100, servingUnit: 'グラム' }, 55.5)).toBe(55.5)
  })

  it('個数系の単位なら食材の基準量（1食分）を初期値にする', () => {
    expect(resolveDraftAmount({ servingAmount: 1, servingUnit: '個' }, 50)).toBe(1)
    expect(resolveDraftAmount({ servingAmount: 2, servingUnit: '枚' }, 30)).toBe(2)
  })

  it('grams が不正でも落ちない（基準量にフォールバック）', () => {
    expect(resolveDraftAmount({ servingAmount: 100, servingUnit: 'g' }, Number.NaN)).toBe(100)
    expect(resolveDraftAmount({ servingAmount: 100, servingUnit: 'g' }, -1)).toBe(100)
  })
})
