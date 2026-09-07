import { describe, expect, it } from 'vitest'
import {
  AI_FOOD_ITEM_CATEGORIES,
  buildDishIngredientPrompt,
  buildFoodItemDraftFromSuggestion,
  matchDishIngredientSuggestions,
  parseDishIngredientSuggestions,
  resolveDraftAmount,
  resolveFoodItemCategory,
} from '../dishIngredientHelpers'
import type { DishIngredientSuggestion } from '../dishIngredientHelpers'
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

const FULL_SUGGESTION: DishIngredientSuggestion = {
  name: 'マグロの刺身',
  grams: 80,
  caloriesPer100g: 125,
  proteinPer100g: 26,
  fatPer100g: 1.4,
  carbohydratesPer100g: 0.1,
  category: '魚介類',
}

describe('buildDishIngredientPrompt', () => {
  it('料理名・栄養成分・カテゴリの各フィールドを要求する', () => {
    const prompt = buildDishIngredientPrompt('親子丼')
    expect(prompt).toContain('親子丼')
    expect(prompt).toContain('caloriesPer100g')
    expect(prompt).toContain('proteinPer100g')
    expect(prompt).toContain('category')
    // カテゴリ選択肢が全部プロンプトに入っている
    for (const category of AI_FOOD_ITEM_CATEGORIES) {
      expect(prompt).toContain(category)
    }
  })
})

describe('resolveFoodItemCategory', () => {
  it('有効なカテゴリはそのまま、それ以外は「その他・未分類」', () => {
    expect(resolveFoodItemCategory('肉類')).toBe('肉類')
    expect(resolveFoodItemCategory('  野菜・キノコ・海藻 ')).toBe('野菜・キノコ・海藻')
    expect(resolveFoodItemCategory('肉')).toBe('その他・未分類')
    expect(resolveFoodItemCategory(undefined)).toBe('その他・未分類')
    expect(resolveFoodItemCategory(42)).toBe('その他・未分類')
  })
})

describe('parseDishIngredientSuggestions', () => {
  it('name / grams / 栄養4項目 / category を全部パースする', () => {
    const raw =
      '[{"name":"鶏もも肉","grams":120,"caloriesPer100g":200,"proteinPer100g":17,"fatPer100g":14,"carbohydratesPer100g":0,"category":"肉類"}]'
    expect(parseDishIngredientSuggestions(raw)).toEqual([
      {
        name: '鶏もも肉',
        grams: 120,
        caloriesPer100g: 200,
        proteinPer100g: 17,
        fatPer100g: 14,
        carbohydratesPer100g: 0,
        category: '肉類',
      },
    ])
  })

  it('栄養成分が欠落・非数値なら、そのフィールドだけ落とす（項目自体は残す）', () => {
    const raw = '[{"name":"謎の食材","grams":30,"caloriesPer100g":"わからない","proteinPer100g":5}]'
    expect(parseDishIngredientSuggestions(raw)).toEqual([{ name: '謎の食材', grams: 30, proteinPer100g: 5 }])
  })

  it('栄養成分 0 は有効な値として残す（水など protein=0）', () => {
    const raw = '[{"name":"水","grams":100,"caloriesPer100g":0,"proteinPer100g":0,"fatPer100g":0,"carbohydratesPer100g":0}]'
    expect(parseDishIngredientSuggestions(raw)?.[0]).toMatchObject({
      caloriesPer100g: 0,
      proteinPer100g: 0,
      fatPer100g: 0,
      carbohydratesPer100g: 0,
    })
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

describe('buildFoodItemDraftFromSuggestion', () => {
  it('栄養4項目が揃っていれば food_items 登録入力を組み立てる', () => {
    expect(buildFoodItemDraftFromSuggestion(FULL_SUGGESTION)).toEqual({
      name: 'マグロの刺身',
      servingAmount: 100,
      servingUnit: 'g',
      calories: 125,
      protein: 26,
      fat: 1.4,
      carbohydrates: 0.1,
      category: '魚介類',
    })
  })

  it('カテゴリが無効／欠落なら「その他・未分類」でフォールバック', () => {
    const draft = buildFoodItemDraftFromSuggestion({ ...FULL_SUGGESTION, category: 'よくわからない' })
    expect(draft?.category).toBe('その他・未分類')
  })

  it('栄養4項目のうち1つでも欠けていれば null（自動登録しない）', () => {
    expect(buildFoodItemDraftFromSuggestion({ name: 'x', grams: 10 })).toBeNull()
    const missingFat: DishIngredientSuggestion = {
      name: 'x',
      grams: 10,
      caloriesPer100g: 100,
      proteinPer100g: 5,
      carbohydratesPer100g: 5,
    }
    expect(buildFoodItemDraftFromSuggestion(missingFat)).toBeNull()
  })
})

describe('matchDishIngredientSuggestions（4分岐）', () => {
  const foodItems = [
    makeFoodItem({ name: '鶏もも肉' }),
    makeFoodItem({ name: '玉ねぎ' }),
    makeFoodItem({ name: 'ほうれん草' }),
    makeFoodItem({ name: 'たまご', servingUnit: '個', servingAmount: 1 }),
  ]

  it("完全一致 → disposition 'matched'、linkTo にその食材", () => {
    const [result] = matchDishIngredientSuggestions([{ name: '玉ねぎ', grams: 50 }], foodItems)
    expect(result.disposition).toBe('matched')
    expect(result.linkTo?.name).toBe('玉ねぎ')
    expect(result.foodItemDraft).toBeNull()
  })

  it("類似候補あり → disposition 'auto-link-similar'、確認を挟まず linkTo に類似食材＋similarity", () => {
    const [result] = matchDishIngredientSuggestions([{ name: 'ほうれんそう', grams: 50 }], foodItems)
    expect(result.disposition).toBe('auto-link-similar')
    expect(result.linkTo?.name).toBe('ほうれん草')
    expect(result.similarity).toBeGreaterThanOrEqual(0.6)
  })

  it("一致も類似も無く栄養成分が有効 → disposition 'auto-create'、foodItemDraft を持つ", () => {
    const [result] = matchDishIngredientSuggestions([FULL_SUGGESTION], foodItems)
    expect(result.disposition).toBe('auto-create')
    expect(result.linkTo).toBeNull()
    expect(result.foodItemDraft).toMatchObject({ name: 'マグロの刺身', servingUnit: 'g', calories: 125 })
  })

  it("一致・類似・有効な栄養成分いずれも無し → disposition 'manual'", () => {
    const [result] = matchDishIngredientSuggestions([{ name: 'マグロの刺身', grams: 80 }], foodItems)
    expect(result.disposition).toBe('manual')
    expect(result.linkTo).toBeNull()
    expect(result.foodItemDraft).toBeNull()
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
