import { describe, expect, it } from 'vitest'
import { calculateACWR, calculateDailyACWRSeries, daysUntilACWRAvailable, getACWRInsight, hasConsecutiveDangerDays } from '../acwrHelpers'
import { toDateKey } from '../chartHelpers'
import type { DateString, TrainingLog } from '../../types'

const TODAY = new Date(2026, 7, 23) // 2026-08-23

function dateAt(offsetDaysAgo: number): DateString {
  const d = new Date(TODAY)
  d.setDate(d.getDate() - offsetDaysAgo)
  return toDateKey(d) as DateString
}

const TODAY_KEY = dateAt(0)

// 負荷スコア = min(100, 総挙上量(kg) / 100) のため、weight=総挙上量・reps=1にすると
// スコアをそのまま指定できる（acwrHelpers.ts の calculateDailyLoadMap 参照）。
function trainingLogWithVolume(offsetDaysAgo: number, volume: number): TrainingLog {
  return {
    date: dateAt(offsetDaysAgo),
    completed: true,
    exercises: [
      {
        exerciseId: 'ex-1',
        orderIndex: 0,
        sets: [{ setNumber: 1, weight: volume, reps: 1, isWarmup: false }],
      },
    ],
  }
}

describe('calculateACWR', () => {
  it('記録が無い場合はnull', () => {
    expect(calculateACWR([], [], TODAY_KEY, undefined, undefined)).toBeNull()
  })

  it('記録が7日未満の期間しかない場合はnull', () => {
    // today と today-3日 の2件のみ（4日分の幅）
    const logs = [trainingLogWithVolume(0, 1000), trainingLogWithVolume(3, 1000)]
    expect(calculateACWR(logs, [], TODAY_KEY, undefined, undefined)).toBeNull()
  })

  it('ちょうど7日分・同一負荷ならACWR=1で🟢sweet_spot', () => {
    const logs = Array.from({ length: 7 }, (_, i) => trainingLogWithVolume(i, 5000)) // スコア50固定
    const result = calculateACWR(logs, [], TODAY_KEY, undefined, undefined)

    expect(result).not.toBeNull()
    expect(result!.acuteDays).toBe(7)
    expect(result!.chronicDays).toBe(7)
    expect(result!.acwr).toBeCloseTo(1)
    expect(result!.status).toBe('sweet_spot')
  })

  it('ACWR=1でも強い張りがあれば🟡warningになる', () => {
    const logs = Array.from({ length: 7 }, (_, i) => trainingLogWithVolume(i, 5000))
    const result = calculateACWR(logs, [], TODAY_KEY, 'severe', 'calf_l')

    expect(result!.status).toBe('warning')
    expect(result!.hasSorenessWarning).toBe(true)
  })

  it('直近急増（ACWR>1.5）で🔴danger', () => {
    // 直近7日=高負荷(100)、それ以前21日=低負荷(10) の28日分
    const highDays = Array.from({ length: 7 }, (_, i) => trainingLogWithVolume(i, 10000))
    const lowDays = Array.from({ length: 21 }, (_, i) => trainingLogWithVolume(7 + i, 1000))
    const logs = [...highDays, ...lowDays]

    const result = calculateACWR(logs, [], TODAY_KEY, undefined, undefined)

    expect(result!.acuteDays).toBe(7)
    expect(result!.chronicDays).toBe(28)
    expect(result!.acuteLoad).toBeCloseTo(100)
    expect(result!.chronicLoad).toBeCloseTo(32.5)
    expect(result!.acwr).toBeCloseTo(100 / 32.5)
    expect(result!.status).toBe('danger')
  })

  it('直近減少（ACWR<0.8）で🔵unload', () => {
    // 直近7日=低負荷(10)、それ以前21日=高負荷(100) の28日分
    const lowDays = Array.from({ length: 7 }, (_, i) => trainingLogWithVolume(i, 1000))
    const highDays = Array.from({ length: 21 }, (_, i) => trainingLogWithVolume(7 + i, 10000))
    const logs = [...lowDays, ...highDays]

    const result = calculateACWR(logs, [], TODAY_KEY, undefined, undefined)
    expect(result!.acwr).toBeLessThan(0.8)
    expect(result!.status).toBe('unload')
  })

  it('ACWR 1.3〜1.5帯：張りが無ければwarning、張りがあればdanger', () => {
    // 直近7日=スコア50、それ以前21日=スコア30 -> ACWR ≈ 1.4286
    const recentDays = Array.from({ length: 7 }, (_, i) => trainingLogWithVolume(i, 5000))
    const olderDays = Array.from({ length: 21 }, (_, i) => trainingLogWithVolume(7 + i, 3000))
    const logs = [...recentDays, ...olderDays]

    const withoutSoreness = calculateACWR(logs, [], TODAY_KEY, undefined, undefined)
    expect(withoutSoreness!.acwr).toBeGreaterThanOrEqual(1.3)
    expect(withoutSoreness!.acwr).toBeLessThan(1.5)
    expect(withoutSoreness!.status).toBe('warning')
    expect(withoutSoreness!.hasSorenessWarning).toBe(false)

    const withSoreness = calculateACWR(logs, [], TODAY_KEY, 'mild', 'hamstring')
    expect(withSoreness!.status).toBe('danger')
    expect(withSoreness!.hasSorenessWarning).toBe(true)
  })

  // 4段階判定は「境界値そのもの」でどちらの分岐に入るかが変わる（コード上は
  // `acwr > 1.5` / `acwr < 0.8` / `acwr >= 1.3` という厳密な不等号のため）。
  // 以下は直近7日=X・それ以前21日=Yの28日分固定データで、acwrがちょうど
  // 1.5 / 1.3 / 0.8になるようX・Yを算出し、境界そのものの分岐を確認する。
  describe('4段階判定の閾値境界（境界値そのもの）', () => {
    function buildLogsForRatio(recentScore: number, olderScore: number): TrainingLog[] {
      const recent = Array.from({ length: 7 }, (_, i) => trainingLogWithVolume(i, recentScore * 100))
      const older = Array.from({ length: 21 }, (_, i) => trainingLogWithVolume(7 + i, olderScore * 100))
      return [...recent, ...older]
    }

    it('acwr=1.5ちょうどは「>1.5」に該当しないためdangerではなくwarning', () => {
      const logs = buildLogsForRatio(90, 50) // acwr = 4*90/(90+150) = 1.5
      const result = calculateACWR(logs, [], TODAY_KEY, undefined, undefined)
      expect(result!.acwr).toBeCloseTo(1.5)
      expect(result!.status).toBe('warning')

      const withSoreness = calculateACWR(logs, [], TODAY_KEY, 'mild', 'hamstring')
      expect(withSoreness!.status).toBe('danger')
    })

    it('acwr=1.3ちょうどは「>=1.3」に該当しwarning（張り無し）/danger（張り有り）', () => {
      const logs = buildLogsForRatio(91, 63) // acwr = 4*91/(91+189) = 1.3
      const result = calculateACWR(logs, [], TODAY_KEY, undefined, undefined)
      expect(result!.acwr).toBeCloseTo(1.3)
      expect(result!.status).toBe('warning')

      const withSoreness = calculateACWR(logs, [], TODAY_KEY, 'severe', 'quad')
      expect(withSoreness!.status).toBe('danger')
    })

    it('acwr=0.8ちょうどは「<0.8」に該当しないためunloadではなくsweet_spot/warning', () => {
      const logs = buildLogsForRatio(75, 100) // acwr = 4*75/(75+300) = 0.8
      const result = calculateACWR(logs, [], TODAY_KEY, undefined, undefined)
      expect(result!.acwr).toBeCloseTo(0.8)
      expect(result!.status).toBe('sweet_spot')

      const withSoreness = calculateACWR(logs, [], TODAY_KEY, 'severe', 'quad')
      expect(withSoreness!.status).toBe('warning')
    })
  })
})

