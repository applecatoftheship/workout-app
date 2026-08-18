import { Cell, Pie, PieChart } from 'recharts'
import type { BodyPartVolumeEntry } from './TrainingBodyPartList'

const DONUT_SIZE = 200

// 進捗グラフ：トレーニング画面 全面刷新v2（2026年8月18日）のセクション2
// 「部位バランス円グラフ」。bodyPartVolumeは既にvolume降順ソート済み
// （ProgressGraph.tsx側の計算）のため、先頭の要素が最もボリュームの大きい部位。
export function TrainingBodyPartDonut({ bodyPartVolume }: { bodyPartVolume: BodyPartVolumeEntry[] }) {
  if (bodyPartVolume.length === 0) {
    return (
      <div className="progress-graph__chart-wrapper">
        <h3 className="chart-card__title">部位バランス</h3>
        <p className="progress-graph__empty">この期間の記録はまだありません</p>
      </div>
    )
  }

  const total = bodyPartVolume.reduce((sum, item) => sum + item.volume, 0)
  const dominant = bodyPartVolume[0]
  const dominantPercent = total > 0 ? Math.round((dominant.volume / total) * 100) : 0
  const data = bodyPartVolume.map((item) => ({ name: item.bodyPart, value: item.volume, color: item.color }))

  return (
    <div className="progress-graph__chart-wrapper">
      <h3 className="chart-card__title">部位バランス</h3>
      <div className="body-part-donut">
        <PieChart width={DONUT_SIZE} height={DONUT_SIZE}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={64}
            outerRadius={92}
            paddingAngle={data.length > 1 ? 2 : 0}
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
        <div className="body-part-donut__center">
          <span className="body-part-donut__center-label">{dominant.bodyPart}</span>
          <span className="body-part-donut__center-value metric-value">{dominantPercent}%</span>
        </div>
      </div>
      <div className="progress-graph__legend">
        {bodyPartVolume.map((item) => {
          const percent = total > 0 ? Math.round((item.volume / total) * 100) : 0
          return (
            <span key={item.bodyPart} className="progress-graph__legend-item">
              <span className="progress-graph__legend-dot" style={{ background: item.color }} />
              {item.bodyPart} {percent}%
            </span>
          )
        })}
      </div>
    </div>
  )
}
