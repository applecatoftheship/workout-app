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

const CHART_WIDTH = 300
const CHART_HEIGHT = 180
const MARGIN_TOP = 16
const MARGIN_BOTTOM = 16
const MARGIN_LEFT = 34
const MARGIN_RIGHT = 12
const DISPLAY_WIDTH = CHART_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
const DISPLAY_HEIGHT = CHART_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM

function formatShortDate(date: string) {
  return date.slice(5).replace('-', '/')
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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

function computeScale(values: number[], padRatio = 0.15) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const rawRange = max - min
  const pad = rawRange === 0 ? Math.max(1, Math.abs(min) * 0.1) : rawRange * padRatio
  const scaleMin = min - pad
  const scaleRange = rawRange === 0 ? pad * 2 : rawRange + pad * 2
  return { min: scaleMin, range: scaleRange }
}

function valueToY(value: number, min: number, range: number) {
  return MARGIN_TOP + DISPLAY_HEIGHT - ((value - min) / range) * DISPLAY_HEIGHT
}

function valueToX(index: number, count: number) {
  if (count <= 1) {
    return MARGIN_LEFT + DISPLAY_WIDTH / 2
  }
  return MARGIN_LEFT + (DISPLAY_WIDTH * index) / (count - 1)
}

function pointsFor(values: number[], min: number, range: number) {
  return values.map((value, index) => `${valueToX(index, values.length)},${valueToY(value, min, range)}`)
}

function areaPathFor(values: number[], min: number, range: number) {
  if (values.length === 0) {
    return ''
  }
  const bottomY = MARGIN_TOP + DISPLAY_HEIGHT
  const points = pointsFor(values, min, range)
  const firstX = valueToX(0, values.length)
  const lastX = valueToX(values.length - 1, values.length)
  return `M ${firstX},${bottomY} L ${points.join(' L ')} L ${lastX},${bottomY} Z`
}

function buildAxisTicks(min: number, range: number, decimals: number) {
  const tickCount = 4
  return Array.from({ length: tickCount }, (_, i) => {
    const y = MARGIN_TOP + (DISPLAY_HEIGHT / (tickCount - 1)) * i
    const value = min + range * ((MARGIN_TOP + DISPLAY_HEIGHT - y) / DISPLAY_HEIGHT)
    return { y, label: value.toFixed(decimals) }
  })
}

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

    const firstCondition = periodConditions[0]
    const startDate = new Date(`${firstCondition.date}T00:00:00`)
    const endDate = end
    const idealValues: number[] = []
    const cursor = new Date(startDate)
    while (cursor <= endDate) {
      const dateKey = toDateKey(cursor)
      if (dateKey >= firstCondition.date && dateKey <= periodEndKey) {
        const totalMs = endDate.getTime() - startDate.getTime()
        const progressRatio = totalMs === 0 ? 1 : (cursor.getTime() - startDate.getTime()) / totalMs
        idealValues.push(firstCondition.weight + (targetWeight - firstCondition.weight) * progressRatio)
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    const { min, range } = computeScale([...weightValues, ...idealValues, targetWeight])
    const actualPoints = pointsFor(weightValues, min, range)
    const idealPoints = idealValues.length > 1 ? pointsFor(idealValues, min, range) : null
    const areaPath = areaPathFor(weightValues, min, range)
    const targetY = valueToY(targetWeight, min, range)
    const ticks = buildAxisTicks(min, range, 1)
    const latestWeight = periodConditions[periodConditions.length - 1].weight

    return (
      <div className="progress-graph__chart-wrapper">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="progress-graph__svg" aria-hidden="true">
          {ticks.map((tick) => (
            <g key={tick.y}>
              <line x1={MARGIN_LEFT} y1={tick.y} x2={CHART_WIDTH - MARGIN_RIGHT} y2={tick.y} className="progress-graph__gridline" />
              <text x={MARGIN_LEFT - 6} y={tick.y + 3} className="progress-graph__axis-label" textAnchor="end">
                {tick.label}
              </text>
            </g>
          ))}
          <line
            x1={MARGIN_LEFT}
            y1={targetY}
            x2={CHART_WIDTH - MARGIN_RIGHT}
            y2={targetY}
            className="progress-graph__target-line"
          />
          {idealPoints ? (
            <polyline points={idealPoints.join(' ')} fill="none" className="progress-graph__line progress-graph__line--ideal" />
          ) : null}
          <path d={areaPath} className="progress-graph__area progress-graph__area--pitch" />
          <polyline points={actualPoints.join(' ')} fill="none" className="progress-graph__line progress-graph__line--pitch" />
          {actualPoints.map((point, index) => {
            const [cx, cy] = point.split(',').map(Number)
            return <circle key={periodConditions[index].date} cx={cx} cy={cy} r="4" className="progress-graph__dot progress-graph__dot--pitch" />
          })}
        </svg>
        <div className="progress-graph__legend">
          <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--actual" />実測</span>
          <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--ideal" />理想ライン</span>
          <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--target" />目標</span>
        </div>
        <div className="progress-graph__labels">
          {periodConditions.map((condition) => (
            <span key={condition.date}>{formatShortDate(condition.date)}</span>
          ))}
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
      <div className="progress-graph__chart-wrapper">
        <p className="progress-graph__goal-note">目標 {targetSleepHours.toFixed(1)}時間</p>
        <div className="progress-graph__bars-wrapper">
          {periodConditions.map((condition, index) => (
            <div key={condition.date} className="progress-graph__bar-column">
              <div
                className={`progress-graph__bar ${sleepValues[index] >= targetSleepHours ? 'progress-graph__bar--done' : 'progress-graph__bar--pending'}`}
                style={{ height: `${(sleepValues[index] / 12) * 100}%` }}
              >
                <span>{sleepValues[index].toFixed(1)}</span>
              </div>
              <span className="progress-graph__bar-label">{formatShortDate(condition.date)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderFatigueChart = () => {
    if (periodConditions.length === 0) {
      return <p className="progress-graph__empty">データがありません</p>
    }

    const { min, range } = computeScale(fatigueValues.length > 0 ? [1, 5, ...fatigueValues] : [1, 5])
    const points = pointsFor(fatigueValues, min, range)
    const areaPath = areaPathFor(fatigueValues, min, range)
    const ticks = buildAxisTicks(min, range, 0)

    return (
      <div className="progress-graph__chart-wrapper">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="progress-graph__svg" aria-hidden="true">
          {ticks.map((tick) => (
            <g key={tick.y}>
              <line x1={MARGIN_LEFT} y1={tick.y} x2={CHART_WIDTH - MARGIN_RIGHT} y2={tick.y} className="progress-graph__gridline" />
              <text x={MARGIN_LEFT - 6} y={tick.y + 3} className="progress-graph__axis-label" textAnchor="end">
                {tick.label}
              </text>
            </g>
          ))}
          <path d={areaPath} className="progress-graph__area progress-graph__area--amber" />
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