import type { Dispatch, SetStateAction } from 'react'
import { calculateDailyRecoveryResults, DEFAULT_RECOVERY_WINDOW_CONFIG } from '../../utils/recoveryHelpers'
import { formatConditionSummary, formatTrainingLogItem, getMealTypeLabel, toJstDateKeyFromIso } from '../../utils/calendarHelpers'
import { RecoveryWindowCard } from '../RecoveryWindowCard'
import { AiCommentCard } from '../AiCommentCard'
import { useDailyAiComment } from '../../hooks/useDailyAiComment'
import { CloseIcon } from '../icons'
import type { DailyCondition, DateString, MealLog, SoccerLog, TrainingLog, TrainingSchedule, Workout } from '../../types'
import './DailyReportModal.css'

// カレンダー「詳細」バッジ：日次レポート機能（Phase 2、2026年8月22日）。
// タブUI（トレーニング/予定/体調/食事/サッカー）が「1カテゴリずつ見る」ためのもの
// なのに対し、こちらは「その日1日を全カテゴリまとめて振り返る」ための読み取り専用
// ビュー。CalendarDaySummaries.tsx（タブ用の編集可能なサマリー）とは別コンポーネント
// とし、記録の追加・編集ボタンは一切持たない（編集は従来通りタブUI側で行う）。

const scheduleStatusLabel: Record<TrainingSchedule['status'], string> = {
  scheduled: '予定',
  completed: '完了',
  cancelled: 'キャンセル',
}

// CalendarDaySummaries.tsxのscheduleTypeLabelと同一内容を重複定義している
// （同ファイル内の既存コメント通り、共通化のための新規ファイル作成は今回の
// スコープを超えるため見送った判断を踏襲）。
const scheduleTypeLabel: Record<NonNullable<TrainingSchedule['scheduleType']>, string> = {
  practice: '練習',
  match: '試合',
  event: 'その他',
}

type DailyReportModalProps = {
  selectedDate: DateString
  trainingLogs: TrainingLog[]
  schedules: TrainingSchedule[]
  dailyConditions: DailyCondition[]
  mealLogs: MealLog[]
  soccerLogs: SoccerLog[]
  // Apple Health連携 Task4（2026年8月27日）：workoutsテーブル新設（Task1）より
  // 後に実装された日次レポートは、当初このテーブルを参照していなかった
  // （Johnさんからの指摘を受けて追加）。fetchWorkoutsが既にis_primary=trueの
  // 行のみを返すため、ここでの追加フィルタは不要（CalendarDaySummaries.tsxの
  // WorkoutSummaryと同じ前提）。
  workouts: Workout[]
  setDailyConditions: Dispatch<SetStateAction<DailyCondition[]>>
  onClose: () => void
}

