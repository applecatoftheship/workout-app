import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { DailyCondition, DateString, MealLog, SoccerLog, TrainingLog, TrainingSchedule, Workout } from '../../types'
import {
  formatConditionSummary,
  getMealTypeLabel,
  groupMealLogsByType,
  toJstDateKeyFromIso,
  getCurrentTimeHHMM,
  combineDateAndTimeToISO,
  extractTimeHHMMFromISO,
} from '../../utils/calendarHelpers'
import { fetchTrainingLogs, upsertTrainingLogMeta } from '../../api/trainingLogs'
import { TrainingExerciseCard } from './TrainingExerciseCard'
import { MealLogCard } from './MealLogCard'
import { useToast } from '../../hooks/useToast'

/**
 * カレンダー構造変更・記録モーダル・トレーニング刷新 実装指示書 Phase C（2026年8月16日）
 * MonthlyCalendarを閲覧専用にするための、記録タイプごとの読み取り専用サマリー表示。
 * 入力フォーム本体（TrainingLogForm等）は RecordFormModal 内でのみ使用し、
 * ここでは保存・削除ロジックには一切触れず、表示専用のコンポーネントとする。
 *
 * 【例外（トレーニング記録画面UI/UX刷新、2026年8月28日）】種目カードの削除ボタン
 * （TrainingExerciseCard.tsx）と、TrainingSummary内の日次メタ情報（完了/未完了・
 * 終了時刻・メモ）の保存は、モーダルを介さず閲覧画面から直接操作できる設計へ
 * 変更したため、この2箇所のみ上記の「表示専用」の原則から意図的に外れている
 * （設計チーム承認済み）。ExercisePicker.tsxが既に採用している「leafコンポーネント
 * 自身がconfirm+API呼び出しを完結させる」パターンを踏襲する。
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

type TrainingMetaState = {
  completed: boolean
  notes: string
  endTime: string
}

function buildMetaState(log: TrainingLog | undefined): TrainingMetaState {
  return {
    completed: log?.completed ?? true,
    notes: log?.notes ?? '',
    endTime: log?.endTime ? extractTimeHHMMFromISO(log.endTime) : '',
  }
}

type TrainingSummaryProps = {
  trainingLogs: TrainingLog[]
  setTrainingLogs: Dispatch<SetStateAction<TrainingLog[]>>
  selectedDate: DateString
  /** 新規種目の追加モーダルを開く。 */
  onAddExercise: () => void
  /** その日の記録一覧 → 選択 → 編集、という画面遷移を開く
   *  （トレーニング実績編集UIの画面遷移化、2026年9月3日）。 */
  onEditRecords: () => void
}

