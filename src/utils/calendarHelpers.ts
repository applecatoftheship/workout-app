import type { DateString, DailyCondition, MealType, SoccerLog, TrainingLogExercise, TrainingSchedule } from '../types'
import type { ActivityType, CalendarCellItem } from '../types/calendar'
import { MUSCLE_LOCATION_LABELS, SORENESS_LEVEL_LABELS } from './acwrHelpers'

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

// カレンダー実績アイコン機能（日付ベース簡易マッチング方式、2026年8月20〜21日）：
// その日の複数training_schedules行から表示する絵文字を1つ選ぶ部分のみを
// 独立させたもの。cancelled行のみ除外し、scheduled/completedの中から
// 最初に見つかった1件の絵文字を使う。ステータスに応じたアイコン切り替え
// （✅/⚠️等）はgetCalendarCellState側の責務に分離した。
// 注意（2026年8月21日修正）：当初はscheduled行のみを対象としていたが、
// completeScheduleForDate（TrainingLogForm.tsx）によりトレーニング実績保存時に
// 対応するtraining_schedules.statusがscheduled→completedへ自動変更されるため、
// scheduled限定のままだとcompleted_planned判定時に対象の予定が見つからず、
// 常にデフォルト🏋️にフォールバックしてしまい「完了予定でもカスタム絵文字を
// 維持する」という設計意図が機能しなかった。cancelled以外を対象にすることで解消した。
export function getScheduleIcon(daySchedules: TrainingSchedule[]): string {
  const target = daySchedules.find((schedule) => schedule.status !== 'cancelled')
  return target?.emoji || '🏋️'
}

// その日に予定（cancelled以外）・実績（training_logs/soccer_logs）が
// それぞれ存在するかを日付単位でSet集計する。MonthlyCalendar・Dashboardの
// 週間ストリップ双方から同一ロジックを参照し、判定基準がずれないようにする。
export function buildActivityByDate(
  schedulesByDate: Map<string, TrainingSchedule[]>,
  soccerLogsByDate: Map<string, SoccerLog[]>,
): Map<string, Set<ActivityType>> {
  const map = new Map<string, Set<ActivityType>>()

  const addActivity = (dateKey: string, type: ActivityType) => {
    const set = map.get(dateKey) ?? new Set<ActivityType>()
    set.add(type)
    map.set(dateKey, set)
  }

  schedulesByDate.forEach((daySchedules, dateKey) => {
    if (daySchedules.some((schedule) => schedule.status !== 'cancelled')) {
      addActivity(dateKey, 'workout')
    }
  })

  soccerLogsByDate.forEach((daySoccerLogs, dateKey) => {
    if (daySoccerLogs.length > 0) {
      addActivity(dateKey, 'soccer')
    }
  })

  return map
}

export interface GetCellStateParams {
  isPast: boolean
  hasSchedule: boolean // 当日にcancelled以外のtraining_schedulesが存在するか
  scheduleIcon: string // getScheduleIconで選定した表示絵文字
  hasTrainingLog: boolean
  hasSoccerLog: boolean
}

// 予定と実績を日付ベースで突き合わせ、カレンダーセルに表示するアイテムを
// 判定する（日付ベース簡易マッチング方式）。「未達成の過去予定」
// （hasSchedule && isPast && !hasTrainingLog）は意図的に何も追加しない
// （＝missedはセル非表示）。
export function getCalendarCellState(params: GetCellStateParams): CalendarCellItem[] {
  const { isPast, hasSchedule, scheduleIcon, hasTrainingLog, hasSoccerLog } = params
  const items: CalendarCellItem[] = []

  if (hasTrainingLog) {
    items.push({
      type: 'workout',
      icon: scheduleIcon || '🏋️',
      status: hasSchedule ? 'completed_planned' : 'completed_unplanned',
    })
  } else if (hasSchedule && !isPast) {
    items.push({
      type: 'workout',
      icon: scheduleIcon || '🏋️',
      status: 'planned',
    })
  }

  if (hasSoccerLog) {
    items.push({ type: 'soccer', icon: '⚽', status: 'completed_unplanned' })
  }

  return items
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
  const base = `${condition.weight.toFixed(1)}kg / ${condition.sleepHours.toFixed(1)}時間 / 疲労度${condition.fatigue}/5`

  const level = condition.muscleSorenessLevel
  if (!level || level === 'none') {
    return base
  }

  const location = condition.muscleSorenessLocation
  const locationLabel = location && location !== 'none' ? MUSCLE_LOCATION_LABELS[location] : '部位未指定'
  const levelLabel = SORENESS_LEVEL_LABELS[level]
  return `${base} / 局所疲労: ${locationLabel}（${levelLabel}）`
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
