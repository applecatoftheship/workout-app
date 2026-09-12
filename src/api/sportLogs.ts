import { getCurrentUserId, supabase } from './client'
import type { DateString, SportLog } from '../types'

// スポーツ記録機能（Tier 4-2：競技の拡張、2026年9月12日）：src/api/soccerLogs.ts と
// 完全に同じパターン（1ユーザー1日1行、upsert onConflict: 'user_id,log_date'）。

type SportLogRow = {
  id: string
  user_id: string | null
  log_date: string
  sport_type: string
  custom_sport_name: string | null
  duration_minutes: number
  rpe: number | null
  calories_burned: number | null
  result_note: string | null
  notes: string | null
  created_at: string
}

function rowToSportLog(row: SportLogRow): SportLog {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    date: row.log_date as DateString,
    sportType: row.sport_type,
    customSportName: row.custom_sport_name ?? undefined,
    durationMinutes: row.duration_minutes,
    rpe: row.rpe ?? undefined,
    caloriesBurned: row.calories_burned ?? undefined,
    resultNote: row.result_note ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at as DateString,
  }
}

export type SportLogInput = {
  date: DateString
  sportType: string
  customSportName?: string
  durationMinutes: number
  rpe?: number
  caloriesBurned?: number
  resultNote?: string
  notes?: string
}

function inputToRow(input: SportLogInput, userId: string) {
  return {
    user_id: userId,
    log_date: input.date,
    sport_type: input.sportType,
    custom_sport_name: input.customSportName ?? null,
    duration_minutes: input.durationMinutes,
    rpe: input.rpe ?? null,
    calories_burned: input.caloriesBurned ?? null,
    result_note: input.resultNote ?? null,
    notes: input.notes ?? null,
  }
}

export async function fetchSportLogs(startDate: string, endDate: string): Promise<SportLog[]> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('sport_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('log_date', startDate)
    .lte('log_date', endDate)
    .order('log_date', { ascending: true })

  if (error) {
    throw error
  }

  return (data as SportLogRow[]).map(rowToSportLog)
}

export async function createOrUpdateSportLog(input: SportLogInput): Promise<SportLog> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('sport_logs')
    .upsert(inputToRow(input, userId), { onConflict: 'user_id,log_date' })
    .select()
    .single()

  if (error) {
    throw error
  }

  return rowToSportLog(data as SportLogRow)
}

export async function deleteSportLog(id: string): Promise<void> {
  // user_id ガード（soccer_logsのdeleteSoccerLogと同じ、誤操作防止。
  // セキュリティ境界ではない。詳細はdeleteDailyConditionRemote参照）。
  const userId = await getCurrentUserId()
  const { error } = await supabase.from('sport_logs').delete().eq('id', id).eq('user_id', userId)

  if (error) {
    throw error
  }
}
