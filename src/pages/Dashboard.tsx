import { useMemo, useState } from 'react'
import './Dashboard.css'
import { GoalPanel } from '../components/GoalPanel'
import type { Goals } from '../api/goals'
import type { DailyCondition, DailyProgram, DateString, MealLog, TrainingLog } from '../types'

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

type DashboardProps = {
  trainingLogs: TrainingLog[]
  mealLogs: MealLog[]
  dailyConditions: DailyCondition[]
  goals: Goals
  setGoals: React.Dispatch<React.SetStateAction<Goals>>
  today: Date
  todayString: DateString
  formattedDate: string
  todayProgram: DailyProgram | undefined
  setActiveView: React.Dispatch<React.SetStateAction<'dashboard' | 'calendar' | 'progress'>>
}

export function Dashboard({
  trainingLogs,
  mealLogs,
  dailyConditions,
  goals,
  setGoals,
  today,
  todayString,
  formattedDate,
  todayProgram,
  setActiveView,
}: DashboardProps) {
  const [isTodayDetailOpen, setIsTodayDetailOpen] = useState(false)
  const [isNutritionOpen, setIsNutritionOpen] = useState(false)

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

      <section className="panel-card accordion-item">
        <button
          type="button"
          className="accordion-header"
          onClick={() => setIsTodayDetailOpen((current) => !current)}
        >
          今日の内容
          <span className="accordion-chevron">{isTodayDetailOpen ? '▼' : '▶'}</span>
        </button>
        {isTodayDetailOpen ? (
          <div className="accordion-body">
            <p className="panel-card__description">筋トレ・食事・体調を一目で確認できます。</p>
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
          </div>
        ) : null}
      </section>

      <section className="panel-card accordion-item">
        <button
          type="button"
          className="accordion-header"
          onClick={() => setIsNutritionOpen((current) => !current)}
        >
          今日の食事・PFC
          <span className="accordion-chevron">{isNutritionOpen ? '▼' : '▶'}</span>
        </button>
        {isNutritionOpen ? (
          <div className="accordion-body">
            <p className="panel-card__description">1日の栄養進捗を目標値と比較して表示します。</p>
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
        ) : null}
      </section>

      <GoalPanel goals={goals} setGoals={setGoals} trainingLogs={trainingLogs} dailyConditions={dailyConditions} today={today} />

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
  )
}
