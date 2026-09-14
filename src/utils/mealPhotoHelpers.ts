// Gemini画像解析による食事入力（指示書2026-09-14）：写真1枚をGeminiに渡し、
// (A)調理済み料理・食品の写真 → 食材内訳の推定、(B)栄養成分表示ラベルの写真 →
// 記載値の読み取り、のどちらかをGemini側に自動判別させて構造化データを返させる。
//
// 【既存資産の再利用】(A)の食材内訳は既存のDishIngredientSuggestion型
// （dishIngredientHelpers.ts、料理名からのAI材料提案機能）とまったく同じ形状
// （name/grams/栄養4項目per100g/category）を採用し、パース処理も
// parseDishIngredientEntriesを再利用する。food_itemsマスタとの4分岐照合
// （matched/auto-link-similar/auto-create/manual）もmatchDishIngredientSuggestions
// をそのまま再利用できる（呼び出し側はUI層、src/components/calendar/参照）。
//
// process.env等のNode依存が無い純粋関数のみを置く（api/_lib/mealPhotoAnalysis.ts
// から読まれるため、相対importは拡張子.jsを明示する。dishIngredientHelpers.tsと同様）。
import {
  AI_FOOD_ITEM_CATEGORIES,
  coerceNonNegativeNumber,
  coercePositiveNumber,
  parseDishIngredientEntries,
  resolveFoodItemCategory,
} from './dishIngredientHelpers.js'
import type { DishIngredientSuggestion } from './dishIngredientHelpers.js'

// 呼び出し元が「この写真はおそらくこちらのはず」という手がかりをGeminiに渡す場合の
// ヒント。FoodItemFormModal（栄養成分ラベル読み取り専用の入力起点）から'label'を
// 渡す想定。省略時（食事記録ウィザードの汎用入力起点）は判定をGeminiに完全に委ねる。
export type MealPhotoHint = 'label' | 'dish'

export function buildMealPhotoPrompt(hint?: MealPhotoHint): string {
  const hintLine =
    hint === 'label'
      ? '重要: この写真は食品パッケージの栄養成分表示ラベルである可能性が高いです。ラベルが写っていれば必ず"label"として扱ってください。'
      : hint === 'dish'
        ? '重要: この写真は調理済みの料理・食品そのものである可能性が高いです。'
        : ''

  return [
    'あなたは食事管理アプリの画像解析アシスタントです。',
    '渡された写真が次のどちらに該当するか判定し、該当する形式でJSONオブジェクトを1つだけ出力してください。',
    '(A) 調理済みの料理・食品そのものの写真 → 含まれる食材の内訳を推定する',
    '(B) 食品パッケージの栄養成分表示ラベルの写真 → 記載されている数値をそのまま読み取る',
    hintLine,
    '',
    '前後に説明文・コードブロックの記号（```）を付けず、JSONオブジェクトのみを出力してください。',
    '',
    '(A)の場合の形式:',
    '{"type": "dish", "dish": {"items": [{"name": "食材名", "grams": 数値, "caloriesPer100g": 数値, "proteinPer100g": 数値, "fatPer100g": 数値, "carbohydratesPer100g": 数値, "category": "カテゴリ"}, ...]}}',
    '- name は日本語の一般的な食材名（例: "鶏もも肉", "白米", "味噌汁"）。',
    '- grams は写真から推定できる1人前あたりの概算グラム数（0より大きい数値）。',
    '- caloriesPer100g / proteinPer100g / fatPer100g / carbohydratesPer100g は、その食材の一般的な100gあたりの概算栄養成分（0以上の数値）。',
    `- category は次のいずれか一つ（判断が付かなければ「その他・未分類」）：${AI_FOOD_ITEM_CATEGORIES.join('／')}`,
    '- 食材は多くても10個程度に絞ってください。',
    '',
    '(B)の場合の形式:',
    '{"type": "label", "label": {"name": "食品名", "servingAmount": 数値, "servingUnit": "g", "calories": 数値, "protein": 数値, "fat": 数値, "carbohydrates": 数値, "category": "カテゴリ"}}',
    '- name はパッケージに記載の商品名・食品名。',
    '- servingAmount / servingUnit はラベルに記載されている基準量をそのまま使ってください（例: 「100gあたり」の表示なら servingAmount:100, servingUnit:"g"。「1食(30g)あたり」の表示なら servingAmount:30, servingUnit:"g"）。',
    '- calories / protein / fat / carbohydrates は servingAmount あたりの記載値をそのまま使ってください（100gあたりへの換算はしないでください）。',
    `- category は次のいずれか一つ（判断が付かなければ「その他・未分類」）：${AI_FOOD_ITEM_CATEGORIES.join('／')}`,
  ]
    .filter((line) => line !== '')
    .join('\n')
}

export type MealPhotoLabelDraft = {
  name: string
  servingAmount: number
  servingUnit: string
  calories: number
  protein: number
  fat: number
  carbohydrates: number
  category: string
}