describe('hasConsecutiveDangerDays', () => {
  const highDays = Array.from({ length: 7 }, (_, i) => trainingLogWithVolume(i, 10000))
  const lowDays = Array.from({ length: 21 }, (_, i) => trainingLogWithVolume(7 + i, 1000))
  const dangerLogs = [...highDays, ...lowDays]

  it('直近3日連続で危険状態ならtrue', () => {
    expect(hasConsecutiveDangerDays(dangerLogs, [], [], TODAY_KEY, 3)).toBe(true)
  })

  it('高負荷期間の範囲内（7日）まではtrueが続く', () => {
    expect(hasConsecutiveDangerDays(dangerLogs, [], [], TODAY_KEY, 7)).toBe(true)
  })

  it('高負荷期間を超える日を含めるとfalseになる', () => {
    expect(hasConsecutiveDangerDays(dangerLogs, [], [], TODAY_KEY, 8)).toBe(false)
  })

  it('判定できない日（データ不足）が含まれる場合は安全側でfalse', () => {
    const shortLogs = [trainingLogWithVolume(0, 10000)]
    expect(hasConsecutiveDangerDays(shortLogs, [], [], TODAY_KEY, 3)).toBe(false)
  })

  it('consecutiveDays省略時は既定値3で判定する', () => {
    expect(hasConsecutiveDangerDays(dangerLogs, [], [], TODAY_KEY)).toBe(true)
  })
})

