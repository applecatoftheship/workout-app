import { describe, expect, it } from 'vitest'
import {
  isAuthorizedBySharedSecret,
  isHealthDataTrackerPayload,
  normalizeCargoId,
  parseHealthDataTrackerDate,
  parseHealthDataTrackerSample,
  resolveHealthDataTrackerField,
} from '../healthDataTrackerHelpers'

describe('normalizeCargoId / resolveHealthDataTrackerField（cargo_id の表記ゆれ）', () => {
  it('大文字小文字・前後の空白・アンダースコアの違いを吸収して照合する', () => {
    expect(resolveHealthDataTrackerField('Resting Heart Rate')).toBe('resting_heart_rate')
    expect(resolveHealthDataTrackerField('  resting heart rate  ')).toBe('resting_heart_rate')
    expect(resolveHealthDataTrackerField('resting_heart_rate')).toBe('resting_heart_rate')
    expect(resolveHealthDataTrackerField('RESTING__HEART   RATE')).toBe('resting_heart_rate')
    expect(resolveHealthDataTrackerField('RestingHeartRate')).toBe('resting_heart_rate')
  })

  it('別名を複数受け付ける', () => {
    expect(resolveHealthDataTrackerField('Heart Rate Variability')).toBe('hrv_ms')
    expect(resolveHealthDataTrackerField('Heart Rate Variability SDNN')).toBe('hrv_ms')
    expect(resolveHealthDataTrackerField('Body Mass')).toBe('weight_kg')
    expect(resolveHealthDataTrackerField('weight body mass')).toBe('weight_kg')
    expect(resolveHealthDataTrackerField('Step Count')).toBe('steps')
    expect(resolveHealthDataTrackerField('Active Energy Burned')).toBe('active_energy_kcal')
  })

  it('未知の cargo_id は null（＝呼び出し元で無視）', () => {
    expect(resolveHealthDataTrackerField('Blood Glucose')).toBeNull()
    expect(resolveHealthDataTrackerField('')).toBeNull()
    expect(resolveHealthDataTrackerField(undefined)).toBeNull()
    expect(resolveHealthDataTrackerField(42)).toBeNull()
  })

  it('normalizeCargoId 単体', () => {
    expect(normalizeCargoId('  Weight_Body  Mass ')).toBe('weight body mass')
    expect(normalizeCargoId(null)).toBe('')
  })
})

describe('parseHealthDataTrackerDate（ロケール差のある time を JST暦日に）', () => {
  it('タイムゾーン付きは絶対時刻として JST暦日へ変換', () => {
    expect(parseHealthDataTrackerDate('2026-09-05 23:30:00 -0800')).toBe('2026-09-06') // HAE形式
    expect(parseHealthDataTrackerDate('2026-09-06T14:30:00+09:00')).toBe('2026-09-06')
    expect(parseHealthDataTrackerDate('2026-09-05T20:00:00Z')).toBe('2026-09-06') // JST 翌05:00
    expect(parseHealthDataTrackerDate('2026-09-06T14:30+09:00')).toBe('2026-09-06') // 秒省略
  })

  it('タイムゾーン無しはローカル(JST)の暦日としてそのまま扱う（日付ずれを起こさない）', () => {
    expect(parseHealthDataTrackerDate('2026-09-06T23:30:00')).toBe('2026-09-06')
    expect(parseHealthDataTrackerDate('2026/09/06 14:30:45')).toBe('2026-09-06')
    expect(parseHealthDataTrackerDate('2026.09.06')).toBe('2026-09-06')
    expect(parseHealthDataTrackerDate('2026-09-06')).toBe('2026-09-06')
  })

  it('日本語ロケール表記', () => {
    expect(parseHealthDataTrackerDate('2026年9月6日 14:30:45')).toBe('2026-09-06')
    expect(parseHealthDataTrackerDate('2026年12月1日')).toBe('2026-12-01')
  })

  it('英語ロケールの月名表記', () => {
    expect(parseHealthDataTrackerDate('Sep 6, 2026 at 2:30 PM')).toBe('2026-09-06')
    expect(parseHealthDataTrackerDate('September 6, 2026')).toBe('2026-09-06')
  })

  it('D/M/YYYY は片方が12超なら確定、両方12以下なら曖昧としてスキップ(null)', () => {
    expect(parseHealthDataTrackerDate('13/09/2026')).toBe('2026-09-13') // 13→日で確定
    expect(parseHealthDataTrackerDate('09/13/2026')).toBe('2026-09-13') // 13→日で確定
    expect(parseHealthDataTrackerDate('06/09/2026')).toBeNull() // 曖昧
  })

  it('パースできない time は null', () => {
    expect(parseHealthDataTrackerDate('not a date')).toBeNull()
    expect(parseHealthDataTrackerDate('')).toBeNull()
    expect(parseHealthDataTrackerDate(undefined)).toBeNull()
    expect(parseHealthDataTrackerDate('2026-99-99')).toBeNull()
  })
})

