// 料理追加時のAI材料提案（2026年9月7日）：DishFormModal で料理名から Gemini に
// 材料の内訳（食材名＋概算グラム数）を JSON で提案させ、既存の nameMatching.ts で
// food_items マスタと照合する。
//
// 【設計方針】AIの提案は必ず「編集可能な下書き」としてフォームに反映するだけで、
// ユーザーが保存ボタンを押すまで DB には一切書き込まない（既存のAI連携と同じ）。
// AI呼び出し（Gemini）は api/_lib/dishIngredientSuggestion.ts（Node専用）が担い、
// このファイルにはプロンプト生成・レスポンス解析・マスタ照合の純粋関数のみを置く
// （process.env 依存が無いため src/utils/ に置け、vitest で直接テストできる）。
// このファイルは api/_lib/dishIngredientSuggestion.ts（Node/nodenext解決）からも
// 読まれるため、相対importは拡張子 .js を明示する（healthAutoExportHelpers.ts と同様）。
import type { FoodItem } from '../types.js'
import { findMostSimilarName, matchByNameWithFallback } from './nameMatching.js'

export type DishIngredientSuggestion = {
  name: string
  grams: number
}

// Gemini へ渡すプロンプト。純粋な文字列生成のみ（api/_lib 側から import して使う）。
export function buildDishIngredientPrompt(dishName: string): string {
  return [
    'あなたは料理の栄養管理アシスタントです。',
    `「${dishName}」という料理の一般的な1人前に含まれる主な食材と、その概算の分量（グラム）を推定してください。`,
    '以下の形式のJSON配列だけを出力してください。前後に説明文・コードブロックの記号（```）を付けないでください。',
    '[{"name": "食材名", "grams": 数値}, ...]',
    '- name は日本語の一般的な食材名（例: "鶏もも肉", "玉ねぎ", "米", "しょうゆ"）。調味料も含めてよい。',
    '- grams は1人前あたりの概算グラム数（0より大きい数値）。',
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
    result.push({ name, grams: Math.round(grams * 10) / 10 })
  }
  return result
}

export type MatchedDishIngredient = {
  suggestedName: string
  grams: number
  // 完全一致（末尾括弧書き除去のフォールバック含む）した food_items。無ければ null。
  matched: FoodItem | null
  // 未一致のときの「似ている食材」候補（レーベンシュタイン類似度、閾値0.6以上）。
  similar: { item: FoodItem; similarity: number } | null
}

// AI提案の各材料を food_items マスタと照合する。
// - 完全一致（matchByNameWithFallback）すれば matched に入れて栄養値の自動計算に使う
// - 一致しなければ matched=null、代わりに findMostSimilarName で「似ている食材」を similar に入れる
export function matchDishIngredientSuggestions(
  suggestions: DishIngredientSuggestion[],
  foodItems: FoodItem[],
): MatchedDishIngredient[] {
  return suggestions.map((suggestion) => {
    const matched = matchByNameWithFallback(foodItems, suggestion.name) ?? null
    const similar = matched ? null : findMostSimilarName(foodItems, suggestion.name)
    return {
      suggestedName: suggestion.name,
      grams: suggestion.grams,
      matched,
      similar,
    }
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
