import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PolarAngleAxis, RadialBar, RadialBarChart } from 'recharts'
import './Dashboard.css'
import { GoalPanel } from '../components/GoalPanel'
import { FatigueIcon, HistoryIcon, SleepIcon, WeightIcon } from '../components/icons'
import { fetchTrainingSchedules } from '../api/trainingSchedules'
import { fetchSoccerLogs } from '../api/soccerLogs'
import { getDayIcons, toDateKey, weekDays } from '../utils/calendarHelpers'
import { APP_VIEW_PATHS } from '../utils/appViewPaths'
import type { Goals } from '../api/goals'
import type {
  DailyCondition,
  DateString,
  MealLog,
  SoccerLog,
  TrainingLog,
  TrainingLogExercise,
  TrainingSchedule,
} from '../types'

function formatExerciseCompact(exercise: TrainingLogExercise) {
  const name = exercise.exercise?.name ?? '不明な種目'

  if (exercise.sets.length === 0) {
    return `${name}（記録なし）`
  }

  const firstSet = exercise.sets[0]
  const weightText = firstSet.weight != null ? `${firstSet.weight}kg` : '-'
  const repsText = firstSet.reps != null ? `${firstSet.reps}回` : '-'
  return `${name} - ${weightText}×${repsText}×${exercise.sets.length}セット`
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
}: DashboardProps) {
  const navigate = useNavigate()
  const [isTodayDetailOpen, setIsTodayDetailOpen] = useState(false)
  const [isNutritionOpen, setIsNutritionOpen] = useState(false)
  const [weekSchedules, setWeekSchedules] = useState<TrainingSchedule[]>([])
  const [weekSoccerLogs, setWeekSoccerLogs] = useState<SoccerLog[]>([])

  const weekStart = useMemo(() => {
    const start = new Date(today)
    start.setDate(today.getDate() - today.getDay())
    return start
  }, [today])

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + index)
      return {
        date,
        dateKey: toDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate()),
      }
    })
  }, [weekStart])

  const weekStartKey = weekDates[0]?.dateKey ?? todayString
  const weekEndKey = weekDates[6]?.dateKey ?? todayString

  useEffect(() => {
    let isMounted = true

    Promise.all([fetchTrainingSchedules(weekStartKey, weekEndKey), fetchSoccerLogs(weekStartKey, weekEndKey)])
      .then(([scheduleData, soccerData]) => {
        if (isMounted) {
          setWeekSchedules(scheduleData)
          setWeekSoccerLogs(soccerData)
        }
      })
      .catch((error) => {
        console.error('Supabaseから今週の予定・サッカー記録の取得に失敗しました', error)
      })

    return () => {
      isMounted = false
    }
  }, [weekStartKey, weekEndKey])

  const weekSchedulesByDate = useMemo(() => {
    const map = new Map<string, TrainingSchedule[]>()
    weekSchedules.forEach((schedule) => {
      const list = map.get(schedule.scheduledDate) ?? []
      list.push(schedule)
      map.set(schedule.scheduledDate, list)
    })
    return map
  }, [weekSchedules])

  const weekSoccerLogsByDate = useMemo(() => {
    const map = new Map<string, SoccerLog[]>()
    weekSoccerLogs.forEach((log) => {
      const list = map.get(log.date) ?? []
      list.push(log)
      map.set(log.date, list)
    })
    return map
  }, [weekSoccerLogs])

  const todaySchedules = weekSchedulesByDate.get(todayString) ?? []
  const todaySoccerLog = weekSoccerLogsByDate.get(todayString)?.[0] ?? null

  const todayTrainingLogs = useMemo(
    () => trainingLogs.filter((log) => log.date === todayString),
    [trainingLogs, todayString],
  )
  const todayCondition = useMemo(
    () => dailyConditions.find((condition) => condition.date === todayString),
    [dailyConditions, todayString],
  )
  const todayMealLogs = useMemo(
    () => mealLogs.filter((log) => log.date === todayString),
    [mealLogs, todayString],
  )

  const todayLoggedExercises = todayTrainingLogs.flatMap((log) => log.exercises)

  const todayBodyPartsLabel = useMemo(() => {
    const parts = Array.from(
      new Set(
        todayLoggedExercises
          .map((exercise) => exercise.exercise?.bodyPart)
          .filter((part): part is NonNullable<typeof part> => Boolean(part)),
      ),
    )
    return parts.length > 0 ? parts.join('・') : 'トレーニング'
  }, [todayLoggedExercises])

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

  const calorieRate = goals.dailyCalorieGoal > 0
    ? Math.min(100, Math.round((todayMealTotals.calories / goals.dailyCalorieGoal) * 100))
    : 0
  const calorieRingData = useMemo(
    () => [{ name: 'calorie', value: calorieRate, fill: 'var(--color-accent)' }],
    [calorieRate],
  )

  const previousCondition = useMemo(() => {
    return (
      [...dailyConditions]
        .filter((condition) => condition.date < todayString)
        .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
    )
  }, [dailyConditions, todayString])

  const weightTrend = useMemo(() => {
    if (!todayCondition || !previousCondition) return null
    const diff = todayCondition.weight - previousCondition.weight
    if (Math.abs(diff) < 0.05) return { text: '±0kg', tone: 'neutral' as const }
    return diff > 0
      ? { text: `+${diff.toFixed(1)}kg`, tone: 'alert' as const }
      : { text: `${diff.toFixed(1)}kg`, tone: 'good' as const }
  }, [todayCondition, previousCondition])

  const sleepTrend = useMemo(() => {
    if (!todayCondition || !previousCondition) return null
    const diff = todayCondition.sleepHours - previousCondition.sleepHours
    if (Math.abs(diff) < 0.05) return { text: '±0h', tone: 'neutral' as const }
    return diff > 0
      ? { text: `+${diff.toFixed(1)}h`, tone: 'good' as const }
      : { text: `${diff.toFixed(1)}h`, tone: 'alert' as const }
  }, [todayCondition, previousCondition])

  const fatigueTrend = useMemo(() => {
    if (!todayCondition || !previousCondition) return null
    const diff = todayCondition.fatigue - previousCondition.fatigue
    if (diff === 0) return { text: '±0', tone: 'neutral' as const }
    return diff > 0
      ? { text: `+${diff}`, tone: 'alert' as const }
      : { text: `${diff}`, tone: 'good' as const }
  }, [todayCondition, previousCondition])

  const mostRecentRecord = useMemo(() => {
    const candidates: { date: DateString; label: string }[] = []
    const latestTraining = [...trainingLogs].sort((a, b) => b.date.localeCompare(a.date))[0]
    if (latestTraining) candidates.push({ date: latestTraining.date, label: 'トレーニング' })
    const latestMeal = [...mealLogs].sort((a, b) => b.date.localeCompare(a.date))[0]
    if (latestMeal) candidates.push({ date: latestMeal.date, label: '食事' })
    const latestCondition = [...dailyConditions].sort((a, b) => b.date.localeCompare(a.date))[0]
    if (latestCondition) candidates.push({ date: latestCondition.date, label: '体調' })

    if (candidates.length === 0) return null
    return candidates.sort((a, b) => b.date.localeCompare(a.date))[0]
  }, [trainingLogs, mealLogs, dailyConditions])

  const mostRecentRecordDaysText = useMemo(() => {
    if (!mostRecentRecord) return null
    if (mostRecentRecord.date === todayString) return '今日'
    const diffDays = Math.round(
      (new Date(todayString).getTime() - new Date(mostRecentRecord.date).getTime()) / 86_400_000,
    )
    return `${diffDays}日前`
  }, [mostRecentRecord, todayString])

  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const currentMonthTrainingCount = trainingLogs.filter((log) => log.date.startsWith(currentMonthKey)).length
  const monthlyAchievementRate = goals.monthlyTrainingGoal > 0
    ? Math.min(100, Math.round((currentMonthTrainingCount / goals.monthlyTrainingGoal) * 100))
    : 0

  const hasTrainingBlock = todayTrainingLogs.length > 0 || todaySchedules.length > 0
  const hasSoccerBlock = todaySoccerLog !== null
  const hasExerciseCard = hasTrainingBlock || hasSoccerBlock

  const todayMealSummary = todayMealLogs.length > 0
    ? todayMealLogs.map((log) => `${log.mealType}(${log.foods.join('・')})`).join(' / ')
    : '記録なし'

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
      <div className="dashboard-header">
        <p className="eyebrow">Workout App</p>
        <h1>{formattedDate}</h1>
      </div>

      <section className="panel-card calorie-card">
        <h2 className="panel-card__title">今日のカロリー</h2>
        <div className="calorie-ring">
          <RadialBarChart
            width={180}
            height={180}
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={86}
            barSize={12}
            data={calorieRingData}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
            <RadialBar background={{ fill: 'var(--color-border)' }} dataKey="value" cornerRadius={20} />
          </RadialBarChart>
          <div className="calorie-ring__center">
            <span className="calorie-ring__value metric-value">{todayMealTotals.calories}</span>
            <span className="calorie-ring__goal">/ {goals.dailyCalorieGoal} kcal</span>
          </div>
        </div>
        <div className="calorie-ring__pfc">
          <span className="pfc-dot">
            <i className="pfc-dot__marker pfc-dot__marker--protein" />P {todayMealTotals.protein}g
          </span>
          <span className="pfc-dot">
            <i className="pfc-dot__marker pfc-dot__marker--fat" />F {todayMealTotals.fat}g
          </span>
          <span className="pfc-dot">
            <i className="pfc-dot__marker pfc-dot__marker--carb" />C {todayMealTotals.carbohydrates}g
          </span>
        </div>
      </section>

      {hasExerciseCard ? (
        <section className="panel-card exercise-card">
          <h2 className="panel-card__title">今日の運動</h2>

          {hasTrainingBlock ? (
            <div className="exercise-block">
              <div className="exercise-block__header">
                <span className="exercise-block__title">{todayBodyPartsLabel}</span>
                <span className={`status-chip status-chip--${todayTrainingLogs.length > 0 ? 'good' : 'warning'}`}>
                  {todayTrainingLogs.length > 0 ? '完了' : '予定'}
                </span>
              </div>
              <ul className="exercise-block__list">
                {todayTrainingLogs.length > 0
                  ? todayLoggedExercises.map((exercise, index) => (
                      <li key={exercise.id ?? `${exercise.exerciseId}-${index}`}>{formatExerciseCompact(exercise)}</li>
                    ))
                  : todaySchedules.map((schedule, index) => (
                      <li key={schedule.id ?? `${schedule.title}-${index}`}>
                        {schedule.emoji} {schedule.title}
                      </li>
                    ))}
              </ul>
            </div>
          ) : null}

          {hasTrainingBlock && hasSoccerBlock ? <div className="exercise-block__divider" /> : null}

          {todaySoccerLog ? (
            <div className="exercise-block exercise-block--soccer">
              <div className="exercise-block__header">
                <span className="exercise-block__title">⚽ {todaySoccerLog.activityType}</span>
                <span className="status-chip status-chip--good">完了</span>
              </div>
              <div className="exercise-block__soccer-stats">
                {todaySoccerLog.durationMinutes != null ? <span>⏱ {todaySoccerLog.durationMinutes}分</span> : null}
                {todaySoccerLog.distanceKm != null ? <span>📍 {todaySoccerLog.distanceKm}km</span> : null}
                {todaySoccerLog.caloriesBurned != null ? <span>🔥 {todaySoccerLog.caloriesBurned}kcal</span> : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="panel-card week-strip">
        <h2 className="panel-card__title">今週の記録</h2>
        <div className="week-strip__grid">
          {weekDates.map(({ date, dateKey }, index) => {
            const isToday = dateKey === todayString
            const icons = getDayIcons(
              weekSchedulesByDate.get(dateKey) ?? [],
              weekSoccerLogsByDate.get(dateKey) ?? [],
              dateKey,
              todayString,
            )

            return (
              <div key={dateKey} className={`week-strip__cell ${isToday ? 'week-strip__cell--today' : ''}`}>
                <span className="week-strip__day-label">{weekDays[index]}</span>
                <span className="week-strip__date metric-value">{date.getDate()}</span>
                <span className="week-strip__icons">{icons.join('')}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="panel-card stats-card">
        <h2 className="panel-card__title">体調・記録</h2>
        <div className="stats-grid">
          <article className="stat-card">
            <div className="stat-card__header">
              <WeightIcon className="stat-card__icon" strokeWidth={1.8} />
              {weightTrend ? <span className={`trend-badge trend-badge--${weightTrend.tone}`}>{weightTrend.text}</span> : null}
            </div>
            <span className="stat-card__label">体重</span>
            <strong className="stat-card__value metric-value">
              {todayCondition ? `${todayCondition.weight.toFixed(1)}kg` : '記録なし'}
            </strong>
          </article>

          <article className="stat-card">
            <div className="stat-card__header">
              <SleepIcon className="stat-card__icon" strokeWidth={1.8} />
              {sleepTrend ? <span className={`trend-badge trend-badge--${sleepTrend.tone}`}>{sleepTrend.text}</span> : null}
            </div>
            <span className="stat-card__label">睡眠</span>
            <strong className="stat-card__value metric-value">
              {todayCondition ? `${todayCondition.sleepHours.toFixed(1)}h` : '記録なし'}
            </strong>
          </article>

          <article className="stat-card">
            <div className="stat-card__header">
              <FatigueIcon className="stat-card__icon" strokeWidth={1.8} />
              {fatigueTrend ? <span className={`trend-badge trend-badge--${fatigueTrend.tone}`}>{fatigueTrend.text}</span> : null}
            </div>
            <span className="stat-card__label">疲労度</span>
            <strong className="stat-card__value metric-value">
              {todayCondition ? `${todayCondition.fatigue}/5` : '記録なし'}
            </strong>
          </article>

          <article className="stat-card">
            <div className="stat-card__header">
              <HistoryIcon className="stat-card__icon" strokeWidth={1.8} />
            </div>
            <span className="stat-card__label">直近の記録</span>
            <strong className="stat-card__value">{mostRecentRecord ? mostRecentRecord.label : '記録なし'}</strong>
            {mostRecentRecordDaysText ? <span className="stat-card__note">{mostRecentRecordDaysText}</span> : null}
          </article>
        </div>
      </section>

      <section className="panel-card goal-strip">
        <div className="goal-strip__header">
          <h2 className="panel-card__title">{today.getMonth() + 1}月の目標</h2>
          <span className="goal-strip__rate">{monthlyAchievementRate}%</span>
        </div>
        <p className="goal-strip__text">
          トレーニング {currentMonthTrainingCount} / {goals.monthlyTrainingGoal}回
        </p>
        <div className="progress-meter" aria-label="今月のトレーニング進捗">
          <div className="progress-meter__fill" style={{ width: `${monthlyAchievementRate}%` }} />
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
                {[
                  {
                    label: 'カロリー',
                    value: `${todayMealTotals.calories} / ${goals.dailyCalorieGoal} kcal`,
                    rate: calorieRate,
                  },
                  {
                    label: 'タンパク質',
                    value: `${todayMealTotals.protein} / ${goals.dailyProteinGoal} g`,
                    rate: goals.dailyProteinGoal > 0
                      ? Math.min(100, Math.round((todayMealTotals.protein / goals.dailyProteinGoal) * 100))
                      : 0,
                  },
                  {
                    label: '脂質',
                    value: `${todayMealTotals.fat} / ${goals.dailyFatGoal} g`,
                    rate: goals.dailyFatGoal > 0
                      ? Math.min(100, Math.round((todayMealTotals.fat / goals.dailyFatGoal) * 100))
                      : 0,
                  },
                  {
                    label: '炭水化物',
                    value: `${todayMealTotals.carbohydrates} / ${goals.dailyCarbohydrateGoal} g`,
                    rate: goals.dailyCarbohydrateGoal > 0
                      ? Math.min(100, Math.round((todayMealTotals.carbohydrates / goals.dailyCarbohydrateGoal) * 100))
                      : 0,
                  },
                ].map((metric) => (
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
              navigate(APP_VIEW_PATHS[link.targetView])
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
