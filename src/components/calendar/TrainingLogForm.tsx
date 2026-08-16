import { useEffect, useMemo, useState } from 'react'
import { fetchExercises } from '../../api/trainingLogs'
import { completeScheduleForDate } from '../../api/trainingSchedules'
import type { TrainingTemplateInput } from '../../api/trainingTemplates'
import { formatTrainingLogItem } from '../../utils/calendarHelpers'
import { ExerciseNameInput } from './ExerciseNameInput'
import { TrainingTemplateSection } from './TrainingTemplateSection'
import { useToast } from '../../hooks/useToast'
import type { DateString, ExerciseDefinition, TrainingLog, TrainingLogExercise, TrainingSet, TrainingTemplate } from '../../types'

type SimpleSetInput = {
  sets: string
  reps: string
  weight: string
}

type DetailedSetInput = {
  key: string
  reps: string
  weight: string
}

type TrainingLogFormExercise = {
  key: string
  exerciseName: string
  exerciseId: string | null
  mode: 'simple' | 'detailed'
  simple: SimpleSetInput
  detailedSets: DetailedSetInput[]
}

type TrainingLogFormExerciseErrors = {
  name?: string
  sets?: string
  reps?: string
  weight?: string
  detailedSets?: Array<{ reps?: string; weight?: string }>
}

type TrainingLogFormState = {
  completed: boolean
  notes: string
  exercises: TrainingLogFormExercise[]
}

let exerciseKeyCounter = 0
function createExerciseKey() {
  exerciseKeyCounter += 1
  return `exercise-${exerciseKeyCounter}`
}

let setKeyCounter = 0
function createSetKey() {
  setKeyCounter += 1
  return `set-${setKeyCounter}`
}

const createEmptySimple = (): SimpleSetInput => ({ sets: '3', reps: '10', weight: '' })

const createEmptyDetailedSet = (): DetailedSetInput => ({ key: createSetKey(), reps: '', weight: '' })

const createEmptyExercise = (): TrainingLogFormExercise => ({
  key: createExerciseKey(),
  exerciseName: '',
  exerciseId: null,
  mode: 'simple',
  simple: createEmptySimple(),
  detailedSets: [],
})

const createEmptyFormState = (): TrainingLogFormState => ({
  completed: true,
  notes: '',
  exercises: [createEmptyExercise()],
})

const createEmptyFormErrors = (count = 1): TrainingLogFormExerciseErrors[] => Array.from({ length: count }, () => ({}))

type TrainingLogFormProps = {
  trainingLogs: TrainingLog[]
  setTrainingLogs: React.Dispatch<React.SetStateAction<TrainingLog[]>>
  selectedDate: DateString
  isFormOpen: boolean
  setIsFormOpen: React.Dispatch<React.SetStateAction<boolean>>
  onScheduleUpdated?: () => void
}

