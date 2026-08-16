import { useMemo, useState } from 'react'
import type { BodyPart, ExerciseDefinition } from '../../types'

/**
 * カレンダー構造変更・記録モーダル・トレーニング刷新 実装指示書 Phase E（2026年8月16日）
 * 食事記録のGenreFoodPicker（ジャンル→食材の2段階選択）と同じUXパターンで、
 * 部位→種目の2段階選択を提供する。exercisesテーブルは既にbody_part/equipment_type
 * 列を持っていたため、DBスキーマ変更は不要だった（SQL追加なし）。
 *
 * 既存のExerciseNameInput（自由入力＋新規登録フロー）はそのまま残し、
 * このコンポーネントは同じ選択結果（exerciseId・name）を親に渡す
 * 「もう一つの入力導線」として並置する。ExerciseNameInput側のロジックは無変更。
 */

const bodyPartOptions: BodyPart[] = ['胸', '肩', '腕', '背', '脚', '腹', '有酸素', 'その他']

type ExercisePickerProps = {
  exercises: ExerciseDefinition[]
  onSelect: (exerciseId: string, name: string) => void
}

export function ExercisePicker({ exercises, onSelect }: ExercisePickerProps) {
  const [selectedBodyPart, setSelectedBodyPart] = useState<BodyPart | ''>('')

  const filteredExercises = useMemo(
    () => (selectedBodyPart ? exercises.filter((exercise) => exercise.bodyPart === selectedBodyPart) : []),
    [exercises, selectedBodyPart],
  )

  return (
    <div className="calendar-detail__field calendar-detail__field--full">
      <span>部位から種目を選ぶ</span>
      <div className="calendar-detail__category-filter">
        {bodyPartOptions.map((bodyPart) => (
          <button
            key={bodyPart}
            type="button"
            className={`calendar-detail__category-chip${selectedBodyPart === bodyPart ? ' calendar-detail__category-chip--active' : ''}`}
            onClick={() => setSelectedBodyPart(bodyPart)}
          >
            {bodyPart}
          </button>
        ))}
      </div>
      {selectedBodyPart ? (
        filteredExercises.length > 0 ? (
          <select
            key={selectedBodyPart}
            value=""
            onChange={(event) => {
              const exercise = filteredExercises.find((candidate) => candidate.id === event.target.value)
              if (exercise?.id) {
                onSelect(exercise.id, exercise.name)
              }
            }}
          >
            <option value="">選択してください</option>
            {filteredExercises.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name}
                {exercise.equipmentType ? `（${exercise.equipmentType}）` : ''}
              </option>
            ))}
          </select>
        ) : (
          <p className="calendar-detail__description">この部位に登録済みの種目がありません。下の入力欄から新規登録できます</p>
        )
      ) : null}
    </div>
  )
}
