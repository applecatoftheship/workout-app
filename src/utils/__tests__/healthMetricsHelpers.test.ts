import { describe, expect, it } from 'vitest'
import {
  buildHealthMetricsRow,
  buildWeightUpsertRow,
  hasAnyMetric,
  isFiniteNonNegative,
  isUnspecified,
  isValidDateKey,
  validateMetricsPayloadShape,
} from '../healthMetricsHelpers'
import type { MetricsPayload } from '../healthMetricsHelpers'

describe('isValidDateKey', () => {
  it('YYYY-MM-DD形式の実在する日付は true', () => {
    expect(isValidDateKey('2026-09-03')).toBe(true)
    expect(isValidDateKey('2026-01-01')).toBe(true)
    expect(isValidDateKey('2024-02-29')).toBe(true) // うるう年
  })

  it('実在しない日付（2月30日等）は false', () => {
    expect(isValidDateKey('2026-02-30')).toBe(false)
    expect(isValidDateKey('2026-13-01')).toBe(false)
    expect(isValidDateKey('2025-02-29')).toBe(false) // うるう年でない
  })

  it('形式が違う・文字列でない値は false', () => {
    expect(isValidDateKey('2026/09/03')).toBe(false)
    expect(isValidDateKey('2026-9-3')).toBe(false)
    expect(isValidDateKey('')).toBe(false)
    expect(isValidDateKey(undefined)).toBe(false)
    expect(isValidDateKey(null)).toBe(false)
    expect(isValidDateKey(20260903)).toBe(false)
  })
})

describe('isFiniteNonNegative', () => {
  it('有限の0以上の数値は true', () => {
    expect(isFiniteNonNegative(0)).toBe(true)
    expect(isFiniteNonNegative(52)).toBe(true)
    expect(isFiniteNonNegative(68.4)).toBe(true)
  })

  it('負数・NaN・Infinity・数値以外は false', () => {
    expect(isFiniteNonNegative(-1)).toBe(false)
    expect(isFiniteNonNegative(Number.NaN)).toBe(false)
    expect(isFiniteNonNegative(Number.POSITIVE_INFINITY)).toBe(false)
    expect(isFiniteNonNegative('52')).toBe(false)
    expect(isFiniteNonNegative(undefined)).toBe(false)
    expect(isFiniteNonNegative(null)).toBe(false)
  })
})

describe('isUnspecified（欠測日にiOSショートカットから届くnull/""の扱い）', () => {
  it('undefined・null・空文字列は「未指定」', () => {
    expect(isUnspecified(undefined)).toBe(true)
    expect(isUnspecified(null)).toBe(true)
    expect(isUnspecified('')).toBe(true)
  })

  it('0・空でない文字列・その他の値は「未指定」ではない', () => {
    expect(isUnspecified(0)).toBe(false)
    expect(isUnspecified('0')).toBe(false)
    expect(isUnspecified(false)).toBe(false)
    expect(isUnspecified(52)).toBe(false)
  })
})

describe('hasAnyMetric', () => {
  it('5項目すべて未指定なら false', () => {
    expect(hasAnyMetric({})).toBe(false)
  })

  it('いずれか1項目でもあれば true', () => {
    expect(hasAnyMetric({ resting_heart_rate: 52 })).toBe(true)
    expect(hasAnyMetric({ hrv_ms: 68.4 })).toBe(true)
    expect(hasAnyMetric({ steps: 9821 })).toBe(true)
    expect(hasAnyMetric({ active_energy_kcal: 512 })).toBe(true)
    expect(hasAnyMetric({ weight_kg: 72.3 })).toBe(true)
  })

  it('null・""（欠測扱い）は「指定あり」に数えない', () => {
    expect(hasAnyMetric({ hrv_ms: null })).toBe(false)
    expect(hasAnyMetric({ hrv_ms: '' })).toBe(false)
    expect(hasAnyMetric({ resting_heart_rate: null, hrv_ms: '', steps: null, active_energy_kcal: '', weight_kg: null })).toBe(
      false,
    )
  })

  it('他の項目がnull/""でも、1項目でも実値があれば true', () => {
    expect(hasAnyMetric({ hrv_ms: null, steps: 9821 })).toBe(true)
  })
})

