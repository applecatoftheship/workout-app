// 推定1RM・自己ベスト（PR）のビジュアル化（指示書2026-09-15）。
//
// 【重要】Epley式による推定1RM計算（calculateEstimated1RM）・保存時PR判定
// （detectPersonalRecords・calculateMaxEstimated1RM）は、いずれもsrc/utils/prHelpers.ts
// に実装済み（記録保存時のPR演出機能で使用中）。このファイルはそれらを再利用する
// だけで、1RM計算式・PR判定ロジック自体は一切再実装しない（指示書の必須要件）。
// prHelpers.ts自体には一切手を加えていない（既存の保存時PR演出への回帰リスクを
// 構造的にゼロにするため）。
//
// ここに新規で置くのは、保存時PR演出（「直前の保存操作でPRを更新したか」の
// 単発判定）には無かった「種目ごとの1RM推移（日付付き系列）」「全種目の現在の
// 自己ベストとその達成日の一覧」という、表示専用の集計ロジックのみ。
import { calculateEstimated1RM } from './prHelpers.js'
import type { DateString, TrainingLog } from '../types.js'

// weight・repsのどちらかが未入力、または0以下のセットは1RM計算の対象外とする
// （prHelpers.tsのgetUsable1RMと同じ方針。ただし関数自体はexportされていないため
// ここで同じガード条件のみを再掲する。Epley式の計算自体はcalculateEstimated1RMを呼ぶ）。
function calculateUsable1RM(weight: number | undefined, reps: number | undefined): number | null {
  if (typeof weight !== 'number' || weight <= 0) return null
  if (typeof reps !== 'number' || reps <= 0) return null
  return calculateEstimated1RM(weight, reps)
}

export type OneRepMaxPoint = { date: DateString; value: number }

// 指定した種目の、日ごとの推定1RM推移を返す（その日の全セット中の最良値）。
// trainingLogsに渡す配列が期間で絞り込み済みならその期間内の推移、全履歴を渡せば
// 全期間の推移になる（呼び出し側が期間の有無を選べるよう、期間の絞り込み自体は
// このファイルでは行わない）。日付昇順でソートして返す。
export function calculateOneRepMaxTrend(trainingLogs: TrainingLog[], exerciseId: string): OneRepMaxPoint[] {
  const bestByDate = new Map<string, number>()
  trainingLogs.forEach((log) => {
    log.exercises.forEach((exercise) => {
      if (exercise.exerciseId !== exerciseId) return
      exercise.sets.forEach((set) => {
        const oneRM = calculateUsable1RM(set.weight, set.reps)
        if (oneRM === null) return
        const current = bestByDate.get(log.date)
        if (current === undefined || oneRM > current) {
          bestByDate.set(log.date, oneRM)
        }
      })
    })
  })
  return Array.from(bestByDate.entries())
    .map(([date, value]) => ({ date: date as DateString, value }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export type LoggedExerciseOption = {
  exerciseId: string
  exerciseName: string
  lastPerformedDate: DateString
}

// 種目セレクタ用：weight・reps両方が有効なセットを1つ以上持つ種目一覧を、
// 直近に実施した順（降順）で返す（デフォルト選択＝直近に取り組んでいる種目、
// という妥当な初期値にするため）。
export function listLoggedExercises(trainingLogs: TrainingLog[]): LoggedExerciseOption[] {
  const byExercise = new Map<string, LoggedExerciseOption>()
  trainingLogs.forEach((log) => {
    log.exercises.forEach((exercise) => {
      const hasUsableSet = exercise.sets.some((set) => calculateUsable1RM(set.weight, set.reps) !== null)
      if (!hasUsableSet) return
      const existing = byExercise.get(exercise.exerciseId)
      if (!existing || log.date > existing.lastPerformedDate) {
        byExercise.set(exercise.exerciseId, {
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exercise?.name ?? '種目',
          lastPerformedDate: log.date,
        })
      }
    })
  })
  return Array.from(byExercise.values()).sort((a, b) => b.lastPerformedDate.localeCompare(a.lastPerformedDate))
}

export type PersonalBestEntry = {
  exerciseId: string
  exerciseName: string
  best1RM: number
  achievedDate: DateString
}

// 全種目について、現在の自己ベスト推定1RMと、その値に最初に到達した日付を返す。
// 「最初に到達した日」を特定するため、必ず日付昇順に並べ替えてから走査し、
// 現在の最大値を「厳密に超えた」ときだけ更新する（同値を再度記録した日で
// 上書きしない。例：8/1に100kg → 9/1にも100kgを記録した場合、達成日は8/1のまま）。
// 達成日が新しい順（降順）でソートして返す（指示書：「種目数が多い場合は、
// 直近で更新されたものを優先的に見せる」）。
export function calculatePersonalBests(trainingLogs: TrainingLog[]): PersonalBestEntry[] {
  const sortedLogs = [...trainingLogs].sort((a, b) => a.date.localeCompare(b.date))
  const bestByExercise = new Map<string, PersonalBestEntry>()

  sortedLogs.forEach((log) => {
    log.exercises.forEach((exercise) => {
      exercise.sets.forEach((set) => {
        const oneRM = calculateUsable1RM(set.weight, set.reps)
        if (oneRM === null) return
        const existing = bestByExercise.get(exercise.exerciseId)
        if (!existing || oneRM > existing.best1RM) {
          bestByExercise.set(exercise.exerciseId, {
            exerciseId: exercise.exerciseId,
            exerciseName: exercise.exercise?.name ?? '種目',
            best1RM: oneRM,
            achievedDate: log.date,
          })
        }
      })
    })
  })

  return Array.from(bestByExercise.values()).sort((a, b) => b.achievedDate.localeCompare(a.achievedDate))
}
