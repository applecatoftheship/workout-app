// トレーニング記録画面UI/UX刷新（種目カード＋編集モーダル分離、2026年8月28日）：
// 一括入力モード・セット別詳細モードの相互変換・均一判定を行う純粋関数群。
// weight/repsはフォーム入力（文字列）とAPI取得値（数値|null）の両方から
// 呼び出されるため、呼び出し側でComparableSetの形（数値|null）に正規化してから渡す。

export type ComparableSet = {
  weight: number | null
  reps: number | null
}

/**
 * 全セットのweight・repsがそれぞれ同一値かどうかを判定する。
 * 0件（セットが1つもない状態）はfalseを返す（＝一括モードへの切替を無効化する
 * 呼び出し元の判断材料として使う。指示書の「セット数0件など、通常想定しない
 * 状態からの切り替えは妥当な形で扱う」への対応）。
 */
export function isUniformSets(sets: ComparableSet[]): boolean {
  if (sets.length === 0) {
    return false
  }
  const [first, ...rest] = sets
  return rest.every((set) => set.weight === first.weight && set.reps === first.reps)
}

/**
 * 均一なセット配列から一括入力モード用の値（セット数・重量・回数）を導出する。
 * isUniformSetsがtrueである前提の入力を想定するが、均一でない場合も
 * 1セット目の値を代表値として返す（詳細→一括切替の確認ダイアログで
 * 提示する「1セット目の値」の算出にもそのまま使う）。
 */
export function bulkFromSets(sets: ComparableSet[]): { setsCount: number; weight: number | null; reps: number | null } {
  return {
    setsCount: sets.length,
    weight: sets[0]?.weight ?? null,
    reps: sets[0]?.reps ?? null,
  }
}

/**
 * 一括入力モードの値（セット数・重量・回数）から、同一値のセット配列を生成する。
 * setsCountが0以下の場合は空配列を返す。
 */
export function detailedSetsFromBulk(setsCount: number, weight: number | null, reps: number | null): ComparableSet[] {
  return Array.from({ length: Math.max(0, setsCount) }, () => ({ weight, reps }))
}
