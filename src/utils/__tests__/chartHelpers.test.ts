import { describe, expect, it } from 'vitest'
import {
  areaPathFor,
  buildAxisTicks,
  buildDateList,
  calculateDenseMovingAverage,
  calculateMovingAverage,
  computeScale,
  DISPLAY_HEIGHT,
  DISPLAY_WIDTH,
  formatShortDate,
  getPeriodGoalMultiplier,
  getPeriodRange,
  getTrendTone,
  MARGIN_LEFT,
  MARGIN_TOP,
  pointsFor,
  shouldShowLabel,
  toDateKey,
  TREND_DIRECTION,
  valueToX,
  valueToY,
} from '../chartHelpers'

const TODAY = new Date(2026, 7, 23) // 2026-08-23

describe('formatShortDate', () => {
  it('YYYY-MM-DDをMM/DDに短縮する', () => {
    expect(formatShortDate('2026-08-23')).toBe('08/23')
  })
})

describe('toDateKey', () => {
  it('ゼロ埋めしたYYYY-MM-DD文字列を返す', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('getPeriodRange', () => {
  it('week: 日〜土の7日間でtodayを含む', () => {
    const { start, end } = getPeriodRange('week', TODAY)
    expect(start.getDay()).toBe(0)
    expect(end.getDay()).toBe(6)
    expect(Math.round((end.getTime() - start.getTime()) / 86_400_000)).toBe(6)
    expect(start.getTime()).toBeLessThanOrEqual(TODAY.getTime())
    expect(end.getTime()).toBeGreaterThanOrEqual(TODAY.getTime())
  })

  it('month: 月初〜月末', () => {
    const { start, end } = getPeriodRange('month', TODAY)
    expect(start.getDate()).toBe(1)
    expect(start.getMonth()).toBe(7)
    expect(end.getMonth()).toBe(7)
    expect(end.getDate()).toBe(31) // 8月は31日まで
  })

  it('quarter: today基準で3ヶ月前+1日〜today', () => {
    const { start, end } = getPeriodRange('quarter', TODAY)
    expect(start).toEqual(new Date(2026, 4, 24))
    expect(end).toEqual(TODAY)
  })

  it('all: earliestDateが無ければtodayを開始日とする', () => {
    const { start, end } = getPeriodRange('all', TODAY)
    expect(start).toEqual(TODAY)
    expect(end).toEqual(TODAY)
  })

  it('all: earliestDateがあればそれを開始日とする', () => {
    const earliest = new Date(2026, 0, 1)
    const { start } = getPeriodRange('all', TODAY, earliest)
    expect(start).toEqual(earliest)
  })
})

describe('getPeriodGoalMultiplier', () => {
  it('week=0.25 / month=1 / quarter=3', () => {
    expect(getPeriodGoalMultiplier('week', TODAY)).toBe(0.25)
    expect(getPeriodGoalMultiplier('month', TODAY)).toBe(1)
    expect(getPeriodGoalMultiplier('quarter', TODAY)).toBe(3)
  })

  it('all: earliestDateからtodayまでの月数（両端含む）', () => {
    const earliest = new Date(2026, 5, 1) // 6月
    expect(getPeriodGoalMultiplier('all', TODAY, earliest)).toBe(3) // 6,7,8月の3ヶ月
  })

  it('all: earliestDateが無ければ1', () => {
    expect(getPeriodGoalMultiplier('all', TODAY)).toBe(1)
  })
})

describe('buildDateList', () => {
  it('start〜endの全日付をYYYY-MM-DDで列挙する', () => {
    const dates = buildDateList(new Date(2026, 7, 1), new Date(2026, 7, 3))
    expect(dates).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
  })
})

describe('computeScale', () => {
  it('値にばらつきがある場合はpadRatio分の余白を持たせる', () => {
    const { min, range } = computeScale([10, 20], 0.1)
    expect(min).toBeCloseTo(10 - 1) // rawRange=10, pad=10*0.1=1
    expect(range).toBeCloseTo(10 + 2)
  })

  it('全て同じ値の場合はabs(min)*0.1（最小1）を余白にする', () => {
    const { min, range } = computeScale([50, 50])
    expect(min).toBeCloseTo(50 - 5) // pad = max(1, 50*0.1) = 5
    expect(range).toBeCloseTo(10)
  })

  it('値が0のみの場合はpad=1になる', () => {
    const { min, range } = computeScale([0])
    expect(min).toBe(-1)
    expect(range).toBe(2)
  })
})

describe('valueToY / valueToX', () => {
  it('valueToY: minの値はグラフ下端に配置される', () => {
    expect(valueToY(0, 0, 100)).toBeCloseTo(MARGIN_TOP + DISPLAY_HEIGHT)
  })

  it('valueToY: min+rangeの値はグラフ上端に配置される', () => {
    expect(valueToY(100, 0, 100)).toBeCloseTo(MARGIN_TOP)
  })

  it('valueToX: 要素が1件のみなら中央に配置される', () => {
    expect(valueToX(0, 1)).toBeCloseTo(MARGIN_LEFT + DISPLAY_WIDTH / 2)
  })

  it('valueToX: 先頭は左端、末尾は右端', () => {
    const count = 5
    const first = valueToX(0, count)
    const last = valueToX(count - 1, count)
    expect(first).toBeLessThan(last)
  })
})

describe('pointsFor / areaPathFor', () => {
  it('pointsForは値の数だけ座標文字列を返す', () => {
    const points = pointsFor([10, 20, 30], 0, 100)
    expect(points).toHaveLength(3)
    points.forEach((p) => expect(p).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/))
  })

  it('areaPathForは空配列で空文字を返す', () => {
    expect(areaPathFor([], 0, 100)).toBe('')
  })

  it('areaPathForはM...Zで閉じたパスを返す', () => {
    const path = areaPathFor([10, 20], 0, 100)
    expect(path.startsWith('M ')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
  })
})

describe('shouldShowLabel', () => {
  it('総数がmaxLabels以下なら常にtrue', () => {
    expect(shouldShowLabel(3, 5, 8)).toBe(true)
  })

  it('末尾のインデックスは常にtrue', () => {
    expect(shouldShowLabel(29, 30, 8)).toBe(true)
  })

  it('間引き間隔に応じてfalseを返す', () => {
    // total=30, maxLabels=8 -> step=ceil(30/8)=4
    expect(shouldShowLabel(1, 30, 8)).toBe(false)
    expect(shouldShowLabel(4, 30, 8)).toBe(true)
  })
})

describe('calculateMovingAverage', () => {
  it('0以下の値は平均対象から除外する', () => {
    const records = [
      { date: '2026-08-20', value: 10 },
      { date: '2026-08-21', value: 0 },
      { date: '2026-08-22', value: 20 },
    ]
    const result = calculateMovingAverage(records, 'date', 'value')
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.date)).toEqual(['2026-08-20', '2026-08-22'])
  })

  it('直近7日以内の記録のみで平均する', () => {
    const records = [
      { date: '2026-08-01', value: 100 }, // window外
      { date: '2026-08-20', value: 10 },
      { date: '2026-08-22', value: 20 },
    ]
    const result = calculateMovingAverage(records, 'date', 'value', 7)
    const last = result[result.length - 1]
    expect(last.date).toBe('2026-08-22')
    expect(last.actual).toBe(20)
    expect(last.movingAvg).toBe(15) // (10+20)/2、08-01は7日窓外
  })
})

describe('TREND_DIRECTION / getTrendTone', () => {
  it('体重・疲労度は減少が良い方向', () => {
    expect(TREND_DIRECTION.weight).toBe('lower_is_better')
    expect(TREND_DIRECTION.fatigue_level).toBe('lower_is_better')
  })

  it('睡眠時間は増加が良い方向', () => {
    expect(TREND_DIRECTION.sleep_hours).toBe('higher_is_better')
  })

  it('差分が閾値未満ならneutral', () => {
    expect(getTrendTone('weight', 0.01)).toBe('neutral')
  })

  it('体重が増えたらalert、減ったらgood', () => {
    expect(getTrendTone('weight', 1)).toBe('alert')
    expect(getTrendTone('weight', -1)).toBe('good')
  })

  it('睡眠時間が増えたらgood、減ったらalert', () => {
    expect(getTrendTone('sleep_hours', 1)).toBe('good')
    expect(getTrendTone('sleep_hours', -1)).toBe('alert')
  })
})

describe('calculateDenseMovingAverage', () => {
  it('休養日の0も平均に含める', () => {
    const series = [
      { date: '2026-08-01', volume: 100 },
      { date: '2026-08-02', volume: 0 },
    ]
    const result = calculateDenseMovingAverage(series, 7)
    expect(result[1].movingAvg).toBe(50) // (100+0)/2
  })

  it('windowSizeを超えるデータは古い分を含めない', () => {
    const series = Array.from({ length: 10 }, (_, i) => ({ date: `day${i}`, volume: 10 }))
    series[9].volume = 100 // 直近1件だけ大きい
    const result = calculateDenseMovingAverage(series, 7)
    // 直近7件(index3-9)のうち6件は10、1件は100 -> (6*10+100)/7
    expect(result[9].movingAvg).toBeCloseTo((6 * 10 + 100) / 7, 1)
  })
})

describe('buildAxisTicks', () => {
  it('4つの目盛りを返し、両端がmin/min+rangeに一致する', () => {
    const ticks = buildAxisTicks(10, 20, 1)
    expect(ticks).toHaveLength(4)
    expect(Number(ticks[ticks.length - 1].label)).toBeCloseTo(10)
    expect(Number(ticks[0].label)).toBeCloseTo(30)
  })
})
