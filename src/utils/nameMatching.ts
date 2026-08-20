// AI一括取り込み：類似名の確認ダイアログ機能（実装指示書v2、2026年8月19日新設）
// 種目名・食材名のマッチング・類似度判定ロジックを、AI一括取り込み時のプレビュー
// （BulkScheduleImportModal.tsx）とマスタ新規登録時の重複チェック
// （ExerciseNameInput.tsx・MealLogForm.tsx）の両方から共通で呼び出すための汎用関数。
// matchByNameWithFallback / stripTrailingParenthetical は、元は
// BulkScheduleImportModal.tsxにローカル定義されていたもの（2026年8月18日追加）を
// このファイルへ移設した（挙動は無変更）。

// 末尾の括弧書き（装備種別・カロリー等）を1つ除去する
function stripTrailingParenthetical(name: string): string {
  return name.replace(/\s*[（(][^（）()]*[）)]\s*$/, '').trim()
}

// 完全一致→末尾括弧書き除去の再マッチ、というフォールバック付きの厳密マッチング
export function matchByNameWithFallback<T extends { name: string }>(items: T[], rawName: string): T | undefined {
  const trimmed = rawName.trim()
  const exact = items.find((item) => item.name.trim() === trimmed)
  if (exact) {
    return exact
  }
  const stripped = stripTrailingParenthetical(trimmed)
  if (!stripped || stripped === trimmed) {
    return undefined
  }
  return items.find((item) => item.name.trim() === stripped)
}

// レーベンシュタイン距離（編集距離）。外部ライブラリを新規導入せず、軽量な自前実装とした。
function levenshteinDistance(a: string, b: string): number {
  const lenA = a.length
  const lenB = b.length
  if (lenA === 0) return lenB
  if (lenB === 0) return lenA

  const matrix: number[][] = Array.from({ length: lenA + 1 }, () => new Array<number>(lenB + 1).fill(0))
  for (let i = 0; i <= lenA; i += 1) matrix[i][0] = i
  for (let j = 0; j <= lenB; j += 1) matrix[0][j] = j

  for (let i = 1; i <= lenA; i += 1) {
    for (let j = 1; j <= lenB; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // 削除
        matrix[i][j - 1] + 1, // 挿入
        matrix[i - 1][j - 1] + cost, // 置換
      )
    }
  }
  return matrix[lenA][lenB]
}

// 0〜1に正規化した類似度（1が完全一致、0が共通点なし）
function calculateNameSimilarity(a: string, b: string): number {
  const trimmedA = a.trim()
  const trimmedB = b.trim()
  const maxLength = Math.max(trimmedA.length, trimmedB.length)
  if (maxLength === 0) return 1
  const distance = levenshteinDistance(trimmedA, trimmedB)
  return 1 - distance / maxLength
}

// 類似名として確認ダイアログを出す閾値（調整可能な定数として分離）
export const NAME_SIMILARITY_THRESHOLD = 0.6

export type SimilarNameMatch<T> = { item: T; similarity: number }

// マスタ内から最も類似度の高い候補を1件返す。閾値未満、またはマスタが空の場合はnull。
export function findMostSimilarName<T extends { name: string }>(
  items: T[],
  rawName: string,
  threshold: number = NAME_SIMILARITY_THRESHOLD,
): SimilarNameMatch<T> | null {
  const trimmed = rawName.trim()
  if (!trimmed || items.length === 0) {
    return null
  }

  let best: SimilarNameMatch<T> | null = null
  for (const item of items) {
    const similarity = calculateNameSimilarity(trimmed, item.name)
    if (!best || similarity > best.similarity) {
      best = { item, similarity }
    }
  }

  if (!best || best.similarity < threshold) {
    return null
  }
  return best
}
