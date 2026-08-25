import { getCurrentUserId, supabase } from './client'
import { fetchExercises } from './trainingLogs'
import type { DateString, ExerciseDefinition, TrainingTemplate, TrainingTemplateExercise } from '../types'

type TrainingTemplateRow = {
  id: string
  name: string
  description: string | null
  user_id: string | null
  created_at: string
}

type TrainingTemplateExerciseRow = {
  id: string
  template_id: string
  exercise_id: string
  order_index: number
  target_sets: number | null
  target_reps: string | null
  target_weight: number | null
  rest_seconds: number | null
  created_at: string
}

function rowToTemplateExercise(
  row: TrainingTemplateExerciseRow,
  exerciseMap: Map<string, ExerciseDefinition>,
): TrainingTemplateExercise {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    exercise: exerciseMap.get(row.exercise_id),
    orderIndex: row.order_index,
    targetSets: row.target_sets ?? undefined,
    targetReps: row.target_reps ?? undefined,
    targetWeight: row.target_weight ?? undefined,
    restSeconds: row.rest_seconds ?? undefined,
    createdAt: row.created_at as DateString,
  }
}

export async function fetchTrainingTemplates(): Promise<TrainingTemplate[]> {
  const userId = await getCurrentUserId()
  const { data: templateRows, error: templateError } = await supabase
    .from('training_templates')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (templateError) {
    throw templateError
  }

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from('training_template_exercises')
    .select('*')

  if (exerciseError) {
    throw exerciseError
  }

  // テンプレートが参照する種目も、論理削除後に名前解決できなくならないよう
  // includeDeletedで取得する（技術的負債#9対応、trainingLogs.tsのfetchTrainingLogs
  // と同じ理由）。
  const exercises = await fetchExercises({ includeDeleted: true })
  const exerciseMap = new Map(exercises.map((exercise) => [exercise.id as string, exercise]))

  return (templateRows as TrainingTemplateRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    userId: row.user_id ?? undefined,
    createdAt: row.created_at as DateString,
    exercises: (exerciseRows as TrainingTemplateExerciseRow[])
      .filter((exercise) => exercise.template_id === row.id)
      .map((exercise) => rowToTemplateExercise(exercise, exerciseMap))
      .sort((a, b) => a.orderIndex - b.orderIndex),
  }))
}

// テンプレート管理UI（技術的負債#7対応、2026年8月18日）。Phase Fで廃止したのは
// 「実績記録時にその場でテンプレートを適用する」機能であり、テンプレート自体の
// 作成・削除は別機能として今回新設する。
export async function createTrainingTemplate(name: string, exerciseIds: string[]): Promise<void> {
  const userId = await getCurrentUserId()
  const { data: insertedTemplate, error: templateError } = await supabase
    .from('training_templates')
    .insert({ name, user_id: userId })
    .select()
    .single()

  if (templateError) {
    throw templateError
  }

  const templateId = (insertedTemplate as TrainingTemplateRow).id

  if (exerciseIds.length > 0) {
    const { error: exercisesError } = await supabase.from('training_template_exercises').insert(
      exerciseIds.map((exerciseId, index) => ({
        template_id: templateId,
        user_id: userId,
        exercise_id: exerciseId,
        order_index: index,
      })),
    )

    if (exercisesError) {
      throw exercisesError
    }
  }
}

// テンプレート編集機能（2026年8月19日）。名前はtraining_templates本体を更新し、
// 種目構成はtraining_template_exercisesを全削除してから再登録する（新規作成時と
// 同じ挿入ロジックを流用）。これはtraining_templates本体の削除ではなく、対象
// templateIdが既に確定している1レコード分の子テーブルのみの入れ替えであり、
// 全件diff同期のような危険なパターンではない。training_schedules.template_idの
// 参照はtemplateId自体を変更しないため影響を受けない。
export async function updateTrainingTemplate(templateId: string, name: string, exerciseIds: string[]): Promise<void> {
  const userId = await getCurrentUserId()
  const { error: templateError } = await supabase
    .from('training_templates')
    .update({ name })
    .eq('id', templateId)
    .eq('user_id', userId)

  if (templateError) {
    throw templateError
  }

  const { error: deleteError } = await supabase.from('training_template_exercises').delete().eq('template_id', templateId)

  if (deleteError) {
    throw deleteError
  }

  if (exerciseIds.length > 0) {
    const { error: exercisesError } = await supabase.from('training_template_exercises').insert(
      exerciseIds.map((exerciseId, index) => ({
        template_id: templateId,
        user_id: userId,
        exercise_id: exerciseId,
        order_index: index,
      })),
    )

    if (exercisesError) {
      throw exercisesError
    }
  }
}

// training_templatesにis_deleted列は存在しないため物理削除とする（食材マスタ・
// 種目マスタの論理削除とは異なるパターン）。training_template_exercisesはON DELETE
// CASCADEで自動削除され、既存のtraining_schedules.template_idを参照している
// 予定はON DELETE SET NULLで参照のみが外れる（予定自体は消えない）。
export async function deleteTrainingTemplate(id: string): Promise<void> {
  const userId = await getCurrentUserId()
  const { error } = await supabase.from('training_templates').delete().eq('id', id).eq('user_id', userId)

  if (error) {
    throw error
  }
}

