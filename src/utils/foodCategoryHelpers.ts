// 食材ジャンルチップの重複表示バグ修正（2026年9月4日）：
// GenreFoodPicker は food_items.category が null/空の食材向けに「未分類」チップを
// ハードコード表示する一方、実データに「その他・未分類」等の実 category 値が
// 混在すると、DBのcategory値から作るチップ一覧にもそれが並び、表記ゆれの重複
// チップ（「その他・未分類」と「その他 / 未分類」）が出ていた。
// null/空/「その他～未分類」系の表記ゆれをまとめて1つの「未分類」バケットに
// 統合するためのヘルパー。DISH_LIKE_CATEGORY の正規化（GenreFoodPicker内）と
// 同じ方針（区切り文字・空白を除去して比較）。

export const UNCATEGORIZED_CHIP_LABEL = 'その他・未分類'

// 「その他」と「未分類」の両方の語を含む表記ゆれのみを対象にする
// （単独の「その他」や「未分類」は、ユーザーが意図的に付けた実カテゴリの
//  可能性があるため統合しない）。
const UNCATEGORIZED_NORMALIZED_KEYS = new Set(['その他未分類', '未分類その他'])

export function isUncategorizedFoodCategory(category: string | null | undefined): boolean {
  if (!category || !category.trim()) {
    return true
  }
  const normalized = category.replace(/[\s・･/／|｜、,]/g, '')
  return UNCATEGORIZED_NORMALIZED_KEYS.has(normalized)
}
