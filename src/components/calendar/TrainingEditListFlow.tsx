import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { DailyCondition, DateString, MealLog, TrainingLog, TrainingSchedule } from '../../types'
import { TrainingExerciseCard } from './TrainingExerciseCard'
import { TrainingExerciseEditModal } from './TrainingExerciseEditModal'

// トレーニング実績編集UIの画面遷移化（2026年9月3日）：
// 従来は種目カード（TrainingExerciseCard）に「編集」「削除」導線が常時表示され
// 情報量が多かったため、閲覧サマリー（TrainingSummary）側のカードは表示専用にし、
// 「記録を編集」ボタンからこのフローに入る。
//   1. その日の種目一覧（カード＝種目名＋サマリー＋編集/削除）
//   2. カードの「編集」→ 既存の TrainingExerciseEditModal（種目別編集画面）へ遷移
//   3. 「← 記録一覧に戻る」で 1 に戻れる
// 編集画面での保存・キャンセル時は既存挙動どおりモーダル全体を閉じる（onClose）。
// 種目カードの「削除」は、閲覧サマリーから外してこの一覧側に集約した
// （TrainingExerciseCard 自身が confirm + API + 再フェッチを内包しているため、
// 呼び出し位置を変えるだけで挙動は不変）。

type TrainingEditListFlowProps = {
  trainingLogs: TrainingLog[]
  setTrainingLogs: Dispatch<SetStateAction<TrainingLog[]>>
  mealLogs: MealLog[]
  dailyConditions: DailyCondition[]
  selectedDate: DateString
  schedulesForMdCheck: TrainingSchedule[]
  onClose: () => void
}

export function TrainingEditListFlow({
  trainingLogs,
  setTrainingLogs,
  mealLogs,
  dailyConditions,
  selectedDate,
  schedulesForMdCheck,
  onClose,
}: TrainingEditListFlowProps) {
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null)

  const dayLog = trainingLogs.find((log) => log.date === selectedDate)
  const exercises = dayLog?.exercises ?? []

  if (editingExerciseId) {
    return (
      <div className="calendar-detail__form">
        <button
          type="button"
          className="calendar-detail__secondary-button"
          onClick={() => setEditingExerciseId(null)}
        >
          ← 記録一覧に戻る
        </button>
        <TrainingExerciseEditModal
          key={editingExerciseId}
          trainingLogs={trainingLogs}
          setTrainingLogs={setTrainingLogs}
          mealLogs={mealLogs}
          dailyConditions={dailyConditions}
          selectedDate={selectedDate}
          trainingLogExerciseId={editingExerciseId}
          schedulesForMdCheck={schedulesForMdCheck}
          onClose={onClose}
        />
      </div>
    )
  }

  return (
    <div className="calendar-detail__form">
      <p className="calendar-detail__description">編集する種目を選んでください。</p>
      {exercises.length > 0 ? (
        <div className="training-exercise-grid">
          {exercises.map((exercise) => (
            <TrainingExerciseCard
              key={exercise.id}
              exercise={exercise}
              setTrainingLogs={setTrainingLogs}
              onEdit={() => exercise.id && setEditingExerciseId(exercise.id)}
            />
          ))}
        </div>
      ) : (
        <p className="calendar-detail__empty">🏋️ この日のトレーニング記録はまだありません</p>
      )}
      <div className="calendar-detail__actions">
        <button type="button" className="calendar-detail__secondary-button" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  )
}
