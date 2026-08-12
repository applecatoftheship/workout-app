import type { DailyCondition } from '../../types'
import { formatShortDate, shouldShowLabel } from '../../utils/chartHelpers'

type SleepChartProps = {
  periodConditions: DailyCondition[]
  targetSleepHours: number
}

export function SleepChart({ periodConditions, targetSleepHours }: SleepChartProps) {
  if (periodConditions.length === 0) {
    return <p className="progress-graph__empty">データがありません</p>
  }

  const sleepValues = periodConditions.map((condition) => condition.sleepHours)

  return (
    <div className="progress-graph__chart-wrapper">
      <p className="progress-graph__goal-note">目標 {targetSleepHours.toFixed(1)}時間</p>
      <div
        className="progress-graph__bars-wrapper"
        style={{ gridTemplateColumns: `repeat(${periodConditions.length}, 1fr)` }}
      >
        {periodConditions.map((condition, index) => (
          <div key={condition.date} className="progress-graph__bar-column">
            <div
              className={`progress-graph__bar ${sleepValues[index] >= targetSleepHours ? 'progress-graph__bar--done' : 'progress-graph__bar--pending'}`}
              style={{ height: `${(sleepValues[index] / 12) * 100}%` }}
            >
              <span>{sleepValues[index].toFixed(1)}</span>
            </div>
            <span className="progress-graph__bar-label">
              {shouldShowLabel(index, periodConditions.length) ? formatShortDate(condition.date) : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
