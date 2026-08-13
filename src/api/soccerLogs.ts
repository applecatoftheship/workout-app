import { supabase } from './client'
import { DEFAULT_USER_ID } from './trainingLogs'
import type { DateString, SoccerLog } from '../types'

type SoccerLogRow = {
  id: string
  user_id: string | null
  log_date: string
  activity_type: string
  training_menu: string | null
  duration_minutes: number | null
  distance_km: number | null
  sprint_count: number | null
  max_speed_kmh: number | null
  calories_burned: number | null
  notes: string | null
  created_at: string
}

function rowToSoccerLog(row: SoccerLogRow): SoccerLog {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    date: row.log_date as DateString,
    activityType: row.activity_type,
    trainingMenu: row.training_menu ?? undefined,
    durationMinutes: row.duration_minutes ?? undefined,
    distanceKm: row.distance_km ?? undefined,
    sprintCount: row.sprint_count ?? undefined,
    maxSpeedKmh: row.max_speed_kmh ?? undefined,
    caloriesBurned: row.calories_burned ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at as DateString,
  }
}

export type SoccerLogInput = {
  date: DateString
  activityType: string
  trainingMenu?: string
  durationMinutes?: number
  distanceKm?: number
  sprintCount?: number
  maxSpeedKmh?: number
  caloriesBurned?: number
  notes?: string
}

function inputToRow(input: SoccerLogInput) {
  return {
    user_id: DEFAULT_USER_ID,
    log_date: input.date,
    activity_type: input.activityType,
    training_menu: input.trainingMenu ?? null,
    duration_minutes: input.durationMinutes ?? null,
    distance_km: input.distanceKm ?? null,
    sprint_count: input.sprintCount ?? null,
    max_speed_kmh: input.maxSpeedKmh ?? null,
    calories_burned: input.caloriesBurned ?? null,
    notes: input.notes ?? null,
  }
}

export async function fetchSoccerLogs(startDate: string, endDate: string): Promise<SoccerLog[]> {
  const { data, error } = await supabase
    .from('soccer_logs')
    .select('*')
    .eq('user_id', DEFAULT_USER_ID)
    .gte('log_date', startDate)
    .lte('log_date', endDate)
    .order('log_date', { ascending: true })

  if (error) {
    throw error
  }

  return (data as SoccerLogRow[]).map(rowToSoccerLog)
}

export async function fetchSoccerLogByDate(date: string): Promise<SoccerLog | null> {
  const { data, error } = await supabase
    .from('soccer_logs')
    .select('*')
    .eq('user_id', DEFAULT_USER_ID)
    .eq('log_date', date)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data ? rowToSoccerLog(data as SoccerLogRow) : null
}

export async function createOrUpdateSoccerLog(input: SoccerLogInput): Promise<SoccerLog> {
  const { data, error } = await supabase
    .from('soccer_logs')
    .upsert(inputToRow(input), { onConflict: 'user_id,log_date' })
    .select()
    .single()

  if (error) {
    throw error
  }

  return rowToSoccerLog(data as SoccerLogRow)
}

export async function deleteSoccerLog(id: string): Promise<void> {
  const { error } = await supabase.from('soccer_logs').delete().eq('id', id)

  if (error) {
    throw error
  }
}