export function DailyReportModal({
  selectedDate,
  trainingLogs,
  schedules,
  dailyConditions,
  mealLogs,
  soccerLogs,
  workouts,
  setDailyConditions,
  onClose,
}: DailyReportModalProps) {
  const dayTrainingLogs = trainingLogs.filter((log) => log.date === selectedDate)
  const daySchedules = schedules.filter((schedule) => schedule.scheduledDate === selectedDate)
  const condition = dailyConditions.find((current) => current.date === selectedDate)
  const dayMealLogs = mealLogs.filter((log) => log.date === selectedDate)
  const soccerLog = soccerLogs.find((log) => log.date === selectedDate)
  // workouts.start_timeはtimestamptzのため、CalendarDaySummaries.tsxの
  // WorkoutSummaryと同じくtoJstDateKeyFromIsoでJST暦日に変換してから絞り込む
  // （log_dateのような単純な日付カラムでの比較はできない）。
  const dayWorkouts = workouts.filter((workout) => toJstDateKeyFromIso(workout.startTime) === selectedDate)

  const {
    isGenerating: isGeneratingAiComment,
    canRegenerate: canRegenerateAiComment,
    regenerate: regenerateAiComment,
  } = useDailyAiComment({
    condition,
    selectedDate,
    dailyConditions,
    setDailyConditions,
  })

  const mealTotals = dayMealLogs.reduce(
    (acc, log) => ({
      calories: acc.calories + log.calories,
      protein: acc.protein + log.protein,
      fat: acc.fat + log.fat,
      carbohydrates: acc.carbohydrates + log.carbohydrates,
    }),
    { calories: 0, protein: 0, fat: 0, carbohydrates: 0 },
  )

  // リカバリー窓：既存のcalculateDailyRecoveryResultsをそのまま流用し、新規の
  // DBクエリ・独自ロジックは追加しない。nowには常に「現在時刻」を渡すため、
  // 過去日を見ている場合はcompleted/missedが、当日進行中ならactiveが正しく
  // 算出される（Dashboard.tsxでの使われ方と同じ）。
  const now = new Date()
  const recoveryResults = calculateDailyRecoveryResults(
    trainingLogs,
    soccerLogs,
    mealLogs,
    selectedDate,
    now,
    DEFAULT_RECOVERY_WINDOW_CONFIG,
    workouts,
  )

  return (
    <div className="daily-report-modal__overlay" role="presentation" onClick={onClose}>
      <div
        className="daily-report-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${selectedDate}の日次レポート`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="daily-report-modal__header">
          <h3>{selectedDate}の日次レポート</h3>
          <button type="button" className="daily-report-modal__close" onClick={onClose} aria-label="閉じる">
            <CloseIcon />
          </button>
        </div>

        <div className="daily-report-modal__body">
          <section className="daily-report__section">
            <h4>トレーニング実績</h4>
            {dayTrainingLogs.length > 0 ? (
              <div className="daily-report__log-list">
                {dayTrainingLogs.map((log, index) => (
                  <div key={log.id ?? index} className="daily-report__item">
                    <p className="daily-report__item-head">{log.completed ? '完了' : '未完了'}</p>
                    <ul className="daily-report__exercise-list">
                      {log.exercises.map((exercise, exerciseIndex) => (
                        <li key={exercise.id ?? exerciseIndex}>{formatTrainingLogItem(exercise)}</li>
                      ))}
                    </ul>
                    {log.notes ? <p className="daily-report__note">メモ: {log.notes}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="daily-report__empty">記録なし</p>
            )}
          </section>

          <section className="daily-report__section">
            <h4>予定</h4>
            {daySchedules.length > 0 ? (
              <div className="daily-report__log-list">
                {daySchedules.map((schedule) => (
                  <div key={schedule.id} className="daily-report__item">
                    <p className="daily-report__item-head">
                      {schedule.emoji} {schedule.title}（{scheduleStatusLabel[schedule.status]}
                      {schedule.scheduleType && schedule.scheduleType !== 'practice'
                        ? `・${scheduleTypeLabel[schedule.scheduleType]}`
                        : ''}
                      ）
                    </p>
                    {schedule.notes ? <p className="daily-report__note">メモ: {schedule.notes}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="daily-report__empty">記録なし</p>
            )}
          </section>

          <section className="daily-report__section">
            <h4>体調</h4>
            {condition ? (
              <div className="daily-report__item">
                <p>{formatConditionSummary(condition)}</p>
                {condition.notes ? <p className="daily-report__note">メモ: {condition.notes}</p> : null}
                <AiCommentCard
                  comment={condition.aiComment}
                  isGenerating={isGeneratingAiComment}
                  onRegenerate={canRegenerateAiComment ? regenerateAiComment : undefined}
                />
              </div>
            ) : (
              <p className="daily-report__empty">記録なし</p>
            )}
          </section>

          <section className="daily-report__section">
            <h4>食事・PFC</h4>
            {dayMealLogs.length > 0 ? (
              <>
                <p className="daily-report__meal-totals">
                  合計: {mealTotals.calories}kcal / P{mealTotals.protein}g F{mealTotals.fat}g C{mealTotals.carbohydrates}g
                </p>
                <div className="daily-report__log-list">
                  {dayMealLogs.map((log, index) => (
                    <div key={log.id ?? index} className="daily-report__item">
                      <p className="daily-report__item-head">{getMealTypeLabel(log.mealType)}</p>
                      <p>内容: {log.foods.join('・')}</p>
                      <p>
                        カロリー: {log.calories}kcal / P{log.protein}g F{log.fat}g C{log.carbohydrates}g
                      </p>
                      {log.notes ? <p className="daily-report__note">メモ: {log.notes}</p> : null}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="daily-report__empty">記録なし</p>
            )}
          </section>

          <section className="daily-report__section">
            <h4>サッカー</h4>
            {soccerLog ? (
              <div className="daily-report__item">
                <p>
                  ⚽ {soccerLog.activityType}
                  {soccerLog.trainingMenu ? `（${soccerLog.trainingMenu}）` : ''}
                  {soccerLog.durationMinutes !== undefined ? ` / ${soccerLog.durationMinutes}分` : ''}
                  {soccerLog.caloriesBurned !== undefined ? ` / ${soccerLog.caloriesBurned}kcal` : ''}
                </p>
                {soccerLog.distanceKm !== undefined ? (
                  <p className="daily-report__note">走行距離: {soccerLog.distanceKm}km</p>
                ) : null}
                {soccerLog.sprintCount !== undefined ? (
                  <p className="daily-report__note">スプリント: {soccerLog.sprintCount}回</p>
                ) : null}
                {soccerLog.maxSpeedKmh !== undefined ? (
                  <p className="daily-report__note">最高速度: {soccerLog.maxSpeedKmh}km/h</p>
                ) : null}
                {soccerLog.notes ? <p className="daily-report__note">メモ: {soccerLog.notes}</p> : null}
              </div>
            ) : (
              <p className="daily-report__empty">記録なし</p>
            )}
          </section>

          <section className="daily-report__section">
            <h4>ワークアウト</h4>
            {dayWorkouts.length > 0 ? (
              <div className="daily-report__log-list">
                {dayWorkouts.map((workout, index) => (
                  <div key={workout.id ?? index} className="daily-report__item">
                    <p className="daily-report__item-head">
                      {/* activityTypeはoptional（Apple純正Shortcutsの制約でdistance_meters・
                          start_timeのみ送られてくる場合があるため）。CalendarDaySummaries.tsx
                          のWorkoutSummaryと同じフォールバック文言に揃える。 */}
                      🏃 {workout.activityType ?? 'ワークアウト'}
                      {workout.externalId ? '（⌚ Watch）' : ''}
                    </p>
                    {workout.durationSeconds != null ? (
                      <p className="daily-report__note">時間: {Math.round(workout.durationSeconds / 60)}分</p>
                    ) : null}
                    {workout.distanceMeters != null ? (
                      <p className="daily-report__note">距離: {(workout.distanceMeters / 1000).toFixed(2)}km</p>
                    ) : null}
                    {workout.activeCalories != null ? (
                      <p className="daily-report__note">消費カロリー: {Math.round(workout.activeCalories)}kcal</p>
                    ) : null}
                    {workout.avgHeartRate != null ? (
                      <p className="daily-report__note">平均心拍: {Math.round(workout.avgHeartRate)}bpm</p>
                    ) : null}
                    {workout.notes ? <p className="daily-report__note">メモ: {workout.notes}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="daily-report__empty">記録なし</p>
            )}
          </section>

          {recoveryResults.length > 0 ? (
            <section className="daily-report__section">
              <h4>リカバリー窓</h4>
              <div className="daily-report__recovery-list">
                {recoveryResults.map((result) => (
                  <RecoveryWindowCard
                    key={`${result.sessionType}-${result.sessionEndTime}`}
                    result={result}
                    config={DEFAULT_RECOVERY_WINDOW_CONFIG}
                    now={now}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
