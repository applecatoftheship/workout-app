import { useState } from 'react'
import type { DailyCondition, DateString, MealLog, SoccerLog, TrainingLog, TrainingSchedule, Workout } from '../../types'
import { formatConditionSummary, formatTrainingLogItem, getMealTypeLabel, toJstDateKeyFromIso } from '../../utils/calendarHelpers'

/**
 * カレンダー構造変更・記録モーダル・トレーニング刷新 実装指示書 Phase C（2026年8月16日）
 * MonthlyCalendarを閲覧専用にするための、記録タイプごとの読み取り専用サマリー表示。
 * 入力フォーム本体（TrainingLogForm等）は RecordFormModal 内でのみ使用し、
 * ここでは保存・削除ロジックには一切触れず、表示専用のコンポーネントとする。
 */

const scheduleStatusLabel: Record<TrainingSchedule['status'], string> = {
  scheduled: '予定',
  completed: '完了',
  cancelled: 'キャンセル',
}

// スプリント3：試合日（MD）基準の栄養・トレーニング調整（2026年8月18日）。
// ScheduleForm.tsx（編集モーダル内の一覧）と同じラベルだが、こちらは
// MonthlyCalendarの閲覧専用サマリー側で別コンポーネントとして定義されているため、
// 同じ内容を重複定義している（判断理由：共通化のための新規ファイル作成は
// 今回のバグ修正の範囲を超えるため見送った）。
const scheduleTypeLabel: Record<NonNullable<TrainingSchedule['scheduleType']>, string> = {
  practice: '練習',
  match: '試合',
  event: 'その他',
}

type TrainingSummaryProps = {
  trainingLogs: TrainingLog[]
  selectedDate: DateString
  onAdd: () => void
  onEdit: (index: number) => void
}