describe('validateMetricsPayloadShape', () => {
  const validBase = { type: 'metrics', date: '2026-09-03', steps: 9821 }

  it('date必須＋1項目以上あれば有効（null）', () => {
    expect(validateMetricsPayloadShape(validBase)).toBeNull()
  })

  it('dateが無効なら date のエラーを返す', () => {
    expect(validateMetricsPayloadShape({ ...validBase, date: '2026-02-30' })).toMatch(/date/)
    expect(validateMetricsPayloadShape({ ...validBase, date: undefined })).toMatch(/date/)
  })

  it('数値項目が負数・非数値ならその項目名でエラーを返す', () => {
    expect(validateMetricsPayloadShape({ ...validBase, resting_heart_rate: -1 })).toMatch(/resting_heart_rate/)
    expect(validateMetricsPayloadShape({ ...validBase, hrv_ms: 'high' })).toMatch(/hrv_ms/)
    expect(validateMetricsPayloadShape({ ...validBase, weight_kg: -72.3 })).toMatch(/weight_kg/)
  })

  it('5項目すべて未指定（date のみ）なら「1件も含まれない」エラー', () => {
    expect(validateMetricsPayloadShape({ type: 'metrics', date: '2026-09-03' })).toMatch(/at least one metric/)
  })

  it('weight_kg のみの指定でも有効（health_metrics側は空でよい）', () => {
    expect(validateMetricsPayloadShape({ type: 'metrics', date: '2026-09-03', weight_kg: 72.3 })).toBeNull()
  })

  it('欠測（null/""）の項目はエラーにせず無視する（1項目欠測でリクエスト全体を400にしない）', () => {
    // HRVが欠測（腕時計未装着で就寝した日等）でも、他の実値がある指標は保存対象になる。
    expect(
      validateMetricsPayloadShape({ type: 'metrics', date: '2026-09-03', hrv_ms: null, steps: 9821 }),
    ).toBeNull()
    expect(
      validateMetricsPayloadShape({ type: 'metrics', date: '2026-09-03', hrv_ms: '', resting_heart_rate: 52 }),
    ).toBeNull()
  })

  it('5項目すべてnull/""なら「1件も含まれない」エラー（空行防止）', () => {
    expect(
      validateMetricsPayloadShape({
        type: 'metrics',
        date: '2026-09-03',
        resting_heart_rate: null,
        hrv_ms: '',
        steps: null,
        active_energy_kcal: '',
        weight_kg: null,
      }),
    ).toMatch(/at least one metric/)
  })

  it('値が入っているのに数値でない場合（"abc"・負数等）は従来どおりエラー', () => {
    expect(validateMetricsPayloadShape({ type: 'metrics', date: '2026-09-03', hrv_ms: 'abc', steps: 9821 })).toMatch(
      /hrv_ms/,
    )
    expect(validateMetricsPayloadShape({ type: 'metrics', date: '2026-09-03', steps: -1 })).toMatch(/steps/)
  })
})

