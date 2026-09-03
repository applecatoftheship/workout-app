import { useEffect, useState } from 'react'
import { createWorkout, updateWorkout } from '../../api/workouts'
import type { WorkoutInput } from '../../api/workouts'
import { fetchRecentWeight } from '../../api/dailyConditions'
import {
  combineDateAndTimeToISO,
  extractTimeHHMMFromISO,
  getCurrentTimeHHMM,
} from '../../utils/calendarHelpers'
import {
  calculateCardioAutoValues,
  DEFAULT_CARDIO_WEIGHT_KG,
  isCardioActivity,
} from '../../utils/workoutCalorieHelpers'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../hooks/useConfirm'
import type { DateString, Workout } from '../../types'

// 有酸素運動の時間ベース記録フォーム（2026年9月3日）：
// body_part = '有酸素' の種目（ウォーキング／ランニング／サイクリング）を
// 選んだときに、重量×回数フォームの代わりに表示する。
// - 入力：開始時刻・時間（分）・メモ
// - 時間（分）を入れると、種目ごとの MET/想定ペースと直近実測体重から
//   距離(km)・カロリー(kcal)を自動計算してフィールドに反映。以後ユーザーが手修正可。
// - 保存先は workouts テーブル（training_logs には保存しない）。
// - 新規（種目選択から）と編集（ワークアウト一覧から）の両方で使う。

type WorkoutFormProps = {
  selectedDate: DateString
  /** 新規：選択した種目名。編集：workout.activityType。 */
  activityType: string
  /** 指定すると編集モード。 */
  editingWorkout?: Workout | null
  onClose: () => void
  /** 保存・削除成功後に呼ぶ（一覧の再取得など）。 */
  onSaved?: () => void
}

