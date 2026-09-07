// 料理追加時のAI材料提案（2026年9月7日）：DishFormModal で料理名から Gemini に
// 材料の内訳（食材名＋概算グラム数＋100gあたりの概算栄養成分＋カテゴリ）を JSON で
// 提案させ、既存の nameMatching.ts で food_items マスタと照合する。
//
// 【設計方針】AIの提案は「編集可能な下書き」としてフォームに反映することを基本とし、
// 料理そのものは保存ボタンを押すまで DB に書き込まない。ただし、この AI 材料提案に
// 限り、food_items（食材マスタ）については一部緩和する（2026年9月7日、John承認）：
//   - 提案された食材が既存マスタに「似ている」ものが見つかれば、確認を挟まず自動で
//     その食材へ紐付ける（ユーザーは後で選び直せる）
//   - 一致も類似候補も無く、AIが有効な栄養成分（100gあたり）を返していれば、その値で
//     food_items へ自動登録し、その食材へ紐付ける（AIの概算値であり、後で食材編集
//     画面から修正できる前提での許容）
//   - 栄養成分が無効／欠落、または登録APIがエラーの場合のみ「未登録の食材（要確認）」の
//     手動フローにフォールバックし、保存もブロックする（不正な栄養値のまま保存させない
//     安全策）
// なお実際の food_items 書き込み（createFoodItem）は DishFormModal 側の async 処理で
// 行う。このファイルには「どの分岐に振り分けるか」の判定と登録入力の組み立てまでの
// 純粋関数のみを置く（process.env 依存が無いため src/utils/ に置け、vitest で直接
// テストできる）。api/_lib/dishIngredientSuggestion.ts（Node/nodenext解決）からも
// 読まれるため、相対importは拡張子 .js を明示する（healthAutoExportHelpers.ts と同様）。
import type { FoodItem } from '../types.js'
import { findMostSimilarName, matchByNameWithFallback } from './nameMatching.js'

// AIに選ばせる食材カテゴリ（food_items.category へそのまま入れる。判断が付かなければ
// 末尾の「その他・未分類」へフォールバックする）。foodCategoryHelpers.ts の
// UNCATEGORIZED_CHIP_LABEL と同じ文字列を末尾に置いている。
export const AI_FOOD_ITEM_CATEGORIES = [
  'サプリ・調味料',
  'スイーツ・間食',
  '果物・芋類',
  '魚介類',
  '穀類・主食',
  '脂質・ナッツ',
  '大豆製品',
  '肉類',
  '野菜・キノコ・海藻',
  '卵・乳製品',
  'その他・未分類',
] as const

const FALLBACK_FOOD_CATEGORY = 'その他・未分類'

export function resolveFoodItemCategory(raw: unknown): string {
  return typeof raw === 'string' && (AI_FOOD_ITEM_CATEGORIES as readonly string[]).includes(raw.trim())
    ? raw.trim()
    : FALLBACK_FOOD_CATEGORY
}

export type DishIngredientSuggestion = {
  name: string
  grams: number
  // 100gあたりの概算栄養成分（AI推定・0以上）。数値化できない／欠落していれば undefined。
  caloriesPer100g?: number
  proteinPer100g?: number
  fatPer100g?: number
  carbohydratesPer100g?: number
  // AI推定カテゴリ（AI_FOOD_ITEM_CATEGORIES のいずれか、または欠落時 undefined）。
  category?: string
}

// Gemini へ渡すプロンプト。純粋な文字列生成のみ（api/_lib 側から import して使う）。
export function buildDishIngredientPrompt(dishName: string): string {
  return [
    'あなたは料理の栄養管理アシスタントです。',
    `「${dishName}」という料理の一般的な1人前に含まれる主な食材と、その概算の分量（グラム）、`,
    'および各食材の100gあたりの概算栄養成分とカテゴリを推定してください。',
    '以下の形式のJSON配列だけを出力してください。前後に説明文・コードブロックの記号（```）を付けないでください。',
    '[{"name": "食材名", "grams": 数値, "caloriesPer100g": 数値, "proteinPer100g": 数値, "fatPer100g": 数値, "carbohydratesPer100g": 数値, "category": "カテゴリ"}, ...]',
    '- name は日本語の一般的な食材名（例: "鶏もも肉", "玉ねぎ", "米", "しょうゆ"）。調味料も含めてよい。',
    '- grams はこの料理1人前あたりの概算グラム数（0より大きい数値）。',
    '- caloriesPer100g / proteinPer100g / fatPer100g / carbohydratesPer100g は、その食材の一般的な100gあたりの概算値（0以上の数値。正確な栄養成分表の値でなくてよい）。',
    `- category は次のいずれか一つ（判断が付かなければ「${FALLBACK_FOOD_CATEGORY}」）：${AI_FOOD_ITEM_CATEGORIES.join('／')}`,
    '- 食材は多くても10個程度に絞ってください。',
  ].join('\n')
}

function coercePositiveNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null
  }
  if (typeof value === 'string' && value.trim() !== '') {
    // "120g" のように単位が付いていても数値部分だけ拾う。
    const match = value.match(/-?\d+(\.\d+)?/)
    if (match) {
      const parsed = Number(match[0])
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null
    }
  }
  return null
}

// 栄養成分用（0 を許容する。水など protein=0 の食材があるため）。負・非数値・欠落は null。
function coerceNonNegativeNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const match = value.match(/-?\d+(\.\d+)?/)
    if (match) {
      const parsed = Number(match[0])
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
    }
  }
  return null
}

// Gemini のテキストレスポンスを解析して材料候補の配列を返す。
// - コードブロック（```json ... ```）で囲まれていても剥がす
// - JSON配列としてパースできなければ null（＝呼び出し元は「解析失敗」として扱う）
// - パースはできたが有効な項目が1つも無ければ空配列
export function parseDishIngredientSuggestions(rawText: string): DishIngredientSuggestion[] | null {
  if (typeof rawText !== 'string') {
    return null
  }
  let text = rawText.trim()
  if (!text) {
    return null
  }

  // ```json ... ``` / ``` ... ``` のフェンスを剥がす
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenceMatch) {
    text = fenceMatch[1].trim()
  }

  // 前後に説明文が付いていても最初の "[" 〜 最後の "]" を取り出す
  const firstBracket = text.indexOf('[')
  const lastBracket = text.lastIndexOf(']')
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    text = text.slice(firstBracket, lastBracket + 1)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) {
    return null
  }

  const result: DishIngredientSuggestion[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const record = entry as Record<string, unknown>
    const nameRaw = record.name ?? record.ingredient ?? record.食材 ?? record.食材名
    const name = typeof nameRaw === 'string' ? nameRaw.trim() : ''
    if (!name) {
      continue
    }
    const grams = coercePositiveNumber(record.grams ?? record.gram ?? record.g ?? record.amount ?? record.分量)
    if (grams === null) {
      continue
    }

    // 栄養成分（100gあたり）。数値化できない／欠落しているものは undefined（＝
    // 「栄養値なし」）として扱い、後段で自動登録の対象外にする。
    const caloriesPer100g = coerceNonNegativeNumber(record.caloriesPer100g ?? record.calories_per_100g ?? record.calories)
    const proteinPer100g = coerceNonNegativeNumber(record.proteinPer100g ?? record.protein_per_100g ?? record.protein)
    const fatPer100g = coerceNonNegativeNumber(record.fatPer100g ?? record.fat_per_100g ?? record.fat)
    const carbohydratesPer100g = coerceNonNegativeNumber(
      record.carbohydratesPer100g ?? record.carbohydrates_per_100g ?? record.carbohydrates ?? record.carbs,
    )
    const category = typeof record.category === 'string' ? record.category.trim() || undefined : undefined

    result.push({
      name,
      grams: Math.round(grams * 10) / 10,
      ...(caloriesPer100g !== null ? { caloriesPer100g } : {}),
      ...(proteinPer100g !== null ? { proteinPer100g } : {}),
      ...(fatPer100g !== null ? { fatPer100g } : {}),
      ...(carbohydratesPer100g !== null ? { carbohydratesPer100g } : {}),
      ...(category !== undefined ? { category } : {}),
    })
  }
  return result
}

// food_items へ自動登録するための入力（DishFormModal 側が createFoodItem に渡す）。
export type DishIngredientFoodItemDraft = {
  name: string
  servingAmount: 100
  servingUnit: 'g'
  calories: number
  protein: number
  fat: number
  carbohydrates: number
  category: string
}

