import { useEffect, useMemo, useState } from 'react'
import { mockAppData } from '../mockData'
import type {
  DateString,
  DailyCondition,
  DailyProgram,
  Exercise,
  FatigueLevel,
  MealLog,
  MealType,
  MonthlyProgram,
  TrainingLog,
} from '../types'
import './MonthlyCalendar.css'

const weekDays = ['日', '月', '火', '水', '木', '金', '土']

function toDateKey(year: number, month: number, day: number): DateString {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as DateString
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
  }).format(date)
}

function getProgramLabel(program: DailyProgram) {
  if (program.type === 'rest' || program.type === 'recovery') {
    return '休養日'
  }

  if (program.type === 'cardio') {
    return '有酸素'
  }

  if (program.type === 'mobility') {
    return '可動域'
  }

  return program.title
}

function getProgramSummary(program: DailyProgram) {
  if (program.type === 'rest' || program.type === 'recovery') {
    return '休養日'
  }

  if (!program.exercises.length && !program.cardio) {
    return program.title
  }

  const parts = [program.title]

  if (program.exercises.length > 0) {
    parts.push(`${program.exercises.length}種目`)
  }

  if (program.cardio) {
    parts.push(`${program.cardio.durationMinutes}分`)
  }

  return parts.join('・')
}

function formatExerciseSummary(exercises: DailyProgram['exercises']) {
  if (exercises.length === 0) {
    return '記録なし'
  }

  return exercises
    .map((exercise) => `${exercise.name} ${exercise.sets}セット ${exercise.targetReps}`)
    .join(' / ')
}

function formatCardioSummary(cardio: DailyProgram['cardio']) {
  if (!cardio) {
    return '記録なし'
  }

  return `${cardio.durationMinutes}分 / ${cardio.intensity} / ${cardio.notes ?? 'メモなし'}`
}

function formatTrainingLogItem(exercise: Exercise) {
  const weight = exercise.targetWeight ? ` / ${exercise.targetWeight}` : ''
  return `${exercise.name} ${exercise.sets}セット ${exercise.targetReps}${weight}${exercise.notes ? ` / ${exercise.notes}` : ''}`
}

function formatConditionSummary(condition: DailyCondition) {
  return `${condition.weight.toFixed(1)}kg / ${condition.sleepHours.toFixed(1)}時間 / 疲労度${condition.fatigue}/5`
}

function getMealTypeLabel(mealType: MealType) {
  switch (mealType) {
    case 'breakfast':
      return '朝食'
    case 'lunch':
      return '昼食'
    case 'dinner':
      return '夕食'
    case 'snack':
      return '間食'
    default:
      return 'その他'
  }
}

