import { supabase } from './client'
import type { DailyCondition, DateString, FatigueLevel } from '../types'

type DailyConditionRow = {
  id: string
  log_date: string
  weight: number | null
  sleep_hours: number | null
  fatigue: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

function rowToDailyCondition(row: DailyConditionRow): DailyCondition {
  return {
    id: row.id,
    date: row.log_date as DateString,
    weight: row.weight ?? 0,
    sleepHours: row.sleep_hours ?? 0,
    fatigue: (row.fatigue ?? 3) as FatigueLevel,
    notes: row.notes ?? undefined,
    createdAt: row.created_at as DateString,
    updatedAt: row.updated_at as DateString,
  }
}

export async function fetchDailyConditions(): Promise<DailyCondition[]> {
  const { data, error } = await supabase
    .from('daily_conditions')
    .select('*')
    .order('log_date', { ascending: true })

  if (error) {
    throw error
  }

  return (data as DailyConditionRow[]).map(rowToDailyCondition)
}

export async function upsertDailyCondition(condition: DailyCondition): Promise<void> {
  const { error } = await supabase
    .from('daily_conditions')
    .upsert(
      {
        log_date: condition.date,
        weight: condition.weight,
        sleep_hours: condition.sleepHours,
        fatigue: condition.fatigue,
        notes: condition.notes ?? null,
      },
      { onConflict: 'log_date' },
    )

  if (error) {
    throw error
  }
}

export async function syncDailyConditions(conditions: DailyCondition[]): Promise<void> {
  const { data: remoteRows, error: fetchError } = await supabase
    .from('daily_conditions')
    .select('id, log_date')

  if (fetchError) {
    throw fetchError
  }

  const localDates = new Set(conditions.map((condition) => condition.date))
  const idsToDelete = (remoteRows as { id: string; log_date: string }[])
    .filter((row) => !localDates.has(row.log_date as DateString))
    .map((row) => row.id)

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase.from('daily_conditions').delete().in('id', idsToDelete)

    if (deleteError) {
      throw deleteError
    }
  }

  for (const condition of conditions) {
    await upsertDailyCondition(condition)
  }
}
