import { useState } from 'react'
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
  valueToY,
} from '../../utils/chartHelpers'

type TrainingDay = { date: string; volume: number }
type NutritionDay = { date: string; calories: number; protein: number; fat: number; carbohydrates: number }

type TrainingNutritionChartProps = {
  periodDates: string[]
  periodTrainingDays: TrainingDay[]
  periodNutritionDays: NutritionDay[]
  dailyCalorieGoal: number
}

// トレーニング×栄養 統合グラフ（Phase3、2026年9月19日新設）：負荷（トレーニング
// ボリューム）とカロリー摂取量は単位が全く異なる（kg vs kcal）ため、既存の
// WeightChart等と同じ生の値ではなく、それぞれ独立した基準で0〜100（%）に正規化
// してから同一のY軸上に重ねて描画する。
// - トレーニング側：期間内の最大ボリューム日を100%とした相対値
//   （目標ボリュームという概念が既存に無いため、期間内での相対的な高低のみを見る）
// - 栄養側：1日のカロリー目標（dailyCalorieGoal）を100%とした絶対値
//   （目標比が明確な指標のため、100%超えも許容してそのまま伸ばす）
// 目的は「厳密な数値の重ね合わせ」ではなく、負荷が高い日に栄養摂取も伴っているか
// （逆に、負荷が高いのに摂取が少ない日がないか）というパターンの相関を
// 一目で確認できるようにすることにある。
export function TrainingNutritionChart({
  periodDates,
  periodTrainingDays,
  periodNutritionDays,
  dailyCalorieGoal,
}: TrainingNutritionChartProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const hasAnyData =
    periodTrainingDays.some((day) => day.volume > 0) || periodNutritionDays.some((day) => day.calories > 0)

  if (!hasAnyData) {
    return <p className="progress-graph__empty">この期間の記録はまだありません</p>
  }

  const maxVolume = Math.max(1, ...periodTrainingDays.map((day) => day.volume))
  const trainingPercents = periodTrainingDays.map((day) => (day.volume / maxVolume) * 100)
  const nutritionPercents = periodNutritionDays.map((day) =>
    dailyCalorieGoal > 0 ? (day.calories / dailyCalorieGoal) * 100 : 0,
  )

  const { min, range } = computeScale([...trainingPercents, ...nutritionPercents, 0, 100])
  const trainingPoints = pointsFor(trainingPercents, min, range)
  const nutritionPoints = pointsFor(nutritionPercents, min, range)
  const ticks = buildAxisTicks(min, range, 0)

  const totalVolume = periodTrainingDays.reduce((sum, day) => sum + day.volume, 0)
  const totalCalories = periodNutritionDays.reduce((sum, day) => sum + day.calories, 0)
  const loggedNutritionDays = periodNutritionDays.filter((day) => day.calories > 0).length
  const avgCalories = loggedNutritionDays > 0 ? Math.round(totalCalories / loggedNutritionDays) : 0

  const selectedTraining = selectedDate ? periodTrainingDays.find((day) => day.date === selectedDate) : null
  const selectedNutrition = selectedDate ? periodNutritionDays.find((day) => day.date === selectedDate) : null

  return (
    <div className="progress-graph__chart-wrapper">
      <div className="chart-card__header">
        <h3 className="chart-card__title">トレーニング×栄養</h3>
        <div className="chart-card__value-group">
          <span className="chart-card__value metric-value">{avgCalories}</span>
          <span className="chart-card__value-unit">kcal/日（平均） ／ {Math.round(totalVolume).toLocaleString()}kg（総ボリューム）</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="progress-graph__svg" aria-hidden="true">
        <defs>
          <linearGradient id="trainingNutritionAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-nutrition)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--color-chart-nutrition)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={tick.y}>
            <line x1={MARGIN_LEFT} y1={tick.y} x2={CHART_WIDTH - MARGIN_RIGHT} y2={tick.y} className="progress-graph__gridline" />
            <text x={MARGIN_LEFT - 6} y={tick.y + 3} className="progress-graph__axis-label" textAnchor="end">
              {tick.label}%
            </text>
          </g>
        ))}
        <line
          x1={MARGIN_LEFT}
          y1={valueToY(100, min, range)}
          x2={CHART_WIDTH - MARGIN_RIGHT}
          y2={valueToY(100, min, range)}
          className="progress-graph__target-line"
        />
        <polyline
          points={trainingPoints.join(' ')}
          fill="none"
          className="progress-graph__line progress-graph__line--chart-training progress-graph__line--emphasis"
        />
        <polyline
          points={nutritionPoints.join(' ')}
          fill="none"
          className="progress-graph__line progress-graph__line--chart-nutrition progress-graph__line--emphasis"
        />
        {trainingPoints.map((point, index) => {
          const [cx, cy] = point.split(',').map(Number)
          const day = periodTrainingDays[index]
          if (day.volume <= 0) return null
          return (
            <circle
              key={`training-${day.date}`}
              cx={cx}
              cy={cy}
              r="4"
              className="progress-graph__dot progress-graph__dot--chart-training progress-graph__dot--emphasis"
              onClick={() => setSelectedDate(day.date)}
            />
          )
        })}
        {nutritionPoints.map((point, index) => {
          const [cx, cy] = point.split(',').map(Number)
          const day = periodNutritionDays[index]
          if (day.calories <= 0) return null
          return (
            <circle
              key={`nutrition-${day.date}`}
              cx={cx}
              cy={cy}
              r="4"
              className="progress-graph__dot progress-graph__dot--chart-nutrition progress-graph__dot--emphasis"
              onClick={() => setSelectedDate(day.date)}
            />
          )
        })}
      </svg>

      <div className="progress-graph__legend">
        <span className="progress-graph__legend-item">
          <span className="progress-graph__legend-dot" style={{ background: 'var(--color-chart-training)' }} />
          トレーニング負荷（期間内最大=100%）
        </span>
        <span className="progress-graph__legend-item">
          <span className="progress-graph__legend-dot" style={{ background: 'var(--color-chart-nutrition)' }} />
          カロリー摂取（目標=100%）
        </span>
        <span className="progress-graph__legend-item">
          <span className="progress-graph__legend-dot progress-graph__legend-dot--target" />
          目標ライン（100%）
        </span>
      </div>

      {selectedTraining || selectedNutrition ? (
        <p className="chart-card__tooltip">
          {selectedDate?.replace(/-/g, '/')}｜ボリューム: {Math.round(selectedTraining?.volume ?? 0).toLocaleString()}kg ／ カロリー:{' '}
          {Math.round(selectedNutrition?.calories ?? 0)}kcal（P{Math.round(selectedNutrition?.protein ?? 0)} F
          {Math.round(selectedNutrition?.fat ?? 0)} C{Math.round(selectedNutrition?.carbohydrates ?? 0)}）
        </p>
      ) : null}

      <div className="progress-graph__labels">
        {periodDates.map((date, index) =>
          shouldShowLabel(index, periodDates.length) ? <span key={date}>{formatShortDate(date)}</span> : null,
        )}
      </div>
    </div>
  )
}
