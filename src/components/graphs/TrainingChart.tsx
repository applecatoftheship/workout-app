import { useState } from 'react'
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  MARGIN_LEFT,
  MARGIN_RIGHT,
  areaPathFor,
  buildAxisTicks,
  computeScale,
  formatShortDate,
  pointsFor,
  shouldShowLabel,
} from '../../utils/chartHelpers'

type TrainingDay = { date: string; sets: number; volume: number; completed: boolean; hasLog: boolean }

export type BodyPartVolumeEntry = {
  bodyPart: string
  color: string
  volume: number
  diff: number | null
  isPersonalBest: boolean
  dailyVolumes: { date: string; volume: number }[]
}

type TrainingChartProps = {
  periodTrainingDays: TrainingDay[]
  trainingGoal: number
  trainingCount: number
  totalSets: number
  totalVolume: number
  achievementRate: number
  bodyPartVolume: BodyPartVolumeEntry[]
}

function BodyPartVolumeChart({
  dailyVolumes,
  color,
}: {
  dailyVolumes: { date: string; volume: number }[]
  color: string
}) {
  if (dailyVolumes.length === 0) {
    return <p className="progress-graph__empty">データがありません</p>
  }

  const values = dailyVolumes.map((point) => point.volume)
  const { min, range } = computeScale(values)
  const points = pointsFor(values, min, range)
  const areaPath = areaPathFor(values, min, range)
  const ticks = buildAxisTicks(min, range, 0)

  return (
    <>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="progress-graph__svg" aria-hidden="true">
        {ticks.map((tick) => (
          <g key={tick.y}>
            <line
              x1={MARGIN_LEFT}
              y1={tick.y}
              x2={CHART_WIDTH - MARGIN_RIGHT}
              y2={tick.y}
              className="progress-graph__gridline"
            />
            <text x={MARGIN_LEFT - 6} y={tick.y + 3} className="progress-graph__axis-label" textAnchor="end">
              {tick.label}
            </text>
          </g>
        ))}
        <path d={areaPath} fill={color} opacity="0.18" />
        <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2" />
        {points.map((point, index) => {
          const [cx, cy] = point.split(',').map(Number)
          return <circle key={dailyVolumes[index].date} cx={cx} cy={cy} r="3" fill={color} />
        })}
      </svg>
      <div className="progress-graph__labels">
        {dailyVolumes.map((point, index) => (
          <span key={point.date}>{shouldShowLabel(index, dailyVolumes.length) ? formatShortDate(point.date) : ''}</span>
        ))}
      </div>
    </>
  )
}

export function TrainingChart({
  periodTrainingDays,
  trainingGoal,
  trainingCount,
  totalSets,
  totalVolume,
  achievementRate,
  bodyPartVolume,
}: TrainingChartProps) {
  const [expandedBodyPart, setExpandedBodyPart] = useState<string | null>(null)
  const hasAnyLog = periodTrainingDays.some((day) => day.hasLog)

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

      {!hasAnyLog ? <p className="progress-graph__empty">この期間の記録はまだありません</p> : null}

      {bodyPartVolume.length > 0 ? (
        <div className="body-part-volume">
          <h4 className="body-part-volume__title">部位別ボリューム</h4>
          <ul className="body-part-volume__list">
            {bodyPartVolume.map((item) => {
              const isExpanded = expandedBodyPart === item.bodyPart
              return (
                <li key={item.bodyPart} className="body-part-volume__item">
                  <button
                    type="button"
                    className="body-part-volume__row"
                    onClick={() =>
                      setExpandedBodyPart((current) => (current === item.bodyPart ? null : item.bodyPart))
                    }
                    aria-expanded={isExpanded}
                  >
                    <span className="body-part-volume__name">
                      <i className="body-part-volume__swatch" style={{ background: item.color }} />
                      {item.bodyPart}
                      {item.isPersonalBest ? (
                        <span className="body-part-volume__pr" title="自己ベスト更新">🔥</span>
                      ) : null}
                    </span>
                    <span className="body-part-volume__value metric-value">{Math.round(item.volume)}kg</span>
                    {item.diff != null ? (
                      <span
                        className={`trend-badge ${
                          item.diff > 0 ? 'trend-badge--good' : item.diff < 0 ? 'trend-badge--alert' : 'trend-badge--neutral'
                        }`}
                      >
                        {item.diff > 0 ? '+' : ''}
                        {Math.round(item.diff)}kg
                      </span>
                    ) : (
                      <span className="body-part-volume__diff-empty">-</span>
                    )}
                  </button>

                  {isExpanded ? (
                    <div className="body-part-volume__drilldown">
                      <BodyPartVolumeChart dailyVolumes={item.dailyVolumes} color={item.color} />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
