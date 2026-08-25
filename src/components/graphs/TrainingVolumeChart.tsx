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

type DailyVolumePoint = { date: string; volume: number }

type TrainingVolumeChartProps = {
  periodDailyVolume: DailyVolumePoint[]
  periodVolumeMA: DailyVolumePoint[]
  totalVolume: number
  volumeDiff: number | null
}

// 進捗グラフ：トレーニング画面 全面刷新v2（2026年8月18日）のセクション1
// 「総ボリューム推移（ヒーローグラフ）」。WeightChart.tsxと同じ視覚スタイル
// （実測=薄い破線、トレンド=太い実線+グラデーションエリア）を踏襲する。
export function TrainingVolumeChart({ periodDailyVolume, periodVolumeMA, totalVolume, volumeDiff }: TrainingVolumeChartProps) {
  if (periodDailyVolume.length === 0) {
    return (
      <div className="progress-graph__chart-wrapper">
        <h3 className="chart-card__title">総ボリューム推移</h3>
        <p className="progress-graph__empty">この期間の記録はまだありません</p>
      </div>
    )
  }

  const maByDate = new Map(periodVolumeMA.map((point) => [point.date, point.volume]))
  const actualValues = periodDailyVolume.map((point) => point.volume)
  // 移動平均側にその日の値がない場合（履歴の起点付近等）は実測値でフォールバックし、
  // 線が途切れないようにする（WeightChart.tsxと同じ扱い）。
  const maValues = periodDailyVolume.map((point) => maByDate.get(point.date) ?? point.volume)

  // UI/UXレビュー修正 項目3（2026年8月25日）：computeScaleは値の変動幅に応じて
  // 上下にパディングを取るため、休養日（0kg）を含む期間では下限がマイナスに
  // なり得る。総ボリュームは負の値を取り得ない指標のため、上限はそのままに
  // 下限のみ0でクランプする（computeScale自体は他のグラフ（体重・睡眠・疲労度）
  // でも使われている共通ロジックのため無変更）。
  const { min: rawMin, range: rawRange } = computeScale([...actualValues, ...maValues])
  const chartTop = rawMin + rawRange
  const min = Math.max(0, rawMin)
  const range = chartTop - min
  const actualPoints = pointsFor(actualValues, min, range)
  const maPoints = pointsFor(maValues, min, range)
  const areaPath = areaPathFor(maValues, min, range)
  const ticks = buildAxisTicks(min, range, 0)

  return (
    <div className="progress-graph__chart-wrapper">
      <div className="chart-card__header">
        <h3 className="chart-card__title">総ボリューム推移</h3>
        <div className="chart-card__value-group">
          <span className="chart-card__value metric-value">
            {Math.round(totalVolume)}
            <span className="chart-card__value-unit">kg</span>
          </span>
          {volumeDiff != null ? (
            <span
              className={`trend-badge ${
                volumeDiff > 0 ? 'trend-badge--good' : volumeDiff < 0 ? 'trend-badge--alert' : 'trend-badge--neutral'
              }`}
            >
              {volumeDiff > 0 ? '+' : ''}
              {Math.round(volumeDiff)}kg
            </span>
          ) : null}
        </div>
      </div>

      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="progress-graph__svg" aria-hidden="true">
        <defs>
          <linearGradient id="volumeAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={tick.y}>
            <line x1={MARGIN_LEFT} y1={tick.y} x2={CHART_WIDTH - MARGIN_RIGHT} y2={tick.y} className="progress-graph__gridline" />
            <text x={MARGIN_LEFT - 6} y={tick.y + 3} className="progress-graph__axis-label" textAnchor="end">
              {tick.label}
            </text>
          </g>
        ))}
        <path d={areaPath} className="progress-graph__area" fill="url(#volumeAreaGradient)" />
        <polyline points={actualPoints.join(' ')} fill="none" className="progress-graph__line progress-graph__line--actual" />
        <polyline points={maPoints.join(' ')} fill="none" className="progress-graph__line progress-graph__line--volume" />
        {actualPoints.map((point, index) => {
          const [cx, cy] = point.split(',').map(Number)
          return (
            <circle
              key={`actual-${periodDailyVolume[index].date}`}
              cx={cx}
              cy={cy}
              r="3"
              className="progress-graph__dot progress-graph__dot--actual"
            />
          )
        })}
        {maPoints.map((point, index) => {
          const [cx, cy] = point.split(',').map(Number)
          return (
            <circle
              key={`ma-${periodDailyVolume[index].date}`}
              cx={cx}
              cy={cy}
              r="3.5"
              className="progress-graph__dot progress-graph__dot--volume"
            />
          )
        })}
      </svg>
      <div className="progress-graph__legend">
        <span className="progress-graph__legend-item">
          <span className="progress-graph__legend-dot progress-graph__legend-dot--actual" />
          日別実測
        </span>
        <span className="progress-graph__legend-item">
          <span className="progress-graph__legend-dot progress-graph__legend-dot--volume" />
          7日平均
        </span>
      </div>
      <div className="progress-graph__labels">
        {periodDailyVolume.map((point, index) =>
          shouldShowLabel(index, periodDailyVolume.length) ? (
            <span key={point.date}>{formatShortDate(point.date)}</span>
          ) : null,
        )}
      </div>
    </div>
  )
}
