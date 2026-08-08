import { useMemo, useState } from 'react'
import type { DailyCondition, TrainingLog } from '../types'
import './ProgressGraph.css'

const chartTabs = [
  { id: 'training' as const, label: 'トレーニング' },
  { id: 'weight' as const, label: '体重' },
  { id: 'sleep' as const, label: '睡眠' },
  { id: 'fatigue' as const, label: '疲労度' },
]

type ChartType = (typeof chartTabs)[number]['id']
type Period = 'week' | 'month'

function formatShortDate(date: string) {
  return date.slice(5).replace('-', '/')
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function buildLinePoints(values: number[]) {
  const width = 300
  const height = 140
  const left = 20
  const right = 20
  const top = 20
  const bottom = 20
  const displayWidth = width - left - right
  const displayHeight = height - top - bottom
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const range = maxValue === minValue ? 1 : maxValue - minValue

  if (values.length === 1) {
    return [`${left + displayWidth / 2},${top + displayHeight / 2}`]
  }

  return values.map((value, index) => {
    const x = left + (displayWidth * index) / (values.length - 1)
    const y = top + displayHeight - ((value - minValue) / range) * displayHeight
    return `${x},${y}`
  })
}

function getPeriodRange(period: Period, today: Date) {
  if (period === 'week') {
    const start = new Date(today)
    start.setDate(today.getDate() - today.getDay())
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return { start, end }
  }

  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return { start, end }
}

function buildDateList(start: Date, end: Date) {
  const dates: string[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    dates.push(toDateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

export function ProgressGraph({
  trainingLogs,
  dailyConditions,
  targetWeight,
  weeklyTrainingGoal,
  monthlyTrainingGoal,
}: {
  trainingLogs: TrainingLog[]
  dailyConditions: DailyCondition[]
  targetWeight: number
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
  const maxSets = Math.max(1, ...periodTrainingDays.map((day) => day.sets))

  const weightValues = periodConditions.map((condition) => condition.weight)
  const sleepValues = periodConditions.map((condition) => condition.sleepHours)
  const fatigueValues = periodConditions.map((condition) => condition.fatigue)

  const renderPeriodSwitcher = () => (
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
  )

  const renderTrainingChart = () => {
    const hasAnyLog = periodTrainingDays.some((day) => day.hasLog)

    return (
      <div className="progress-graph__chart-wrapper">
        <div className="progress-graph__training-metrics">
          <div className="progress-graph__metric">
            <span className="progress-graph__metric-label">実施回数</span>
            <strong>{trainingCount} / {trainingGoal}回</strong>
          </div>
          <div className="progress-graph__metric">
            <span className="progress-graph__metric-label">達成率</span>
            <strong>{achievementRate}%</strong>
          </div>
          <div className="progress-graph__metric">
            <span className="progress-graph__metric-label">総セット数</span>
            <strong>{totalSets}セット</strong>
          </div>
        </div>

        <div className="progress-meter" aria-label="トレーニング達成率">
          <div className="progress-meter__fill" style={{ width: `${achievementRate}%` }} />
        </div>

        {hasAnyLog ? (
          <div className="progress-graph__bars-wrapper">
            {periodTrainingDays.map((day) => (
              <div key={day.date} className="progress-graph__bar-column">
                <div
                  className={`progress-graph__bar ${
                    day.hasLog
                      ? day.completed
                        ? 'progress-graph__bar--done'
                        : 'progress-graph__bar--pending'
                      : 'progress-graph__bar--empty'
                  }`}
                  style={{ height: day.sets > 0 ? `${Math.max(12, (day.sets / maxSets) * 100)}%` : '4%' }}
                >
                  {day.sets > 0 ? <span>{day.sets}</span> : null}
                </div>
                <span className="progress-graph__bar-label">{formatShortDate(day.date)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="progress-graph__empty">この期間の記録はまだありません</p>
        )}
      </div>
    )
  }

  const renderWeightChart = () => {
    if (periodConditions.length === 0) {
      return <p className="progress-graph__empty">データがありません</p>
    }

    const points = buildLinePoints(weightValues)
    const min = Math.min(...weightValues)
    const max = Math.max(...weightValues)
    const latestWeight = periodConditions[periodConditions.length - 1].weight

    return (
      <div className="progress-graph__chart-wrapper">
        <svg viewBox="0 0 300 180" className="progress-graph__svg" aria-hidden="true">
          <g className="progress-graph__gridlines">
            <line x1="20" y1="20" x2="280" y2="20" />
            <line x1="20" y1="80" x2="280" y2="80" />
            <line x1="20" y1="140" x2="280" y2="140" />
          </g>
          <polyline points={points.join(' ')} fill="none" className="progress-graph__line progress-graph__line--pitch" />
          {points.map((point, index) => {
            const [cx, cy] = point.split(',').map(Number)
            return <circle key={periodConditions[index].date} cx={cx} cy={cy} r="4" className="progress-graph__dot progress-graph__dot--pitch" />
          })}
        </svg>
        <div className="progress-graph__labels">
          {periodConditions.map((condition) => (
            <span key={condition.date}>{formatShortDate(condition.date)}</span>
          ))}
        </div>
        <div className="progress-graph__summary">
          <span>{`${min.toFixed(1)}kg`}</span>
          <span>{`${max.toFixed(1)}kg`}</span>
        </div>
        <div className="progress-graph__metrics">
          <div className="progress-graph__metric">
            <span className="progress-graph__metric-label">現在の体重</span>
            <strong>{latestWeight.toFixed(1)}kg</strong>
          </div>
          <div className="progress-graph__metric">
            <span className="progress-graph__metric-label">目標体重</span>
            <strong>{targetWeight.toFixed(1)}kg</strong>
          </div>
          <div className="progress-graph__metric">
            <span className="progress-graph__metric-label">目標までの差</span>
            <strong>{(latestWeight - targetWeight).toFixed(1)}kg</strong>
          </div>
        </div>
      </div>
    )
  }

  const renderSleepChart = () => {
    if (periodConditions.length === 0) {
      return <p className="progress-graph__empty">データがありません</p>
    }

    return (
      <div className="progress-graph__bars-wrapper">
        {periodConditions.map((condition, index) => (
          <div key={condition.date} className="progress-graph__bar-column">
            <div className="progress-graph__bar progress-graph__bar--sleep" style={{ height: `${(sleepValues[index] / 12) * 100}%` }}>
              <span>{sleepValues[index].toFixed(1)}</span>
            </div>
            <span className="progress-graph__bar-label">{formatShortDate(condition.date)}</span>
          </div>
        ))}
      </div>
    )
  }

  const renderFatigueChart = () => {
    if (periodConditions.length === 0) {
      return <p className="progress-graph__empty">データがありません</p>
    }

    const points = buildLinePoints(fatigueValues)

    return (
      <div className="progress-graph__chart-wrapper">
        <svg viewBox="0 0 300 180" className="progress-graph__svg" aria-hidden="true">
          <g className="progress-graph__gridlines">
            <line x1="20" y1="20" x2="280" y2="20" />
            <line x1="20" y1="80" x2="280" y2="80" />
            <line x1="20" y1="140" x2="280" y2="140" />
          </g>
          <polyline points={points.join(' ')} fill="none" className="progress-graph__line progress-graph__line--amber" />
          {points.map((point, index) => {
            const [cx, cy] = point.split(',').map(Number)
            return <circle key={periodConditions[index].date} cx={cx} cy={cy} r="4" className="progress-graph__dot progress-graph__dot--amber" />
          })}
        </svg>
        <div className="progress-graph__labels">
          {periodConditions.map((condition) => (
            <span key={condition.date}>{formatShortDate(condition.date)}</span>
          ))}
        </div>
        <div className="progress-graph__summary">
          <span>低い</span>
          <span>高い</span>
        </div>
      </div>
    )
  }

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

      {renderPeriodSwitcher()}

      <div className="progress-graph__panel">
        {selectedChart === 'training' && renderTrainingChart()}
        {selectedChart === 'weight' && renderWeightChart()}
        {selectedChart === 'sleep' && renderSleepChart()}
        {selectedChart === 'fatigue' && renderFatigueChart()}
      </div>
    </section>
  )
}