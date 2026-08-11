import { supabase } from './client'
import { DEFAULT_USER_ID, fetchExercises } from './trainingLogs'
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
  const { data: templateRows, error: templateError } = await supabase
    .from('training_templates')
    .select('*')
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

  const exercises = await fetchExercises()
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

export type TrainingTemplateInput = {
  name: string
  description?: string
  exercises: Array<{
    exerciseId: string
    orderIndex: number
    targetSets?: number
    targetReps?: string
    targetWeight?: number
  }>
}

export async function createTrainingTemplate(input: TrainingTemplateInput): Promise<void> {
  const { data: insertedTemplate, error: templateError } = await supabase
    .from('training_templates')
    .insert({
      name: input.name,
      description: input.description ?? null,
      user_id: DEFAULT_USER_ID,
    })
    .select()
    .single()

  if (templateError) {
    throw templateError
  }

  const templateId = (insertedTemplate as TrainingTemplateRow).id

  if (input.exercises.length > 0) {
    const { error: exercisesError } = await supabase.from('training_template_exercises').insert(
      input.exercises.map((exercise) => ({
        template_id: templateId,
        exercise_id: exercise.exerciseId,
        order_index: exercise.orderIndex,
        target_sets: exercise.targetSets ?? null,
        target_reps: exercise.targetReps ?? null,
        target_weight: exercise.targetWeight ?? null,
      })),
    )

    if (exercisesError) {
      throw exercisesError
    }
  }
}
