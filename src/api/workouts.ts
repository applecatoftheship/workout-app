import { getCurrentUserId, supabase } from './client'
import type { DateString, Workout } from '../types'

type WorkoutRow = {
  id: string
  user_id: string | null
  external_id: string | null
  activity_type: string
  start_time: string
  end_time: string | null
  duration_seconds: number | null
  distance_meters: number | null
  active_calories: number | null
  avg_heart_rate: number | null
  is_primary: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

function rowToWorkout(row: WorkoutRow): Workout {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    externalId: row.external_id ?? undefined,
    activityType: row.activity_type,
    startTime: row.start_time,
    endTime: row.end_time ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    distanceMeters: row.distance_meters ?? undefined,
    activeCalories: row.active_calories ?? undefined,
    avgHeartRate: row.avg_heart_rate ?? undefined,
    isPrimary: row.is_primary,
    notes: row.notes ?? undefined,
    createdAt: row.created_at as DateString,
    updatedAt: row.updated_at as DateString,
  }
}

// workouts.start_timeはtimestamptzのため、JST基準の暦日範囲[startDate, endDate]を
// UTC境界に変換してから絞り込む（training_schedules・soccer_logs等のlog_date
// （dateカラム）を素直に.gte/.lteできるのとは異なる、timestamptz特有の変換）。
function jstDateRangeToUtc(startDate: DateString, endDate: DateString): { startUtc: string; endUtc: string } {
  const startUtc = new Date(`${startDate}T00:00:00+09:00`).toISOString()
  const endUtc = new Date(`${endDate}T00:00:00+09:00`)
  endUtc.setUTCDate(endUtc.getUTCDate() + 1)
  return { startUtc, endUtc: endUtc.toISOString() }
}

// カレンダー画面（MonthlyCalendar.tsx）が月範囲でtraining_schedules・soccer_logs等を
// まとめて取得しているのと同じパターン。一覧表示は読み取り専用のため、
// is_primary = trueの行のみを対象とする（統合済みの手動レコードはis_primary:
// falseになっており一覧には出さない、実装指示書の要件）。
export async function fetchWorkouts(startDate: DateString, endDate: DateString): Promise<Workout[]> {
  const userId = await getCurrentUserId()
  const { startUtc, endUtc } = jstDateRangeToUtc(startDate, endDate)

  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_primary', true)
    .gte('start_time', startUtc)
    .lt('start_time', endUtc)
    .order('start_time', { ascending: true })

  if (error) {
    throw error
  }

  return (data as WorkoutRow[]).map(rowToWorkout)
}