export function TrainingSummary({ trainingLogs, selectedDate, onAdd, onEdit }: TrainingSummaryProps) {
  const logs = trainingLogs.map((log, index) => ({ log, index })).filter(({ log }) => log.date === selectedDate)

  return (
    <div className="calendar-detail__section">
      <div className="calendar-detail__section-header">
        <h4>トレーニング実績</h4>
        <button type="button" className="calendar-detail__secondary-button" onClick={onAdd}>
          記録を追加
        </button>
      </div>
      {logs.length > 0 ? (
        <div className="calendar-detail__log-list">
          {logs.map(({ log, index }) => (
            <div key={`${selectedDate}-${index}`} className="calendar-detail__log-item">
              <div className="calendar-detail__log-head">
                <span>{log.completed ? '完了' : '未完了'}</span>
                <button type="button" className="calendar-detail__edit-button" onClick={() => onEdit(index)}>
                  編集
                </button>
              </div>
              <ul className="calendar-detail__exercise-list">
                {log.exercises.map((exercise, exerciseIndex) => (
                  <li key={`${selectedDate}-${index}-${exerciseIndex}`}>{formatTrainingLogItem(exercise)}</li>
                ))}
              </ul>
              {log.notes ? <p className="calendar-detail__description">メモ: {log.notes}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="calendar-detail__empty">🏋️ まだトレーニング記録がありません</p>
      )}
    </div>
  )
}

type ScheduleSummaryProps = {
  schedules: TrainingSchedule[]
  selectedDate: DateString
  onAdd: () => void
  onEdit: (scheduleId: string) => void
}

export function ScheduleSummary({ schedules, selectedDate, onAdd, onEdit }: ScheduleSummaryProps) {
  const daySchedules = schedules.filter((schedule) => schedule.scheduledDate === selectedDate)

  return (
    <div className="calendar-detail__section">
      <div className="calendar-detail__section-header">
        <h4>トレーニング予定</h4>
        <button type="button" className="calendar-detail__secondary-button" onClick={onAdd}>
          予定を追加
        </button>
      </div>
      {daySchedules.length > 0 ? (
        <div className="calendar-detail__log-list">
          {daySchedules.map((schedule) => (
            <div key={schedule.id} className="calendar-detail__log-item">
              <div className="calendar-detail__log-head">
                <span>
                  {schedule.emoji} {schedule.title}（{scheduleStatusLabel[schedule.status]}
                  {schedule.scheduleType && schedule.scheduleType !== 'practice'
                    ? `・${scheduleTypeLabel[schedule.scheduleType]}`
                    : ''}
                  ）
                </span>
                <button
                  type="button"
                  className="calendar-detail__edit-button"
                  onClick={() => schedule.id && onEdit(schedule.id)}
                >
                  編集
                </button>
              </div>
              {schedule.notes ? <p className="calendar-detail__description">メモ: {schedule.notes}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="calendar-detail__empty">📅 まだ予定がありません</p>
      )}
    </div>
  )
}

type ConditionSummaryProps = {
  dailyConditions: DailyCondition[]
  selectedDate: DateString
  onAdd: () => void
  onEdit: () => void
}

export function ConditionSummary({ dailyConditions, selectedDate, onAdd, onEdit }: ConditionSummaryProps) {
  const condition = dailyConditions.find((current) => current.date === selectedDate)

  return (
    <div className="calendar-detail__section">
      <div className="calendar-detail__section-header">
        <h4>体調</h4>
        <button type="button" className="calendar-detail__secondary-button" onClick={onAdd}>
          体調を記録
        </button>
      </div>
      {condition ? (
        <div className="calendar-detail__item">
          <p>{formatConditionSummary(condition)}</p>
          <div className="calendar-detail__condition-actions">
            <button type="button" className="calendar-detail__edit-button" onClick={onEdit}>
              編集
            </button>
          </div>
          {condition.notes ? <p className="calendar-detail__description">メモ: {condition.notes}</p> : null}
        </div>
      ) : (
        <p className="calendar-detail__empty">🌙 まだ体調記録がありません</p>
      )}
    </div>
  )
}

type MealSummaryProps = {
  mealLogs: MealLog[]
  selectedDate: DateString
  onAdd: () => void
  onEdit: (index: number) => void
}

export function MealSummary({ mealLogs, selectedDate, onAdd, onEdit }: MealSummaryProps) {
  const logs = mealLogs.map((mealLog, index) => ({ mealLog, index })).filter(({ mealLog }) => mealLog.date === selectedDate)
  const totals = logs.reduce(
    (acc, { mealLog }) => ({
      calories: acc.calories + mealLog.calories,
      protein: acc.protein + mealLog.protein,
      fat: acc.fat + mealLog.fat,
      carbohydrates: acc.carbohydrates + mealLog.carbohydrates,
    }),
    { calories: 0, protein: 0, fat: 0, carbohydrates: 0 },
  )

  return (
    <div className="calendar-detail__section">
      <div className="calendar-detail__section-header">
        <h4>食事記録</h4>
        <button type="button" className="calendar-detail__secondary-button" onClick={onAdd}>
          食事・PFCを記録
        </button>
      </div>
      {logs.length > 0 ? (
        <>
          <div className="calendar-detail__meal-totals">
            合計: {totals.calories}kcal / P{totals.protein}g F{totals.fat}g C{totals.carbohydrates}g
          </div>
          <div className="calendar-detail__log-list">
            {logs.map(({ mealLog, index }) => (
              <div key={`${selectedDate}-meal-${index}`} className="calendar-detail__meal-item">
                <div className="calendar-detail__meal-head">
                  <span>{getMealTypeLabel(mealLog.mealType)}</span>
                  <button type="button" className="calendar-detail__edit-button" onClick={() => onEdit(index)}>
                    編集
                  </button>
                </div>
                <div className="calendar-detail__meal-row">内容: {mealLog.foods.join('・')}</div>
                <div className="calendar-detail__meal-row">
                  カロリー: {mealLog.calories}kcal / P{mealLog.protein}g F{mealLog.fat}g C{mealLog.carbohydrates}g
                </div>
                {mealLog.notes ? <p className="calendar-detail__description">メモ: {mealLog.notes}</p> : null}
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="calendar-detail__empty">🍽️ まだ食事記録がありません</p>
      )}
    </div>
  )
}

type SoccerSummaryProps = {
  soccerLogs: SoccerLog[]
  selectedDate: DateString
  onAdd: () => void
  onEdit: () => void
}

export function SoccerSummary({ soccerLogs, selectedDate, onAdd, onEdit }: SoccerSummaryProps) {
  const log = soccerLogs.find((current) => current.date === selectedDate)

  return (
    <div className="calendar-detail__section">
      <div className="calendar-detail__section-header">
        <h4>サッカー</h4>
        <button type="button" className="calendar-detail__secondary-button" onClick={onAdd}>
          {log ? '記録を編集' : '記録を追加'}
        </button>
      </div>
      {log ? (
        <div className="calendar-detail__item">
          <p>
            ⚽ {log.activityType}
            {log.trainingMenu ? `（${log.trainingMenu}）` : ''}
            {log.durationMinutes !== undefined ? ` / ${log.durationMinutes}分` : ''}
            {log.caloriesBurned !== undefined ? ` / ${log.caloriesBurned}kcal` : ''}
          </p>
          {log.distanceKm !== undefined ? <p className="calendar-detail__description">走行距離: {log.distanceKm}km</p> : null}
          {log.sprintCount !== undefined ? <p className="calendar-detail__description">スプリント: {log.sprintCount}回</p> : null}
          {log.maxSpeedKmh !== undefined ? <p className="calendar-detail__description">最高速度: {log.maxSpeedKmh}km/h</p> : null}
          {log.notes ? <p className="calendar-detail__description">メモ: {log.notes}</p> : null}
          <div className="calendar-detail__condition-actions">
            <button type="button" className="calendar-detail__edit-button" onClick={onEdit}>
              編集
            </button>
          </div>
        </div>
      ) : (
        <p className="calendar-detail__empty">⚽ まだサッカー記録がありません</p>
      )}
    </div>
  )
}

// Apple Health連携 Task3（2026年8月27日）：読み取り専用のワークアウト一覧。
// 他のSummaryと異なりonAdd/onEditを持たない（手動での追加・編集UIは今回の
// スコープ外、api/sync-apple-health.ts経由での自動登録のみ）。1日に複数件
// 持ちうるため、SoccerSummary（1日1件前提のfind）ではなくTrainingSummaryの
// mapパターンを踏襲している。
function formatJstTime(isoString: string): string {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(isoString),
  )
}

type WorkoutSummaryProps = {
  workouts: Workout[]
  selectedDate: DateString
}

export function WorkoutSummary({ workouts, selectedDate }: WorkoutSummaryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const dayWorkouts = workouts.filter((workout) => toJstDateKeyFromIso(workout.startTime) === selectedDate)

  return (
    <div className="calendar-detail__section">
      <div className="calendar-detail__section-header">
        <h4>ワークアウト</h4>
      </div>
      {dayWorkouts.length > 0 ? (
        <div className="calendar-detail__log-list">
          {dayWorkouts.map((workout) => {
            const isExpanded = workout.id != null && expandedId === workout.id
            return (
              <button
                type="button"
                key={workout.id ?? workout.startTime}
                className="calendar-detail__item workout-summary__item"
                onClick={() => setExpandedId(isExpanded ? null : workout.id ?? null)}
              >
                <div className="workout-summary__head">
                  {/* activityTypeはoptional（2026年8月27日改修、Apple純正Shortcuts制約で
                      distance_meters・start_timeのみ送られてくるケースがあるため）。
                      未指定時は汎用ラベルにフォールバックする。 */}
                  <span>🏃 {workout.activityType ?? 'ワークアウト'}</span>
                  {workout.externalId ? <span className="workout-summary__watch-badge">⌚ Watch</span> : null}
                </div>
                <p className="calendar-detail__description">
                  {workout.durationSeconds != null ? `${Math.round(workout.durationSeconds / 60)}分` : ''}
                  {workout.distanceMeters != null ? ` / ${(workout.distanceMeters / 1000).toFixed(2)}km` : ''}
                  {workout.activeCalories != null ? ` / ${Math.round(workout.activeCalories)}kcal` : ''}
                  {workout.avgHeartRate != null ? ` / 平均心拍 ${Math.round(workout.avgHeartRate)}bpm` : ''}
                </p>
                {workout.notes ? <p className="calendar-detail__description">メモ: {workout.notes}</p> : null}
                {isExpanded && workout.externalId ? (
                  <p className="workout-summary__auto-note">
                    Apple Watchワークアウトにより自動記録（{formatJstTime(workout.startTime)}
                    {workout.endTime ? `〜${formatJstTime(workout.endTime)}` : ''}）
                  </p>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : (
        <p className="calendar-detail__empty">🏃 まだワークアウト記録がありません</p>
      )}
    </div>
  )
}
