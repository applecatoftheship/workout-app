import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  aggregateHealthAutoExport,
  isHealthAutoExportPayload,
  parseHealthAutoExportDate,
  resolveHealthAutoExportUnitFactor,
} from '../healthAutoExportHelpers'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseHealthAutoExportDate（タイムゾーンオフセット付き日付 → JST暦日）', () => {
  it('マイナスオフセットで日付が繰り上がるケース', () => {
    // 2026-09-05 23:30 -0800 = 2026-09-06 07:30 UTC = JST 16:30 → 2026-09-06
    expect(parseHealthAutoExportDate('2026-09-05 23:30:00 -0800')).toBe('2026-09-06')
    // 2024-02-06 14:30 -0800 = 2024-02-06 22:30 UTC = JST 翌07:30 → 2024-02-07
    expect(parseHealthAutoExportDate('2024-02-06 14:30:00 -0800')).toBe('2024-02-07')
  })

  it('JSTと同じオフセット(+0900)ならその日のまま', () => {
    expect(parseHealthAutoExportDate('2026-09-05 10:00:00 +0900')).toBe('2026-09-05')
    expect(parseHealthAutoExportDate('2026-09-05 23:59:00 +0900')).toBe('2026-09-05')
  })

  it('"Z"（UTC）表記・コロン付きオフセット・小数秒も許容する', () => {
    expect(parseHealthAutoExportDate('2026-09-05T10:00:00Z')).toBe('2026-09-05') // JST 19:00
    expect(parseHealthAutoExportDate('2026-09-05 22:00:00 +00:00')).toBe('2026-09-06') // JST 翌07:00
    expect(parseHealthAutoExportDate('2026-09-05 10:00:00.500 +0900')).toBe('2026-09-05')
  })

  it('パースできない文字列は null', () => {
    expect(parseHealthAutoExportDate('garbage')).toBeNull()
    expect(parseHealthAutoExportDate('2026/09/05 10:00:00 +0900')).toBeNull()
    expect(parseHealthAutoExportDate('')).toBeNull()
  })
})

describe('isHealthAutoExportPayload（type が無く data.metrics が配列）', () => {
  it('data.metrics が配列なら true', () => {
    expect(isHealthAutoExportPayload({ data: { metrics: [] } })).toBe(true)
    expect(isHealthAutoExportPayload({ data: { metrics: [{ name: 'step_count' }] } })).toBe(true)
  })

  it('既存の type 付きペイロード（sleep/workout/metrics）は false', () => {
    expect(isHealthAutoExportPayload({ type: 'sleep', total_asleep_seconds: 100, start_time: 'x' })).toBe(false)
    expect(isHealthAutoExportPayload({ type: 'workout', start_time: 'x' })).toBe(false)
    // type が付いていれば data.metrics があっても既存分岐を優先
    expect(isHealthAutoExportPayload({ type: 'metrics', data: { metrics: [] } })).toBe(false)
  })

  it('data.metrics が無い・配列でない・payloadが不正なら false', () => {
    expect(isHealthAutoExportPayload({ data: {} })).toBe(false)
    expect(isHealthAutoExportPayload({ data: { metrics: 'x' } })).toBe(false)
    expect(isHealthAutoExportPayload({})).toBe(false)
    expect(isHealthAutoExportPayload(null)).toBe(false)
    expect(isHealthAutoExportPayload('x')).toBe(false)
  })
})

describe('resolveHealthAutoExportUnitFactor', () => {
  it('体重：kg はそのまま、lb は kg 係数、その他は null', () => {
    expect(resolveHealthAutoExportUnitFactor('weight_kg', 'kg')).toBe(1)
    expect(resolveHealthAutoExportUnitFactor('weight_kg', 'lb')).toBeCloseTo(0.45359237, 8)
    expect(resolveHealthAutoExportUnitFactor('weight_kg', 'lbs')).toBeCloseTo(0.45359237, 8)
    expect(resolveHealthAutoExportUnitFactor('weight_kg', 'stone')).toBeNull()
  })

  it('エネルギー：kcal はそのまま、kJ は 1/4.184、その他は null', () => {
    expect(resolveHealthAutoExportUnitFactor('active_energy_kcal', 'kcal')).toBe(1)
    expect(resolveHealthAutoExportUnitFactor('active_energy_kcal', 'kJ')).toBeCloseTo(1 / 4.184, 8)
    expect(resolveHealthAutoExportUnitFactor('active_energy_kcal', 'joules')).toBeNull()
  })

  it('歩数・心拍・HRV は単位変換不要のため常に 1', () => {
    expect(resolveHealthAutoExportUnitFactor('steps', 'count')).toBe(1)
    expect(resolveHealthAutoExportUnitFactor('resting_heart_rate', 'bpm')).toBe(1)
    expect(resolveHealthAutoExportUnitFactor('hrv_ms', 'ms')).toBe(1)
  })
})

