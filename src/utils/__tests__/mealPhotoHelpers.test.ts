import { describe, expect, it } from 'vitest'
import { AI_FOOD_ITEM_CATEGORIES } from '../dishIngredientHelpers'
import {
  buildMealPhotoPrompt,
  parseMealPhotoAnalysis,
  toFoodItemDraftFromMealPhotoResult,
} from '../mealPhotoHelpers'
import type { MealPhotoAnalysisResult } from '../mealPhotoHelpers'

describe('buildMealPhotoPrompt', () => {
  it('ヒント無しでは(A)(B)両方の形式・全カテゴリを要求する', () => {
    const prompt = buildMealPhotoPrompt()
    expect(prompt).toContain('"type": "dish"')
    expect(prompt).toContain('"type": "label"')
    expect(prompt).toContain('caloriesPer100g')
    expect(prompt).toContain('servingAmount')
    for (const category of AI_FOOD_ITEM_CATEGORIES) {
      expect(prompt).toContain(category)
    }
    expect(prompt).not.toContain('重要:')
  })

  it('hint:"label"では栄養成分ラベルである可能性が高い旨のヒント行を含む', () => {
    const prompt = buildMealPhotoPrompt('label')
    expect(prompt).toContain('栄養成分表示ラベルである可能性が高いです')
  })

  it('hint:"dish"では料理写真である可能性が高い旨のヒント行を含む', () => {
    const prompt = buildMealPhotoPrompt('dish')
    expect(prompt).toContain('調理済みの料理・食品そのものである可能性が高いです')
  })
})

describe('parseMealPhotoAnalysis', () => {
  it('type:"dish"を食材配列としてパースする', () => {
    const raw = JSON.stringify({
      type: 'dish',
      dish: {
        items: [
          { name: '白米', grams: 150, caloriesPer100g: 168, proteinPer100g: 2.5, fatPer100g: 0.3, carbohydratesPer100g: 37, category: '穀類・主食' },
        ],
      },
    })
    expect(parseMealPhotoAnalysis(raw)).toEqual({
      type: 'dish',
      items: [
        { name: '白米', grams: 150, caloriesPer100g: 168, proteinPer100g: 2.5, fatPer100g: 0.3, carbohydratesPer100g: 37, category: '穀類・主食' },
      ],
    })
  })

  it('type:"label"をラベル下書きとしてパースする', () => {
    const raw = JSON.stringify({
      type: 'label',
      label: {
        name: 'プロテインバー',
        servingAmount: 1,
        servingUnit: '本',
        calories: 200,
        protein: 20,
        fat: 7,
        carbohydrates: 18,
        category: 'サプリ・調味料',
      },
    })
    expect(parseMealPhotoAnalysis(raw)).toEqual({
      type: 'label',
      draft: {
        name: 'プロテインバー',
        servingAmount: 1,
        servingUnit: '本',
        calories: 200,
        protein: 20,
        fat: 7,
        carbohydrates: 18,
        category: 'サプリ・調味料',
      },
    })
  })

  it('無効なカテゴリは「その他・未分類」にフォールバックする（label）', () => {
    const raw = JSON.stringify({
      type: 'label',
      label: { name: '謎の食品', servingAmount: 100, servingUnit: 'g', calories: 100, protein: 1, fat: 1, carbohydrates: 1, category: '謎' },
    })
    const result = parseMealPhotoAnalysis(raw)
    expect(result?.type).toBe('label')
    expect(result?.type === 'label' && result.draft.category).toBe('その他・未分類')
  })

  it('```json フェンス付きでも剥がしてパースする', () => {
    const raw = '```json\n' + JSON.stringify({ type: 'dish', dish: { items: [{ name: '卵', grams: 50, caloriesPer100g: 151, proteinPer100g: 12.3, fatPer100g: 10.3, carbohydratesPer100g: 0.3 }] } }) + '\n```'
    const result = parseMealPhotoAnalysis(raw)
    expect(result?.type).toBe('dish')
  })

  it('前後に説明文が付いていても最初の{〜最後の}を取り出す', () => {
    const raw =
      'これは料理の写真です。\n' +
      JSON.stringify({ type: 'dish', dish: { items: [{ name: '味噌汁', grams: 200, caloriesPer100g: 20, proteinPer100g: 2, fatPer100g: 0.5, carbohydratesPer100g: 2 }] } }) +
      '\n以上です。'
    const result = parseMealPhotoAnalysis(raw)
    expect(result?.type).toBe('dish')
  })

  it('labelの必須フィールドが欠けている場合はdish側へフォールバックする', () => {
    const raw = JSON.stringify({
      type: 'label',
      label: { name: 'ラベル不備品', calories: 100 }, // servingAmount/servingUnit/protein/fat/carbohydrates欠落
      dish: { items: [{ name: 'フォールバック食材', grams: 80, caloriesPer100g: 100, proteinPer100g: 5, fatPer100g: 5, carbohydratesPer100g: 5 }] },
    })
    const result = parseMealPhotoAnalysis(raw)
    expect(result).toEqual({
      type: 'dish',
      items: [{ name: 'フォールバック食材', grams: 80, caloriesPer100g: 100, proteinPer100g: 5, fatPer100g: 5, carbohydratesPer100g: 5 }],
    })
  })

  it('typeが未指定でもitemsがあればdishとして扱う', () => {
    const raw = JSON.stringify({ items: [{ name: '食パン', grams: 60, caloriesPer100g: 260, proteinPer100g: 9, fatPer100g: 4, carbohydratesPer100g: 47 }] })
    expect(parseMealPhotoAnalysis(raw)?.type).toBe('dish')
  })

  it('dish.itemsが空配列ならnull', () => {
    const raw = JSON.stringify({ type: 'dish', dish: { items: [] } })
    expect(parseMealPhotoAnalysis(raw)).toBeNull()
  })

  it('JSONとしてパースできない文字列はnull', () => {
    expect(parseMealPhotoAnalysis('これはJSONではありません')).toBeNull()
  })

  it('空文字列・非文字列はnull', () => {
    expect(parseMealPhotoAnalysis('')).toBeNull()
    expect(parseMealPhotoAnalysis('   ')).toBeNull()
    // @ts-expect-error 実行時の型不正を検証する
    expect(parseMealPhotoAnalysis(undefined)).toBeNull()
  })

  it('トップレベルが配列の場合はnull', () => {
    expect(parseMealPhotoAnalysis('[1,2,3]')).toBeNull()
  })
})