function parseFoodList(input: string) {
  return input
    .split(/[,、]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function getProgramForDate(programs: MonthlyProgram | undefined, dateKey: DateString) {
  if (!programs) {
    return []
  }

  return programs.dailyPrograms.filter((program) => program.date === dateKey)
}

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

type MealLogFormState = {
  mealType: MealType | ''
  foods: string
  calories: string
  protein: string
  fat: string
  carbohydrates: string
  notes: string
}

type MealLogFormErrors = {
  mealType?: string
  foods?: string
  calories?: string
  protein?: string
  fat?: string
  carbohydrates?: string
}

type ConditionFormState = {
  weight: string
  sleepHours: string
  fatigue: FatigueLevel | ''
  notes: string
}

type ConditionFormErrors = {
  weight?: string
  sleepHours?: string
  fatigue?: string
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

const createEmptyMealFormState = (): MealLogFormState => ({
  mealType: '',
  foods: '',
  calories: '0',
  protein: '0',
  fat: '0',
  carbohydrates: '0',
  notes: '',
})

const createEmptyMealFormErrors = (): MealLogFormErrors => ({})

const createEmptyConditionFormState = (): ConditionFormState => ({
  weight: '',
  sleepHours: '',
  fatigue: '',
  notes: '',
})

const createEmptyConditionFormErrors = (): ConditionFormErrors => ({})

type MonthlyCalendarProps = {
  trainingLogs: TrainingLog[]
  setTrainingLogs: React.Dispatch<React.SetStateAction<TrainingLog[]>>
  mealLogs: MealLog[]
  setMealLogs: React.Dispatch<React.SetStateAction<MealLog[]>>
  dailyConditions: DailyCondition[]
  setDailyConditions: React.Dispatch<React.SetStateAction<DailyCondition[]>>
}

export function MonthlyCalendar({
  trainingLogs,
  setTrainingLogs,
  mealLogs,
  setMealLogs,
  dailyConditions,
  setDailyConditions,
}: MonthlyCalendarProps) {
  const today = new Date()
  const [displayDate, setDisplayDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState<DateString>(toDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate()))
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingLogIndex, setEditingLogIndex] = useState<number | null>(null)
  const [formState, setFormState] = useState<TrainingLogFormState>(createEmptyFormState())
  const [formErrors, setFormErrors] = useState<TrainingLogFormErrors[]>(createEmptyFormErrors())
  const [formSummaryError, setFormSummaryError] = useState<string | null>(null)
  const [isMealFormOpen, setIsMealFormOpen] = useState(false)
  const [editingMealIndex, setEditingMealIndex] = useState<number | null>(null)
  const [mealFormState, setMealFormState] = useState<MealLogFormState>(createEmptyMealFormState())
  const [mealFormErrors, setMealFormErrors] = useState<MealLogFormErrors>(createEmptyMealFormErrors())
  const [mealFormSummaryError, setMealFormSummaryError] = useState<string | null>(null)
  const [isConditionFormOpen, setIsConditionFormOpen] = useState(false)
  const [editingConditionIndex, setEditingConditionIndex] = useState<number | null>(null)
  const [conditionFormState, setConditionFormState] = useState<ConditionFormState>(createEmptyConditionFormState())
  const [conditionFormErrors, setConditionFormErrors] = useState<ConditionFormErrors>(createEmptyConditionFormErrors())
  const [conditionFormSummaryError, setConditionFormSummaryError] = useState<string | null>(null)

  const year = displayDate.getFullYear()
  const month = displayDate.getMonth()
  const monthlyProgram = useMemo(
    () => mockAppData.monthlyPrograms.find((program) => program.year === year && program.month === month + 1),
    [month, year],
  )

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const startDate = new Date(firstDay)
    startDate.setDate(firstDay.getDate() - firstDay.getDay())

    const days: Array<{
      date: Date
      dateKey: DateString
      isCurrentMonth: boolean
      programs: DailyProgram[]
    }> = []

    for (let index = 0; index < 42; index += 1) {
      const currentDate = new Date(startDate)
      currentDate.setDate(startDate.getDate() + index)
      const dateKey = toDateKey(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate())

      days.push({
        date: currentDate,
        dateKey,
        isCurrentMonth: currentDate.getMonth() === month,
        programs: getProgramForDate(monthlyProgram, dateKey),
      })
    }

    return days
  }, [month, monthlyProgram, year])

  const selectedPrograms = useMemo(() => {
    return getProgramForDate(monthlyProgram, selectedDate)
  }, [monthlyProgram, selectedDate])

  const selectedTrainingLogs = useMemo(
    () => trainingLogs.map((log, index) => ({ log, index })).filter(({ log }) => log.date === selectedDate),
    [selectedDate, trainingLogs],
  )

  const selectedCondition = useMemo(() => dailyConditions.find((condition) => condition.date === selectedDate), [dailyConditions, selectedDate])

  const selectedMealLogs = useMemo(
    () => mealLogs.map((mealLog, index) => ({ mealLog, index })).filter(({ mealLog }) => mealLog.date === selectedDate),
    [mealLogs, selectedDate],
  )

  const mealTotals = useMemo(
    () =>
      selectedMealLogs.reduce(
        (totals, { mealLog }) => ({
          calories: totals.calories + mealLog.calories,
          protein: totals.protein + mealLog.protein,
          fat: totals.fat + mealLog.fat,
          carbohydrates: totals.carbohydrates + mealLog.carbohydrates,
        }),
        { calories: 0, protein: 0, fat: 0, carbohydrates: 0 },
      ),
    [selectedMealLogs],
  )

  useEffect(() => {
    setIsFormOpen(false)
    setEditingLogIndex(null)
    setIsMealFormOpen(false)
    setEditingMealIndex(null)
    setIsConditionFormOpen(false)
    setEditingConditionIndex(null)
  }, [selectedDate])

  const changeMonth = (direction: -1 | 1) => {
    const nextDate = new Date(displayDate)
    nextDate.setMonth(displayDate.getMonth() + direction)
    setDisplayDate(nextDate)
  }

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

  const openMealForm = (mealIndex?: number) => {
    const existingLog = typeof mealIndex === 'number' ? mealLogs[mealIndex] : null

    setEditingMealIndex(typeof mealIndex === 'number' ? mealIndex : null)
    setMealFormState(
      existingLog
        ? {
            mealType: existingLog.mealType,
            foods: existingLog.foods.join('、'),
            calories: String(existingLog.calories),
            protein: String(existingLog.protein),
            fat: String(existingLog.fat),
            carbohydrates: String(existingLog.carbohydrates),
            notes: existingLog.notes ?? '',
          }
        : createEmptyMealFormState(),
    )
    setMealFormErrors(createEmptyMealFormErrors())
    setMealFormSummaryError(null)
    setIsFormOpen(false)
    setIsMealFormOpen(true)
  }

  const handleMealFieldChange = (field: keyof MealLogFormState, value: string) => {
    setMealFormState((current) => ({ ...current, [field]: value }))
  }

  const validateMealForm = () => {
    const errors: MealLogFormErrors = {}
    const caloriesValue = Number(mealFormState.calories)
    const proteinValue = Number(mealFormState.protein)
    const fatValue = Number(mealFormState.fat)
    const carbohydrateValue = Number(mealFormState.carbohydrates)

    if (!mealFormState.mealType) {
      errors.mealType = '食事タイプは必須です'
    }
    if (!mealFormState.foods.trim()) {
      errors.foods = '食品・食事内容は必須です'
    }
    if (!Number.isFinite(caloriesValue) || caloriesValue < 0) {
      errors.calories = 'カロリーは0以上の数値で入力してください'
    }
    if (!Number.isFinite(proteinValue) || proteinValue < 0) {
      errors.protein = 'タンパク質は0以上の数値で入力してください'
    }
    if (!Number.isFinite(fatValue) || fatValue < 0) {
      errors.fat = '脂質は0以上の数値で入力してください'
    }
    if (!Number.isFinite(carbohydrateValue) || carbohydrateValue < 0) {
      errors.carbohydrates = '炭水化物は0以上の数値で入力してください'
    }

    const hasErrors = Object.keys(errors).length > 0
    if (hasErrors) {
      setMealFormSummaryError('入力内容にエラーがあります。各項目を確認してください')
    } else {
      setMealFormSummaryError(null)
    }

    setMealFormErrors(errors)
    return !hasErrors
  }

  const saveMealLog = () => {
    if (!validateMealForm()) {
      return
    }

    const nextLog: MealLog = {
      date: selectedDate,
      mealType: mealFormState.mealType as MealType,
      foods: parseFoodList(mealFormState.foods),
      calories: Number(mealFormState.calories) || 0,
      protein: Number(mealFormState.protein) || 0,
      fat: Number(mealFormState.fat) || 0,
      carbohydrates: Number(mealFormState.carbohydrates) || 0,
      notes: mealFormState.notes.trim() || undefined,
    }

    setMealLogs((current) => {
      if (editingMealIndex !== null) {
        const updated = [...current]
        updated[editingMealIndex] = nextLog
        return updated
      }

      return [...current, nextLog]
    })

    setIsMealFormOpen(false)
    setEditingMealIndex(null)
  }

  const deleteMealLog = (mealIndex: number) => {
    const confirmed = window.confirm('この食事記録を本当に削除しますか？')
    if (!confirmed) {
      return
    }

    setMealLogs((current) => {
      const updated = [...current]
      updated.splice(mealIndex, 1)
      return updated
    })

    if (editingMealIndex === mealIndex) {
      setIsMealFormOpen(false)
      setEditingMealIndex(null)
    }
    if (editingMealIndex !== null && editingMealIndex > mealIndex) {
      setEditingMealIndex(editingMealIndex - 1)
    }
  }

  const openConditionForm = (conditionIndex?: number) => {
    const existingCondition = typeof conditionIndex === 'number' && conditionIndex >= 0 ? dailyConditions[conditionIndex] : null

    setEditingConditionIndex(typeof conditionIndex === 'number' && conditionIndex >= 0 ? conditionIndex : null)
    setConditionFormState(
      existingCondition
        ? {
            weight: String(existingCondition.weight),
            sleepHours: String(existingCondition.sleepHours),
            fatigue: existingCondition.fatigue,
            notes: existingCondition.notes ?? '',
          }
        : createEmptyConditionFormState(),
    )
    setConditionFormErrors(createEmptyConditionFormErrors())
    setConditionFormSummaryError(null)
    setIsFormOpen(false)
    setIsMealFormOpen(false)
    setIsConditionFormOpen(true)
  }

  const handleConditionFieldChange = (field: keyof ConditionFormState, value: string | FatigueLevel | '') => {
    setConditionFormState((current) => ({ ...current, [field]: value }))
  }

  const validateConditionForm = () => {
    const errors: ConditionFormErrors = {}
    const weightValue = Number(conditionFormState.weight)
    const sleepValue = Number(conditionFormState.sleepHours)

    if (!Number.isFinite(weightValue) || weightValue <= 0) {
      errors.weight = '体重は0より大きい数値で入力してください'
    }
    if (!Number.isFinite(sleepValue) || sleepValue < 0 || sleepValue > 24) {
      errors.sleepHours = '睡眠時間は0以上24以下の数値で入力してください'
    }
    if (!conditionFormState.fatigue) {
      errors.fatigue = '疲労度は必須です'
    }

    const hasErrors = Object.keys(errors).length > 0
    if (hasErrors) {
      setConditionFormSummaryError('入力内容にエラーがあります。各項目を確認してください')
    } else {
      setConditionFormSummaryError(null)
    }

    setConditionFormErrors(errors)
    return !hasErrors
  }

  const saveCondition = () => {
    if (!validateConditionForm()) {
      return
    }

    const nextCondition = {
      date: selectedDate,
      weight: Number(conditionFormState.weight),
      sleepHours: Number(conditionFormState.sleepHours),
      fatigue: conditionFormState.fatigue as FatigueLevel,
      notes: conditionFormState.notes.trim() || undefined,
    }

    setDailyConditions((current) => {
      if (editingConditionIndex !== null) {
        const updated = [...current]
        updated[editingConditionIndex] = nextCondition
        return updated
      }

      return [...current, nextCondition]
    })

    setIsConditionFormOpen(false)
    setEditingConditionIndex(null)
  }

  const deleteCondition = () => {
    if (!selectedCondition) {
      return
    }

    const confirmed = window.confirm('この体調記録を本当に削除しますか？')
    if (!confirmed) {
      return
    }

    setDailyConditions((current) => current.filter((condition) => condition.date !== selectedDate))
    setIsConditionFormOpen(false)
    setEditingConditionIndex(null)
  }

  return (
    <section className="calendar-card">
      <div className="calendar-card__header">
        <div>
          <p className="calendar-card__eyebrow">月間カレンダー</p>
          <h2>{formatMonthLabel(displayDate)}</h2>
        </div>
        <div className="calendar-nav">
          <button type="button" className="calendar-nav__button" onClick={() => changeMonth(-1)}>
            前月
          </button>
          <button type="button" className="calendar-nav__button" onClick={() => changeMonth(1)}>
            翌月
          </button>
        </div>
      </div>

      <div className="calendar-weekdays" aria-label="曜日">
        {weekDays.map((day) => (
          <div key={day} className="calendar-weekday">
            {day}
          </div>
        ))}
      </div>

      <div className="calendar-grid">
        {calendarDays.map((day) => {
          const isSelected = selectedDate === day.dateKey
          const isToday =
            day.date.getFullYear() === today.getFullYear() &&
            day.date.getMonth() === today.getMonth() &&
            day.date.getDate() === today.getDate()

          return (
            <button
              key={day.dateKey}
              type="button"
              className={`calendar-day ${day.isCurrentMonth ? '' : 'calendar-day--muted'} ${isSelected ? 'calendar-day--selected' : ''} ${isToday ? 'calendar-day--today' : ''}`}
              onClick={() => setSelectedDate(day.dateKey)}
            >
              <span className="calendar-day__number">{day.date.getDate()}</span>
              <span className="calendar-day__content">
                {day.programs.length === 0 ? '予定なし' : getProgramLabel(day.programs[0])}
              </span>
            </button>
          )
        })}
      </div>

      <div className="calendar-detail">
        <div className="calendar-detail__header">
          <h3>{selectedDate}</h3>
          <span className="calendar-detail__badge">詳細</span>
        </div>

        <div className="calendar-detail__group">
          <div className="calendar-detail__section">
            <h4>トレーニング予定</h4>
            {selectedPrograms.length === 0 ? (
              <p className="calendar-detail__empty">記録なし</p>
            ) : (
              selectedPrograms.map((program) => (
                <div key={`${selectedDate}-${program.title}`} className="calendar-detail__item">
                  <strong>{getProgramLabel(program)}</strong>
                  <p>{getProgramSummary(program)}</p>
                  {program.description ? <p className="calendar-detail__description">{program.description}</p> : null}
                  <p className="calendar-detail__description">種目: {formatExerciseSummary(program.exercises)}</p>
                  <p className="calendar-detail__description">有酸素: {formatCardioSummary(program.cardio)}</p>
                  {program.notes ? <p className="calendar-detail__description">メモ: {program.notes}</p> : null}
                </div>
              ))
            )}
          </div>

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

          <div className="calendar-detail__section">
            <div className="calendar-detail__section-header">
              <h4>体調</h4>
              <button type="button" className="calendar-detail__secondary-button" onClick={() => openConditionForm()}>
                体調を記録
              </button>
            </div>
            {selectedCondition && !isConditionFormOpen ? (
              <div className="calendar-detail__item">
                <p>{formatConditionSummary(selectedCondition)}</p>
                <div className="calendar-detail__condition-actions">
                  <button
                    type="button"
                    className="calendar-detail__edit-button"
                    onClick={() => {
                      const conditionIndex = dailyConditions.findIndex((condition) => condition.date === selectedDate)
                      if (conditionIndex >= 0) {
                        openConditionForm(conditionIndex)
                      }
                    }}
                  >
                    編集
                  </button>
                  <button type="button" className="calendar-detail__delete-button" onClick={deleteCondition}>
                    削除
                  </button>
                </div>
                {selectedCondition.notes ? <p className="calendar-detail__description">メモ: {selectedCondition.notes}</p> : null}
              </div>
            ) : isConditionFormOpen ? (
              <div className="calendar-detail__form">
                {conditionFormSummaryError ? <p className="calendar-detail__form-error">{conditionFormSummaryError}</p> : null}
                <label className="calendar-detail__field">
                  <span>体重 (kg)</span>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={conditionFormState.weight}
                    onChange={(event) => handleConditionFieldChange('weight', event.target.value)}
                    placeholder="例: 64.8"
                  />
                  {conditionFormErrors.weight ? <p className="calendar-detail__error">{conditionFormErrors.weight}</p> : null}
                </label>
                <label className="calendar-detail__field">
                  <span>睡眠時間 (時間)</span>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    step="0.1"
                    value={conditionFormState.sleepHours}
                    onChange={(event) => handleConditionFieldChange('sleepHours', event.target.value)}
                    placeholder="例: 7.0"
                  />
                  {conditionFormErrors.sleepHours ? <p className="calendar-detail__error">{conditionFormErrors.sleepHours}</p> : null}
                </label>
                <label className="calendar-detail__field">
                  <span>疲労度</span>
                  <select
                    value={conditionFormState.fatigue}
                    onChange={(event) => handleConditionFieldChange('fatigue', event.target.value as FatigueLevel | '')}
                  >
                    <option value="">選択してください</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                  {conditionFormErrors.fatigue ? <p className="calendar-detail__error">{conditionFormErrors.fatigue}</p> : null}
                </label>
                <label className="calendar-detail__field calendar-detail__field--full">
                  <span>体調メモ</span>
                  <textarea
                    rows={3}
                    value={conditionFormState.notes}
                    onChange={(event) => handleConditionFieldChange('notes', event.target.value)}
                    placeholder="今日の体調の特徴や感想"
                  />
                </label>
                <div className="calendar-detail__actions">
                  <button type="button" className="calendar-detail__button" onClick={saveCondition}>
                    保存する
                  </button>
                </div>
              </div>
            ) : (
              <p className="calendar-detail__empty">記録なし</p>
            )}
          </div>

          <div className="calendar-detail__section">
            <h4>食事記録</h4>
            <button type="button" className="calendar-detail__button" onClick={() => openMealForm()}>
              食事・PFCを記録
            </button>

            {selectedMealLogs.length > 0 && !isMealFormOpen ? (
              <>
                <div className="calendar-detail__meal-totals">
                  合計: {mealTotals.calories}kcal / P{mealTotals.protein}g F{mealTotals.fat}g C{mealTotals.carbohydrates}g
                </div>
                <div className="calendar-detail__log-list">
                  {selectedMealLogs.map(({ mealLog, index }) => (
                    <div key={`${selectedDate}-meal-${index}`} className="calendar-detail__meal-item">
                      <div className="calendar-detail__meal-head">
                        <span>{getMealTypeLabel(mealLog.mealType)}</span>
                        <div className="calendar-detail__log-actions">
                          <button type="button" className="calendar-detail__edit-button" onClick={() => openMealForm(index)}>
                            編集
                          </button>
                          <button type="button" className="calendar-detail__delete-button" onClick={() => deleteMealLog(index)}>
                            削除
                          </button>
                        </div>
                      </div>
                      <div className="calendar-detail__meal-row">内容: {mealLog.foods.join('・')}</div>
                      <div className="calendar-detail__meal-row">
                        カロリー: {mealLog.calories}kcal / P{mealLog.protein}g F{mealLog.fat}g C{mealLog.carbohydrates}g
                      </div>
                      {mealLog.notes ? <p className="calendar-detail__description">メモ: {mealLog.notes}</p> : null}
                    </div>
                  ))}
                </div>
              </>
            ) : isMealFormOpen ? (
              <div className="calendar-detail__form">
                {mealFormSummaryError ? <p className="calendar-detail__form-error">{mealFormSummaryError}</p> : null}
                <label className="calendar-detail__field">
                  <span>食事タイプ</span>
                  <select value={mealFormState.mealType} onChange={(event) => handleMealFieldChange('mealType', event.target.value)}>
                    <option value="">選択してください</option>
                    <option value="breakfast">朝食</option>
                    <option value="lunch">昼食</option>
                    <option value="dinner">夕食</option>
                    <option value="snack">間食</option>
                    <option value="other">その他</option>
                  </select>
                  {mealFormErrors.mealType ? <p className="calendar-detail__error">{mealFormErrors.mealType}</p> : null}
                </label>

                <label className="calendar-detail__field calendar-detail__field--full">
                  <span>食品・食事内容</span>
                  <input
                    type="text"
                    value={mealFormState.foods}
                    onChange={(event) => handleMealFieldChange('foods', event.target.value)}
                    placeholder="例: 鶏むね肉、玄米、サラダ"
                  />
                  {mealFormErrors.foods ? <p className="calendar-detail__error">{mealFormErrors.foods}</p> : null}
                </label>

                <div className="calendar-detail__inline-fields">
                  <label className="calendar-detail__field">
                    <span>カロリー (kcal)</span>
                    <input
                      type="number"
                      min="0"
                      value={mealFormState.calories}
                      onChange={(event) => handleMealFieldChange('calories', event.target.value)}
                    />
                    {mealFormErrors.calories ? <p className="calendar-detail__error">{mealFormErrors.calories}</p> : null}
                  </label>
                  <label className="calendar-detail__field">
                    <span>タンパク質 (g)</span>
                    <input
                      type="number"
                      min="0"
                      value={mealFormState.protein}
                      onChange={(event) => handleMealFieldChange('protein', event.target.value)}
                    />
                    {mealFormErrors.protein ? <p className="calendar-detail__error">{mealFormErrors.protein}</p> : null}
                  </label>
                </div>

                <div className="calendar-detail__inline-fields">
                  <label className="calendar-detail__field">
                    <span>脂質 (g)</span>
                    <input
                      type="number"
                      min="0"
                      value={mealFormState.fat}
                      onChange={(event) => handleMealFieldChange('fat', event.target.value)}
                    />
                    {mealFormErrors.fat ? <p className="calendar-detail__error">{mealFormErrors.fat}</p> : null}
                  </label>
                  <label className="calendar-detail__field">
                    <span>炭水化物 (g)</span>
                    <input
                      type="number"
                      min="0"
                      value={mealFormState.carbohydrates}
                      onChange={(event) => handleMealFieldChange('carbohydrates', event.target.value)}
                    />
                    {mealFormErrors.carbohydrates ? <p className="calendar-detail__error">{mealFormErrors.carbohydrates}</p> : null}
                  </label>
                </div>

                <label className="calendar-detail__field calendar-detail__field--full">
                  <span>メモ</span>
                  <textarea
                    value={mealFormState.notes}
                    onChange={(event) => handleMealFieldChange('notes', event.target.value)}
                    rows={3}
                    placeholder="今日の気づきや食事コメント"
                  />
                </label>

                <div className="calendar-detail__actions">
                  <button type="button" className="calendar-detail__button" onClick={saveMealLog}>
                    保存する
                  </button>
                </div>
              </div>
            ) : (
              <p className="calendar-detail__empty">記録なし</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
