export type Period = 'week' | 'month'

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

export function getPeriodRange(period: Period, today: Date) {
  if (period === 'week') {
    const start = new Date(today)
    start.setDate(today.getDate() - today.getDay())
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return { start, end }
  }

  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return { start, end }
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

export function buildAxisTicks(min: number, range: number, decimals: number) {
  const tickCount = 4
  return Array.from({ length: tickCount }, (_, i) => {
    const y = MARGIN_TOP + (DISPLAY_HEIGHT / (tickCount - 1)) * i
    const value = min + range * ((MARGIN_TOP + DISPLAY_HEIGHT - y) / DISPLAY_HEIGHT)
    return { y, label: value.toFixed(decimals) }
  })
}