describe('aggregateHealthAutoExport', () => {
  it('複数指標・複数日付を JST暦日ごとに集約する（steps=合計 / resting_heart_rate=平均）', () => {
    const result = aggregateHealthAutoExport({
      data: {
        metrics: [
          {
            name: 'step_count',
            units: 'count',
            data: [
              { qty: 3000, date: '2026-09-05 08:00:00 +0900' },
              { qty: 5000, date: '2026-09-05 20:00:00 +0900' },
              { qty: 1000, date: '2026-09-06 09:00:00 +0900' },
            ],
          },
          {
            name: 'resting_heart_rate',
            units: 'bpm',
            data: [
              { qty: 50, date: '2026-09-05 07:00:00 +0900' },
              { qty: 60, date: '2026-09-05 07:30:00 +0900' },
            ],
          },
        ],
      },
    })

    expect(result.rows).toEqual([
      { logDate: '2026-09-05', steps: 8000, resting_heart_rate: 55 },
      { logDate: '2026-09-06', steps: 1000 },
    ])
    expect(result.unrecognizedMetricNames).toEqual([])
    expect(result.skippedUnitMetrics).toEqual([])
  })

  it('未知の指標名は無視し unrecognizedMetricNames に記録、既知の指標は残る', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = aggregateHealthAutoExport({
      data: {
        metrics: [
          { name: 'blood_glucose', units: 'mg/dL', data: [{ qty: 90, date: '2026-09-05 07:00:00 +0900' }] },
          { name: 'step_count', units: 'count', data: [{ qty: 2000, date: '2026-09-05 07:00:00 +0900' }] },
        ],
      },
    })

    expect(result.rows).toEqual([{ logDate: '2026-09-05', steps: 2000 }])
    expect(result.unrecognizedMetricNames).toEqual(['blood_glucose'])
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('未対応の指標名: blood_glucose'))
  })

  it('別名（active_energy_burned / heart_rate_variability_sdnn / body_mass）も対応表で解決する', () => {
    const result = aggregateHealthAutoExport({
      data: {
        metrics: [
          { name: 'active_energy_burned', units: 'kcal', data: [{ qty: 300, date: '2026-09-05 07:00:00 +0900' }] },
          { name: 'heart_rate_variability_sdnn', units: 'ms', data: [{ qty: 45, date: '2026-09-05 07:00:00 +0900' }] },
          { name: 'body_mass', units: 'kg', data: [{ qty: 70, date: '2026-09-05 07:00:00 +0900' }] },
        ],
      },
    })
    expect(result.rows).toEqual([
      { logDate: '2026-09-05', active_energy_kcal: 300, hrv_ms: 45, weight_kg: 70 },
    ])
  })

  it('lb → kg 変換（体重）', () => {
    const result = aggregateHealthAutoExport({
      data: {
        metrics: [
          { name: 'weight_body_mass', units: 'lb', data: [{ qty: 220.462, date: '2026-09-05 07:00:00 +0900' }] },
        ],
      },
    })
    expect(result.rows[0].weight_kg).toBeCloseTo(100, 1)
  })

  it('kJ → kcal 変換（エネルギー、その日の合計）', () => {
    const result = aggregateHealthAutoExport({
      data: {
        metrics: [
          {
            name: 'active_energy',
            units: 'kJ',
            data: [
              { qty: 2092, date: '2026-09-05 08:00:00 +0900' },
              { qty: 2092, date: '2026-09-05 18:00:00 +0900' },
            ],
          },
        ],
      },
    })
    // 4184 kJ / 4.184 = 1000 kcal
    expect(result.rows[0].active_energy_kcal).toBeCloseTo(1000, 5)
  })

  it('想定外の単位の指標はスキップし skippedUnitMetrics に記録（他の指標は保存対象に残る）', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = aggregateHealthAutoExport({
      data: {
        metrics: [
          { name: 'weight_body_mass', units: 'stone', data: [{ qty: 11, date: '2026-09-05 07:00:00 +0900' }] },
          { name: 'step_count', units: 'count', data: [{ qty: 1234, date: '2026-09-05 07:00:00 +0900' }] },
        ],
      },
    })
    expect(result.rows).toEqual([{ logDate: '2026-09-05', steps: 1234 }])
    expect(result.skippedUnitMetrics).toEqual(['weight_body_mass (units: stone)'])
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('未対応の単位'))
  })

  it('qty が非数値・負・日付不正のデータ点は無視する', () => {
    const result = aggregateHealthAutoExport({
      data: {
        metrics: [
          {
            name: 'step_count',
            units: 'count',
            data: [
              { qty: 'abc', date: '2026-09-05 07:00:00 +0900' },
              { qty: -5, date: '2026-09-05 07:00:00 +0900' },
              { qty: 100, date: 'not-a-date' },
              { qty: 500, date: '2026-09-05 07:00:00 +0900' },
            ],
          },
        ],
      },
    })
    expect(result.rows).toEqual([{ logDate: '2026-09-05', steps: 500 }])
  })

  it('metrics が空・非配列なら空の結果', () => {
    expect(aggregateHealthAutoExport({ data: { metrics: [] } })).toEqual({
      rows: [],
      unrecognizedMetricNames: [],
      skippedUnitMetrics: [],
    })
    expect(aggregateHealthAutoExport({ data: {} })).toEqual({
      rows: [],
      unrecognizedMetricNames: [],
      skippedUnitMetrics: [],
    })
  })
})
