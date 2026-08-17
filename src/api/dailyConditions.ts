import { supabase } from './client'
import { DEFAULT_USER_ID } from './trainingLogs'
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

export async function fetchRecentWeight(beforeDate: DateString): Promise<number | null> {
  const { data, error } = await supabase
    .from('daily_conditions')
    .select('weight')
    .eq('user_id', DEFAULT_USER_ID)
    .lte('log_date', beforeDate)
    .order('log_date', { ascending: false })
    .limit(1)

  if (error) {
    throw error
  }

  const rows = data as { weight: number | null }[]
  return rows[0]?.weight ?? null
}

export async function fetchDailyConditions(): Promise<DailyCondition[]> {
  const { data, error } = await supabase
    .from('daily_conditions')
    .select('*')
    .eq('user_id', DEFAULT_USER_ID)
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
        user_id: DEFAULT_USER_ID,
        log_date: condition.date,
        weight: condition.weight,
        sleep_hours: condition.sleepHours,
        fatigue: condition.fatigue,
        notes: condition.notes ?? null,
      },
      { onConflict: 'user_id,log_date' },
    )

  if (error) {
    throw error
  }
}

export async function deleteDailyConditionRemote(id: string): Promise<void> {
  const { error } = await supabase.from('daily_conditions').delete().eq('id', id)

  if (error) {
    throw error
  }
}