describe('daysUntilACWRAvailable', () => {
  it('記録が無ければ最短所要日数(7)を返す', () => {
    expect(daysUntilACWRAvailable([], [], TODAY_KEY)).toBe(7)
  })

  it('今日のみ記録がある場合はあと6日', () => {
    const logs = [trainingLogWithVolume(0, 1000)]
    expect(daysUntilACWRAvailable(logs, [], TODAY_KEY)).toBe(6)
  })

  it('7日分のデータが揃っていれば0', () => {
    const logs = [trainingLogWithVolume(0, 1000), trainingLogWithVolume(6, 1000)]
    expect(daysUntilACWRAvailable(logs, [], TODAY_KEY)).toBe(0)
  })
})

describe('calculateDailyACWRSeries', () => {
  it('記録が無ければ全日nullの系列を返す（日数分の長さは維持）', () => {
    const series = calculateDailyACWRSeries([], [], TODAY_KEY, 28)
    expect(series).toHaveLength(28)
    expect(series.every((point) => point.acwr === null)).toBe(true)
    expect(series[series.length - 1].date).toBe(TODAY_KEY)
  })

  it('日付は古い順→新しい順（先頭が最も過去、末尾が本日）', () => {
    const series = calculateDailyACWRSeries([], [], TODAY_KEY, 7)
    expect(series[0].date).toBe(dateAt(6))
    expect(series[6].date).toBe(TODAY_KEY)
  })

  it('7日分の記録が揃った日以降はacwrが非null、それ以前はnull', () => {
    // today-6日〜todayの7日分だけ記録があるケース：この7日間の各日を終端として
    // 見た場合、todayから見て7日分（today-6〜today）に達するのはtoday自身のみ
    // （today-1日を終端にすると、その時点での記録範囲はtoday-6〜today-1の6日分でまだ足りない）。
    const logs = Array.from({ length: 7 }, (_, i) => trainingLogWithVolume(i, 5000))
    const series = calculateDailyACWRSeries(logs, [], TODAY_KEY, 7)
    expect(series.slice(0, 6).every((point) => point.acwr === null)).toBe(true)
    expect(series[6].acwr).not.toBeNull()
    expect(series[6].acwr).toBeCloseTo(1)
  })
})

describe('getACWRInsight', () => {
  it('0.8未満はunload（負荷低下）', () => {
    expect(getACWRInsight(0.5).tier).toBe('unload')
  })

  it('0.8以上1.0未満はrecovery（リカバリー最適期）', () => {
    expect(getACWRInsight(0.8).tier).toBe('recovery')
    expect(getACWRInsight(0.99).tier).toBe('recovery')
  })

  it('1.0以上1.3未満はoptimal（最適トレーニング帯）', () => {
    expect(getACWRInsight(1.0).tier).toBe('optimal')
    expect(getACWRInsight(1.29).tier).toBe('optimal')
  })

  it('1.3以上1.5以下はsurge（負荷急増・警戒）', () => {
    expect(getACWRInsight(1.3).tier).toBe('surge')
    expect(getACWRInsight(1.5).tier).toBe('surge')
  })

  it('1.5超はspike（怪我リスク高）', () => {
    expect(getACWRInsight(1.51).tier).toBe('spike')
    expect(getACWRInsight(3.0).tier).toBe('spike')
  })
})