describe('toFoodItemDraftFromMealPhotoResult', () => {
  it('type:"label"はそのままフォーム下書きへマッピングする', () => {
    const result: MealPhotoAnalysisResult = {
      type: 'label',
      draft: {
        name: 'グラノーラ',
        servingAmount: 40,
        servingUnit: 'g',
        calories: 180,
        protein: 4,
        fat: 6,
        carbohydrates: 28,
        category: '穀類・主食',
      },
    }
    expect(toFoodItemDraftFromMealPhotoResult(result)).toEqual({
      name: 'グラノーラ',
      servingAmount: 40,
      servingUnit: 'g',
      calories: 180,
      protein: 4,
      fat: 6,
      carbohydrates: 28,
      category: '穀類・主食',
    })
  })

  it('type:"dish"は最初の食材の100gあたり値をservingAmount:100/servingUnit:"g"として採用する', () => {
    const result: MealPhotoAnalysisResult = {
      type: 'dish',
      items: [
        { name: '鶏むね肉', grams: 120, caloriesPer100g: 108, proteinPer100g: 22.3, fatPer100g: 1.5, carbohydratesPer100g: 0, category: '肉類' },
        { name: 'ブロッコリー', grams: 50, caloriesPer100g: 33, proteinPer100g: 4.3, fatPer100g: 0.5, carbohydratesPer100g: 5.2 },
      ],
    }
    expect(toFoodItemDraftFromMealPhotoResult(result)).toEqual({
      name: '鶏むね肉',
      servingAmount: 100,
      servingUnit: 'g',
      calories: 108,
      protein: 22.3,
      fat: 1.5,
      carbohydrates: 0,
      category: '肉類',
    })
  })

  it('type:"dish"で最初の食材の栄養成分が欠けていればnull', () => {
    const result: MealPhotoAnalysisResult = {
      type: 'dish',
      items: [{ name: '不明な食材', grams: 100 }],
    }
    expect(toFoodItemDraftFromMealPhotoResult(result)).toBeNull()
  })
})
