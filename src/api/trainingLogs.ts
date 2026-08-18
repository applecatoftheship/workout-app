import { supabase } from './client'
import type { BodyPart, DateString, EquipmentType, ExerciseDefinition, TrainingLog, TrainingLogExercise, TrainingSet } from '../types'

export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000002'

// --- exercises (種目マスタ) ---

type ExerciseRow = {
  id: string
  name: string
  body_part: string
  equipment_type: string | null
  is_preset: boolean
  user_id: string | null
  created_at: string
}

function rowToExerciseDefinition(row: ExerciseRow): ExerciseDefinition {
  return {
    id: row.id,
    name: row.name,
    bodyPart: row.body_part as BodyPart,
    equipmentType: (row.equipment_type as EquipmentType | null) ?? undefined,
    isPreset: row.is_preset,
    userId: row.user_id ?? undefined,
    createdAt: row.created_at as DateString,
  }
}

export async function fetchExercises(): Promise<ExerciseDefinition[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .or(`is_preset.eq.true,user_id.eq.${DEFAULT_USER_ID}`)
    .order('name', { ascending: true })

  if (error) {
    throw error
  }

  return (data as ExerciseRow[]).map(rowToExerciseDefinition)
}

export async function createExercise(input: {
  name: string
  bodyPart: BodyPart
  equipmentType?: EquipmentType
}): Promise<ExerciseDefinition> {
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      name: input.name,
      body_part: input.bodyPart,
      equipment_type: input.equipmentType ?? null,
      is_preset: false,
      user_id: DEFAULT_USER_ID,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return rowToExerciseDefinition(data as ExerciseRow)
}

// --- training_logs ---

type TrainingLogRow = {
  id: string
  log_date: string
  user_id: string
  completed: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

type TrainingLogExerciseRow = {
  id: string
  training_log_id: string
  exercise_id: string
  order_index: number
}

type TrainingSetRow = {
  id: string
  training_log_exercise_id: string
  set_number: number
  weight: number | null
  reps: number | null
  is_warmup: boolean
  created_at: string
}

function rowToTrainingSet(row: TrainingSetRow): TrainingSet {
  return {
    id: row.id,
    setNumber: row.set_number,
    weight: row.weight ?? undefined,
    reps: row.reps ?? undefined,
    isWarmup: row.is_warmup,
    createdAt: row.created_at as DateString,
  }
}

function rowToTrainingLogExercise(
  row: TrainingLogExerciseRow,
  setRows: TrainingSetRow[],
  exerciseMap: Map<string, ExerciseDefinition>,
): TrainingLogExercise {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    orderIndex: row.order_index,
    exercise: exerciseMap.get(row.exercise_id),
    sets: setRows
      .filter((set) => set.training_log_exercise_id === row.id)
      .map(rowToTrainingSet)
      .sort((a, b) => a.setNumber - b.setNumber),
  }
}

function rowToTrainingLog(row: TrainingLogRow, exercises: TrainingLogExercise[]): TrainingLog {
  return {
    id: row.id,
    date: row.log_date as DateString,
    completed: row.completed,
    notes: row.notes ?? undefined,
    exercises,
    createdAt: row.created_at as DateString,
    updatedAt: row.updated_at as DateString,
  }
}

export async function fetchTrainingLogs(): Promise<TrainingLog[]> {
  const { data: logRows, error: logError } = await supabase
    .from('training_logs')
    .select('*')
    .eq('user_id', DEFAULT_USER_ID)
    .order('log_date', { ascending: true })

  if (logError) {
    throw logError
  }

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from('training_log_exercises')
    .select('*')

  if (exerciseError) {
    throw exerciseError
  }

  const { data: setRows, error: setError } = await supabase
    .from('training_sets')
    .select('*')

  if (setError) {
    throw setError
  }

  const exercises = await fetchExercises()
  const exerciseMap = new Map(exercises.map((exercise) => [exercise.id as string, exercise]))

  return (logRows as TrainingLogRow[]).map((row) => {
    const logExercises = (exerciseRows as TrainingLogExerciseRow[])
      .filter((exercise) => exercise.training_log_id === row.id)
      .map((exercise) => rowToTrainingLogExercise(exercise, setRows as TrainingSetRow[], exerciseMap))
      .sort((a, b) => a.orderIndex - b.orderIndex)

    return rowToTrainingLog(row, logExercises)
  })
}

