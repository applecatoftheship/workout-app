// 2026年11月6日：WeeklyACWRTrendCard.tsx から移した（ホームの疲労カードでも使うため）
/** ミニスパークライン用の簡易SVG座標計算（メイングラフとは別に、控えめな高さのカード向けに専用実装） */
export function buildSparklinePath(values: number[], width: number, height: number) {
  if (values.length === 0) {
    return { linePoints: '', areaPath: '' }
  }
  const min = Math.min(...values, 0.8)
  const max = Math.max(...values, 1.5)
  const range = max - min || 1

  const toXY = (value: number, index: number) => {
    const x = values.length <= 1 ? width / 2 : (width * index) / (values.length - 1)
    const y = height - ((value - min) / range) * height
    return [x, y] as const
  }

  const coords = values.map((value, index) => toXY(value, index))
  const linePoints = coords.map(([x, y]) => `${x},${y}`).join(' ')
  const areaPath = `M ${coords[0][0]},${height} L ${coords.map(([x, y]) => `${x},${y}`).join(' L ')} L ${coords[coords.length - 1][0]},${height} Z`

  return { linePoints, areaPath }
}
