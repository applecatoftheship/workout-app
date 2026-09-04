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

// トレーニング記録の「ゴースト入力」（前回値のワンタップ補完、2026年9月4日）：
// 食事記録側の「前回実測量プレースホルダー」（src/api/mealLogs.ts fetchLatestFoodItemRecord
// ＋ MealFoodItemCard の placeholder prop）と同じ体験をトレーニングに展開する。
// 前回記録（同じ種目の最新記録、fetchLatestExerciseRecord）を、重量kg・回数入力欄の
// placeholder として薄く表示する。
//
// - 新規に種目を追加する時のみ（isNewExercise=false ＝ 既存記録の編集時は null を返す）。
//   編集時にゴースト値が混ざると誤上書きの原因になるため。
// - 前回記録が無い種目は null。
// - あくまで placeholder（表示）であり、ユーザーがワンタップ確定（既存の
//   「前回の内容をコピー」ボタン）しない限り実際の値としては保存されない。
export type GhostPlaceholders = {
  bulk: { setsCount: string; weight: string; reps: string }
  detailed: { reps: string; weight: string }[]
}

export function buildGhostPlaceholders(
  previousSets: ComparableSet[] | null | undefined,
  isNewExercise: boolean,
): GhostPlaceholders | null {
  if (!isNewExercise || !previousSets || previousSets.length === 0) {
    return null
  }
  const { setsCount, weight, reps } = bulkFromSets(previousSets)
  return {
    bulk: {
      setsCount: String(setsCount),
      weight: weight != null ? String(weight) : '',
      reps: reps != null ? String(reps) : '',
    },
    detailed: previousSets.map((set) => ({
      reps: set.reps != null ? String(set.reps) : '',
      weight: set.weight != null ? String(set.weight) : '',
    })),
  }
}
