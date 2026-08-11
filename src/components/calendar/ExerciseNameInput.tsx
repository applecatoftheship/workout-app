import { useId, useState } from 'react'
import { createExercise } from '../../api/trainingLogs'
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
  const datalistId = useId()
  const [newBodyPart, setNewBodyPart] = useState<BodyPart | ''>('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)

  const trimmedName = name.trim()
  const needsRegistration = trimmedName !== '' && !exerciseId

  const handleNameChange = (value: string) => {
    setRegisterError(null)
    const matched = exercises.find((exercise) => exercise.name === value.trim())
    onChange(value, matched?.id ?? null)
  }

  const handleRegister = async () => {
    if (!trimmedName) {
      return
    }
    if (!newBodyPart) {
      setRegisterError('部位を選択してください')
      return
    }

    setIsRegistering(true)
    setRegisterError(null)
    try {
      const created = await createExercise({ name: trimmedName, bodyPart: newBodyPart })
      onExerciseCreated(created)
      onChange(created.name, created.id ?? null)
      setNewBodyPart('')
    } catch (registrationError) {
      console.error('Supabaseへの種目登録に失敗しました', registrationError)
      setRegisterError('種目の登録に失敗しました')
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
          {registerError ? <p className="calendar-detail__error">{registerError}</p> : null}
        </div>
      ) : null}
    </label>
  )
}
