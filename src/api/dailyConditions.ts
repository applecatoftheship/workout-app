import { getCurrentUserId, supabase } from './client'
import type { DailyCondition, DateString, FatigueLevel, MuscleLocation, SorenessLevel } from '../types'

type DailyConditionRow = {
  id: string
  log_date: string
  weight: number | null
  sleep_hours: number | null
  fatigue: number | null
  notes: string | null
  muscle_soreness_location: string | null
  muscle_soreness_level: string | null
  ai_comment: string | null
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
    muscleSorenessLocation: (row.muscle_soreness_location ?? 'none') as MuscleLocation,
    muscleSorenessLevel: (row.muscle_soreness_level ?? 'none') as SorenessLevel,
    aiComment: row.ai_comment ?? undefined,
    createdAt: row.created_at as DateString,
    updatedAt: row.updated_at as DateString,
  }
}

export async function fetchRecentWeight(beforeDate: DateString): Promise<number | null> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('daily_conditions')
    .select('weight')
    .eq('user_id', userId)
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
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('daily_conditions')
    .select('*')
    .eq('user_id', userId)
    .order('log_date', { ascending: true })

  if (error) {
    throw error
  }

  return (data as DailyConditionRow[]).map(rowToDailyCondition)
}

export async function upsertDailyCondition(condition: DailyCondition): Promise<void> {
  const userId = await getCurrentUserId()
  const { error } = await supabase
    .from('daily_conditions')
    .upsert(
      {
        user_id: userId,
        log_date: condition.date,
        weight: condition.weight,
        sleep_hours: condition.sleepHours,
        fatigue: condition.fatigue,
        notes: condition.notes ?? null,
        muscle_soreness_location: condition.muscleSorenessLocation ?? 'none',
        muscle_soreness_level: condition.muscleSorenessLevel ?? 'none',
      },
      { onConflict: 'user_id,log_date' },
    )

  if (error) {
    throw error
  }
}

// プロフィール機能（2026年8月27日）：ユーザー詳細画面の体重入力用。
// api/sync-apple-health.tsのhandleSleep（睡眠時間のみのupsert）と同じ「部分列
// upsert」パターンを踏襲し、user_id・log_date・weight以外の列（睡眠時間・疲労度・
// メモ等）には触れない。PostgRESTのupsertは渡した列のみをDO UPDATE SETするため、
// 今日のdaily_conditions行が既に他フォーム（ConditionForm.tsx）で作成されていても
// weight以外は上書きされない。既存の体重記録の保存先（daily_conditions）を
// 分断しないための実装（実装指示書の確認事項①への対応）。
export async function upsertWeightOnly(logDate: DateString, weight: number): Promise<void> {
  const userId = await getCurrentUserId()
  const { error } = await supabase
    .from('daily_conditions')
    .upsert({ user_id: userId, log_date: logDate, weight }, { onConflict: 'user_id,log_date' })

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