export function WorkoutForm({ selectedDate, activityType, editingWorkout, onClose, onSaved }: WorkoutFormProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()

  const isEditing = editingWorkout != null

  const [startTime, setStartTime] = useState(getCurrentTimeHHMM())
  const [durationMin, setDurationMin] = useState('')
  const [distanceKm, setDistanceKm] = useState('')
  const [calories, setCalories] = useState('')
  const [notes, setNotes] = useState('')
  const [weightKg, setWeightKg] = useState<number>(DEFAULT_CARDIO_WEIGHT_KG)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const supportsAutoCalc = isCardioActivity(activityType)

  useEffect(() => {
    if (!editingWorkout) {
      return
    }
    setStartTime(extractTimeHHMMFromISO(editingWorkout.startTime))
    setDurationMin(
      editingWorkout.durationSeconds != null ? String(Math.round(editingWorkout.durationSeconds / 60)) : '',
    )
    setDistanceKm(
      editingWorkout.distanceMeters != null ? String(Math.round((editingWorkout.distanceMeters / 1000) * 100) / 100) : '',
    )
    setCalories(editingWorkout.activeCalories != null ? String(Math.round(editingWorkout.activeCalories)) : '')
    setNotes(editingWorkout.notes ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingWorkout?.id])

  // MET計算用の直近実測体重（weight>0 のみ。取れなければ既定値70kg）。
  useEffect(() => {
    fetchRecentWeight(selectedDate)
      .then((weight) => {
        if (weight != null && weight > 0) {
          setWeightKg(weight)
        }
      })
      .catch((fetchError) => {
        console.error('Supabaseから直近体重の取得に失敗しました', fetchError)
      })
  }, [selectedDate])

  const applyAutoCalc = (minutesValue: string, weight: number) => {
    const auto = calculateCardioAutoValues(activityType, Number(minutesValue), weight)
    if (auto) {
      setDistanceKm(String(auto.distanceKm))
      setCalories(String(auto.calories))
    }
  }

  // 体重の取得は非同期。取得完了で weightKg が既定値から変わったとき、
  // 新規入力で時間が既に入っていれば実体重で再計算する（編集モードでは
  // 既存の距離・カロリー——Apple Watch の実測値等——を上書きしない）。
  useEffect(() => {
    if (isEditing || durationMin.trim() === '') {
      return
    }
    applyAutoCalc(durationMin, weightKg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightKg])

  // 時間（分）を変更したときの自動計算。編集モードでは既存の距離・カロリーを
  // 尊重し、時間だけ変えても距離・カロリーは自動上書きしない（手修正可のまま）。
  const handleDurationChange = (value: string) => {
    setDurationMin(value)
    if (!isEditing) {
      applyAutoCalc(value, weightKg)
    }
  }

  const handleSave = async () => {
    const minutes = Number(durationMin)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setError('時間（分）は0より大きい数値で入力してください')
      return
    }
    const distanceValue = distanceKm.trim() === '' ? null : Number(distanceKm)
    if (distanceValue != null && (!Number.isFinite(distanceValue) || distanceValue < 0)) {
      setError('距離は0以上の数値で入力してください')
      return
    }
    const caloriesValue = calories.trim() === '' ? null : Number(calories)
    if (caloriesValue != null && (!Number.isFinite(caloriesValue) || caloriesValue < 0)) {
      setError('カロリーは0以上の数値で入力してください')
      return
    }

    const confirmed = await confirm('記録しますか？', { confirmLabel: 'はい', cancelLabel: 'いいえ' })
    if (!confirmed) {
      return
    }

    const input: WorkoutInput = {
      activityType,
      startTime: combineDateAndTimeToISO(selectedDate, startTime || getCurrentTimeHHMM()),
      durationSeconds: Math.round(minutes * 60),
      distanceMeters: distanceValue != null ? Math.round(distanceValue * 1000) : null,
      activeCalories: caloriesValue,
      notes: notes.trim() || undefined,
    }

    setError(null)
    setIsSaving(true)
    try {
      if (isEditing && editingWorkout?.id) {
        await updateWorkout(editingWorkout.id, input)
        showToast('ワークアウトを更新しました', 'success')
      } else {
        await createWorkout(input)
        showToast('ワークアウトを記録しました', 'success')
      }
      onSaved?.()
      onClose()
    } catch (saveError) {
      console.error('Supabaseへのワークアウトの保存に失敗しました', saveError)
      setError('保存に失敗しました。もう一度お試しください')
      showToast(isEditing ? 'ワークアウトの更新に失敗しました' : 'ワークアウトの記録に失敗しました', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // 呼び出し元（TrainingExerciseEditModal / WorkoutEditListFlow）が既に
  // .calendar-detail__form の内側で描画するため、ここは Fragment にして二重ネストを避ける。
  return (
    <>
      {error ? <p className="calendar-detail__form-error">{error}</p> : null}

      <div className="calendar-detail__exercise-form">
        <span>{activityType}（有酸素運動）</span>

        <label className="calendar-detail__field">
          <span>開始時刻</span>
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        </label>

        <label className="calendar-detail__field">
          <span>時間（分）</span>
          <input
            type="number"
            min="0"
            step="1"
            value={durationMin}
            onChange={(event) => handleDurationChange(event.target.value)}
            placeholder="30"
          />
        </label>

        {supportsAutoCalc ? (
          <p className="calendar-detail__description">
            時間から距離・カロリーを自動計算します（体重 {Math.round(weightKg)}kg 換算）。必要なら下の値を手修正できます。
          </p>
        ) : (
          <p className="calendar-detail__description">
            この種目は自動計算に対応していません。距離・カロリーを手入力してください。
          </p>
        )}

        <div className="calendar-detail__inline-fields">
          <label className="calendar-detail__field">
            <span>距離（km）</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={distanceKm}
              onChange={(event) => setDistanceKm(event.target.value)}
            />
          </label>
          <label className="calendar-detail__field">
            <span>カロリー（kcal）</span>
            <input
              type="number"
              min="0"
              step="1"
              value={calories}
              onChange={(event) => setCalories(event.target.value)}
            />
          </label>
        </div>

        <label className="calendar-detail__field calendar-detail__field--full">
          <span>メモ（任意）</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
        </label>
      </div>

      <div className="calendar-detail__actions">
        <button type="button" className="calendar-detail__button" onClick={handleSave} disabled={isSaving}>
          {isSaving ? '保存中...' : '保存する'}
        </button>
        <button type="button" className="calendar-detail__secondary-button" onClick={onClose} disabled={isSaving}>
          キャンセル
        </button>
      </div>
    </>
  )
}
