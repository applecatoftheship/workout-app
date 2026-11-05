import type { Dispatch, SetStateAction } from 'react'
import { deleteTrainingLogExerciseRemote, fetchTrainingLogs } from '../../api/trainingLogs'
import { formatSetSummary } from '../../utils/calendarHelpers'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../hooks/useConfirm'
import { useAuth } from '../../hooks/useAuth'
import { enqueueOutbox, hasPendingOutboxEntryFor } from '../../offline/outbox'
import { updateOfflineCache, withOfflineCache } from '../../offline/offlineCache'
import { applyTrainingExerciseDelete } from '../../offline/offlineEdits'
import { getNavigatorOnline, isNetworkError } from '../../utils/networkErrors'
import type { TrainingLog, TrainingLogExercise } from '../../types'
import { SwipeableRow } from '../common/SwipeableRow'
import './TrainingExercise.css'
import './CalendarForms.css'

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
//
// 記録リストのスワイプ操作化（2026年10月31日）：常時表示の「編集」「削除」ボタンを撤去し、
// onEdit を渡した場合はカードを左スワイプすると「編集」「削除」が現れる方式に変更した
// （common/SwipeableRow.tsx）。削除は従来どおり useConfirm の確認を経てから実行する。

type TrainingExerciseCardProps = {
  exercise: TrainingLogExercise
  setTrainingLogs: Dispatch<SetStateAction<TrainingLog[]>>
  /** 未指定なら表示専用（スワイプ操作なし）。指定すると左スワイプで「編集」「削除」を出す。 */
  onEdit?: () => void
}

export function TrainingExerciseCard({ exercise, setTrainingLogs, onEdit }: TrainingExerciseCardProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const { user } = useAuth()
  const exerciseName = exercise.exercise?.name ?? '不明な種目'

  const handleDelete = async () => {
    if (!exercise.id) {
      return
    }

    const confirmed = await confirm(`『${exerciseName}』の記録（${exercise.sets.length}セット）をすべて削除しますか？`)
    if (!confirmed) {
      return
    }

    // オフラインでの削除（2026年11月6日）：通信できないときは削除の操作を端末に保存し、
    // 一覧からは先に消す。オンラインに戻ると自動で送信する。
    const trainingLogExerciseId = exercise.id
    // 同じ記録への未送信の操作があるか（あれば順番待ちに回す。トーストの理由の出し分けにも使う）
    const queuedBehindPending =
      getNavigatorOnline() && hasPendingOutboxEntryFor(`trainingExercise:${trainingLogExerciseId}`, user?.id)
    const deleteOnDevice = () => {
      const saved =
        !!user &&
        enqueueOutbox({
          kind: 'trainingExerciseDelete',
          id: crypto.randomUUID(),
          userId: user.id,
          createdAt: new Date().toISOString(),
          attempts: 0,
          label: `${exerciseName}（${exercise.sets.length}セット）を削除`,
          trainingLogExerciseId,
        })
      if (!saved) {
        showToast(
          user ? '種目を削除できませんでした。ストレージの設定を確認してください' : 'ログイン情報を確認できないため削除できませんでした',
          'error',
        )
        return
      }
      setTrainingLogs((current) => applyTrainingExerciseDelete(current, trainingLogExerciseId))
      updateOfflineCache<TrainingLog[]>('trainingLogs', (current) => applyTrainingExerciseDelete(current, trainingLogExerciseId))
      showToast(queuedBehindPending ? '同じ記録の未送信の操作があるため端末に保存しました。順番に自動で反映します' : '通信できないため端末に保存しました。オンラインに戻ると自動で反映します', 'info')
    }

    if (!getNavigatorOnline() || queuedBehindPending) {
      deleteOnDevice()
      return
    }

    try {
      try {
        await deleteTrainingLogExerciseRemote(trainingLogExerciseId)
      } catch (error) {
        if (isNetworkError(error)) {
          console.error('通信エラーのため種目の削除を端末に保存します', error)
          deleteOnDevice()
          return
        }
        throw error
      }
      // 削除した種目は、取り直しが失敗しても一覧・控えに残らないよう先に除く
      setTrainingLogs((current) => applyTrainingExerciseDelete(current, trainingLogExerciseId))
      updateOfflineCache<TrainingLog[]>('trainingLogs', (current) => applyTrainingExerciseDelete(current, trainingLogExerciseId))
      // 端末の控えも最新にする（後でオフラインで開いたときに、削除・編集済みの記録が古いまま出ないように。2026年11月6日）
      const refreshed = await withOfflineCache('trainingLogs', () => fetchTrainingLogs())
      setTrainingLogs(refreshed)
      showToast('種目を削除しました', 'success')
    } catch (error) {
      console.error('Supabaseからの種目削除に失敗しました', error)
      showToast('種目の削除に失敗しました。もう一度お試しください', 'error')
    }
  }

  const card = (
    <div className="training-exercise-card">
      <div className="training-exercise-card__head">
        <span className="training-exercise-card__name">{exerciseName}</span>
      </div>
      <p className="training-exercise-card__summary">
        {exercise.sets.length > 0 ? `${exercise.sets.length}セット (${formatSetSummary(exercise.sets)})` : '記録なし'}
      </p>
    </div>
  )

  if (!onEdit) {
    return card
  }

  return (
    <SwipeableRow
      actions={[
        { key: 'edit', label: '編集', tone: 'accent', onClick: onEdit },
        { key: 'delete', label: '削除', tone: 'danger', onClick: handleDelete },
      ]}
    >
      {card}
    </SwipeableRow>
  )
}
