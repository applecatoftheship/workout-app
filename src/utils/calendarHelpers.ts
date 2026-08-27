import type { DateString, DailyCondition, MealType, SoccerLog, TrainingLogExercise, TrainingSchedule, Workout } from '../types'
import type { ActivityType, CalendarCellItem } from '../types/calendar'
import { MUSCLE_LOCATION_LABELS, SORENESS_LEVEL_LABELS } from './acwrHelpers'

export const weekDays = ['日', '月', '火', '水', '木', '金', '土']

export function toDateKey(year: number, month: number, day: number): DateString {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as DateString
}

// Apple Health連携（2026年8月27日）：workouts.start_time等のtimestamptz（ISO 8601
// 文字列）から、JST基準の暦日（YYYY-MM-DD）を求める。api/sync-apple-health.tsの
// toJstDateKeyと同じ換算方式（Asia/Tokyoタイムゾーンでフォーマット）だが、
// あちらはサーバー側（api/）専用ファイルのためimportせず、同じロジックを
// クライアント側ユーティリティとしてこちらに個別実装している。
export function toJstDateKeyFromIso(isoString: string): DateString {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(isoString))
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return `${year}-${month}-${day}` as DateString
}

export function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
  }).format(date)
}

// リカバリー窓機能（スプリント4 Phase 1、2026年8月21日）：meal_time/end_time
// （input type="time"用のHH:MM文字列 ⇔ timestamptz用のISO文字列）の相互変換。
// MealLogForm・TrainingLogForm・SoccerLogFormの3フォームで共通利用する。

export function getCurrentTimeHHMM(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

// dateはそのレコードが属する日付（log_date）、timeはinput type="time"の値（HH:MM）。
// ブラウザのローカルタイムゾーンで解釈したうえでUTCのISO文字列に変換するため、
// timestamptz列にサーバー側のタイムゾーン設定に依存せず一意に保存できる。
export function combineDateAndTimeToISO(date: DateString, time: string): string {
  return new Date(`${date}T${time}`).toISOString()
}

export function extractTimeHHMMFromISO(iso: string): string {
  const parsed = new Date(iso)
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`
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
  workoutsByDate?: Map<string, Workout[]>,
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

  // Apple Health連携（2026年8月27日）：workoutsByDate引数は省略可能とし、既存の
  // buildActivityByDate(schedulesByDate, soccerLogsByDate)呼び出し（テスト等）を
  // 壊さないようにしている。呼び出し側はis_primary = trueの行のみを渡す前提
  // （Task3で確立した既存パターン、fetchWorkoutsが既にサーバー側でフィルタ済み）。
  workoutsByDate?.forEach((dayWorkouts, dateKey) => {
    if (dayWorkouts.length > 0) {
      addActivity(dateKey, 'appleWorkout')
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
  // Apple Health連携（2026年8月27日）：省略時はfalse扱い（既存呼び出しを壊さない）。
  hasAppleWorkout?: boolean
}

// 予定と実績を日付ベースで突き合わせ、カレンダーセルに表示するアイテムを
// 判定する（日付ベース簡易マッチング方式）。「未達成の過去予定」
// （hasSchedule && isPast && !hasTrainingLog）は意図的に何も追加しない
// （＝missedはセル非表示）。
export function getCalendarCellState(params: GetCellStateParams): CalendarCellItem[] {
  const { isPast, hasSchedule, scheduleIcon, hasTrainingLog, hasSoccerLog, hasAppleWorkout } = params
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

  // Apple Watchワークアウトには「予定」の概念が無い（training_schedulesのような
  // 事前登録が無く、常に自動記録＝実績のみ）ため、soccerと同じくstatusは
  // 常にcompleted_unplanned固定とする。
  if (hasAppleWorkout) {
    items.push({ type: 'appleWorkout', icon: '🏃', status: 'completed_unplanned' })
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
