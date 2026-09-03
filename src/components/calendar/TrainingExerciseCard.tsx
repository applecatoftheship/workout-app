import type { Dispatch, SetStateAction } from 'react'
import { deleteTrainingLogExerciseRemote, fetchTrainingLogs } from '../../api/trainingLogs'
import { formatSetSummary } from '../../utils/calendarHelpers'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../hooks/useConfirm'
import type { TrainingLog, TrainingLogExercise } from '../../types'
import './TrainingExercise.css'

// トレーニング記録画面UI/UX刷新（種目カード＋編集モーダル分離、2026年8月28日）：
// 閲覧画面：種目ごとにカード表示（種目名＋記録サマリーのみ、入力欄なし）。
// 削除ボタンは、ExercisePicker.tsxが自身のconfirm+API呼び出しを内包している
// 既存パターンを踏襲し、このカード自身で確認ダイアログ・削除・再フェッチまで
// 完結させる。
//
// トレーニング実績編集UIの画面遷移化（2026年9月3日）：onEdit が undefined の場合は
// 「編集」「削除」導線を出さず表示専用カードになる（TrainingSummary の閲覧サマリー
// 用）。onEdit を渡すと編集＋削除ボタンを表示する（TrainingEditListFlow の
// 「記録を編集」一覧用）。

type TrainingExerciseCardProps = {
  exercise: TrainingLogExercise
  setTrainingLogs: Dispatch<SetStateAction<TrainingLog[]>>
  /** 未指定なら表示専用（編集・削除ボタンを出さない）。 */
  onEdit?: () => void
}

export function TrainingExerciseCard({ exercise, setTrainingLogs, onEdit }: TrainingExerciseCardProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const exerciseName = exercise.exercise?.name ?? '不明な種目'

  const handleDelete = async () => {
    if (!exercise.id) {
      return
    }

    const confirmed = await confirm(`『${exerciseName}』の記録（${exercise.sets.length}セット）をすべて削除しますか？`)
    if (!confirmed) {
      return
    }

    try {
      await deleteTrainingLogExerciseRemote(exercise.id)
      const refreshed = await fetchTrainingLogs()
      setTrainingLogs(refreshed)
      showToast('種目を削除しました', 'success')
    } catch (error) {
      console.error('Supabaseからの種目削除に失敗しました', error)
      showToast('種目の削除に失敗しました。もう一度お試しください', 'error')
    }
  }

  return (
    <div className="training-exercise-card">
      <div className="training-exercise-card__head">
        <span className="training-exercise-card__name">{exerciseName}</span>
        {onEdit ? (
          <div className="training-exercise-card__actions">
            <button type="button" className="calendar-detail__edit-button" onClick={onEdit}>
              編集
            </button>
            <button type="button" className="calendar-detail__delete-button" onClick={handleDelete}>
              削除
            </button>
          </div>
        ) : null}
      </div>
      <p className="training-exercise-card__summary">
        {exercise.sets.length > 0 ? `${exercise.sets.length}セット (${formatSetSummary(exercise.sets)})` : '記録なし'}
      </p>
    </div>
  )
}
