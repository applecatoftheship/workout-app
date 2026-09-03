import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { deleteWorkout, fetchWorkouts } from '../../api/workouts'
import { toJstDateKeyFromIso } from '../../utils/calendarHelpers'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../hooks/useConfirm'
import type { DateString, Workout } from '../../types'
import { WorkoutForm } from './WorkoutForm'

// 有酸素運動の時間ベース記録への移行（2026年9月3日）：
// ⑤「記録を編集」の画面遷移パターン（一覧→選択→編集）をワークアウトにも踏襲。
//   1. その日のワークアウト一覧（種目名＋時間/距離/カロリー＋編集/削除）
//   2. 「編集」→ WorkoutForm（編集モード）へ遷移。「← 一覧に戻る」で戻れる
//   3. 「削除」はカード自身が confirm + deleteWorkout + 再取得を完結（TrainingExerciseCard と同型）
// 新規作成は「トレーニングを記録 → 種目を追加 → 有酸素種目を選択」から行う（このフローには無い）。

type WorkoutEditListFlowProps = {
  workouts: Workout[]
  setWorkouts: Dispatch<SetStateAction<Workout[]>>
  selectedDate: DateString
  onClose: () => void
}

function formatWorkoutSummary(workout: Workout): string {
  const parts: string[] = []
  if (workout.durationSeconds != null) {
    parts.push(`${Math.round(workout.durationSeconds / 60)}分`)
  }
  if (workout.distanceMeters != null) {
    parts.push(`${(workout.distanceMeters / 1000).toFixed(2)}km`)
  }
  if (workout.activeCalories != null) {
    parts.push(`${Math.round(workout.activeCalories)}kcal`)
  }
  return parts.length > 0 ? parts.join(' / ') : '記録なし'
}

export function WorkoutEditListFlow({ workouts, setWorkouts, selectedDate, onClose }: WorkoutEditListFlowProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null)

  const dayWorkouts = workouts.filter((workout) => toJstDateKeyFromIso(workout.startTime) === selectedDate)

  const refetch = () => {
    fetchWorkouts(selectedDate, selectedDate)
      .then(setWorkouts)
      .catch((error) => {
        console.error('Supabaseからワークアウト記録の再取得に失敗しました', error)
      })
  }

  const handleDelete = async (workout: Workout) => {
    if (!workout.id) {
      return
    }
    const label = workout.activityType ?? 'ワークアウト'
    const confirmed = await confirm(`「${label}」（${formatWorkoutSummary(workout)}）を削除しますか？この操作は取り消せません`)
    if (!confirmed) {
      return
    }
    try {
      await deleteWorkout(workout.id)
      refetch()
      showToast('ワークアウトを削除しました', 'success')
    } catch (error) {
      console.error('Supabaseからのワークアウト削除に失敗しました', error)
      showToast('削除に失敗しました。もう一度お試しください', 'error')
    }
  }

  const editingWorkout = editingWorkoutId ? dayWorkouts.find((workout) => workout.id === editingWorkoutId) ?? null : null

  if (editingWorkout) {
    return (
      <div className="calendar-detail__form">
        <button
          type="button"
          className="calendar-detail__secondary-button"
          onClick={() => setEditingWorkoutId(null)}
        >
          ← 記録一覧に戻る
        </button>
        <WorkoutForm
          key={editingWorkout.id}
          selectedDate={selectedDate}
          activityType={editingWorkout.activityType ?? 'ワークアウト'}
          editingWorkout={editingWorkout}
          onSaved={refetch}
          onClose={onClose}
        />
      </div>
    )
  }

  return (
    <div className="calendar-detail__form">
      <p className="calendar-detail__description">編集するワークアウトを選んでください。</p>
      {dayWorkouts.length > 0 ? (
        <div className="calendar-detail__log-list">
          {dayWorkouts.map((workout) => (
            <div key={workout.id ?? workout.startTime} className="calendar-detail__log-item">
              <div className="calendar-detail__log-head">
                <span>
                  🏃 {workout.activityType ?? 'ワークアウト'}
                  {workout.externalId ? ' （⌚ Watch）' : ''}
                </span>
                <div className="calendar-detail__log-actions">
                  <button
                    type="button"
                    className="calendar-detail__edit-button"
                    onClick={() => workout.id && setEditingWorkoutId(workout.id)}
                  >
                    編集
                  </button>
                  <button type="button" className="calendar-detail__delete-button" onClick={() => handleDelete(workout)}>
                    削除
                  </button>
                </div>
              </div>
              <p className="calendar-detail__description">{formatWorkoutSummary(workout)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="calendar-detail__empty">🏃 この日のワークアウト記録はまだありません</p>
      )}
      <div className="calendar-detail__actions">
        <button type="button" className="calendar-detail__secondary-button" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  )
}