export function TrainingLogForm({
  trainingLogs,
  setTrainingLogs,
  selectedDate,
  isFormOpen,
  setIsFormOpen,
  onScheduleUpdated,
}: TrainingLogFormProps) {
  const { showToast } = useToast()
  const [editingLogIndex, setEditingLogIndex] = useState<number | null>(null)
  const [formState, setFormState] = useState<TrainingLogFormState>(createEmptyFormState())
  const [formErrors, setFormErrors] = useState<TrainingLogFormExerciseErrors[]>(createEmptyFormErrors())
  const [formSummaryError, setFormSummaryError] = useState<string | null>(null)
  const [exercises, setExercises] = useState<ExerciseDefinition[]>([])
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null)

  useEffect(() => {
    fetchExercises()
      .then(setExercises)
      .catch((error) => {
        console.error('Supabaseから種目一覧の取得に失敗しました', error)
      })
  }, [])

  const selectedTrainingLogs = useMemo(
    () => trainingLogs.map((log, index) => ({ log, index })).filter(({ log }) => log.date === selectedDate),
    [selectedDate, trainingLogs],
  )

  useEffect(() => {
    setIsFormOpen(false)
    setEditingLogIndex(null)
  }, [selectedDate, setIsFormOpen])

  const handleExerciseCreated = (exercise: ExerciseDefinition) => {
    setExercises((current) => [...current, exercise].sort((a, b) => a.name.localeCompare(b.name)))
  }

  const openForm = (logIndex?: number) => {
    const existingLog = typeof logIndex === 'number' ? trainingLogs[logIndex] : null

    const nextExercises: TrainingLogFormExercise[] =
      existingLog?.exercises.length
        ? existingLog.exercises.map((exercise) => ({
            key: createExerciseKey(),
            exerciseName: exercise.exercise?.name ?? '',
            exerciseId: exercise.exerciseId,
            mode: 'detailed',
            simple: createEmptySimple(),
            detailedSets:
              exercise.sets.length > 0
                ? exercise.sets.map((set) => ({
                    key: createSetKey(),
                    reps: set.reps != null ? String(set.reps) : '',
                    weight: set.weight != null ? String(set.weight) : '',
                  }))
                : [createEmptyDetailedSet()],
          }))
        : [createEmptyExercise()]

    setEditingLogIndex(typeof logIndex === 'number' ? logIndex : null)
    setFormState({
      completed: existingLog?.completed ?? true,
      notes: existingLog?.notes ?? '',
      exercises: nextExercises,
    })
    setFormErrors(createEmptyFormErrors(nextExercises.length))
    setFormSummaryError(null)
    setAppliedTemplateId(null)
    setIsFormOpen(true)
  }

  const handleExerciseNameChange = (index: number, name: string, exerciseId: string | null) => {
    setFormState((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index ? { ...exercise, exerciseName: name, exerciseId } : exercise,
      ),
    }))
  }

  const handleSimpleFieldChange = (index: number, field: keyof SimpleSetInput, value: string) => {
    setFormState((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index ? { ...exercise, simple: { ...exercise.simple, [field]: value } } : exercise,
      ),
    }))
  }

  const toggleDetailedMode = (index: number) => {
    setFormState((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) => {
        if (exerciseIndex !== index) {
          return exercise
        }

        if (exercise.mode === 'simple') {
          const setsCount = Math.max(1, Number(exercise.simple.sets) || 1)
          const detailedSets =
            exercise.detailedSets.length > 0
              ? exercise.detailedSets
              : Array.from({ length: setsCount }, () => ({
                  key: createSetKey(),
                  reps: exercise.simple.reps,
                  weight: exercise.simple.weight,
                }))
          return { ...exercise, mode: 'detailed' as const, detailedSets }
        }

        return { ...exercise, mode: 'simple' as const }
      }),
    }))
  }

  const handleDetailedSetChange = (index: number, setIndex: number, field: 'reps' | 'weight', value: string) => {
    setFormState((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index
          ? {
              ...exercise,
              detailedSets: exercise.detailedSets.map((set, currentSetIndex) =>
                currentSetIndex === setIndex ? { ...set, [field]: value } : set,
              ),
            }
          : exercise,
      ),
    }))
  }

  const addDetailedSetRow = (index: number) => {
    setFormState((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index ? { ...exercise, detailedSets: [...exercise.detailedSets, createEmptyDetailedSet()] } : exercise,
      ),
    }))
  }

  const removeDetailedSetRow = (index: number, setIndex: number) => {
    setFormState((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) =>
        exerciseIndex === index
          ? { ...exercise, detailedSets: exercise.detailedSets.filter((_, currentSetIndex) => currentSetIndex !== setIndex) }
          : exercise,
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

  const applyTemplate = (template: TrainingTemplate) => {
    const nextExercises: TrainingLogFormExercise[] =
      template.exercises.length > 0
        ? template.exercises.map((templateExercise) => ({
            key: createExerciseKey(),
            exerciseName: templateExercise.exercise?.name ?? '',
            exerciseId: templateExercise.exerciseId,
            mode: 'simple' as const,
            simple: {
              sets: templateExercise.targetSets != null ? String(templateExercise.targetSets) : '3',
              reps:
                templateExercise.targetReps && /^\d+$/.test(templateExercise.targetReps.trim())
                  ? templateExercise.targetReps.trim()
                  : '',
              weight: templateExercise.targetWeight != null ? String(templateExercise.targetWeight) : '',
            },
            detailedSets: [],
          }))
        : [createEmptyExercise()]

    setFormState((current) => ({ ...current, exercises: nextExercises }))
    setFormErrors(createEmptyFormErrors(nextExercises.length))
    setFormSummaryError(null)
    setAppliedTemplateId(template.id ?? null)
  }

  const currentExerciseTargets: TrainingTemplateInput['exercises'] = useMemo(
    () =>
      formState.exercises
        .filter((exercise) => exercise.exerciseId)
        .map((exercise, index) => ({
          exerciseId: exercise.exerciseId as string,
          orderIndex: index,
          targetSets:
            exercise.mode === 'simple'
              ? exercise.simple.sets.trim() === ''
                ? undefined
                : Number(exercise.simple.sets)
              : exercise.detailedSets.length || undefined,
          targetReps:
            exercise.mode === 'simple'
              ? exercise.simple.reps.trim() || undefined
              : exercise.detailedSets[0]?.reps.trim() || undefined,
          targetWeight:
            exercise.mode === 'simple'
              ? exercise.simple.weight.trim() !== ''
                ? Number(exercise.simple.weight)
                : undefined
              : exercise.detailedSets[0]?.weight.trim()
              ? Number(exercise.detailedSets[0].weight)
              : undefined,
        })),
    [formState.exercises],
  )

  const validateForm = () => {
    const errors: TrainingLogFormExerciseErrors[] = formState.exercises.map((exercise) => {
      const error: TrainingLogFormExerciseErrors = {}
      const trimmedName = exercise.exerciseName.trim()

      if (!trimmedName) {
        return error
      }

      if (!exercise.exerciseId) {
        error.name = '候補から選択するか、新規登録してください'
        return error
      }

      if (exercise.mode === 'simple') {
        const setsValue = Number(exercise.simple.sets)
        const repsValue = Number(exercise.simple.reps)
        const weightValue = exercise.simple.weight.trim() === '' ? NaN : Number(exercise.simple.weight)

        if (!Number.isFinite(setsValue) || setsValue < 1) {
          error.sets = 'セット数は1以上の数値で入力してください'
        }
        if (!Number.isFinite(repsValue) || repsValue < 1) {
          error.reps = '回数は1以上の数値で入力してください'
        }
        if (exercise.simple.weight.trim() !== '' && (!Number.isFinite(weightValue) || weightValue < 0)) {
          error.weight = '重量は0以上の数値で入力してください'
        }
      } else {
        if (exercise.detailedSets.length === 0) {
          error.sets = '少なくとも1セット入力してください'
        }

        error.detailedSets = exercise.detailedSets.map((set) => {
          const setError: { reps?: string; weight?: string } = {}
          const repsValue = Number(set.reps)
          const weightValue = set.weight.trim() === '' ? NaN : Number(set.weight)

          if (!Number.isFinite(repsValue) || repsValue < 1) {
            setError.reps = '回数は1以上の数値で入力してください'
          }
          if (set.weight.trim() !== '' && (!Number.isFinite(weightValue) || weightValue < 0)) {
            setError.weight = '重量は0以上の数値で入力してください'
          }

          return setError
        })
      }

      return error
    })

    const hasExercise = formState.exercises.some((exercise) => exercise.exerciseName.trim() !== '')
    const hasErrors = errors.some(
      (error) =>
        error.name || error.sets || error.reps || error.weight || error.detailedSets?.some((set) => set.reps || set.weight),
    )

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
    showToast('トレーニング実績を削除しました', 'success')
  }

  const saveTrainingLog = () => {
    if (!validateForm()) {
      return
    }

    const nextExercises: TrainingLogExercise[] = formState.exercises
      .filter((exercise) => exercise.exerciseName.trim() !== '' && exercise.exerciseId)
      .map((exercise, index) => {
        const sets: TrainingSet[] =
          exercise.mode === 'simple'
            ? Array.from({ length: Number(exercise.simple.sets) || 0 }, (_, setIndex) => ({
                setNumber: setIndex + 1,
                reps: exercise.simple.reps.trim() === '' ? undefined : Number(exercise.simple.reps),
                weight: exercise.simple.weight.trim() === '' ? undefined : Number(exercise.simple.weight),
                isWarmup: false,
              }))
            : exercise.detailedSets.map((set, setIndex) => ({
                setNumber: setIndex + 1,
                reps: set.reps.trim() === '' ? undefined : Number(set.reps),
                weight: set.weight.trim() === '' ? undefined : Number(set.weight),
                isWarmup: false,
              }))

        return {
          exerciseId: exercise.exerciseId as string,
          orderIndex: index,
          exercise: exercises.find((candidate) => candidate.id === exercise.exerciseId),
          sets,
        }
      })

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

    if (nextLog.completed) {
      completeScheduleForDate(selectedDate, appliedTemplateId ?? undefined)
        .then(() => {
          onScheduleUpdated?.()
        })
        .catch((error) => {
          console.error('Supabaseへの予定の完了連動に失敗しました', error)
          showToast('予定の完了連動に失敗しました', 'error')
        })
    }

    setIsFormOpen(false)
    setEditingLogIndex(null)
    showToast('トレーニング実績を保存しました', 'success')
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

          <TrainingTemplateSection currentExerciseTargets={currentExerciseTargets} onApplyTemplate={applyTemplate} />

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
            <div key={exercise.key} className="calendar-detail__exercise-form">
              <ExerciseNameInput
                exercises={exercises}
                onExerciseCreated={handleExerciseCreated}
                name={exercise.exerciseName}
                exerciseId={exercise.exerciseId}
                onChange={(name, exerciseId) => handleExerciseNameChange(index, name, exerciseId)}
                error={formErrors[index]?.name}
              />

              <button type="button" className="calendar-detail__secondary-button" onClick={() => toggleDetailedMode(index)}>
                {exercise.mode === 'simple' ? '詳細入力に切り替える' : 'シンプル入力に戻す'}
              </button>

              {exercise.mode === 'simple' ? (
                <>
                  <div className="calendar-detail__inline-fields">
                    <label className="calendar-detail__field">
                      <span>セット数</span>
                      <input
                        type="number"
                        min="1"
                        value={exercise.simple.sets}
                        onChange={(event) => handleSimpleFieldChange(index, 'sets', event.target.value)}
                      />
                      {formErrors[index]?.sets ? <p className="calendar-detail__error">{formErrors[index]?.sets}</p> : null}
                    </label>
                    <label className="calendar-detail__field">
                      <span>回数</span>
                      <input
                        type="number"
                        min="1"
                        value={exercise.simple.reps}
                        onChange={(event) => handleSimpleFieldChange(index, 'reps', event.target.value)}
                        placeholder="8"
                      />
                      {formErrors[index]?.reps ? <p className="calendar-detail__error">{formErrors[index]?.reps}</p> : null}
                    </label>
                  </div>
                  <label className="calendar-detail__field">
                    <span>重量 (kg)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={exercise.simple.weight}
                      onChange={(event) => handleSimpleFieldChange(index, 'weight', event.target.value)}
                      placeholder="60"
                    />
                    {formErrors[index]?.weight ? <p className="calendar-detail__error">{formErrors[index]?.weight}</p> : null}
                  </label>
                </>
              ) : (
                <>
                  {formErrors[index]?.sets ? <p className="calendar-detail__error">{formErrors[index]?.sets}</p> : null}
                  {exercise.detailedSets.map((set, setIndex) => (
                    <div key={set.key} className="calendar-detail__inline-fields">
                      <label className="calendar-detail__field">
                        <span>{setIndex + 1}セット目 回数</span>
                        <input
                          type="number"
                          min="1"
                          value={set.reps}
                          onChange={(event) => handleDetailedSetChange(index, setIndex, 'reps', event.target.value)}
                        />
                        {formErrors[index]?.detailedSets?.[setIndex]?.reps ? (
                          <p className="calendar-detail__error">{formErrors[index]?.detailedSets?.[setIndex]?.reps}</p>
                        ) : null}
                      </label>
                      <label className="calendar-detail__field">
                        <span>重量 (kg)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={set.weight}
                          onChange={(event) => handleDetailedSetChange(index, setIndex, 'weight', event.target.value)}
                        />
                        {formErrors[index]?.detailedSets?.[setIndex]?.weight ? (
                          <p className="calendar-detail__error">{formErrors[index]?.detailedSets?.[setIndex]?.weight}</p>
                        ) : null}
                      </label>
                      <button
                        type="button"
                        className="calendar-detail__delete-button"
                        onClick={() => removeDetailedSetRow(index, setIndex)}
                      >
                        削除
                      </button>
                    </div>
                  ))}
                  <button type="button" className="calendar-detail__secondary-button" onClick={() => addDetailedSetRow(index)}>
                    セットを追加
                  </button>
                </>
              )}
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
