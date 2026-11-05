import type { MealLogInput } from '../api/mealLogs'
import type { MealLog, TrainingLog, TrainingSet } from '../types'
import type { OutboxEntry } from './outbox'

// オフラインでの編集・削除（2026年11月6日）：通信できないときに端末へ保存した
// 編集・削除の操作を、送信前から画面の一覧に反映するための純粋関数。
// 送信後は一覧を取り直すので、ここでの反映はそれまでの仮の表示になる。

/** 食事記録を一覧から除く。 */
export function applyMealDelete(mealLogs: MealLog[], mealLogId: string): MealLog[] {
  return mealLogs.filter((log) => log.id !== mealLogId)
}

/** 食事記録の編集内容（食材ごとの値）から、一覧に出す合計を作り直して差し替える。 */
export function applyMealEdit(mealLogs: MealLog[], input: MealLogInput, foodNames: string[]): MealLog[] {
  const totals = input.items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      fat: acc.fat + item.fat,
      carbohydrates: acc.carbohydrates + item.carbohydrates,
    }),
    { calories: 0, protein: 0, fat: 0, carbohydrates: 0 },
  )
  return mealLogs.map((log) =>
    log.id === input.id
      ? {
          ...log,
          date: input.date,
          mealType: input.mealType,
          notes: input.notes,
          mealTime: input.mealTime,
          dishName: input.dishName,
          foods: foodNames,
          items: input.items.map((item) => ({ foodItemId: item.foodItemId, amount: item.amount })),
          calories: Math.round(totals.calories),
          protein: Math.round(totals.protein),
          fat: Math.round(totals.fat),
          carbohydrates: Math.round(totals.carbohydrates),
        }
      : log,
  )
}

/** トレーニング種目のセットを差し替える。 */
export function applyTrainingSetsReplace(
  trainingLogs: TrainingLog[],
  trainingLogExerciseId: string,
  sets: TrainingSet[],
): TrainingLog[] {
  return trainingLogs.map((log) =>
    log.exercises.some((exercise) => exercise.id === trainingLogExerciseId)
      ? {
          ...log,
          exercises: log.exercises.map((exercise) =>
            exercise.id === trainingLogExerciseId ? { ...exercise, sets } : exercise,
          ),
        }
      : log,
  )
}

/** トレーニング種目を一覧から除く（その日の記録自体は残す）。 */
export function applyTrainingExerciseDelete(trainingLogs: TrainingLog[], trainingLogExerciseId: string): TrainingLog[] {
  return trainingLogs.map((log) =>
    log.exercises.some((exercise) => exercise.id === trainingLogExerciseId)
      ? { ...log, exercises: log.exercises.filter((exercise) => exercise.id !== trainingLogExerciseId) }
      : log,
  )
}

/**
 * まだ送っていない編集・削除の操作を、サーバーから取得した一覧に重ねる（2026年11月6日）。
 * 一覧を取り直しても、送信前の編集・削除が画面や控えから消えないようにするため。
 * ログイン中のユーザーの操作だけを、保存した順に重ねる。新規追加の操作は重ねない
 * （未送信の新規記録は従来どおり一覧に出さない）。
 */
export function overlayPendingMealOperations(
  mealLogs: MealLog[],
  entries: OutboxEntry[],
  userId: string,
  foodNameOf: (foodItemId: string) => string | undefined,
): MealLog[] {
  return entries.reduce((current, entry) => {
    if (entry.userId !== userId) return current
    if (entry.kind === 'mealDelete') return applyMealDelete(current, entry.mealLogId)
    if (entry.kind === 'mealUpsert' && current.some((log) => log.id === entry.input.id)) {
      return applyMealEdit(
        current,
        entry.input,
        entry.input.items.map((item) => foodNameOf(item.foodItemId) ?? '不明な食材'),
      )
    }
    return current
  }, mealLogs)
}

export function overlayPendingTrainingOperations(trainingLogs: TrainingLog[], entries: OutboxEntry[], userId: string): TrainingLog[] {
  return entries.reduce((current, entry) => {
    if (entry.userId !== userId) return current
    if (entry.kind === 'trainingSetsReplace') return applyTrainingSetsReplace(current, entry.trainingLogExerciseId, entry.sets)
    if (entry.kind === 'trainingExerciseDelete') return applyTrainingExerciseDelete(current, entry.trainingLogExerciseId)
    return current
  }, trainingLogs)
}
