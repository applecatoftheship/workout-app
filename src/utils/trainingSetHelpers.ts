// トレーニング記録画面UI/UX刷新（種目カード＋編集モーダル分離、2026年8月28日）：
// 一括入力モード・セット別詳細モードの相互変換・均一判定を行う純粋関数群。
// weight/repsはフォーム入力（文字列）とAPI取得値（数値|null）の両方から
// 呼び出されるため、呼び出し側でComparableSetの形（数値|null）に正規化してから渡す。

export type ComparableSet = {
  weight: number | null
  reps: number | null
}

/**
 * 均一なセット配列から一括入力モード用の値（セット数・重量・回数）を導出する。
 * 均一でない場合は1セット目の値を代表値として返す。
 */
export function bulkFromSets(sets: ComparableSet[]): { setsCount: number; weight: number | null; reps: number | null } {
  return {
    setsCount: sets.length,
    weight: sets[0]?.weight ?? null,
    reps: sets[0]?.reps ?? null,
  }
}

// セットの完了チェック（2026年11月1日、Strong・Hevy の記録画面を参考）：
// ✓を押したとき、空欄の重量・回数を前回値（入力欄に薄く表示している値）で埋める。
// 入力済みの値はそのまま。前回値も無い欄は空欄のまま（保存時の入力チェックは従来どおり）。
export function fillRowFromPrevious<T extends { weight: string; reps: string }>(
  row: T,
  previous: ComparableSet | null | undefined,
): T {
  return {
    ...row,
    weight: row.weight.trim() === '' && previous?.weight != null ? String(previous.weight) : row.weight,
    reps: row.reps.trim() === '' && previous?.reps != null ? String(previous.reps) : row.reps,
  }
}
