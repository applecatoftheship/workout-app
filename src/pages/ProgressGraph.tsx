import { useMemo, useState } from 'react'
import type { DailyCondition, TrainingLog } from '../types'
import './ProgressGraph.css'
import '../components/graphs/ChartCommon.css'
import { TrainingChart } from '../components/graphs/TrainingChart'
import { WeightChart } from '../components/graphs/WeightChart'
import { SleepChart } from '../components/graphs/SleepChart'
import { FatigueChart } from '../components/graphs/FatigueChart'
import { buildDateList, getPeriodRange, toDateKey } from '../utils/chartHelpers'
import type { Period } from '../utils/chartHelpers'

const chartTabs = [
  { id: 'training' as const, label: 'トレーニング' },
  { id: 'weight' as const, label: '体重' },
  { id: 'sleep' as const, label: '睡眠' },
  { id: 'fatigue' as const, label: '疲労度' },
]

type ChartType = (typeof chartTabs)[number]['id']

export function ProgressGraph({
  trainingLogs,
  dailyConditions,
  targetWeight,
  targetSleepHours,
  weeklyTrainingGoal,
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
  const { start, end } = useMemo(() => getPeriodRange(period, today), [period, today])
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
    const map = new Map<string, { sets: number; completed: boolean; hasLog: boolean }>()
    trainingLogs.forEach((log) => {
      const sets = log.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)
      const existing = map.get(log.date)
      map.set(log.date, {
        sets: (existing?.sets ?? 0) + sets,
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
        ...(trainingByDate.get(date) ?? { sets: 0, completed: false, hasLog: false }),
      })),
    [periodDates, trainingByDate],
  )

  const trainingGoal = period === 'week' ? weeklyTrainingGoal : monthlyTrainingGoal
  const trainingCount = periodTrainingDays.filter((day) => day.hasLog).length
  const totalSets = periodTrainingDays.reduce((sum, day) => sum + day.sets, 0)
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
        <button
          type="button"
          className={`progress-graph__period-button ${period === 'week' ? 'progress-graph__period-button--active' : ''}`}
          onClick={() => setPeriod('week')}
        >
          今週
        </button>
        <button
          type="button"
          className={`progress-graph__period-button ${period === 'month' ? 'progress-graph__period-button--active' : ''}`}
          onClick={() => setPeriod('month')}
        >
          今月
        </button>
      </div>

      <div className="progress-graph__panel">
        {selectedChart === 'training' ? (
          <TrainingChart
            periodTrainingDays={periodTrainingDays}
            trainingGoal={trainingGoal}
            trainingCount={trainingCount}
            totalSets={totalSets}
            achievementRate={achievementRate}
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
