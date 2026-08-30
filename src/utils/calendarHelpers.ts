import type { DateString, DailyCondition, FirstDayOfWeek, MealLog, MealType, SoccerLog, TrainingLogExercise, TrainingSchedule, Workout } from '../types.js'
import type { ActivityType, CalendarCellItem } from '../types/calendar.js'
import { MUSCLE_LOCATION_LABELS, SORENESS_LEVEL_LABELS } from './acwrHelpers.js'

export const weekDays = ['日', '月', '火', '水', '木', '金', '土']

// 設定画面拡張 Phase 1（2026年8月28日）：カレンダー週始まり設定。weekDaysは
// 常に日曜始まり固定の配列のため、firstDayOfWeek（1:月曜/0:日曜）に応じて
// 表示順を並び替える。MonthlyCalendar.tsxの週見出し（calendar-weekdays）専用。
export function getOrderedWeekDayLabels(firstDayOfWeek: FirstDayOfWeek): string[] {
  return firstDayOfWeek === 1 ? [...weekDays.slice(1), weekDays[0]] : [...weekDays]
}

// 月グリッド（6週×7日=42マス）の開始日を求める。Date.getDay()は常に
// 日曜=0起算のため、firstDayOfWeekとのズレをoffsetとして差し引く。
// 例：1日が水曜（getDay()=3）でfirstDayOfWeek=1（月曜始まり）の場合、
// offset=(3-1+7)%7=2 → 月曜から始まるグリッドになる。
export function getCalendarGridStartDate(year: number, month: number, firstDayOfWeek: FirstDayOfWeek): Date {
  const firstDay = new Date(year, month, 1)
  const offset = (firstDay.getDay() - firstDayOfWeek + 7) % 7
  const startDate = new Date(firstDay)
  startDate.setDate(firstDay.getDate() - offset)
  return startDate
}

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

// meal_time/end_time（input type="time"用のHH:MM文字列 ⇔ timestamptz用の
// ISO文字列）の相互変換（スプリント4 Phase 1、2026年8月21日追加）。
// MealLogEditModal・TrainingExerciseEditModal・SoccerLogFormの3フォームで共通利用する。

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
// completeScheduleForDate（TrainingExerciseEditModal.tsx、旧TrainingLogForm.tsx）
// によりトレーニング実績保存時に
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

// トレーニング記録画面UI/UX刷新（種目カード＋編集モーダル分離、2026年8月28日）：
// 種目カード（TrainingExerciseCard.tsx）の本文でも同じセット単位の要約表示を
// 再利用するため、種目名を含まない部分だけを独立関数として切り出した。
// formatTrainingLogItemの戻り値（AIコメント生成・日次レポートで参照される
// フォーマット済み文字列）は変更しない。
export function formatSetSummary(sets: TrainingLogExercise['sets']) {
  if (sets.length === 0) {
    return '記録なし'
  }

  return sets
    .map((set) => {
      const weightText = set.weight != null ? `${set.weight}kg` : '-'
      const repsText = set.reps != null ? `${set.reps}回` : '-'
      return `${weightText}×${repsText}`
    })
    .join(', ')
}

export function formatTrainingLogItem(exercise: TrainingLogExercise) {
  const name = exercise.exercise?.name ?? '不明な種目'

  if (exercise.sets.length === 0) {
    return `${name}（記録なし）`
  }

  return `${name} ${exercise.sets.length}セット (${formatSetSummary(exercise.sets)})`
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

// 食事記録画面UI/UX刷新（meal_logエントリカード＋編集モーダル分離、2026年8月29日）：
// MealSummary（CalendarDaySummaries.tsx）の食事タイミング別グルーピング表示用。
// meal_logsは1日複数行が前提（同一mealTypeの複数件も許容）で、meal_type自体は
// 中間テーブルではなく各行が持つ属性のため、グルーピングは表示側のみで行う
// （DBスキーマは無変更）。記録が0件のタイミングは見出しごと表示しない。
export const MEAL_TYPE_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack', 'other']

export function groupMealLogsByType(
  mealLogs: MealLog[],
  selectedDate: DateString,
): { mealType: MealType; logs: MealLog[] }[] {
  const dayLogs = mealLogs.filter((log) => log.date === selectedDate)

  return MEAL_TYPE_ORDER.map((mealType) => ({
    mealType,
    // mealTime未設定のエントリはソート末尾に回す（Number.POSITIVE_INFINITYで比較）。
    // Array.prototype.sortは安定ソートのため、mealTime同士が同値・共に未設定の場合は
    // 元の配列順（fetchMealLogsのlog_date昇順取得順）を維持する。
    logs: dayLogs
      .filter((log) => log.mealType === mealType)
      .sort((a, b) => {
        const aTime = a.mealTime ? new Date(a.mealTime).getTime() : Number.POSITIVE_INFINITY
        const bTime = b.mealTime ? new Date(b.mealTime).getTime() : Number.POSITIVE_INFINITY
        return aTime - bTime
      }),
  })).filter((group) => group.logs.length > 0)
}