// 種目カード＋編集モーダル分離（2026年8月28日）：日次メタ情報（完了/未完了・
// 終了時刻・メモ）は種目カード一覧の上に常時表示する小さな設定欄として独立させる
// （設計チーム承認済み、実装方針提案の3-2）。種目の追加・削除とは別のtraining_logs
// 本体のみを更新するupsertTrainingLogMetaを使うため、他の種目データには一切触れない。
export function TrainingSummary({ trainingLogs, setTrainingLogs, selectedDate, onAddExercise, onEditRecords }: TrainingSummaryProps) {
  const { showToast } = useToast()
  const dayLog = trainingLogs.find((log) => log.date === selectedDate)
  const [meta, setMeta] = useState<TrainingMetaState>(() => buildMetaState(dayLog))
  const [isSavingMeta, setIsSavingMeta] = useState(false)

  // selectedDateが変わるたび、その日の最新状態でメタ欄を作り直す
  // （TrainingLogForm.tsx時代のuseEffect(() => {...}, [selectedDate])を踏襲）。
  // 依存配列にdayLog?.idも追加（2026年8月28日のバグ修正）：selectedDateのみに
  // 依存していると、ページ再読み込み直後（fetchTrainingLogsの完了前にこの
  // コンポーネントがマウントされ、trainingLogsが空配列のままdayLog=undefinedで
  // meta欄が初期化されるケース）で、後からtrainingLogsが届いてもmeta欄が
  // 再同期されず、保存済みのメモ等が空欄のまま表示され続ける不具合があった。
  // dayLog?.idはtraining_logsの行が「存在しない→存在する」に変わる瞬間
  // （初回フェッチ完了時・新規作成時）にのみ変化し、同じ日に種目を追加・削除
  // しても値は変わらないため、その操作でmeta欄（入力中のメモ等）が意図せず
  // 巻き戻ることはない。
  useEffect(() => {
    setMeta(buildMetaState(trainingLogs.find((log) => log.date === selectedDate)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, dayLog?.id])

  const handleSaveMeta = async () => {
    setIsSavingMeta(true)
    try {
      await upsertTrainingLogMeta(selectedDate, {
        completed: meta.completed,
        notes: meta.notes.trim() || undefined,
        endTime: meta.endTime ? combineDateAndTimeToISO(selectedDate, meta.endTime || getCurrentTimeHHMM()) : undefined,
      })
      const refreshed = await fetchTrainingLogs()
      setTrainingLogs(refreshed)
      showToast('保存しました', 'success')
    } catch (error) {
      console.error('Supabaseへの日次メタ情報の保存に失敗しました', error)
      showToast('保存に失敗しました。もう一度お試しください', 'error')
    } finally {
      setIsSavingMeta(false)
    }
  }

  return (
    <div className="calendar-detail__section">
      <div className="calendar-detail__section-header">
        <h4>トレーニング実績</h4>
        <div className="calendar-detail__section-header-actions">
          <button type="button" className="calendar-detail__secondary-button" onClick={onAddExercise}>
            種目を追加
          </button>
          {dayLog && dayLog.exercises.length > 0 ? (
            <button type="button" className="calendar-detail__secondary-button" onClick={onEditRecords}>
              記録を編集
            </button>
          ) : null}
        </div>
      </div>

      <div className="training-day-meta">
        <div className="calendar-detail__inline-fields">
          <label className="calendar-detail__field">
            <span>完了/未完了</span>
            <select
              value={meta.completed ? 'completed' : 'pending'}
              onChange={(event) => setMeta((current) => ({ ...current, completed: event.target.value === 'completed' }))}
            >
              <option value="completed">完了</option>
              <option value="pending">未完了</option>
            </select>
          </label>
          <label className="calendar-detail__field">
            <span>終了時刻（任意）</span>
            <input type="time" value={meta.endTime} onChange={(event) => setMeta((current) => ({ ...current, endTime: event.target.value }))} />
          </label>
        </div>
        <label className="calendar-detail__field">
          <span>メモ</span>
          <textarea
            value={meta.notes}
            onChange={(event) => setMeta((current) => ({ ...current, notes: event.target.value }))}
            rows={2}
            placeholder="今日の感想やポイント"
          />
        </label>
        <button type="button" className="calendar-detail__secondary-button" onClick={handleSaveMeta} disabled={isSavingMeta}>
          {isSavingMeta ? '保存中...' : '保存'}
        </button>
      </div>

      {dayLog && dayLog.exercises.length > 0 ? (
        <div className="training-exercise-grid">
          {dayLog.exercises.map((exercise) => (
            // 表示専用（編集・削除は「記録を編集」の画面遷移側に集約、2026年9月3日）。
            <TrainingExerciseCard key={exercise.id} exercise={exercise} setTrainingLogs={setTrainingLogs} />
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
  setMealLogs: Dispatch<SetStateAction<MealLog[]>>
  selectedDate: DateString
  onAdd: () => void
  /** 未指定（新規エントリ）でも編集モーダルを開けるが、MealSummary自身は
   * 常に既存エントリのmealLogIdを渡す（新規追加はonAdd経由のみ）。 */
  onEdit: (mealLogId: string) => void
}

// 食事記録画面UI/UX刷新（meal_logエントリカード＋編集モーダル分離、2026年8月29日）：
// 閲覧と編集を完全分離し、meal_logエントリごとにMealLogCardを表示する
// （閲覧専用、編集/削除はカード自身が担う。TrainingSummaryと同じ設計）。
// 食事タイミング（朝食/昼食/夕食/間食/その他）ごとにグルーピングして見出しを
// 立てる（groupMealLogsByType、表示側のみの変更。meal_type自体はDB上の
// 中間テーブルではなく各meal_log行が持つ属性のため、スキーマは無変更）。
export function MealSummary({ mealLogs, setMealLogs, selectedDate, onAdd, onEdit }: MealSummaryProps) {
  const groups = groupMealLogsByType(mealLogs, selectedDate)
  const totals = groups.reduce(
    (acc, group) =>
      group.logs.reduce(
        (inner, mealLog) => ({
          calories: inner.calories + mealLog.calories,
          protein: inner.protein + mealLog.protein,
          fat: inner.fat + mealLog.fat,
          carbohydrates: inner.carbohydrates + mealLog.carbohydrates,
        }),
        acc,
      ),
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
      {groups.length > 0 ? (
        <>
          <div className="calendar-detail__meal-totals">
            合計: {totals.calories}kcal / P{totals.protein}g F{totals.fat}g C{totals.carbohydrates}g
          </div>
          {groups.map((group) => (
            <div key={group.mealType} className="meal-type-group">
              <h5 className="meal-type-group__header">{getMealTypeLabel(group.mealType)}</h5>
              <div className="meal-log-grid">
                {group.logs.map((mealLog) => (
                  <MealLogCard
                    key={mealLog.id}
                    mealLog={mealLog}
                    setMealLogs={setMealLogs}
                    onEdit={() => mealLog.id && onEdit(mealLog.id)}
                  />
                ))}
              </div>
            </div>
          ))}
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
