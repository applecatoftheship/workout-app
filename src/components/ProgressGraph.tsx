import { useMemo, useState } from 'react'
import type { DailyCondition, TrainingLog } from '../types'
import './ProgressGraph.css'

const chartTabs = [
  { id: 'weight' as const, label: '体重' },
  { id: 'sleep' as const, label: '睡眠' },
  { id: 'fatigue' as const, label: '疲労度' },
  { id: 'training' as const, label: 'トレーニング' },
]

type ChartType = (typeof chartTabs)[number]['id']

function formatShortDate(date: string) {
  return date.slice(5).replace('-', '/')
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

function parseDateString(date: string) {
  return new Date(`${date}T00:00:00`)
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function ProgressGraph({ trainingLogs, dailyConditions, targetWeight }: { trainingLogs: TrainingLog[]; dailyConditions: DailyCondition[]; targetWeight: number }) {
  const [selectedChart, setSelectedChart] = useState<ChartType>('weight')

  const sortedConditions = useMemo(
    () => [...dailyConditions].sort((a, b) => a.date.localeCompare(b.date)),
    [dailyConditions],
  )

  const trainingStatus = useMemo(() => {
    const dates = Array.from(new Set(trainingLogs.map((log) => log.date))).sort()
    return dates.map((date) => {
      const logs = trainingLogs.filter((log) => log.date === date)
      return {
        date,
        completed: logs.some((log) => log.completed),
        pending: logs.some((log) => !log.completed) && !logs.some((log) => log.completed),
      }
    })
  }, [trainingLogs])

  const augustStartKey = '2026-08-01'
  const augustEndKey = '2026-08-31'
  const augustConditions = useMemo(() => {
    return sortedConditions.filter((condition) => condition.date >= augustStartKey && condition.date <= augustEndKey)
  }, [sortedConditions])

  const weightValues = augustConditions.map((condition) => condition.weight)
  const sleepValues = sortedConditions.map((condition) => condition.sleepHours)
  const fatigueValues = sortedConditions.map((condition) => condition.fatigue)

  const hasConditionData = augustConditions.length > 0
  const hasTrainingData = trainingStatus.length > 0

  const renderLineChart = (values: number[], color: string, unit: string) => {
    if (values.length === 0) {
      return <p className="progress-graph__empty">データがありません</p>
    }

    const points = buildLinePoints(values)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const labels = augustConditions.map((condition) => formatShortDate(condition.date))

    return (
      <div className="progress-graph__chart-wrapper">
        <svg viewBox="0 0 300 180" className="progress-graph__svg" aria-hidden="true">
          <g stroke="#dbeafe" strokeWidth="1">
            <line x1="20" y1="20" x2="280" y2="20" />
            <line x1="20" y1="80" x2="280" y2="80" />
            <line x1="20" y1="140" x2="280" y2="140" />
          </g>
          <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((point, index) => {
            const [cx, cy] = point.split(',').map(Number)
            return <circle key={labels[index]} cx={cx} cy={cy} r="4" fill={color} />
          })}
        </svg>
        <div className="progress-graph__labels">
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="progress-graph__summary">
          <span>{`${min.toFixed(1)}${unit}`}</span>
          <span>{`${max.toFixed(1)}${unit}`}</span>
        </div>
      </div>
    )
  }

  const renderWeightChart = () => {
    if (augustConditions.length === 0) {
      return <p className="progress-graph__empty">データがありません</p>
    }

    const firstAugustCondition = augustConditions[0]
    const startWeight = firstAugustCondition.weight
    const startDate = parseDateString(firstAugustCondition.date)
    const endDate = parseDateString(augustEndKey)
    const idealValues = [] as number[]

    const currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      const dateKey = toDateKey(currentDate)
      if (dateKey >= firstAugustCondition.date && dateKey <= augustEndKey) {
        const progressRatio = (currentDate.getTime() - startDate.getTime()) / (endDate.getTime() - startDate.getTime())
        const idealValue = startWeight + (targetWeight - startWeight) * (Number.isFinite(progressRatio) ? progressRatio : 0)
        idealValues.push(idealValue)
      }
      currentDate.setDate(currentDate.getDate() + 1)
    }

    if (idealValues.length === 0) {
      return <p className="progress-graph__empty">データがありません</p>
    }

    const actualPoints = buildLinePoints(weightValues)
    const idealPoints = buildLinePoints(idealValues)
    const allValues = [...weightValues, ...idealValues]
    const min = Math.min(...allValues)
    const max = Math.max(...allValues)

    return (
      <div className="progress-graph__chart-wrapper">
        <svg viewBox="0 0 300 180" className="progress-graph__svg" aria-hidden="true">
          <g stroke="#dbeafe" strokeWidth="1">
            <line x1="20" y1="20" x2="280" y2="20" />
            <line x1="20" y1="80" x2="280" y2="80" />
            <line x1="20" y1="140" x2="280" y2="140" />
          </g>
          <polyline points={idealPoints.join(' ')} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6 4" />
          <polyline points={actualPoints.join(' ')} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {actualPoints.map((point, index) => {
            const [cx, cy] = point.split(',').map(Number)
            return <circle key={augustConditions[index].date} cx={cx} cy={cy} r="4" fill="#2563eb" />
          })}
        </svg>
        <div className="progress-graph__legend">
          <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--actual" />実測体重</span>
          <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--ideal" />理想ライン</span>
        </div>
        <div className="progress-graph__labels">
          {augustConditions.map((condition) => (
            <span key={condition.date}>{formatShortDate(condition.date)}</span>
          ))}
        </div>
        <div className="progress-graph__summary">
          <span>{`${min.toFixed(1)}kg`}</span>
          <span>{`${max.toFixed(1)}kg`}</span>
        </div>
        <div className="progress-graph__metrics">
          <div className="progress-graph__metric">
            <span className="progress-graph__metric-label">開始体重</span>
            <strong>{startWeight.toFixed(1)}kg</strong>
          </div>
          <div className="progress-graph__metric">
            <span className="progress-graph__metric-label">目標体重</span>
            <strong>{targetWeight.toFixed(1)}kg</strong>
          </div>
          <div className="progress-graph__metric">
            <span className="progress-graph__metric-label">現在の体重</span>
            <strong>{augustConditions[augustConditions.length - 1].weight.toFixed(1)}kg</strong>
          </div>
          <div className="progress-graph__metric">
            <span className="progress-graph__metric-label">目標までの差</span>
            <strong>{(augustConditions[augustConditions.length - 1].weight - targetWeight).toFixed(1)}kg</strong>
          </div>
        </div>
      </div>
    )
  }

  const renderSleepChart = () => {
    if (!hasConditionData) {
      return <p className="progress-graph__empty">データがありません</p>
    }

    const labels = sortedConditions.map((condition) => formatShortDate(condition.date))

    return (
      <div className="progress-graph__bars-wrapper">
        {sleepValues.map((value, index) => (
          <div key={labels[index]} className="progress-graph__bar-column">
            <div className="progress-graph__bar" style={{ height: `${(value / 24) * 100}%` }}>
              <span>{value.toFixed(1)}</span>
            </div>
            <span className="progress-graph__bar-label">{labels[index]}</span>
          </div>
        ))}
      </div>
    )
  }

  const renderTrainingSummary = () => {
    if (!hasTrainingData) {
      return <p className="progress-graph__empty">データがありません</p>
    }

    return (
      <div className="progress-graph__status-grid">
        {trainingStatus.map((item) => (
          <div key={item.date} className="progress-graph__status-item">
            <div
              className={`progress-graph__status-dot ${item.completed ? 'progress-graph__status-dot--done' : 'progress-graph__status-dot--pending'}`}
            />
            <span>{formatShortDate(item.date)}</span>
          </div>
        ))}
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

      <div className="progress-graph__panel">
        {selectedChart === 'weight' && renderWeightChart()}
        {selectedChart === 'sleep' && renderSleepChart()}
        {selectedChart === 'fatigue' && renderLineChart(fatigueValues, '#f97316', '/5')}
        {selectedChart === 'training' && renderTrainingSummary()}
      </div>
    </section>
  )
}