describe('parseHealthDataTrackerSample', () => {
  it('正常系：cargo_id・time・value が揃えば ok', () => {
    expect(
      parseHealthDataTrackerSample({ cargo_id: 'Resting Heart Rate', value: 52, time: '2026-09-06T07:00:00' }),
    ).toEqual({ status: 'ok', field: 'resting_heart_rate', logDate: '2026-09-06', value: 52 })
  })

  it('value が文字列でも数値に変換する', () => {
    expect(
      parseHealthDataTrackerSample({ cargo_id: 'Heart Rate Variability', value: '45.5', time: '2026-09-06' }),
    ).toMatchObject({ status: 'ok', field: 'hrv_ms', value: 45.5 })
  })

  it('未知の cargo_id は unrecognized_cargo', () => {
    expect(parseHealthDataTrackerSample({ cargo_id: 'Blood Oxygen', value: 98, time: '2026-09-06' })).toEqual({
      status: 'unrecognized_cargo',
      cargoId: 'Blood Oxygen',
    })
  })

  it('パースできない time は unparseable_time（その1件だけスキップ）', () => {
    expect(
      parseHealthDataTrackerSample({ cargo_id: 'Resting Heart Rate', value: 52, time: 'yesterday' }),
    ).toEqual({ status: 'unparseable_time', cargoId: 'Resting Heart Rate' })
  })

  it('不正な value は invalid_value', () => {
    expect(
      parseHealthDataTrackerSample({ cargo_id: 'Resting Heart Rate', value: 'abc', time: '2026-09-06' }),
    ).toEqual({ status: 'invalid_value', cargoId: 'Resting Heart Rate' })
    expect(
      parseHealthDataTrackerSample({ cargo_id: 'Resting Heart Rate', value: -1, time: '2026-09-06' }),
    ).toEqual({ status: 'invalid_value', cargoId: 'Resting Heart Rate' })
  })

  it('体重の日付制限：受信時点から2日以内は ok、3日以上前は weight_date_too_old', () => {
    const now = '2026-09-06'
    expect(
      parseHealthDataTrackerSample({ cargo_id: 'Weight', value: 70, time: '2026-09-04' }, now),
    ).toMatchObject({ status: 'ok', field: 'weight_kg' })
    expect(
      parseHealthDataTrackerSample({ cargo_id: 'Weight', value: 70, time: '2026-09-03' }, now),
    ).toEqual({ status: 'weight_date_too_old', cargoId: 'Weight', logDate: '2026-09-03' })
  })

  it('体重以外は日付制限を受けない（過去日でも ok）', () => {
    expect(
      parseHealthDataTrackerSample({ cargo_id: 'Resting Heart Rate', value: 52, time: '2026-08-01' }, '2026-09-06'),
    ).toMatchObject({ status: 'ok', field: 'resting_heart_rate', logDate: '2026-08-01' })
  })
})

describe('isHealthDataTrackerPayload', () => {
  it('type 無し・data.metrics 無し・cargo_id と value あり → true', () => {
    expect(isHealthDataTrackerPayload({ cargo_id: 'Weight', value: 70, time: 'x', ship_id: 'iPhone' })).toBe(true)
  })

  it('既存の type 付きペイロードは false', () => {
    expect(isHealthDataTrackerPayload({ type: 'sleep', total_asleep_seconds: 1, start_time: 'x' })).toBe(false)
    expect(isHealthDataTrackerPayload({ type: 'metrics', cargo_id: 'Weight', value: 70 })).toBe(false)
  })

  it('Health Auto Export 形式（data.metrics 配列）は false', () => {
    expect(isHealthDataTrackerPayload({ data: { metrics: [] }, cargo_id: 'Weight', value: 70 })).toBe(false)
  })

  it('cargo_id か value が欠けていれば false', () => {
    expect(isHealthDataTrackerPayload({ cargo_id: 'Weight' })).toBe(false)
    expect(isHealthDataTrackerPayload({ value: 70 })).toBe(false)
    expect(isHealthDataTrackerPayload(null)).toBe(false)
  })
})

describe('isAuthorizedBySharedSecret（x-webhook-secret と X-API-Key の両対応・大文字小文字非依存）', () => {
  const secret = 'sekret-value'

  it('x-webhook-secret が一致すれば true', () => {
    expect(isAuthorizedBySharedSecret({ 'x-webhook-secret': secret }, secret)).toBe(true)
  })

  it('x-api-key が一致すれば true', () => {
    expect(isAuthorizedBySharedSecret({ 'x-api-key': secret }, secret)).toBe(true)
  })

  it('ヘッダー名の大文字小文字は区別しない', () => {
    expect(isAuthorizedBySharedSecret({ 'X-API-Key': secret }, secret)).toBe(true)
    expect(isAuthorizedBySharedSecret({ 'X-Webhook-Secret': secret }, secret)).toBe(true)
  })

  it('片方が誤りでももう片方が一致すれば true', () => {
    expect(isAuthorizedBySharedSecret({ 'x-webhook-secret': 'wrong', 'x-api-key': secret }, secret)).toBe(true)
  })

  it('どちらも一致しなければ false / 期待値が空でも false', () => {
    expect(isAuthorizedBySharedSecret({ 'x-api-key': 'wrong' }, secret)).toBe(false)
    expect(isAuthorizedBySharedSecret({}, secret)).toBe(false)
    expect(isAuthorizedBySharedSecret({ 'x-api-key': '' }, '')).toBe(false)
  })

  it('配列で届いたヘッダー値は先頭を使う', () => {
    expect(isAuthorizedBySharedSecret({ 'x-api-key': [secret, 'other'] }, secret)).toBe(true)
  })
})