export async function upsertTrainingLog(log: TrainingLog): Promise<void> {
  const { data: upsertedLog, error: logError } = await supabase
    .from('training_logs')
    .upsert(
      {
        id: log.id,
        user_id: DEFAULT_USER_ID,
        log_date: log.date,
        completed: log.completed,
        notes: log.notes ?? null,
      },
      { onConflict: 'user_id,log_date' },
    )
    .select()
    .single()

  if (logError) {
    throw logError
  }

  const trainingLogId = (upsertedLog as TrainingLogRow).id

  const { error: deleteExercisesError } = await supabase
    .from('training_log_exercises')
    .delete()
    .eq('training_log_id', trainingLogId)

  if (deleteExercisesError) {
    throw deleteExercisesError
  }

  for (const [index, exercise] of log.exercises.entries()) {
    const { data: insertedExercise, error: exerciseInsertError } = await supabase
      .from('training_log_exercises')
      .insert({
        training_log_id: trainingLogId,
        exercise_id: exercise.exerciseId,
        order_index: exercise.orderIndex ?? index,
      })
      .select()
      .single()

    if (exerciseInsertError) {
      throw exerciseInsertError
    }

    if (exercise.sets.length > 0) {
      const { error: setsInsertError } = await supabase.from('training_sets').insert(
        exercise.sets.map((set) => ({
          training_log_exercise_id: (insertedExercise as TrainingLogExerciseRow).id,
          set_number: set.setNumber,
          weight: set.weight ?? null,
          reps: set.reps ?? null,
          is_warmup: set.isWarmup,
        })),
      )

      if (setsInsertError) {
        throw setsInsertError
      }
    }
  }
}

// --- 前回記録の自動入力（技術指示書Phase F-2、2026年8月16日） ---

export type LatestExerciseRecord = {
  setsCount: number
  reps: number | null
  weight: number | null
  logDate: DateString
}

export async function fetchLatestExerciseRecord(exerciseId: string): Promise<LatestExerciseRecord | null> {
  const { data: exerciseRows, error: exerciseError } = await supabase
    .from('training_log_exercises')
    .select('id, training_log_id')
    .eq('exercise_id', exerciseId)

  if (exerciseError) {
    throw exerciseError
  }

  const rows = exerciseRows as { id: string; training_log_id: string }[]
  if (rows.length === 0) {
    return null
  }

  const trainingLogIds = Array.from(new Set(rows.map((row) => row.training_log_id)))

  const { data: logRows, error: logError } = await supabase
    .from('training_logs')
    .select('id, log_date')
    .eq('user_id', DEFAULT_USER_ID)
    .in('id', trainingLogIds)
    .order('log_date', { ascending: false })
    .limit(1)

  if (logError) {
    throw logError
  }

  const latestLog = (logRows as { id: string; log_date: string }[])[0]
  if (!latestLog) {
    return null
  }

  const latestExerciseRow = rows.find((row) => row.training_log_id === latestLog.id)
  if (!latestExerciseRow) {
    return null
  }

  const { data: setRows, error: setError } = await supabase
    .from('training_sets')
    .select('set_number, reps, weight')
    .eq('training_log_exercise_id', latestExerciseRow.id)
    .order('set_number', { ascending: true })

  if (setError) {
    throw setError
  }

  const sets = setRows as { set_number: number; reps: number | null; weight: number | null }[]
  if (sets.length === 0) {
    return null
  }

  return {
    setsCount: sets.length,
    reps: sets[0].reps,
    weight: sets[0].weight,
    logDate: latestLog.log_date as DateString,
  }
}

export async function deleteTrainingLogRemote(id: string): Promise<void> {
  const { error } = await supabase.from('training_logs').delete().eq('id', id).eq('user_id', DEFAULT_USER_ID)

  if (error) {
    throw error
  }
}

// training_sets は training_log_exercise_id に on delete cascade が設定されているため、
// このテーブルの行を削除するだけで配下のセットも自動的に削除される。
// user_idでの絞り込みは、RLSが全許可のためセキュリティ境界にはならないが、
// アプリ側の誤操作（他ユーザーのIDを誤って渡すバグ等）を防ぐガードとして付与している
// （技術的負債5番、2026年8月18日の調査を踏まえた対応）。
export async function deleteTrainingLogExerciseRemote(id: string): Promise<void> {
  const { error } = await supabase.from('training_log_exercises').delete().eq('id', id).eq('user_id', DEFAULT_USER_ID)

  if (error) {
    throw error
  }
}
