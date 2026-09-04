import { getCurrentUserId, supabase } from './client'
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
  end_time: string | null
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
    endTime: row.end_time ?? undefined,
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
  // この活動の終了時刻（ISO 8601、timestamptz。スプリント4 Phase 1追加）。
  // 未指定の場合はNULLのまま保存する。
  endTime?: string
}

function inputToRow(input: SoccerLogInput, userId: string) {
  return {
    user_id: userId,
    log_date: input.date,
    activity_type: input.activityType,
    training_menu: input.trainingMenu ?? null,
    duration_minutes: input.durationMinutes ?? null,
    distance_km: input.distanceKm ?? null,
    sprint_count: input.sprintCount ?? null,
    max_speed_kmh: input.maxSpeedKmh ?? null,
    calories_burned: input.caloriesBurned ?? null,
    notes: input.notes ?? null,
    end_time: input.endTime ?? null,
  }
}

export async function fetchSoccerLogs(startDate: string, endDate: string): Promise<SoccerLog[]> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('soccer_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('log_date', startDate)
    .lte('log_date', endDate)
    .order('log_date', { ascending: true })

  if (error) {
    throw error
  }

  return (data as SoccerLogRow[]).map(rowToSoccerLog)
}

export async function createOrUpdateSoccerLog(input: SoccerLogInput): Promise<SoccerLog> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('soccer_logs')
    .upsert(inputToRow(input, userId), { onConflict: 'user_id,log_date' })
    .select()
    .single()

  if (error) {
    throw error
  }

  return rowToSoccerLog(data as SoccerLogRow)
}

export async function deleteSoccerLog(id: string): Promise<void> {
  // user_id ガード（2026年9月4日、技術的負債#5関連）：他の delete-by-id 関数と
  // 同じく誤操作防止（セキュリティ境界ではない。詳細は deleteDailyConditionRemote 参照）。
  const userId = await getCurrentUserId()
  const { error } = await supabase.from('soccer_logs').delete().eq('id', id).eq('user_id', userId)

  if (error) {
    throw error
  }
}