// AI提案の栄養成分（100gあたり）が4項目とも有効なら、food_items 自動登録用の入力を
// 組み立てて返す。1つでも欠けていれば null（＝自動登録せず手動フローへフォールバック）。
export function buildFoodItemDraftFromSuggestion(
  suggestion: DishIngredientSuggestion,
): DishIngredientFoodItemDraft | null {
  const { caloriesPer100g, proteinPer100g, fatPer100g, carbohydratesPer100g } = suggestion
  if (
    caloriesPer100g === undefined ||
    proteinPer100g === undefined ||
    fatPer100g === undefined ||
    carbohydratesPer100g === undefined
  ) {
    return null
  }
  return {
    name: suggestion.name,
    servingAmount: 100,
    servingUnit: 'g',
    calories: caloriesPer100g,
    protein: proteinPer100g,
    fat: fatPer100g,
    carbohydrates: carbohydratesPer100g,
    category: resolveFoodItemCategory(suggestion.category),
  }
}

// AI提案の各材料を food_items マスタと照合し、扱いを4分岐で決める（純粋関数）。
//   - 'matched'          … 完全一致（フォールバック含む）。linkTo の食材へ紐付ける
//   - 'auto-link-similar' … 類似候補あり。確認を挟まず linkTo の食材へ自動紐付け
//                           （similarity はラベル表示用）
//   - 'auto-create'       … 一致も類似も無いが有効な栄養成分あり。foodItemDraft で
//                           food_items へ自動登録し、その食材へ紐付ける
//   - 'manual'            … 一致・類似・有効な栄養成分いずれも無い。「未登録の食材
//                           （要確認）」の手動フローへ（保存もブロック）
export type MatchedDishIngredient = {
  suggestedName: string
  grams: number
  disposition: 'matched' | 'auto-link-similar' | 'auto-create' | 'manual'
  // 'matched' / 'auto-link-similar' のとき、この行を紐付ける先の food_item。
  linkTo: FoodItem | null
  // 'auto-link-similar' のとき、ラベル表示用の類似度（0〜1）。
  similarity: number | null
  // 'auto-create' のとき、food_items へ新規登録するための入力。
  foodItemDraft: DishIngredientFoodItemDraft | null
}

export function matchDishIngredientSuggestions(
  suggestions: DishIngredientSuggestion[],
  foodItems: FoodItem[],
): MatchedDishIngredient[] {
  return suggestions.map((suggestion): MatchedDishIngredient => {
    const base = { suggestedName: suggestion.name, grams: suggestion.grams }

    const exact = matchByNameWithFallback(foodItems, suggestion.name)
    if (exact) {
      return { ...base, disposition: 'matched', linkTo: exact, similarity: null, foodItemDraft: null }
    }

    const similar = findMostSimilarName(foodItems, suggestion.name)
    if (similar) {
      return {
        ...base,
        disposition: 'auto-link-similar',
        linkTo: similar.item,
        similarity: similar.similarity,
        foodItemDraft: null,
      }
    }

    const foodItemDraft = buildFoodItemDraftFromSuggestion(suggestion)
    if (foodItemDraft) {
      return { ...base, disposition: 'auto-create', linkTo: null, similarity: null, foodItemDraft }
    }

    return { ...base, disposition: 'manual', linkTo: null, similarity: null, foodItemDraft: null }
  })
}

// AI提案の下書きとしてフォームに入れる初期「量」を決める。
// - 食材の基準単位がグラム系（g/ml/cc 等）なら AI のグラム値をそのまま使う
// - それ以外（「個」「食」等）は g→単位数の換算ができないため、食材の基準量
//   （1食分）を初期値にする。いずれも編集可能な下書きなのでユーザーが調整できる。
const GRAM_LIKE_UNITS = new Set(['g', 'ｇ', 'グラム', 'gram', 'grams', 'ml', 'ｍｌ', 'cc', 'ｃｃ'])

export function resolveDraftAmount(foodItem: Pick<FoodItem, 'servingAmount' | 'servingUnit'>, grams: number): number {
  const unit = foodItem.servingUnit.trim().toLowerCase()
  if (GRAM_LIKE_UNITS.has(unit) && Number.isFinite(grams) && grams > 0) {
    return Math.round(grams * 10) / 10
  }
  return foodItem.servingAmount
}
