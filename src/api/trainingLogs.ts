import { supabase } from './client'
import type { DateString, TrainingLog } from '../types'

type TrainingLogRow = {
  id: string
  log_date: string
  completed: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

type TrainingLogExerciseRow = {
  id: string
  training_log_id: string
  name: string
  sets: number
  target_reps: string
  target_weight: string | null
}

function rowToTrainingLog(row: TrainingLogRow, exerciseRows: TrainingLogExerciseRow[]): TrainingLog {
  return {
    id: row.id,
    date: row.log_date as DateString,
    completed: row.completed,
    notes: row.notes ?? undefined,
    exercises: exerciseRows.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      sets: exercise.sets,
      targetReps: exercise.target_reps,
      targetWeight: exercise.target_weight ?? undefined,
    })),
    createdAt: row.created_at as DateString,
    updatedAt: row.updated_at as DateString,
  }
}

export async function fetchTrainingLogs(): Promise<TrainingLog[]> {
  const { data: logRows, error: logError } = await supabase
    .from('training_logs')
    .select('*')
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

  return (logRows as TrainingLogRow[]).map((row) =>
    rowToTrainingLog(
      row,
      (exerciseRows as TrainingLogExerciseRow[]).filter((exercise) => exercise.training_log_id === row.id),
    ),
  )
}

export async function upsertTrainingLog(log: TrainingLog): Promise<void> {
  const { data: upsertedLog, error: logError } = await supabase
    .from('training_logs')
    .upsert(
      {
        id: log.id,
        log_date: log.date,
        completed: log.completed,
        notes: log.notes ?? null,
      },
      { onConflict: 'log_date' },
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

  if (log.exercises.length > 0) {
    const { error: insertError } = await supabase.from('training_log_exercises').insert(
      log.exercises.map((exercise) => ({
        training_log_id: trainingLogId,
        name: exercise.name,
        sets: exercise.sets,
        target_reps: exercise.targetReps,
        target_weight: exercise.targetWeight ?? null,
      })),
    )

    if (insertError) {
      throw insertError
    }
  }
}

export async function syncTrainingLogs(logs: TrainingLog[]): Promise<void> {
  const { data: remoteRows, error: fetchError } = await supabase
    .from('training_logs')
    .select('id, log_date')

  if (fetchError) {
    throw fetchError
  }

  const localDates = new Set(logs.map((log) => log.date))
  const idsToDelete = (remoteRows as { id: string; log_date: string }[])
    .filter((row) => !localDates.has(row.log_date as DateString))
    .map((row) => row.id)

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase.from('training_logs').delete().in('id', idsToDelete)

    if (deleteError) {
      throw deleteError
    }
  }

  for (const log of logs) {
    await upsertTrainingLog(log)
  }
}
