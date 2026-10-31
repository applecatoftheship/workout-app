import type { BodyPart, ExerciseDefinition, TrainingLog } from '../types'

// 記録画面ブラッシュアップ（2026年11月1日）：種目選択（ExerciseSelector）の
// 絞り込み・並び順ロジック。DOMに依存しない純粋関数としてテスト対象にする。

/** 直近に記録した種目IDを、新しい日付順・重複なしで最大 limit 件返す。 */
export function getRecentExerciseIds(trainingLogs: TrainingLog[], limit = 8): string[] {
  const sorted = [...trainingLogs].sort((a, b) => b.date.localeCompare(a.date))
  const ids: string[] = []
  for (const log of sorted) {
    // 同じ日の中では後から追加した種目（order_index が大きい）を先にする
    const exercises = [...log.exercises].sort((a, b) => (b.orderIndex ?? 0) - (a.orderIndex ?? 0))
    for (const exercise of exercises) {
      if (exercise.exerciseId && !ids.includes(exercise.exerciseId)) {
        ids.push(exercise.exerciseId)
        if (ids.length >= limit) {
          return ids
        }
      }
    }
  }
  return ids
}

/** 検索語の比較用に正規化する（前後空白除去・英字小文字化・全角英数→半角・カタカナ→ひらがな）。 */
export function normalizeExerciseQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s・･]/g, '')
}

type FilterOptions = {
  query: string
  bodyPart: BodyPart | ''
  recentIds: string[]
}

/**
 * 検索語・部位で絞り込み、最近使った種目を先頭に、残りは名前順で返す。
 * 検索語も部位も無い場合は、最近使った種目だけを返す（一覧が長くなりすぎないように）。
 * 最近使った種目が1件も無い場合は全件を返す。
 */
export function filterExercises(exercises: ExerciseDefinition[], { query, bodyPart, recentIds }: FilterOptions): ExerciseDefinition[] {
  const normalizedQuery = normalizeExerciseQuery(query)
  const recentRank = new Map(recentIds.map((id, index) => [id, index]))

  if (!normalizedQuery && !bodyPart) {
    const recent = recentIds
      .map((id) => exercises.find((exercise) => exercise.id === id))
      .filter((exercise): exercise is ExerciseDefinition => !!exercise)
    return recent.length > 0 ? recent : sortByName(exercises)
  }

  const matched = exercises.filter((exercise) => {
    if (bodyPart && exercise.bodyPart !== bodyPart) {
      return false
    }
    if (normalizedQuery && !normalizeExerciseQuery(exercise.name).includes(normalizedQuery)) {
      return false
    }
    return true
  })

  return [...matched].sort((a, b) => {
    const rankA = a.id !== undefined ? recentRank.get(a.id) : undefined
    const rankB = b.id !== undefined ? recentRank.get(b.id) : undefined
    if (rankA !== undefined && rankB !== undefined) {
      return rankA - rankB
    }
    if (rankA !== undefined) {
      return -1
    }
    if (rankB !== undefined) {
      return 1
    }
    return a.name.localeCompare(b.name, 'ja')
  })
}

function sortByName(exercises: ExerciseDefinition[]): ExerciseDefinition[] {
  return [...exercises].sort((a, b) => a.name.localeCompare(b.name, 'ja'))
}

/** 検索語と完全一致（正規化後）する種目があるか。新規登録の案内を出すかの判定に使う。 */
export function hasExactExerciseMatch(exercises: ExerciseDefinition[], query: string): boolean {
  const normalizedQuery = normalizeExerciseQuery(query)
  if (!normalizedQuery) {
    return true
  }
  return exercises.some((exercise) => normalizeExerciseQuery(exercise.name) === normalizedQuery)
}

// 記録画面の色合い改善（2026年11月1日）：種目一覧で部位を色の点＋文字で示すための対応表。
// 色は tokens.css の --color-bp-*（グラフ画面の部位別ボリュームと同じ色）。
const BODY_PART_COLOR_VARS: Record<BodyPart, string> = {
  胸: 'var(--color-bp-chest)',
  肩: 'var(--color-bp-shoulder)',
  腕: 'var(--color-bp-arm)',
  背: 'var(--color-bp-back)',
  脚: 'var(--color-bp-leg)',
  腹: 'var(--color-bp-core)',
  有酸素: 'var(--color-bp-cardio)',
  その他: 'var(--color-bp-other)',
}

export function bodyPartColorVar(bodyPart: BodyPart | null | undefined): string {
  return (bodyPart && BODY_PART_COLOR_VARS[bodyPart]) || BODY_PART_COLOR_VARS['その他']
}
