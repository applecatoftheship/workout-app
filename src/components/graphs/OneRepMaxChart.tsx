import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  MARGIN_LEFT,
  MARGIN_RIGHT,
  buildAxisTicks,
  computeScale,
  formatShortDate,
  pointsFor,
  shouldShowLabel,
} from '../../utils/chartHelpers'
import type { LoggedExerciseOption, OneRepMaxPoint } from '../../utils/oneRepMaxHelpers'

type OneRepMaxChartProps = {
  exercises: LoggedExerciseOption[]
  selectedExerciseId: string
  onSelectExercise: (exerciseId: string) => void
  // 選択期間で絞り込み済みの推移点（ProgressGraph.tsxの期間タブに追従）。
  points: OneRepMaxPoint[]
  // 期間タブに関わらない全履歴からの自己ベスト（prHelpers.calculateMaxEstimated1RMを
  // 呼び出し元がそのまま渡す。0＝記録なし）。
  allTimeBest: number
}

// 推定1RM推移（指示書「推定1RM・PR・総挙上重量のビジュアル化」2026-09-15）：
// 種目セレクタ付きの時系列トレンドグラフ。WeightChart.tsx・TrainingVolumeChart.tsx
// と同じ手書きSVGパターン（computeScale/pointsFor/buildAxisTicksはいずれも
// 0〜1件の疎なデータでも破綻しないchartHelpers.tsの既存関数）を踏襲する。
// 1RM自体は「その時点のベスト」を示す指標のため、体重・睡眠・疲労度のような
// 7日移動平均は付けず、実測点のみの単一系列にしている。
export function OneRepMaxChart({ exercises, selectedExerciseId, onSelectExercise, points, allTimeBest }: OneRepMaxChartProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  if (exercises.length === 0) {
    return (
      <div className="progress-graph__chart-wrapper">
        <h3 className="chart-card__title">推定1RM推移</h3>
        <p className="progress-graph__empty">トレーニング実績がまだありません</p>
      </div>
    )
  }

  let chartBody: ReactNode
  if (points.length === 0) {
    chartBody = <p className="progress-graph__empty">この種目・この期間の記録はまだありません</p>
  } else {
    const values = points.map((point) => point.value)
    // computeScale/valueToXは値が1件・全件同値でもパディングして安全にスケールする
    // （体重チャート等で既に実績のある挙動をそのまま再利用。記録件数が少ない種目でも
    // 崩れないようにする指示への対応）。
    const { min, range } = computeScale(values)
    const plotted = pointsFor(values, min, range)
    const ticks = buildAxisTicks(min, range, 1)
    const selectedPoint = selectedDate ? points.find((point) => point.date === selectedDate) : null

    chartBody = (
      <>
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="progress-graph__svg" aria-hidden="true">
          {ticks.map((tick) => (
            <g key={tick.y}>
              <line x1={MARGIN_LEFT} y1={tick.y} x2={CHART_WIDTH - MARGIN_RIGHT} y2={tick.y} className="progress-graph__gridline" />
              <text x={MARGIN_LEFT - 6} y={tick.y + 3} className="progress-graph__axis-label" textAnchor="end">
                {tick.label}
              </text>
            </g>
          ))}
          {/* 1点のみの場合はpolylineを描かず（点が1つだと線にならない）ドットのみ表示する。 */}
          {points.length > 1 ? (
            <polyline
              points={plotted.join(' ')}
              fill="none"
              className="progress-graph__line progress-graph__line--accent progress-graph__line--emphasis"
            />
          ) : null}
          {plotted.map((point, index) => {
            const [cx, cy] = point.split(',').map(Number)
            return (
              <circle
                key={points[index].date}
                cx={cx}
                cy={cy}
                r="4"
                className="progress-graph__dot progress-graph__dot--accent progress-graph__dot--emphasis"
                onClick={() => setSelectedDate(points[index].date)}
              />
            )
          })}
        </svg>
        {selectedPoint ? (
          <p className="chart-card__tooltip">
            {selectedPoint.date.replace(/-/g, '/')}｜推定1RM: {selectedPoint.value}kg
          </p>
        ) : null}
        <div className="progress-graph__labels">
          {points.map((point, index) =>
            shouldShowLabel(index, points.length) ? <span key={point.date}>{formatShortDate(point.date)}</span> : null,
          )}
        </div>
      </>
    )
  }

  return (
    <div className="progress-graph__chart-wrapper">
      <div className="chart-card__header">
        <h3 className="chart-card__title">推定1RM推移</h3>
        <div className="chart-card__value-group">
          <span className="chart-card__value metric-value">
            {allTimeBest > 0 ? allTimeBest : '-'}
            <span className="chart-card__value-unit">kg（自己ベスト）</span>
          </span>
        </div>
      </div>

      <label className="one-rep-max-chart__exercise-select">
        <span>種目</span>
        <select value={selectedExerciseId} onChange={(event) => onSelectExercise(event.target.value)}>
          {exercises.map((exercise) => (
            <option key={exercise.exerciseId} value={exercise.exerciseId}>
              {exercise.exerciseName}
            </option>
          ))}
        </select>
      </label>

      {chartBody}
    </div>
  )
}
