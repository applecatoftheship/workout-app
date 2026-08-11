import { useEffect, useMemo, useState } from 'react'
import type { DateString, Exercise, TrainingLog } from '../../types'
import { formatTrainingLogItem } from '../../utils/calendarHelpers'

type TrainingLogFormExercise = {
  name: string
  sets: string
  targetReps: string
  targetWeight: string
  notes: string
}

type TrainingLogFormErrors = {
  name?: string
  sets?: string
  targetReps?: string
  targetWeight?: string
}

type TrainingLogFormState = {
  completed: boolean
  notes: string
  exercises: TrainingLogFormExercise[]
}

const createEmptyExercise = (): TrainingLogFormExercise => ({
  name: '',
  sets: '3',
  targetReps: '10',
  targetWeight: '',
  notes: '',
})

const createEmptyFormState = (): TrainingLogFormState => ({
  completed: true,
  notes: '',
  exercises: [createEmptyExercise()],
})

const createEmptyFormErrors = (count = 1): TrainingLogFormErrors[] => Array.from({ length: count }, () => ({}))

type TrainingLogFormProps = {
  trainingLogs: TrainingLog[]
  setTrainingLogs: React.Dispatch<React.SetStateAction<TrainingLog[]>>
  selectedDate: DateString
  isFormOpen: boolean
  setIsFormOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export function TrainingLogForm({ trainingLogs, setTrainingLogs, selectedDate, isFormOpen, setIsFormOpen }: TrainingLogFormProps) {
  const [editingLogIndex, setEditingLogIndex] = useState<number | null>(null)
  const [formState, setFormState] = useState<TrainingLogFormState>(createEmptyFormState())
  const [formErrors, setFormErrors] = useState<TrainingLogFormErrors[]>(createEmptyFormErrors())
  const [formSummaryError, setFormSummaryError] = useState<string | null>(null)

  const selectedTrainingLogs = useMemo(
    () => trainingLogs.map((log, index) => ({ log, index })).filter(({ log }) => log.date === selectedDate),
    [selectedDate, trainingLogs],
  )

  useEffect(() => {
    setIsFormOpen(false)
    setEditingLogIndex(null)
  }, [selectedDate, setIsFormOpen])

  const openForm = (logIndex?: number) => {
    const existingLog = typeof logIndex === 'number' ? trainingLogs[logIndex] : null

    const exercises =
      existingLog?.exercises.length
        ? existingLog.exercises.map((exercise) => ({
            name: exercise.name,
            sets: String(exercise.sets),
            targetReps: exercise.targetReps,
            targetWeight: exercise.targetWeight ?? '',
            notes: exercise.notes ?? '',
          }))
        : [createEmptyExercise()]

    setEditingLogIndex(typeof logIndex === 'number' ? logIndex : null)
    setFormState({
      completed: existingLog?.completed ?? true,
      notes: existingLog?.notes ?? '',
      exercises,
    })
    setFormErrors(createEmptyFormErrors(exercises.length))
    setFormSummaryError(null)
    setIsFormOpen(true)
  }

  const handleExerciseChange = (index: number, field: keyof TrainingLogFormExercise, value: string) => {
    setFormState((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index ? { ...exercise, [field]: value } : exercise,
      ),
    }))
  }

  const addExerciseRow = () => {
    setFormState((current) => ({
      ...current,
      exercises: [...current.exercises, createEmptyExercise()],
    }))
    setFormErrors((current) => [...current, {}])
  }

  const validateForm = () => {
    const errors = formState.exercises.map((exercise) => {
      const error: TrainingLogFormErrors = {}
      const trimmedName = exercise.name.trim()
      const setsValue = Number(exercise.sets)
      const repsValue = Number(exercise.targetReps)
      const weightValue = exercise.targetWeight.trim() === '' ? NaN : Number(exercise.targetWeight)

      if (!trimmedName) {
        error.name = '種目は必須です'
      }
      if (!Number.isFinite(setsValue) || setsValue < 1) {
        error.sets = 'セット数は1以上の数値で入力してください'
      }
      if (!Number.isFinite(repsValue) || repsValue < 1) {
        error.targetReps = '回数は1以上の数値で入力してください'
      }
      if (exercise.targetWeight.trim() !== '' && (!Number.isFinite(weightValue) || weightValue < 0)) {
        error.targetWeight = '重量は0以上の数値で入力してください'
      }

      return error
    })

    const hasExercise = formState.exercises.some((exercise) => exercise.name.trim() !== '')
    const hasErrors = errors.some((error) => Object.keys(error).length > 0)

    if (!hasExercise) {
      setFormSummaryError('少なくとも1つの種目を入力してください')
    } else if (hasErrors) {
      setFormSummaryError('入力内容にエラーがあります。各項目を確認してください')
    } else {
      setFormSummaryError(null)
    }

    setFormErrors(errors)
    return !hasErrors && hasExercise
  }

  const deleteTrainingLog = (logIndex: number) => {
    const confirmed = window.confirm('このトレーニング実績を本当に削除しますか？')
    if (!confirmed) {
      return
    }

    setTrainingLogs((current) => {
      const updated = [...current]
      updated.splice(logIndex, 1)
      return updated
    })

    if (editingLogIndex === logIndex) {
      setIsFormOpen(false)
      setEditingLogIndex(null)
    }
    if (editingLogIndex !== null && editingLogIndex > logIndex) {
      setEditingLogIndex(editingLogIndex - 1)
    }
  }

  const saveTrainingLog = () => {
    if (!validateForm()) {
      return
    }

    const nextExercises: Exercise[] = formState.exercises
      .filter((exercise) => exercise.name.trim() !== '')
      .map((exercise) => ({
        name: exercise.name.trim(),
        sets: Number(exercise.sets) || 0,
        targetReps: exercise.targetReps.trim() || '10',
        targetWeight: exercise.targetWeight.trim() || undefined,
        notes: exercise.notes.trim() || undefined,
      }))

    const nextLog: TrainingLog = {
      date: selectedDate,
      exercises: nextExercises,
      notes: formState.notes.trim() || undefined,
      completed: formState.completed,
    }

    setTrainingLogs((current) => {
      if (editingLogIndex !== null) {
        const updated = [...current]
        updated[editingLogIndex] = nextLog
        return updated
      }

      return [...current, nextLog]
    })

    setIsFormOpen(false)
    setEditingLogIndex(null)
  }

  return (
    <div className="calendar-detail__section">
      <h4>トレーニング実績</h4>
      <button type="button" className="calendar-detail__button" onClick={() => openForm()}>
        実績を記録 / 追加
      </button>

      {selectedTrainingLogs.length > 0 && !isFormOpen ? (
        <div className="calendar-detail__log-list">
          {selectedTrainingLogs.map(({ log, index }) => (
            <div key={`${selectedDate}-${index}`} className="calendar-detail__log-item">
              <div className="calendar-detail__log-head">
                <span>{log.completed ? '完了' : '未完了'}</span>
                <div className="calendar-detail__log-actions">
                  <button type="button" className="calendar-detail__edit-button" onClick={() => openForm(index)}>
                    編集
                  </button>
                  <button type="button" className="calendar-detail__delete-button" onClick={() => deleteTrainingLog(index)}>
                    削除
                  </button>
                </div>
              </div>
              <div className="calendar-detail__log-row">種目:</div>
              <ul className="calendar-detail__exercise-list">
                {log.exercises.map((exercise, exerciseIndex) => (
                  <li key={`${selectedDate}-${index}-${exerciseIndex}`}>{formatTrainingLogItem(exercise)}</li>
                ))}
              </ul>
              <div className="calendar-detail__log-row">メモ: {log.notes ?? 'なし'}</div>
            </div>
          ))}
        </div>
      ) : null}

      {isFormOpen ? (
        <div className="calendar-detail__form">
          {formSummaryError ? <p className="calendar-detail__form-error">{formSummaryError}</p> : null}
          <label className="calendar-detail__field">
            <span>完了/未完了</span>
            <select
              value={formState.completed ? 'completed' : 'pending'}
              onChange={(event) => setFormState((current) => ({ ...current, completed: event.target.value === 'completed' }))}
            >
              <option value="completed">完了</option>
              <option value="pending">未完了</option>
            </select>
          </label>

          {formState.exercises.map((exercise, index) => (
            <div key={`${selectedDate}-${index}`} className="calendar-detail__exercise-form">
              <label className="calendar-detail__field">
                <span>種目</span>
                <input
                  type="text"
                  value={exercise.name}
                  onChange={(event) => handleExerciseChange(index, 'name', event.target.value)}
                  placeholder="例: ベンチプレス"
                />
                {formErrors[index]?.name ? <p className="calendar-detail__error">{formErrors[index]?.name}</p> : null}
              </label>

              <div className="calendar-detail__inline-fields">
                <label className="calendar-detail__field">
                  <span>セット数</span>
                  <input
                    type="number"
                    min="1"
                    value={exercise.sets}
                    onChange={(event) => handleExerciseChange(index, 'sets', event.target.value)}
                  />
                  {formErrors[index]?.sets ? <p className="calendar-detail__error">{formErrors[index]?.sets}</p> : null}
                </label>
                <label className="calendar-detail__field">
                  <span>回数</span>
                  <input
                    type="number"
                    min="1"
                    value={exercise.targetReps}
                    onChange={(event) => handleExerciseChange(index, 'targetReps', event.target.value)}
                    placeholder="8"
                  />
                  {formErrors[index]?.targetReps ? <p className="calendar-detail__error">{formErrors[index]?.targetReps}</p> : null}
                </label>
              </div>

              <div className="calendar-detail__inline-fields">
                <label className="calendar-detail__field">
                  <span>重量</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={exercise.targetWeight}
                    onChange={(event) => handleExerciseChange(index, 'targetWeight', event.target.value)}
                    placeholder="60"
                  />
                  {formErrors[index]?.targetWeight ? <p className="calendar-detail__error">{formErrors[index]?.targetWeight}</p> : null}
                </label>
                <label className="calendar-detail__field">
                  <span>メモ</span>
                  <input
                    type="text"
                    value={exercise.notes}
                    onChange={(event) => handleExerciseChange(index, 'notes', event.target.value)}
                    placeholder="フォームを意識"
                  />
                </label>
              </div>
            </div>
          ))}

          <div className="calendar-detail__actions">
            <button type="button" className="calendar-detail__secondary-button" onClick={addExerciseRow}>
              種目を追加
            </button>
            <label className="calendar-detail__field calendar-detail__field--full">
              <span>メモ</span>
              <textarea
                value={formState.notes}
                onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
                placeholder="今日の感想やポイント"
              />
            </label>
          </div>

          <div className="calendar-detail__actions">
            <button type="button" className="calendar-detail__button" onClick={saveTrainingLog}>
              保存する
            </button>
          </div>
        </div>
      ) : (
        <p className="calendar-detail__empty">記録なし</p>
      )}
    </div>
  )
}
