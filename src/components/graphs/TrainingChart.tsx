import { formatShortDate } from '../../utils/chartHelpers'

type TrainingDay = { date: string; sets: number; volume: number; completed: boolean; hasLog: boolean }

type TrainingChartProps = {
  periodTrainingDays: TrainingDay[]
  trainingGoal: number
  trainingCount: number
  totalSets: number
  totalVolume: number
  achievementRate: number
}

export function TrainingChart({
  periodTrainingDays,
  trainingGoal,
  trainingCount,
  totalSets,
  totalVolume,
  achievementRate,
}: TrainingChartProps) {
  const hasAnyLog = periodTrainingDays.some((day) => day.hasLog)
  const maxSets = Math.max(1, ...periodTrainingDays.map((day) => day.sets))

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
        <div className="progress-graph__metric">
          <span className="progress-graph__metric-label">総ボリューム</span>
          <strong>{Math.round(totalVolume)}kg</strong>
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
