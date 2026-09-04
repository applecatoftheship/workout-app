import type { FoodItem } from '../types'

// 料理レシピの単位不一致・再発防止（2026年9月4日）：
// dish_food_items.unit を自由入力・独立選択にすると、食材の基準単位
// （food_items.serving_unit）と食い違い、栄養計算（amount ÷ serving_amount）が
// 単位無視でそのまま計算されて栄養値が数十倍に膨張／過小評価される不具合が
// 発生していた（122件中59行）。DishFormModal では単位をユーザーに選ばせず、
// 選択した食材の serving_unit へ固定する。ここはその解決ロジックの純粋関数部分。

const DEFAULT_DISH_ITEM_UNIT = 'g'

// 料理レシピの1食材行に使う単位を決める。原則は「選択した食材の現在の
// serving_unit」。食材が見つからない（論理削除済み等）場合のみ、fallback
// （既存 dish_food_items.unit 等）→ 'g' の順で使う。
export function resolveDishItemUnit(
  foodItem: Pick<FoodItem, 'servingUnit'> | undefined,
  fallbackUnit?: string,
): string {
  const serving = foodItem?.servingUnit?.trim()
  if (serving) {
    return serving
  }
  const fallback = fallbackUnit?.trim()
  return fallback || DEFAULT_DISH_ITEM_UNIT
}

// 量（amount）入力欄のラベル。g前提の文言をやめ、食材ごとの実際の単位を出す
// （例：「量（単位: 個）」）。
export function formatDishAmountLabel(unit: string): string {
  return `量（単位: ${unit}）`
}