describe('buildHealthMetricsRow（送られてきた項目だけを含める）', () => {
  const userId = 'user-1'
  const logDate = '2026-09-03'
  const now = '2026-09-04T05:00:00.000Z'

  it('1項目だけ送られてきた場合、他の3項目はrowに含まれない（既存値を消さない）', () => {
    const payload: MetricsPayload = { type: 'metrics', date: logDate, steps: 9821 }
    const row = buildHealthMetricsRow(payload, userId, logDate, now)
    expect(row).toEqual({ user_id: userId, log_date: logDate, updated_at: now, steps: 9821 })
    expect(row).not.toHaveProperty('resting_heart_rate')
    expect(row).not.toHaveProperty('hrv_ms')
    expect(row).not.toHaveProperty('active_energy_kcal')
  })

  it('複数項目が送られてきた場合はすべて含める', () => {
    const payload: MetricsPayload = {
      type: 'metrics',
      date: logDate,
      resting_heart_rate: 52,
      hrv_ms: 68.4,
      steps: 9821,
      active_energy_kcal: 512,
    }
    const row = buildHealthMetricsRow(payload, userId, logDate, now)
    expect(row).toEqual({
      user_id: userId,
      log_date: logDate,
      updated_at: now,
      resting_heart_rate: 52,
      hrv_ms: 68.4,
      steps: 9821,
      active_energy_kcal: 512,
    })
  })

  it('stepsが小数で送られてきたら丸める（DBのinteger列対応）', () => {
    const payload: MetricsPayload = { type: 'metrics', date: logDate, steps: 9821.6 }
    const row = buildHealthMetricsRow(payload, userId, logDate, now)
    expect(row?.steps).toBe(9822)
  })

  it('health_metrics 対象の4項目が1つも無ければ null（weight_kgのみの送信を想定）', () => {
    const payload: MetricsPayload = { type: 'metrics', date: logDate, weight_kg: 72.3 }
    expect(buildHealthMetricsRow(payload, userId, logDate, now)).toBeNull()
  })

  it('値0は「未指定」として扱わず含める（0 !== undefined）', () => {
    const payload: MetricsPayload = { type: 'metrics', date: logDate, steps: 0 }
    const row = buildHealthMetricsRow(payload, userId, logDate, now)
    expect(row).toMatchObject({ steps: 0 })
  })

  it('null/""（欠測扱い）の項目はrowに含めない（既存値を消さない）', () => {
    const payload = {
      type: 'metrics',
      date: logDate,
      hrv_ms: null,
      active_energy_kcal: '',
      steps: 9821,
    } as unknown as MetricsPayload
    const row = buildHealthMetricsRow(payload, userId, logDate, now)
    expect(row).toEqual({ user_id: userId, log_date: logDate, updated_at: now, steps: 9821 })
    expect(row).not.toHaveProperty('hrv_ms')
    expect(row).not.toHaveProperty('active_energy_kcal')
  })

  it('4項目すべてnull/""なら null（weight_kgのみ実値がある場合を含む）', () => {
    const payload = {
      type: 'metrics',
      date: logDate,
      resting_heart_rate: null,
      hrv_ms: '',
      steps: null,
      active_energy_kcal: '',
      weight_kg: 72.3,
    } as unknown as MetricsPayload
    expect(buildHealthMetricsRow(payload, userId, logDate, now)).toBeNull()
  })
})

describe('buildWeightUpsertRow（daily_conditions.weight の部分列upsert）', () => {
  it('weight_kg が指定されていれば user_id・log_date・weight のみの行を返す', () => {
    const payload: MetricsPayload = { type: 'metrics', date: '2026-09-03', weight_kg: 72.3 }
    expect(buildWeightUpsertRow(payload, 'user-1', '2026-09-03')).toEqual({
      user_id: 'user-1',
      log_date: '2026-09-03',
      weight: 72.3,
    })
  })

  it('weight_kg が未指定なら null（sleep_hours等の他の列を巻き込まない）', () => {
    const payload: MetricsPayload = { type: 'metrics', date: '2026-09-03', steps: 9821 }
    expect(buildWeightUpsertRow(payload, 'user-1', '2026-09-03')).toBeNull()
  })

  it('weight_kg が null/""（欠測扱い）でも null', () => {
    const nullPayload = { type: 'metrics', date: '2026-09-03', weight_kg: null } as unknown as MetricsPayload
    const emptyPayload = { type: 'metrics', date: '2026-09-03', weight_kg: '' } as unknown as MetricsPayload
    expect(buildWeightUpsertRow(nullPayload, 'user-1', '2026-09-03')).toBeNull()
    expect(buildWeightUpsertRow(emptyPayload, 'user-1', '2026-09-03')).toBeNull()
  })
})
