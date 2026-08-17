export type Period = 'week' | 'month' | 'quarter' | 'all'

export const CHART_WIDTH = 300
export const CHART_HEIGHT = 180
export const MARGIN_TOP = 16
export const MARGIN_BOTTOM = 16
export const MARGIN_LEFT = 34
export const MARGIN_RIGHT = 12
export const DISPLAY_WIDTH = CHART_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
export const DISPLAY_HEIGHT = CHART_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM

export function formatShortDate(date: string) {
  return date.slice(5).replace('-', '/')
}

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function getPeriodRange(period: Period, today: Date, earliestDate?: Date) {
  if (period === 'week') {
    const start = new Date(today)
    start.setDate(today.getDate() - today.getDay())
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return { start, end }
  }

  if (period === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return { start, end }
  }

  if (period === 'quarter') {
    const start = new Date(today)
    start.setMonth(today.getMonth() - 3)
    start.setDate(start.getDate() + 1)
    return { start, end: today }
  }

  // all
  return { start: earliestDate ?? today, end: today }
}

/**
 * 月間目標（monthlyTrainingGoal）を選択期間に応じて比例スケールするための倍率。
 * 1週間=1/4, 1ヶ月=1, 3ヶ月=3, 全期間=開始月から現在月までの月数。
 */
export function getPeriodGoalMultiplier(period: Period, today: Date, earliestDate?: Date) {
  if (period === 'week') return 0.25
  if (period === 'month') return 1
  if (period === 'quarter') return 3

  // all
  if (!earliestDate) return 1
  const monthsCount =
    (today.getFullYear() - earliestDate.getFullYear()) * 12 + (today.getMonth() - earliestDate.getMonth()) + 1
  return Math.max(1, monthsCount)
}

export function buildDateList(start: Date, end: Date) {
  const dates: string[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    dates.push(toDateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

export function computeScale(values: number[], padRatio = 0.15) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const rawRange = max - min
  const pad = rawRange === 0 ? Math.max(1, Math.abs(min) * 0.1) : rawRange * padRatio
  const scaleMin = min - pad
  const scaleRange = rawRange === 0 ? pad * 2 : rawRange + pad * 2
  return { min: scaleMin, range: scaleRange }
}

export function valueToY(value: number, min: number, range: number) {
  return MARGIN_TOP + DISPLAY_HEIGHT - ((value - min) / range) * DISPLAY_HEIGHT
}

export function valueToX(index: number, count: number) {
  if (count <= 1) {
    return MARGIN_LEFT + DISPLAY_WIDTH / 2
  }
  return MARGIN_LEFT + (DISPLAY_WIDTH * index) / (count - 1)
}

export function pointsFor(values: number[], min: number, range: number) {
  return values.map((value, index) => `${valueToX(index, values.length)},${valueToY(value, min, range)}`)
}

export function areaPathFor(values: number[], min: number, range: number) {
  if (values.length === 0) {
    return ''
  }
  const bottomY = MARGIN_TOP + DISPLAY_HEIGHT
  const points = pointsFor(values, min, range)
  const firstX = valueToX(0, values.length)
  const lastX = valueToX(values.length - 1, values.length)
  return `M ${firstX},${bottomY} L ${points.join(' L ')} L ${lastX},${bottomY} Z`
}

export function shouldShowLabel(index: number, total: number, maxLabels = 8) {
  if (total <= maxLabels) {
    return true
  }
  const step = Math.ceil(total / maxLabels)
  return index % step === 0 || index === total - 1
}

export interface MAPoint {
  date: string // YYYY-MM-DD
  actual: number // 本日実測値
  movingAvg: number // 7日移動平均値
}

/**
 * 任意のレコード配列から指定キーの7日移動平均（過去データが存在する日数分で平均、
 * 欠損は許容する）を動的計算する。DBにはキャッシュせず、呼び出しのたびに算出する方針
 * （ACWR機能・src/utils/acwrHelpers.tsと同じ設計思想）。
 * 計算コスト（windowItemsのfilterによる全件スキャン）は現状のデータ量では
 * 問題にならないため、最適化は行っていない（将来的な改善余地として認識のみ）。
 */
export function calculateMovingAverage<T>(
  records: T[],
  dateKey: keyof T,
  valueKey: keyof T,
  windowSize = 7,
): MAPoint[] {
  const sorted = [...records]
    .filter((record) => typeof record[valueKey] === 'number' && (record[valueKey] as number) > 0)
    .sort((a, b) => String(a[dateKey]).localeCompare(String(b[dateKey])))

  return sorted.map((current) => {
    const currentDate = new Date(String(current[dateKey]))
    const windowStartDate = new Date(currentDate)
    windowStartDate.setDate(windowStartDate.getDate() - (windowSize - 1))

    const windowItems = sorted.filter((item) => {
      const itemDate = new Date(String(item[dateKey]))
      return itemDate >= windowStartDate && itemDate <= currentDate
    })

    const sum = windowItems.reduce((acc, item) => acc + (item[valueKey] as number), 0)
    const avg = sum / (windowItems.length || 1)

    return {
      date: String(current[dateKey]),
      actual: current[valueKey] as number,
      movingAvg: Math.round(avg * 10) / 10,
    }
  })
}

/**
 * 指標ごとに「増加が良いか、減少が良いか」を一箇所で管理する設定。
 * 新しい指標を追加する場合はここに1行追加するだけでトレンドバッジの色分けに反映される。
 */
export type TrendMetricKey = 'weight' | 'sleep_hours' | 'fatigue_level'

export const TREND_DIRECTION: Record<TrendMetricKey, 'lower_is_better' | 'higher_is_better'> = {
  weight: 'lower_is_better',
  sleep_hours: 'higher_is_better',
  fatigue_level: 'lower_is_better',
}

/**
 * 差分（diff = 現在値 - 比較対象値）から、指標ごとの向き設定を踏まえてトレンドバッジの
 * トーン（good=改善方向/alert=悪化方向/neutral=ほぼ変化なし）を判定する。
 * Dashboard.tsx（Phase 3）で確立していた個別のweightTrend/sleepTrend/fatigueTrend
 * ロジックを、指標横断で再利用できる形に共通化したもの。
 */
export function getTrendTone(
  metricKey: TrendMetricKey,
  diff: number,
  neutralThreshold = 0.05,
): 'good' | 'alert' | 'neutral' {
  if (Math.abs(diff) < neutralThreshold) {
    return 'neutral'
  }
  const direction = TREND_DIRECTION[metricKey]
  const isIncrease = diff > 0
  if (direction === 'higher_is_better') {
    return isIncrease ? 'good' : 'alert'
  }
  return isIncrease ? 'alert' : 'good'
}

export function buildAxisTicks(min: number, range: number, decimals: number) {
  const tickCount = 4
  return Array.from({ length: tickCount }, (_, i) => {
    const y = MARGIN_TOP + (DISPLAY_HEIGHT / (tickCount - 1)) * i
    const value = min + range * ((MARGIN_TOP + DISPLAY_HEIGHT - y) / DISPLAY_HEIGHT)
    return { y, label: value.toFixed(decimals) }
  })
}
