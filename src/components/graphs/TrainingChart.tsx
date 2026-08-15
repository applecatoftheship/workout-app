import { formatShortDate, shouldShowLabel } from '../../utils/chartHelpers'

type TrainingDay = { date: string; sets: number; volume: number; completed: boolean; hasLog: boolean }
type BodyPartFrequency = { bodyPart: string; count: number }

type TrainingChartProps = {
  periodTrainingDays: TrainingDay[]
  trainingGoal: number
  trainingCount: number
  totalSets: number
  totalVolume: number
  achievementRate: number
  bodyPartFrequency: BodyPartFrequency[]
}

export function TrainingChart({
  periodTrainingDays,
  trainingGoal,
  trainingCount,
  totalSets,
  totalVolume,
  achievementRate,
  bodyPartFrequency,
}: TrainingChartProps) {
  const hasAnyLog = periodTrainingDays.some((day) => day.hasLog)
  const maxSets = Math.max(1, ...periodTrainingDays.map((day) => day.sets))
  const maxBodyPartCount = Math.max(1, ...bodyPartFrequency.map((item) => item.count))

  return (
    <div className="progress-graph__chart-wrapper">
      <div className="chart-card__header">
        <h3 className="chart-card__title">トレーニング</h3>
        <div className="chart-card__value-group">
          <span className="chart-card__value metric-value">
            {achievementRate}
            <span className="chart-card__value-unit">%</span>
          </span>
        </div>
      </div>

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
        <div className="progress-graph__metric">
          <span className="progress-graph__metric-label">総ボリューム</span>
          <strong>{Math.round(totalVolume)}kg</strong>
        </div>
      </div>

      <div className="progress-meter" aria-label="トレーニング達成率">
        <div className="progress-meter__fill" style={{ width: `${achievementRate}%` }} />
      </div>

      {hasAnyLog ? (
        <div
          className="progress-graph__bars-wrapper"
          style={{ gridTemplateColumns: `repeat(${periodTrainingDays.length}, 1fr)` }}
        >
          {periodTrainingDays.map((day, index) => (
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
              <span className="progress-graph__bar-label">
                {shouldShowLabel(index, periodTrainingDays.length) ? formatShortDate(day.date) : ''}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="progress-graph__empty">この期間の記録はまだありません</p>
      )}

      {bodyPartFrequency.length > 0 ? (
        <div className="body-part-frequency">
          <h4 className="body-part-frequency__title">部位別トレーニング頻度</h4>
          <ul className="body-part-frequency__list">
            {bodyPartFrequency.map((item) => (
              <li key={item.bodyPart} className="body-part-frequency__row">
                <span className="body-part-frequency__label">{item.bodyPart}</span>
                <div className="body-part-frequency__bar-track">
                  <div
                    className="body-part-frequency__bar-fill"
                    style={{ width: `${(item.count / maxBodyPartCount) * 100}%` }}
                  />
                </div>
                <span className="body-part-frequency__count metric-value">{item.count}回</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
