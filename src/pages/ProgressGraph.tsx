import { useMemo, useState } from 'react'
import type { DailyCondition, TrainingLog } from '../types'
import './ProgressGraph.css'
import '../components/graphs/ChartCommon.css'
import { TrainingChart } from '../components/graphs/TrainingChart'
import { WeightChart } from '../components/graphs/WeightChart'
import { SleepChart } from '../components/graphs/SleepChart'
import { FatigueChart } from '../components/graphs/FatigueChart'
import { buildDateList, getPeriodGoalMultiplier, getPeriodRange, toDateKey } from '../utils/chartHelpers'
import type { Period } from '../utils/chartHelpers'

const chartTabs = [
  { id: 'training' as const, label: 'トレーニング' },
  { id: 'weight' as const, label: '体重' },
  { id: 'sleep' as const, label: '睡眠' },
  { id: 'fatigue' as const, label: '疲労度' },
]

type ChartType = (typeof chartTabs)[number]['id']

const periodTabs: { id: Period; label: string }[] = [
  { id: 'week', label: '1週間' },
  { id: 'month', label: '1ヶ月' },
  { id: 'quarter', label: '3ヶ月' },
  { id: 'all', label: '全期間' },
]

export function ProgressGraph({
  trainingLogs,
  dailyConditions,
  targetWeight,
  targetSleepHours,
  monthlyTrainingGoal,
}: {
  trainingLogs: TrainingLog[]
  dailyConditions: DailyCondition[]
  targetWeight: number
  targetSleepHours: number
  weeklyTrainingGoal: number
  monthlyTrainingGoal: number
}) {
  const [selectedChart, setSelectedChart] = useState<ChartType>('training')
  const [period, setPeriod] = useState<Period>('week')

  const today = useMemo(() => new Date(), [])

  const earliestDate = useMemo(() => {
    const dates = [...trainingLogs.map((log) => log.date), ...dailyConditions.map((condition) => condition.date)]
    if (dates.length === 0) return undefined
    return new Date(`${[...dates].sort()[0]}T00:00:00`)
  }, [trainingLogs, dailyConditions])

  const { start, end } = useMemo(() => getPeriodRange(period, today, earliestDate), [period, today, earliestDate])
  const periodStartKey = toDateKey(start)
  const periodEndKey = toDateKey(end)
  const periodDates = useMemo(() => buildDateList(start, end), [start, end])

  const sortedConditions = useMemo(
    () => [...dailyConditions].sort((a, b) => a.date.localeCompare(b.date)),
    [dailyConditions],
  )

  const periodConditions = useMemo(
    () => sortedConditions.filter((condition) => condition.date >= periodStartKey && condition.date <= periodEndKey),
    [sortedConditions, periodStartKey, periodEndKey],
  )

  const trainingByDate = useMemo(() => {
    const map = new Map<string, { sets: number; volume: number; completed: boolean; hasLog: boolean }>()
    trainingLogs.forEach((log) => {
      const sets = log.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
      const volume = log.exercises.reduce(
        (sum, exercise) => sum + exercise.sets.reduce((setSum, set) => setSum + (set.weight ?? 0) * (set.reps ?? 0), 0),
        0,
      )
      const existing = map.get(log.date)
      map.set(log.date, {
        sets: (existing?.sets ?? 0) + sets,
        volume: (existing?.volume ?? 0) + volume,
        completed: (existing?.completed ?? false) || log.completed,
        hasLog: true,
      })
    })
    return map
  }, [trainingLogs])

  const periodTrainingDays = useMemo(
    () =>
      periodDates.map((date) => ({
        date,
        ...(trainingByDate.get(date) ?? { sets: 0, volume: 0, completed: false, hasLog: false }),
      })),
    [periodDates, trainingByDate],
  )

  const bodyPartFrequency = useMemo(() => {
    const counts = new Map<string, number>()
    trainingLogs
      .filter((log) => log.date >= periodStartKey && log.date <= periodEndKey)
      .forEach((log) => {
        log.exercises.forEach((exercise) => {
          const bodyPart = exercise.exercise?.bodyPart
          if (!bodyPart) return
          counts.set(bodyPart, (counts.get(bodyPart) ?? 0) + 1)
        })
      })
    return Array.from(counts.entries())
      .map(([bodyPart, count]) => ({ bodyPart, count }))
      .sort((a, b) => b.count - a.count)
  }, [trainingLogs, periodStartKey, periodEndKey])

  const periodGoalMultiplier = useMemo(
    () => getPeriodGoalMultiplier(period, today, earliestDate),
    [period, today, earliestDate],
  )
  const trainingGoal = Math.round(monthlyTrainingGoal * periodGoalMultiplier)
  const trainingCount = periodTrainingDays.filter((day) => day.hasLog).length
  const totalSets = periodTrainingDays.reduce((sum, day) => sum + day.sets, 0)
  const totalVolume = periodTrainingDays.reduce((sum, day) => sum + day.volume, 0)
  const achievementRate = trainingGoal > 0 ? Math.min(100, Math.round((trainingCount / trainingGoal) * 100)) : 0

  return (
    <section className="progress-graph">
      <div className="progress-graph__header">
        <h2>進捗グラフ</h2>
        <p>記録したデータをグラフで確認できます。</p>
      </div>

      <div className="progress-graph__tabs">
        {chartTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`progress-graph__tab ${selectedChart === tab.id ? 'progress-graph__tab--active' : ''}`}
            onClick={() => setSelectedChart(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="progress-graph__period">
        {periodTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`progress-graph__period-button ${period === tab.id ? 'progress-graph__period-button--active' : ''}`}
            onClick={() => setPeriod(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="progress-graph__panel">
        {selectedChart === 'training' ? (
          <TrainingChart
            periodTrainingDays={periodTrainingDays}
            trainingGoal={trainingGoal}
            trainingCount={trainingCount}
            totalSets={totalSets}
            totalVolume={totalVolume}
            achievementRate={achievementRate}
            bodyPartFrequency={bodyPartFrequency}
          />
        ) : null}
        {selectedChart === 'weight' ? (
          <WeightChart
            periodConditions={periodConditions}
            targetWeight={targetWeight}
            periodEnd={end}
            periodEndKey={periodEndKey}
          />
        ) : null}
        {selectedChart === 'sleep' ? (
          <SleepChart periodConditions={periodConditions} targetSleepHours={targetSleepHours} />
        ) : null}
        {selectedChart === 'fatigue' ? <FatigueChart periodConditions={periodConditions} /> : null}
      </div>
    </section>
  )
}
