type TrainingDay = { date: string; sets: number; volume: number; completed: boolean; hasLog: boolean }

type TrainingChartProps = {
  periodTrainingDays: TrainingDay[]
  trainingGoal: number
  trainingCount: number
  totalSets: number
  totalVolume: number
  achievementRate: number
}

// トレーニング実施状況のサマリーカード（実施回数・達成率・総セット数・総ボリューム・
// 達成率メーター）。進捗グラフ トレーニング画面刷新v2（2026年8月18日）で、
// 軸ラベルが読めなかった日次バーチャートと部位別ボリュームの内訳リストはこのカードから
// 分離し、それぞれTrainingVolumeChart.tsx（ヒーローグラフ）・
// TrainingBodyPartDonut.tsx（部位バランス円グラフ）・TrainingBodyPartList.tsx
// （部位別詳細リスト）に置き換え・移設した。このカード自体は既存の集計値表示のため
// 変更していない。
export function TrainingChart({
  periodTrainingDays,
  trainingGoal,
  trainingCount,
  totalSets,
  totalVolume,
  achievementRate,
}: TrainingChartProps) {
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
    </div>
  )
}