export type MealPhotoAnalysisResult =
  | { type: 'dish'; items: DishIngredientSuggestion[] }
  | { type: 'label'; draft: MealPhotoLabelDraft }

function parseLabelRecord(record: Record<string, unknown>): MealPhotoLabelDraft | null {
  const nameRaw = record.name ?? record.食品名 ?? record.productName
  const name = typeof nameRaw === 'string' ? nameRaw.trim() : ''
  if (!name) {
    return null
  }

  const servingAmount = coercePositiveNumber(record.servingAmount ?? record.serving_amount ?? record.amount)
  const servingUnitRaw = record.servingUnit ?? record.serving_unit ?? record.unit
  const servingUnit = typeof servingUnitRaw === 'string' ? servingUnitRaw.trim() : ''
  const calories = coerceNonNegativeNumber(record.calories)
  const protein = coerceNonNegativeNumber(record.protein)
  const fat = coerceNonNegativeNumber(record.fat)
  const carbohydrates = coerceNonNegativeNumber(record.carbohydrates ?? record.carbs)

  if (
    servingAmount === null ||
    !servingUnit ||
    calories === null ||
    protein === null ||
    fat === null ||
    carbohydrates === null
  ) {
    return null
  }

  return {
    name,
    servingAmount,
    servingUnit,
    calories,
    protein,
    fat,
    carbohydrates,
    category: resolveFoodItemCategory(record.category),
  }
}

// Gemini のテキストレスポンスを解析してMealPhotoAnalysisResultを返す。
// - コードブロック（```json ... ```）で囲まれていても剥がす
// - 前後に説明文が付いていても最初の "{" 〜 最後の "}" を取り出す
// - JSONオブジェクトとしてパースできなければ null
// - type:"label" は label（またはトップレベル）から必須フィールドを読み取れたときのみ
//   'label' 結果を返す。それ以外（type:"dish"、type未指定・不明、labelの解析失敗）は
//   dish.items（またはトップレベルitems）のパースを試み、1件以上あれば'dish'結果を
//   返す。どちらも成立しなければ null（＝呼び出し元は「解析失敗」として扱う）。
export function parseMealPhotoAnalysis(rawText: string): MealPhotoAnalysisResult | null {
  if (typeof rawText !== 'string') {
    return null
  }
  let text = rawText.trim()
  if (!text) {
    return null
  }

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenceMatch) {
    text = fenceMatch[1].trim()
  }

  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }
  const record = parsed as Record<string, unknown>
  const type = typeof record.type === 'string' ? record.type.trim().toLowerCase() : ''

  if (type === 'label') {
    const labelSource =
      record.label && typeof record.label === 'object' && !Array.isArray(record.label)
        ? (record.label as Record<string, unknown>)
        : record
    const draft = parseLabelRecord(labelSource)
    if (draft) {
      return { type: 'label', draft }
    }
    // labelとして必須フィールドを読み取れなかった場合はdish側へのフォールバックを試みる
    // （下記へ続行）。
  }

  const dishItemsSource =
    record.dish && typeof record.dish === 'object' && !Array.isArray(record.dish)
      ? (record.dish as Record<string, unknown>).items
      : record.items
  const items = parseDishIngredientEntries(dishItemsSource)
  if (items && items.length > 0) {
    return { type: 'dish', items }
  }

  return null
}

// FoodItemFormModal（食材新規登録フォーム）への下書き反映用。
// - type:'label' はそのままフォームの各フィールドへマッピングする。
// - type:'dish'（想定外の判定。ラベル読み取り専用の入力起点で料理写真として
//   判定されてしまったケース）は、最初の食材の100gあたり栄養成分を
//   servingAmount:100 / servingUnit:'g' の食材としてフォールバック採用する
//   （per-100g値をそのまま流用できるため変換不要）。栄養成分が1つでも欠けている
//   食材の場合はnull（＝呼び出し元は「読み取れませんでした」として扱う）。
export type FoodItemDraftFromPhoto = {
  name: string
  servingAmount: number
  servingUnit: string
  calories: number
  protein: number
  fat: number
  carbohydrates: number
  category?: string
}

export function toFoodItemDraftFromMealPhotoResult(result: MealPhotoAnalysisResult): FoodItemDraftFromPhoto | null {
  if (result.type === 'label') {
    return { ...result.draft }
  }

  const first = result.items[0]
  if (
    !first ||
    first.caloriesPer100g === undefined ||
    first.proteinPer100g === undefined ||
    first.fatPer100g === undefined ||
    first.carbohydratesPer100g === undefined
  ) {
    return null
  }
  return {
    name: first.name,
    servingAmount: 100,
    servingUnit: 'g',
    calories: first.caloriesPer100g,
    protein: first.proteinPer100g,
    fat: first.fatPer100g,
    carbohydrates: first.carbohydratesPer100g,
    category: first.category,
  }
}
