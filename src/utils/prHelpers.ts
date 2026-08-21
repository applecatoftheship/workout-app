import type { TrainingLog, TrainingLogExercise } from '../types'

// 記録更新演出機能（PR・連続記録、2026年8月21日）：推定1RM計算にはEpley式を採用。
// 1RM = weight * (1 + reps / 30)。0.5kg単位で四捨五入する。
const ONE_RM_ROUNDING_STEP = 0.5

export function calculateEstimated1RM(weight: number, reps: number): number {
  const raw = weight * (1 + reps / 30)
  return Math.round(raw / ONE_RM_ROUNDING_STEP) * ONE_RM_ROUNDING_STEP
}

// weight・repsのどちらかが未入力、または0以下のセットは1RM計算の対象外とする
// （移動平均計算の「値0以下は除外」方針＝calculateMovingAverageを踏襲）。
function getUsable1RM(weight: number | undefined, reps: number | undefined): number | null {
  if (typeof weight !== 'number' || weight <= 0) return null
  if (typeof reps !== 'number' || reps <= 0) return null
  return calculateEstimated1RM(weight, reps)
}

// 種目ごとの過去最高推定1RMを算出する。ACWR・移動平均・部位別ボリュームと同じく
// DBにはキャッシュせず、既にアプリ内に読み込み済みのtrainingLogsから動的計算する
// （新規DBクエリ不要という指示書の方針）。
export function calculateMaxEstimated1RM(trainingLogs: TrainingLog[], exerciseId: string): number {
  let max = 0
  trainingLogs.forEach((log) => {
    log.exercises.forEach((exercise) => {
      if (exercise.exerciseId !== exerciseId) return
      exercise.sets.forEach((set) => {
        const oneRM = getUsable1RM(set.weight, set.reps)
        if (oneRM != null && oneRM > max) {
          max = oneRM
        }
      })
    })
  })
  return max
}

export type PersonalRecordResult = {
  exerciseId: string
  exerciseName: string
  before: number
  after: number
}

// 保存対象の種目群（このセーブ操作でこれから保存するsets）ごとに、保存前の
// 最大推定1RMを上回っていればPR達成として結果を返す。trainingLogsは保存前
// （refetch前）のstateを渡すこと（呼び出し側のクロージャで捕捉した値でよい）。
export function detectPersonalRecords(
  trainingLogs: TrainingLog[],
  savedExercises: TrainingLogExercise[],
): PersonalRecordResult[] {
  const results: PersonalRecordResult[] = []

  savedExercises.forEach((exercise) => {
    const before = calculateMaxEstimated1RM(trainingLogs, exercise.exerciseId)

    let after = 0
    exercise.sets.forEach((set) => {
      const oneRM = getUsable1RM(set.weight, set.reps)
      if (oneRM != null && oneRM > after) {
        after = oneRM
      }
    })

    if (after > 0 && after > before) {
      results.push({
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exercise?.name ?? '種目',
        before,
        after,
      })
    }
  })

  return results
}
