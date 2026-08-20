import { useId, useState } from 'react'
import { createExercise } from '../../api/trainingLogs'
import { useToast } from '../../hooks/useToast'
import { findMostSimilarName } from '../../utils/nameMatching'
import type { BodyPart, ExerciseDefinition } from '../../types'

const bodyPartOptions: BodyPart[] = ['胸', '肩', '腕', '背', '脚', '腹', '有酸素', 'その他']

type ExerciseNameInputProps = {
  exercises: ExerciseDefinition[]
  onExerciseCreated: (exercise: ExerciseDefinition) => void
  name: string
  exerciseId: string | null
  onChange: (name: string, exerciseId: string | null) => void
  error?: string
}

export function ExerciseNameInput({ exercises, onExerciseCreated, name, exerciseId, onChange, error }: ExerciseNameInputProps) {
  const { showToast } = useToast()
  const datalistId = useId()
  const [newBodyPart, setNewBodyPart] = useState<BodyPart | ''>('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)
  // 種目マスタ新規登録時の類似名確認（実装指示書v2 Phase C、2026年8月19日新設）：
  // 表記ゆれによる重複登録（例：「シーテッドロー」/「シーテッドロウ」）を防ぐため、
  // 登録前に類似名がないか確認する。名前を変更したら確認状態はリセットする。
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false)

  const trimmedName = name.trim()
  const needsRegistration = trimmedName !== '' && !exerciseId
  const similarMatch = needsRegistration ? findMostSimilarName(exercises, trimmedName) : null

  const handleNameChange = (value: string) => {
    setRegisterError(null)
    setDuplicateConfirmed(false)
    const matched = exercises.find((exercise) => exercise.name === value.trim())
    onChange(value, matched?.id ?? null)
  }

  const handleUseSimilarExercise = () => {
    if (!similarMatch || !similarMatch.item.id) {
      return
    }
    setDuplicateConfirmed(false)
    onChange(similarMatch.item.name, similarMatch.item.id)
  }

  const handleRegister = async () => {
    if (!trimmedName) {
      return
    }
    if (!newBodyPart) {
      setRegisterError('部位を選択してください')
      return
    }
    if (similarMatch && !duplicateConfirmed) {
      // 類似名があり、まだ「それでも新規登録する」の確認が済んでいない場合は
      // 登録処理を進めない（確認UIはJSX側で表示）。
      return
    }

    setIsRegistering(true)
    setRegisterError(null)
    try {
      const created = await createExercise({ name: trimmedName, bodyPart: newBodyPart })
      onExerciseCreated(created)
      onChange(created.name, created.id ?? null)
      setNewBodyPart('')
      setDuplicateConfirmed(false)
      showToast('種目を登録しました', 'success')
    } catch (registrationError) {
      console.error('Supabaseへの種目登録に失敗しました', registrationError)
      setRegisterError('種目の登録に失敗しました')
      showToast('種目の登録に失敗しました', 'error')
    } finally {
      setIsRegistering(false)
    }
  }

  return (
    <label className="calendar-detail__field">
      <span>種目</span>
      <input
        type="text"
        list={datalistId}
        value={name}
        onChange={(event) => handleNameChange(event.target.value)}
        placeholder="例: ベンチプレス"
      />
      <datalist id={datalistId}>
        {exercises.map((exercise) => (
          <option key={exercise.id} value={exercise.name} />
        ))}
      </datalist>
      {error ? <p className="calendar-detail__error">{error}</p> : null}

      {needsRegistration ? (
        <div className="exercise-name-input__register">
          <p className="calendar-detail__description">「{trimmedName}」は未登録の種目です</p>

          {similarMatch && !duplicateConfirmed ? (
            <div className="calendar-detail__warning">
              「{trimmedName}」という類似の種目「{similarMatch.item.name}」が既に存在します。それでも新規登録しますか？
              <div className="calendar-detail__inline-fields">
                <button type="button" className="calendar-detail__secondary-button" onClick={() => setDuplicateConfirmed(true)}>
                  はい（新規登録する）
                </button>
                <button type="button" className="calendar-detail__secondary-button" onClick={handleUseSimilarExercise}>
                  いいえ（「{similarMatch.item.name}」を使う）
                </button>
              </div>
            </div>
          ) : (
            <div className="calendar-detail__inline-fields">
              <select value={newBodyPart} onChange={(event) => setNewBodyPart(event.target.value as BodyPart | '')}>
                <option value="">部位を選択</option>
                {bodyPartOptions.map((bodyPart) => (
                  <option key={bodyPart} value={bodyPart}>
                    {bodyPart}
                  </option>
                ))}
              </select>
              <button type="button" className="calendar-detail__secondary-button" onClick={handleRegister} disabled={isRegistering}>
                {isRegistering ? '登録中...' : 'この種目を登録'}
              </button>
            </div>
          )}
          {registerError ? <p className="calendar-detail__error">{registerError}</p> : null}
        </div>
      ) : null}
    </label>
  )
}
