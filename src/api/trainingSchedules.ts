import { supabase } from './client'
import { DEFAULT_USER_ID } from './trainingLogs'
import type { DateString, TrainingSchedule } from '../types'

type TrainingScheduleRow = {
  id: string
  user_id: string
  scheduled_date: string
  template_id: string | null
  title: string
  emoji: string
  status: TrainingSchedule['status']
  schedule_type: TrainingSchedule['scheduleType'] | null
  notes: string | null
  created_at: string
  updated_at: string
}

function rowToSchedule(row: TrainingScheduleRow): TrainingSchedule {
  return {
    id: row.id,
    userId: row.user_id,
    scheduledDate: row.scheduled_date as DateString,
    templateId: row.template_id ?? undefined,
    title: row.title,
    emoji: row.emoji,
    status: row.status,
    // DB列のデフォルトは'practice'。旧スキーマ時代の行でnullの場合も同じ扱いにする
    scheduleType: row.schedule_type ?? 'practice',
    notes: row.notes ?? undefined,
    createdAt: row.created_at as DateString,
    updatedAt: row.updated_at as DateString,
  }
}

type ScheduleInput = Omit<TrainingSchedule, 'id' | 'userId' | 'createdAt' | 'updatedAt'>

function scheduleInputToRow(schedule: ScheduleInput) {
  return {
    user_id: DEFAULT_USER_ID,
    scheduled_date: schedule.scheduledDate,
    template_id: schedule.templateId ?? null,
    title: schedule.title,
    emoji: schedule.emoji,
    status: schedule.status,
    schedule_type: schedule.scheduleType ?? 'practice',
    notes: schedule.notes ?? null,
  }
}

export async function fetchTrainingSchedules(startDate: string, endDate: string): Promise<TrainingSchedule[]> {
  const { data, error } = await supabase
    .from('training_schedules')
    .select('*')
    .eq('user_id', DEFAULT_USER_ID)
    .gte('scheduled_date', startDate)
    .lte('scheduled_date', endDate)
    .order('scheduled_date', { ascending: true })

  if (error) {
    throw error
  }

  return (data as TrainingScheduleRow[]).map(rowToSchedule)
}

export async function createSchedule(schedule: ScheduleInput): Promise<TrainingSchedule> {
  const { data, error } = await supabase
    .from('training_schedules')
    .insert(scheduleInputToRow(schedule))
    .select()
    .single()

  if (error) {
    throw error
  }

  return rowToSchedule(data as TrainingScheduleRow)
}

export async function bulkCreateSchedules(schedules: ScheduleInput[]): Promise<TrainingSchedule[]> {
  if (schedules.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('training_schedules')
    .insert(schedules.map(scheduleInputToRow))
    .select()

  if (error) {
    throw error
  }

  return (data as TrainingScheduleRow[]).map(rowToSchedule)
}

export async function updateSchedule(id: string, updates: Partial<TrainingSchedule>): Promise<TrainingSchedule> {
  const payload: Record<string, unknown> = {}
  if (updates.scheduledDate !== undefined) payload.scheduled_date = updates.scheduledDate
  if (updates.templateId !== undefined) payload.template_id = updates.templateId
  if (updates.title !== undefined) payload.title = updates.title
  if (updates.emoji !== undefined) payload.emoji = updates.emoji
  if (updates.status !== undefined) payload.status = updates.status
  if (updates.scheduleType !== undefined) payload.schedule_type = updates.scheduleType
  if (updates.notes !== undefined) payload.notes = updates.notes

  const { data, error } = await supabase.from('training_schedules').update(payload).eq('id', id).select().single()

  if (error) {
    throw error
  }

  return rowToSchedule(data as TrainingScheduleRow)
}

export async function deleteSchedule(id: string): Promise<void> {
  const { error } = await supabase.from('training_schedules').delete().eq('id', id)

  if (error) {
    throw error
  }
}

export async function deleteSchedulesInRange(startDate: string, endDate: string): Promise<void> {
  const { error } = await supabase
    .from('training_schedules')
    .delete()
    .eq('user_id', DEFAULT_USER_ID)
    .gte('scheduled_date', startDate)
    .lte('scheduled_date', endDate)

  if (error) {
    throw error
  }
}

export async function completeScheduleForDate(date: string, templateId?: string): Promise<void> {
  const { data, error } = await supabase
    .from('training_schedules')
    .select('*')
    .eq('user_id', DEFAULT_USER_ID)
    .eq('scheduled_date', date)
    .eq('status', 'scheduled')
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  const candidates = data as TrainingScheduleRow[]
  if (candidates.length === 0) {
    return
  }

  const target = (templateId ? candidates.find((row) => row.template_id === templateId) : undefined) ?? candidates[0]

  const { error: updateError } = await supabase.from('training_schedules').update({ status: 'completed' }).eq('id', target.id)

  if (updateError) {
    throw updateError
  }
}
