import type { DateString, DailyCondition, MealType, TrainingLogExercise, TrainingSchedule } from '../types'

export const weekDays = ['日', '月', '火', '水', '木', '金', '土']

export function toDateKey(year: number, month: number, day: number): DateString {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as DateString
}

export function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
  }).format(date)
}

export function getScheduleDayIcon(daySchedules: TrainingSchedule[], dateKey: string, todayKey: string) {
  if (daySchedules.length === 0) {
    return ''
  }

  if (daySchedules.some((schedule) => schedule.status === 'completed')) {
    return '✅'
  }

  if (daySchedules.some((schedule) => schedule.status === 'cancelled' || (schedule.status === 'scheduled' && dateKey < todayKey))) {
    return '⚠️'
  }

  const nextScheduled = daySchedules.find((schedule) => schedule.status === 'scheduled')
  return nextScheduled?.emoji || '🏋️'
}

export function formatTrainingLogItem(exercise: TrainingLogExercise) {
  const name = exercise.exercise?.name ?? '不明な種目'

  if (exercise.sets.length === 0) {
    return `${name}（記録なし）`
  }

  const setSummary = exercise.sets
    .map((set) => {
      const weightText = set.weight != null ? `${set.weight}kg` : '-'
      const repsText = set.reps != null ? `${set.reps}回` : '-'
      return `${weightText}×${repsText}`
    })
    .join(', ')

  return `${name} ${exercise.sets.length}セット (${setSummary})`
}

export function formatConditionSummary(condition: DailyCondition) {
  return `${condition.weight.toFixed(1)}kg / ${condition.sleepHours.toFixed(1)}時間 / 疲労度${condition.fatigue}/5`
}

export function getMealTypeLabel(mealType: MealType) {
  switch (mealType) {
    case 'breakfast':
      return '朝食'
    case 'lunch':
      return '昼食'
    case 'dinner':
      return '夕食'
    case 'snack':
      return '間食'
    default:
      return 'その他'
  }
}
