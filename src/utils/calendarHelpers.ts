import type { DateString, DailyCondition, DailyProgram, MealType, MonthlyProgram, TrainingLogExercise } from '../types'

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

export function getProgramIcon(program: DailyProgram) {
  if (program.type === 'rest' || program.type === 'recovery') {
    return '💤'
  }
  if (program.type === 'cardio') {
    return '🏃'
  }
  if (program.type === 'mobility') {
    return '🧘'
  }
  return '💪'
}

export function getProgramLabel(program: DailyProgram) {
  if (program.type === 'rest' || program.type === 'recovery') {
    return '休養日'
  }

  if (program.type === 'cardio') {
    return '有酸素'
  }

  if (program.type === 'mobility') {
    return '可動域'
  }

  return program.title
}

export function getProgramSummary(program: DailyProgram) {
  if (program.type === 'rest' || program.type === 'recovery') {
    return '休養日'
  }

  if (!program.exercises.length && !program.cardio) {
    return program.title
  }

  const parts = [program.title]

  if (program.exercises.length > 0) {
    parts.push(`${program.exercises.length}種目`)
  }

  if (program.cardio) {
    parts.push(`${program.cardio.durationMinutes}分`)
  }

  return parts.join('・')
}

export function formatExerciseSummary(exercises: DailyProgram['exercises']) {
  if (exercises.length === 0) {
    return '記録なし'
  }

  return exercises
    .map((exercise) => `${exercise.name} ${exercise.sets}セット ${exercise.targetReps}`)
    .join(' / ')
}

export function formatCardioSummary(cardio: DailyProgram['cardio']) {
  if (!cardio) {
    return '記録なし'
  }

  return `${cardio.durationMinutes}分 / ${cardio.intensity} / ${cardio.notes ?? 'メモなし'}`
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

export function getProgramForDate(programs: MonthlyProgram | undefined, dateKey: DateString) {
  if (!programs) {
    return []
  }

  return programs.dailyPrograms.filter((program) => program.date === dateKey)
}
