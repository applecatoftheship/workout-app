import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { MonthlyCalendar } from './components/MonthlyCalendar'
import { ProgressGraph } from './components/ProgressGraph'
import { mockAppData } from './mockData'
import type { DateString, DailyCondition, MealLog, TrainingLog } from './types'

const STORAGE_KEY = 'workout-app-data-v1'

type Goals = {
  targetWeight: number
  targetSleepHours: number
  weeklyTrainingGoal: number
  monthlyTrainingGoal: number
  dailyCalorieGoal: number
  dailyProteinGoal: number
  dailyFatGoal: number
  dailyCarbohydrateGoal: number
}

type PersistedAppState = {
  trainingLogs: TrainingLog[]
  mealLogs: MealLog[]
  dailyConditions: DailyCondition[]
  goals: Goals
}

const defaultGoals: Goals = {
  targetWeight: 65,
  targetSleepHours: 7.5,
  weeklyTrainingGoal: 3,
  monthlyTrainingGoal: 12,
  dailyCalorieGoal: 2200,
  dailyProteinGoal: 150,
  dailyFatGoal: 60,
  dailyCarbohydrateGoal: 250,
}

function cloneTrainingLogs(logs: TrainingLog[]) {
  return logs.map((log) => ({
    ...log,
    exercises: log.exercises.map((exercise) => ({ ...exercise })),
  }))
}

function createDefaultState(): PersistedAppState {
  return {
    trainingLogs: cloneTrainingLogs(mockAppData.trainingLogs),
    mealLogs: mockAppData.mealLogs.map((log) => ({ ...log })),
    dailyConditions: mockAppData.dailyConditions.map((condition) => ({ ...condition })),
    goals: { ...defaultGoals },
  }
}

function loadPersistedState(): PersistedAppState {
  if (typeof window === 'undefined') {
    return createDefaultState()
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY)
  if (!rawValue) {
    return createDefaultState()
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedAppState>
    const trainingLogs = Array.isArray(parsed.trainingLogs)
      ? cloneTrainingLogs(parsed.trainingLogs as TrainingLog[])
      : mockAppData.trainingLogs.map((log) => ({ ...log, exercises: log.exercises.map((exercise) => ({ ...exercise })) }))
    const mealLogs = Array.isArray(parsed.mealLogs)
      ? (parsed.mealLogs as MealLog[]).map((log) => ({ ...log }))
      : mockAppData.mealLogs.map((log) => ({ ...log }))
    const dailyConditions = Array.isArray(parsed.dailyConditions)
      ? (parsed.dailyConditions as DailyCondition[]).map((condition) => ({ ...condition }))
      : mockAppData.dailyConditions.map((condition) => ({ ...condition }))
    const goals = parsed.goals && typeof parsed.goals === 'object'
      ? {
          targetWeight: typeof parsed.goals.targetWeight === 'number' ? parsed.goals.targetWeight : defaultGoals.targetWeight,
          targetSleepHours: typeof parsed.goals.targetSleepHours === 'number' ? parsed.goals.targetSleepHours : defaultGoals.targetSleepHours,
          weeklyTrainingGoal: typeof parsed.goals.weeklyTrainingGoal === 'number' ? parsed.goals.weeklyTrainingGoal : defaultGoals.weeklyTrainingGoal,
          monthlyTrainingGoal: typeof parsed.goals.monthlyTrainingGoal === 'number' ? parsed.goals.monthlyTrainingGoal : defaultGoals.monthlyTrainingGoal,
          dailyCalorieGoal: typeof parsed.goals.dailyCalorieGoal === 'number' ? parsed.goals.dailyCalorieGoal : defaultGoals.dailyCalorieGoal,
          dailyProteinGoal: typeof parsed.goals.dailyProteinGoal === 'number' ? parsed.goals.dailyProteinGoal : defaultGoals.dailyProteinGoal,
          dailyFatGoal: typeof parsed.goals.dailyFatGoal === 'number' ? parsed.goals.dailyFatGoal : defaultGoals.dailyFatGoal,
          dailyCarbohydrateGoal: typeof parsed.goals.dailyCarbohydrateGoal === 'number' ? parsed.goals.dailyCarbohydrateGoal : defaultGoals.dailyCarbohydrateGoal,
        }
      : { ...defaultGoals }

    return {
      trainingLogs,
      mealLogs,
      dailyConditions,
      goals,
    }
  } catch {
    // Fallback to the built-in mock data when storage contents are invalid.
  }

  return createDefaultState()
}

function savePersistedState(state: PersistedAppState) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

const today = new Date()
const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}` as DateString
const formattedDate = new Intl.DateTimeFormat('ja-JP', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
}).format(today)

const todayProgram = mockAppData.monthlyPrograms
  .flatMap((program) => program.dailyPrograms)
  .find((program) => program.date === todayString)


function formatExerciseList(exercises: Array<{ name: string; sets: number; targetReps: string; targetWeight?: string }>) {
  if (exercises.length === 0) {
    return '記録なし'
  }

  return exercises
    .map((exercise) => {
      const weightText = exercise.targetWeight ? ` / ${exercise.targetWeight}` : ''
      return `${exercise.name} ${exercise.sets}セット ${exercise.targetReps}${weightText}`
    })
    .join(' / ')
}

function formatAggregatedMealInfo(mealLogs: MealLog[]) {
  if (mealLogs.length === 0) {
    return '記録なし'
  }

  const totals = mealLogs.reduce(
    (acc, log) => ({
      calories: acc.calories + log.calories,
      protein: acc.protein + log.protein,
      fat: acc.fat + log.fat,
      carbohydrates: acc.carbohydrates + log.carbohydrates,
    }),
    { calories: 0, protein: 0, fat: 0, carbohydrates: 0 },
  )

  const mealSummary = mealLogs.map((log) => `${log.mealType}(${log.foods.join('・')})`).join(' / ')
  return `${mealSummary} / 合計 ${totals.calories}kcal / P${totals.protein}g F${totals.fat}g C${totals.carbohydrates}g`
}

function App() {
  const initialState = useMemo(() => loadPersistedState(), [])
  const [activeView, setActiveView] = useState<'dashboard' | 'calendar' | 'progress'>('dashboard')
  const [trainingLogs, setTrainingLogs] = useState<TrainingLog[]>(() => initialState.trainingLogs)
  const [mealLogs, setMealLogs] = useState<MealLog[]>(() => initialState.mealLogs)
  const [dailyConditions, setDailyConditions] = useState<DailyCondition[]>(() => initialState.dailyConditions)
  const [goals, setGoals] = useState<Goals>(() => initialState.goals)
  const [isEditingGoals, setIsEditingGoals] = useState(false)
  const [goalFormState, setGoalFormState] = useState({
    targetWeight: String(initialState.goals.targetWeight),
    targetSleepHours: String(initialState.goals.targetSleepHours),
    weeklyTrainingGoal: String(initialState.goals.weeklyTrainingGoal),
    monthlyTrainingGoal: String(initialState.goals.monthlyTrainingGoal),
    dailyCalorieGoal: String(initialState.goals.dailyCalorieGoal),
    dailyProteinGoal: String(initialState.goals.dailyProteinGoal),
    dailyFatGoal: String(initialState.goals.dailyFatGoal),
    dailyCarbohydrateGoal: String(initialState.goals.dailyCarbohydrateGoal),
  })
  const [goalFormErrors, setGoalFormErrors] = useState<{
    targetWeight?: string
    targetSleepHours?: string
    weeklyTrainingGoal?: string
    monthlyTrainingGoal?: string
    dailyCalorieGoal?: string
    dailyProteinGoal?: string
    dailyFatGoal?: string
    dailyCarbohydrateGoal?: string
  }>({})
  const [goalFormSummaryError, setGoalFormSummaryError] = useState<string | null>(null)

  useEffect(() => {
    savePersistedState({ trainingLogs, mealLogs, dailyConditions, goals })
  }, [dailyConditions, goals, mealLogs, trainingLogs])

  const todayTrainingLogs = useMemo(
    () => trainingLogs.filter((log) => log.date === todayString),
    [trainingLogs],
  )
  const todayCondition = useMemo(
    () => dailyConditions.find((condition) => condition.date === todayString),
    [dailyConditions],
  )
  const todayMealLogs = useMemo(
    () => mealLogs.filter((log) => log.date === todayString),
    [mealLogs],
  )

  const todayTrainingExercises = todayTrainingLogs.length > 0 ? todayTrainingLogs.flatMap((log) => log.exercises) : todayProgram?.exercises ?? []
  const trainingPlanSummary = todayTrainingLogs.length > 0
    ? `${todayTrainingExercises.length}種目 / ${todayTrainingLogs.some((log) => log.completed) ? '完了' : '未完了'}`
    : todayProgram
    ? `${todayProgram.title} / ${todayProgram.description}`
    : '記録なし'
  const trainingPlanBadge = todayTrainingLogs.length > 0 ? '実績あり' : todayProgram ? todayProgram.type : '休息'
  const todayTrainingSummary = todayTrainingLogs.length > 0
    ? `${todayTrainingLogs.some((log) => log.completed) ? '完了' : '未完了'} / ${todayTrainingLogs
        .map((log) => log.notes ?? 'メモなし')
        .join(' / ')}`
    : '記録なし'
  const todayMealTotals = useMemo(() => {
    return todayMealLogs.reduce(
      (acc, log) => ({
        calories: acc.calories + log.calories,
        protein: acc.protein + log.protein,
        fat: acc.fat + log.fat,
        carbohydrates: acc.carbohydrates + log.carbohydrates,
      }),
      { calories: 0, protein: 0, fat: 0, carbohydrates: 0 },
    )
  }, [todayMealLogs])

  const todayMealSummary = todayMealLogs.length > 0 ? formatAggregatedMealInfo(todayMealLogs) : '記録なし'

  const todayNutritionMetrics = [
    {
      label: 'カロリー',
      value: `${todayMealTotals.calories} / ${goals.dailyCalorieGoal} kcal`,
      rate: goals.dailyCalorieGoal > 0 ? Math.min(100, Math.round((todayMealTotals.calories / goals.dailyCalorieGoal) * 100)) : 0,
    },
    {
      label: 'タンパク質',
      value: `${todayMealTotals.protein} / ${goals.dailyProteinGoal} g`,
      rate: goals.dailyProteinGoal > 0 ? Math.min(100, Math.round((todayMealTotals.protein / goals.dailyProteinGoal) * 100)) : 0,
    },
    {
      label: '脂質',
      value: `${todayMealTotals.fat} / ${goals.dailyFatGoal} g`,
      rate: goals.dailyFatGoal > 0 ? Math.min(100, Math.round((todayMealTotals.fat / goals.dailyFatGoal) * 100)) : 0,
    },
    {
      label: '炭水化物',
      value: `${todayMealTotals.carbohydrates} / ${goals.dailyCarbohydrateGoal} g`,
      rate: goals.dailyCarbohydrateGoal > 0 ? Math.min(100, Math.round((todayMealTotals.carbohydrates / goals.dailyCarbohydrateGoal) * 100)) : 0,
    },
  ]

  const todayTrainingStatus = todayTrainingLogs.length === 0
    ? '要注意'
    : todayTrainingLogs.every((log) => log.completed)
    ? '順調'
    : 'あと少し'

  const todayTrainingStatusTone = todayTrainingStatus === '順調'
    ? 'good'
    : todayTrainingStatus === 'あと少し'
    ? 'warning'
    : 'alert'

  const todayTrainingStatusMessage = todayTrainingLogs.length === 0
    ? '記録なし'
    : todayTrainingLogs.every((log) => log.completed)
    ? '完了'
    : '未完了'

  const todaySleepStatus = todayCondition
    ? todayCondition.sleepHours >= goals.targetSleepHours
      ? '順調'
      : todayCondition.sleepHours >= goals.targetSleepHours * 0.9
      ? 'あと少し'
      : '要注意'
    : '記録なし'

  const todaySleepStatusTone = todayCondition
    ? todaySleepStatus === '順調'
      ? 'good'
      : todaySleepStatus === 'あと少し'
      ? 'warning'
      : 'alert'
    : 'neutral'

  const todaySleepDifferenceText = todayCondition
    ? (() => {
        const diff = goals.targetSleepHours - todayCondition.sleepHours
        return diff <= 0
          ? `目標以上 (${Math.abs(diff).toFixed(1)}h 超過)`
          : `あと ${diff.toFixed(1)}h`
      })()
    : '記録なし'

  const todayFoodMetric = todayNutritionMetrics[0]
  const todayProteinMetric = todayNutritionMetrics[1]

  const getProgressTone = (rate: number) =>
    rate >= 90 ? 'good' : rate >= 70 ? 'warning' : 'alert'

  const todayFoodTone = getProgressTone(todayFoodMetric.rate)
  const todayProteinTone = getProgressTone(todayProteinMetric.rate)

  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const currentMonthTrainingCount = trainingLogs.filter((log) => log.date.startsWith(currentMonthKey)).length
  const currentMonthConditions = dailyConditions.filter((condition) => condition.date.startsWith(currentMonthKey))
  const averageSleepHours =
    currentMonthConditions.length > 0
      ? currentMonthConditions.reduce((sum, condition) => sum + condition.sleepHours, 0) / currentMonthConditions.length
      : null
  const achievementRate = goals.monthlyTrainingGoal > 0 ? Math.min(100, Math.round((currentMonthTrainingCount / goals.monthlyTrainingGoal) * 100)) : 0

  const latestCondition = useMemo(() => {
    return [...dailyConditions].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  }, [dailyConditions])
  const latestWeightText = latestCondition ? `${latestCondition.weight.toFixed(1)}kg` : '記録なし'
  const targetWeightText = `${goals.targetWeight.toFixed(1)}kg`
  const weightDifferenceText = latestCondition
    ? `${Math.abs(latestCondition.weight - goals.targetWeight).toFixed(1)}kg`
    : '記録なし'

  const averageSleepText = averageSleepHours != null ? `${averageSleepHours.toFixed(1)}時間` : '記録なし'
  const sleepDifferenceText = averageSleepHours != null
    ? `${(goals.targetSleepHours - averageSleepHours).toFixed(1)}時間`
    : '記録なし'

  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  const weekStartKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`
  const weekEndKey = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`
  const weekTrainingCount = trainingLogs.filter((log) => log.date >= weekStartKey && log.date <= weekEndKey).length

  const openGoalEditor = () => {
    setGoalFormState({
      targetWeight: String(goals.targetWeight),
      targetSleepHours: String(goals.targetSleepHours),
      weeklyTrainingGoal: String(goals.weeklyTrainingGoal),
      monthlyTrainingGoal: String(goals.monthlyTrainingGoal),
      dailyCalorieGoal: String(goals.dailyCalorieGoal),
      dailyProteinGoal: String(goals.dailyProteinGoal),
      dailyFatGoal: String(goals.dailyFatGoal),
      dailyCarbohydrateGoal: String(goals.dailyCarbohydrateGoal),
    })
    setGoalFormErrors({})
    setGoalFormSummaryError(null)
    setIsEditingGoals(true)
  }

  const handleGoalFieldChange = (field: keyof typeof goalFormState, value: string) => {
    setGoalFormState((current) => ({ ...current, [field]: value }))
  }

  const validateGoalForm = () => {
    const errors: typeof goalFormErrors = {}
    const targetWeight = Number(goalFormState.targetWeight)
    const targetSleepHours = Number(goalFormState.targetSleepHours)
    const weeklyTrainingGoal = Number(goalFormState.weeklyTrainingGoal)
    const monthlyTrainingGoal = Number(goalFormState.monthlyTrainingGoal)
    const dailyCalorieGoal = Number(goalFormState.dailyCalorieGoal)
    const dailyProteinGoal = Number(goalFormState.dailyProteinGoal)
    const dailyFatGoal = Number(goalFormState.dailyFatGoal)
    const dailyCarbohydrateGoal = Number(goalFormState.dailyCarbohydrateGoal)

    if (!Number.isFinite(targetWeight) || targetWeight <= 0) {
      errors.targetWeight = '目標体重は0より大きい数値で入力してください'
    }
    if (!Number.isFinite(targetSleepHours) || targetSleepHours <= 0 || targetSleepHours > 24) {
      errors.targetSleepHours = '睡眠時間は0より大きく24以下の数値で入力してください'
    }
    if (!Number.isFinite(weeklyTrainingGoal) || !Number.isInteger(weeklyTrainingGoal) || weeklyTrainingGoal < 0) {
      errors.weeklyTrainingGoal = '週の目標回数は0以上の整数で入力してください'
    }
    if (!Number.isFinite(monthlyTrainingGoal) || !Number.isInteger(monthlyTrainingGoal) || monthlyTrainingGoal < 0) {
      errors.monthlyTrainingGoal = '8月の目標回数は0以上の整数で入力してください'
    }
    if (!Number.isFinite(dailyCalorieGoal) || dailyCalorieGoal <= 0) {
      errors.dailyCalorieGoal = '1日の目標カロリーは0より大きい数値で入力してください'
    }
    if (!Number.isFinite(dailyProteinGoal) || dailyProteinGoal <= 0) {
      errors.dailyProteinGoal = '1日の目標タンパク質は0より大きい数値で入力してください'
    }
    if (!Number.isFinite(dailyFatGoal) || dailyFatGoal <= 0) {
      errors.dailyFatGoal = '1日の目標脂質は0より大きい数値で入力してください'
    }
    if (!Number.isFinite(dailyCarbohydrateGoal) || dailyCarbohydrateGoal <= 0) {
      errors.dailyCarbohydrateGoal = '1日の目標炭水化物は0より大きい数値で入力してください'
    }

    const hasErrors = Object.keys(errors).length > 0
    if (hasErrors) {
      setGoalFormSummaryError('入力内容にエラーがあります。各項目を確認してください')
    } else {
      setGoalFormSummaryError(null)
    }
    setGoalFormErrors(errors)
    return !hasErrors
  }

  const saveGoalSettings = () => {
    if (!validateGoalForm()) {
      return
    }

    setGoals({
      targetWeight: Number(goalFormState.targetWeight),
      targetSleepHours: Number(goalFormState.targetSleepHours),
      weeklyTrainingGoal: Number(goalFormState.weeklyTrainingGoal),
      monthlyTrainingGoal: Number(goalFormState.monthlyTrainingGoal),
      dailyCalorieGoal: Number(goalFormState.dailyCalorieGoal),
      dailyProteinGoal: Number(goalFormState.dailyProteinGoal),
      dailyFatGoal: Number(goalFormState.dailyFatGoal),
      dailyCarbohydrateGoal: Number(goalFormState.dailyCarbohydrateGoal),
    })
    setIsEditingGoals(false)
  }

  const cancelGoalEdit = () => {
    setIsEditingGoals(false)
    setGoalFormErrors({})
    setGoalFormSummaryError(null)
  }

  const metrics = [
    {
      label: '今日の体重',
      value: todayCondition ? `${todayCondition.weight.toFixed(1)}kg` : '記録なし',
      tone: 'primary',
    },
    {
      label: '今日の睡眠時間',
      value: todayCondition ? `${todayCondition.sleepHours.toFixed(1)}時間` : '記録なし',
      tone: 'secondary',
    },
    {
      label: '今日の疲労度',
      value: todayCondition ? `${todayCondition.fatigue}/5` : '記録なし',
      tone: 'accent',
    },
  ]

  const quickLinks = [
    {
      title: '月間カレンダー',
      description: '今月の予定と達成状況を確認',
      badge: 'Calendar',
      targetView: 'calendar' as const,
    },
    {
      title: 'トレーニング記録',
      description: 'セット数と負荷を振り返る',
      badge: 'Log',
      targetView: 'calendar' as const,
    },
    {
      title: '食事・PFC記録',
      description: '栄養バランスを管理する',
      badge: 'Meal',
      targetView: 'dashboard' as const,
    },
    {
      title: '進捗グラフ',
      description: '体重と体調の推移を見る',
      badge: 'Trend',
      targetView: 'progress' as const,
    },
  ]

  return (
    <main className="app-shell">
      <div className="view-switcher" role="tablist" aria-label="ビュー切り替え">
        <button
          type="button"
          className={`view-switcher__button ${activeView === 'dashboard' ? 'view-switcher__button--active' : ''}`}
          onClick={() => setActiveView('dashboard')}
        >
          ダッシュボード
        </button>
        <button
          type="button"
          className={`view-switcher__button ${activeView === 'calendar' ? 'view-switcher__button--active' : ''}`}
          onClick={() => setActiveView('calendar')}
        >
          月間カレンダー
        </button>
      </div>

      {activeView === 'calendar' ? (
        <MonthlyCalendar
          trainingLogs={trainingLogs}
          setTrainingLogs={setTrainingLogs}
          mealLogs={mealLogs}
          setMealLogs={setMealLogs}
          dailyConditions={dailyConditions}
          setDailyConditions={setDailyConditions}
        />
      ) : activeView === 'progress' ? (
        <ProgressGraph trainingLogs={trainingLogs} dailyConditions={dailyConditions} targetWeight={goals.targetWeight} />
      ) : (
        <>
          <section className="hero-card">
            <div className="hero-top">
              <div>
                <p className="eyebrow">Workout App</p>
                <h1>{formattedDate}</h1>
              </div>
              <span className="status-pill">今日もGood</span>
            </div>

            <div className="summary-card">
              <div className="summary-card__header">
                <h2>今日のトレーニング</h2>
                <span className="chip">{trainingPlanBadge}</span>
              </div>
              <p className="summary-card__body">{trainingPlanSummary}</p>
            </div>

            <div className="metrics-grid">
              {metrics.map((item) => (
                <article key={item.label} className={`metric-card ${item.tone}`}>
                  <span className="metric-label">{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>

            <div className="status-overview">
              <article className="status-card">
                <div className="status-card__header">
                  <span className="status-card__label">トレーニング</span>
                  <span className={`status-chip status-chip--${todayTrainingStatusTone}`}>{todayTrainingStatus}</span>
                </div>
                <div className="status-card__value">{todayTrainingLogs.length > 0 ? `${todayTrainingLogs.length}件` : '記録なし'}</div>
                <p className="status-card__detail">{todayTrainingStatusMessage}</p>
              </article>

              <article className="status-card">
                <div className="status-card__header">
                  <span className="status-card__label">食事</span>
                  <span className={`status-chip status-chip--${todayFoodTone}`}>{todayFoodMetric.rate >= 90 ? '順調' : todayFoodMetric.rate >= 70 ? 'あと少し' : '要注意'}</span>
                </div>
                <div className="status-card__value">{todayFoodMetric.value}</div>
                <p className="status-card__detail">達成率 {todayFoodMetric.rate}%</p>
                <div className="status-progress">
                  <div className="status-progress__fill" style={{ width: `${todayFoodMetric.rate}%` }} />
                </div>
              </article>

              <article className="status-card">
                <div className="status-card__header">
                  <span className="status-card__label">タンパク質</span>
                  <span className={`status-chip status-chip--${todayProteinTone}`}>{todayProteinMetric.rate >= 90 ? '順調' : todayProteinMetric.rate >= 70 ? 'あと少し' : '要注意'}</span>
                </div>
                <div className="status-card__value">{todayProteinMetric.value}</div>
                <p className="status-card__detail">達成率 {todayProteinMetric.rate}%</p>
                <div className="status-progress">
                  <div className="status-progress__fill" style={{ width: `${todayProteinMetric.rate}%` }} />
                </div>
              </article>

              <article className="status-card">
                <div className="status-card__header">
                  <span className="status-card__label">睡眠</span>
                  <span className={`status-chip status-chip--${todaySleepStatusTone}`}>{todaySleepStatus}</span>
                </div>
                <div className="status-card__value">{todayCondition ? `${todayCondition.sleepHours.toFixed(1)}時間` : '記録なし'}</div>
                <p className="status-card__detail">目標 {goals.targetSleepHours.toFixed(1)}時間</p>
                <p className="status-card__note">{todayCondition ? todaySleepDifferenceText : '記録なし'}</p>
              </article>
            </div>
          </section>

          <section className="panel-card">
            <div className="panel-card__header">
              <h2>今日の内容</h2>
              <p>筋トレ・食事・体調を一目で確認できます。</p>
            </div>

            <div className="detail-list">
              <div className="detail-item">
                <span className="detail-label">トレーニング内容</span>
                <p>{todayTrainingLogs.length > 0 ? formatExerciseList(todayTrainingExercises) : todayProgram ? formatExerciseList(todayProgram.exercises) : '記録なし'}</p>
              </div>
              <div className="detail-item">
                <span className="detail-label">実績</span>
                <p>{todayTrainingSummary}</p>
              </div>
              <div className="detail-item">
                <span className="detail-label">食事情報</span>
                <p>{todayMealSummary}</p>
              </div>
              <div className="detail-item">
                <span className="detail-label">体調メモ</span>
                <p>{todayCondition ? todayCondition.notes ?? 'メモなし' : '記録なし'}</p>
              </div>
            </div>

            <div className="nutrition-section">
              <div className="panel-card__header">
                <h2>今日の食事・PFC</h2>
                <p>1日の栄養進捗を目標値と比較して表示します。</p>
              </div>
              {todayMealLogs.length === 0 ? (
                <p className="no-record">今日の食事記録はありません</p>
              ) : (
                <div className="nutrition-grid">
                  {todayNutritionMetrics.map((metric) => (
                    <article key={metric.label} className="nutrition-card">
                      <span className="nutrition-card__label">{metric.label}</span>
                      <div className="nutrition-card__value">{metric.value}</div>
                      <div className="nutrition-card__rate">{metric.rate}%</div>
                      <div className="nutrition-progress" aria-label={`${metric.label}進捗`}>
                        <div className="nutrition-progress__fill" style={{ width: `${metric.rate}%` }} />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="panel-card goal-panel">
            <div className="panel-card__header">
              <div>
                <h2>8月の目標</h2>
                <p>今月の進捗を確認し、目標を調整できます。</p>
              </div>
              <button type="button" className="button button--secondary" onClick={openGoalEditor}>
                目標を編集
              </button>
            </div>

            {isEditingGoals ? (
              <div className="dashboard-goals-form">
                {goalFormSummaryError ? <p className="form-error">{goalFormSummaryError}</p> : null}
                <label className="dashboard-goals-field">
                  <span>目標体重 (kg)</span>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={goalFormState.targetWeight}
                    onChange={(event) => handleGoalFieldChange('targetWeight', event.target.value)}
                  />
                  {goalFormErrors.targetWeight ? <p className="form-error">{goalFormErrors.targetWeight}</p> : null}
                </label>
                <label className="dashboard-goals-field">
                  <span>目標睡眠時間 (時間)</span>
                  <input
                    type="number"
                    min="0.1"
                    max="24"
                    step="0.1"
                    value={goalFormState.targetSleepHours}
                    onChange={(event) => handleGoalFieldChange('targetSleepHours', event.target.value)}
                  />
                  {goalFormErrors.targetSleepHours ? <p className="form-error">{goalFormErrors.targetSleepHours}</p> : null}
                </label>
                <label className="dashboard-goals-field">
                  <span>週の目標トレーニング回数</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={goalFormState.weeklyTrainingGoal}
                    onChange={(event) => handleGoalFieldChange('weeklyTrainingGoal', event.target.value)}
                  />
                  {goalFormErrors.weeklyTrainingGoal ? <p className="form-error">{goalFormErrors.weeklyTrainingGoal}</p> : null}
                </label>
                <label className="dashboard-goals-field">
                  <span>8月の目標トレーニング回数</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={goalFormState.monthlyTrainingGoal}
                    onChange={(event) => handleGoalFieldChange('monthlyTrainingGoal', event.target.value)}
                  />
                  {goalFormErrors.monthlyTrainingGoal ? <p className="form-error">{goalFormErrors.monthlyTrainingGoal}</p> : null}
                </label>
                <label className="dashboard-goals-field">
                  <span>1日の目標カロリー</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={goalFormState.dailyCalorieGoal}
                    onChange={(event) => handleGoalFieldChange('dailyCalorieGoal', event.target.value)}
                  />
                  {goalFormErrors.dailyCalorieGoal ? <p className="form-error">{goalFormErrors.dailyCalorieGoal}</p> : null}
                </label>
                <label className="dashboard-goals-field">
                  <span>1日の目標タンパク質</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={goalFormState.dailyProteinGoal}
                    onChange={(event) => handleGoalFieldChange('dailyProteinGoal', event.target.value)}
                  />
                  {goalFormErrors.dailyProteinGoal ? <p className="form-error">{goalFormErrors.dailyProteinGoal}</p> : null}
                </label>
                <label className="dashboard-goals-field">
                  <span>1日の目標脂質</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={goalFormState.dailyFatGoal}
                    onChange={(event) => handleGoalFieldChange('dailyFatGoal', event.target.value)}
                  />
                  {goalFormErrors.dailyFatGoal ? <p className="form-error">{goalFormErrors.dailyFatGoal}</p> : null}
                </label>
                <label className="dashboard-goals-field">
                  <span>1日の目標炭水化物</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={goalFormState.dailyCarbohydrateGoal}
                    onChange={(event) => handleGoalFieldChange('dailyCarbohydrateGoal', event.target.value)}
                  />
                  {goalFormErrors.dailyCarbohydrateGoal ? <p className="form-error">{goalFormErrors.dailyCarbohydrateGoal}</p> : null}
                </label>
                <div className="dashboard-goals-actions">
                  <button type="button" className="button button--primary" onClick={saveGoalSettings}>
                    保存する
                  </button>
                  <button type="button" className="button button--secondary" onClick={cancelGoalEdit}>
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <div className="goal-grid">
                <article className="goal-card goal-card--training">
                  <div className="goal-card__title">8月トレーニング</div>
                  <div className="goal-card__stat">{currentMonthTrainingCount} / {goals.monthlyTrainingGoal}回</div>
                  <div className="goal-card__percent">{achievementRate}%</div>
                  <div className="progress-meter" aria-label="8月トレーニング進捗">
                    <div className="progress-meter__fill" style={{ width: `${achievementRate}%` }} />
                  </div>
                </article>

                <article className="goal-card">
                  <div className="goal-card__title">目標体重</div>
                  <div className="goal-card__stat">現在 {latestWeightText}</div>
                  <div className="goal-card__stat">目標 {targetWeightText}</div>
                  <div className="goal-card__note">あと {weightDifferenceText}</div>
                </article>

                <article className="goal-card">
                  <div className="goal-card__title">睡眠</div>
                  <div className="goal-card__stat">平均 {averageSleepText}</div>
                  <div className="goal-card__stat">目標 {goals.targetSleepHours.toFixed(1)}時間</div>
                  <div className="goal-card__note">あと {sleepDifferenceText}</div>
                </article>

                <article className="goal-card">
                  <div className="goal-card__title">今週のトレーニング</div>
                  <div className="goal-card__stat">今週 {weekTrainingCount} / {goals.weeklyTrainingGoal}回</div>
                  <div className="goal-card__note">この週の進捗を確認できます。</div>
                </article>
              </div>
            )}
          </section>

          <section className="links-section" aria-label="機能メニュー">
            {quickLinks.map((link) => (
              <button
                key={link.title}
                type="button"
                className="link-card"
                onClick={() => {
                  setActiveView(link.targetView)
                }}
              >
                <span className="link-card__badge">{link.badge}</span>
                <strong>{link.title}</strong>
                <p>{link.description}</p>
              </button>
            ))}
          </section>
        </>
      )}
    </main>
  )
}

export default App
