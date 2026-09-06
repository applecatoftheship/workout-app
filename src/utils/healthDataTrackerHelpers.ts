// Health Data Tracker（RoutineHub の公開ショートカット、本来は Telemetry Harbor 向け）
// のペイロードを api/sync-apple-health.ts で受け取るための純粋関数群（2026年9月7日）。
//
// 【このショートカットが送ってくるもの（実機のスクリーンショットで確認済み）】
//   - ヘッダ： X-API-Key: <値>
//   - 方法： POST
//   - 本文（JSON、フラット構造・1リクエスト＝ヘルスケアサンプル1件）：
//       time      … サンプルの「開始日」（日付。ロケールにより表記が変わりうる）
//       cargo_id  … サンプルの「種類」（例 "Resting Heart Rate"。Apple の表示名がそのまま届く）
//       ship_id   … デバイス名（このアプリでは使わない）
//       value     … サンプルの値
//   - ショートカットは「各項目を繰り返す」でサンプル1件につき1リクエスト送る
//     （安静時心拍数・HRV・体重は1日1〜数件のため実用上問題なし）
//
// 【防御的方針】対応表に無い cargo_id・パースできない time・不正な value は
// エラーにせず無視し console.warn を出す（既存の Health Auto Export 経路と同じ）。
import { isValidDateKey, toJstDateKey } from './healthMetricsHelpers.js'
import { isWeightWritableForDate, parseHealthAutoExportDate } from './healthAutoExportHelpers.js'

// weight_kg のみ daily_conditions.weight、残り4つは health_metrics
// （healthMetricsHelpers.ts / healthAutoExportHelpers.ts と同じ分離方針）。
export type HealthDataTrackerTargetField =
  | 'steps'
  | 'active_energy_kcal'
  | 'resting_heart_rate'
  | 'hrv_ms'
  | 'weight_kg'

// cargo_id（Apple の表示名がそのまま届く）→ 保存先カラムの対応表。**別名を複数受け付ける**。
// 照合時は normalizeCargoId で trim + 小文字化 + 空白/アンダースコアの連続を単一スペースに
// 正規化するため、キーはその正規化済みの形で書く。
//
// 【重要】steps / active_energy_kcal は本来「その日の合計」だが、Health Data Tracker は
// 1リクエスト＝1サンプルのためこの経路では合計できず、同じ日に複数回届くと
// **後勝ち（最後に届いた値で上書き）** になる。安静時心拍数・HRV・体重は1日1〜数件なので
// 実用上問題ないが、歩数・アクティブエネルギーをこの経路で正確に集計することはできない
// （必要なら Health Auto Export 経路を使う）。
export const HEALTH_DATA_TRACKER_CARGO_ALIASES: Record<string, HealthDataTrackerTargetField> = {
  'resting heart rate': 'resting_heart_rate',
  restingheartrate: 'resting_heart_rate',
  'heart rate variability': 'hrv_ms',
  'heart rate variability sdnn': 'hrv_ms',
  weight: 'weight_kg',
  'body mass': 'weight_kg',
  'weight body mass': 'weight_kg',
  steps: 'steps',
  'step count': 'steps',
  'active energy': 'active_energy_kcal',
  'active energy burned': 'active_energy_kcal',
}

// trim → 小文字化 → 空白・アンダースコアの連続を単一スペースへ → 端の空白を除去。
// "Resting_Heart_Rate" / " resting heart rate " / "RestingHeartRate" いずれも
// 対応表のキーと照合できるようにする。
export function normalizeCargoId(raw: unknown): string {
  if (typeof raw !== 'string') {
    return ''
  }
  return raw.trim().toLowerCase().replace(/[\s_]+/g, ' ').trim()
}

export function resolveHealthDataTrackerField(cargoId: unknown): HealthDataTrackerTargetField | null {
  return HEALTH_DATA_TRACKER_CARGO_ALIASES[normalizeCargoId(cargoId)] ?? null
}

const ENGLISH_MONTH_ABBREVIATIONS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
]

function buildDateKey(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }
  const key = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return isValidDateKey(key) ? key : null
}

// time を JST の暦日（YYYY-MM-DD）に変換する。ショートカットのロケールで表記が変わりうるため
// 複数の形式を順に試し、どれにも当てはまらなければ null（呼び出し元でスキップ＋警告）。
//
// タイムゾーン情報がある文字列は「絶対時刻」として JST 暦日へ変換する。タイムゾーンが
// 無い文字列は送信元（John の端末）のローカル時刻＝JST とみなし、文字列から年月日だけを
// 取り出してそのまま暦日にする（new Date に渡すとサーバー(UTC)基準で解釈され日付がずれる）。
export function parseHealthDataTrackerDate(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }

  // 1. Health Auto Export と同じ "yyyy-MM-dd HH:mm:ss Z" 形式
  const haeParsed = parseHealthAutoExportDate(trimmed)
  if (haeParsed) {
    return haeParsed
  }

  // 2. タイムゾーン付き ISO-8601（"2026-09-06T14:30:00+09:00" / "...Z" / 秒省略可）
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    const instant = new Date(trimmed)
    if (!Number.isNaN(instant.getTime())) {
      return toJstDateKey(instant.toISOString())
    }
  }

  // 3. 先頭が YYYY-M-D / YYYY/M/D / YYYY.M.D（タイムゾーン無し＝ローカル暦日）。
  //    後ろは "T14:30" のように文字が続いてもよいが、さらに数字が続く場合は別形式。
  const isoLike = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/.exec(trimmed)
  if (isoLike) {
    const key = buildDateKey(Number(isoLike[1]), Number(isoLike[2]), Number(isoLike[3]))
    if (key) {
      return key
    }
  }

  // 4. 日本語ロケール "2026年9月6日 14:30:45"
  const japanese = /^(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(trimmed)
  if (japanese) {
    const key = buildDateKey(Number(japanese[1]), Number(japanese[2]), Number(japanese[3]))
    if (key) {
      return key
    }
  }

  // 5. "D/M/YYYY" or "M/D/YYYY"（順序が曖昧）。片方が 12 超なら確定、両方 12 以下なら
  //    推測せずスキップ（null）。
  const slashFirst = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)/.exec(trimmed)
  if (slashFirst) {
    const a = Number(slashFirst[1])
    const b = Number(slashFirst[2])
    const year = Number(slashFirst[3])
    let month: number | null = null
    let day: number | null = null
    if (a > 12 && b <= 12) {
      day = a
      month = b
    } else if (b > 12 && a <= 12) {
      month = a
      day = b
    }
    if (month !== null && day !== null) {
      const key = buildDateKey(year, month, day)
      if (key) {
        return key
      }
    }
    return null
  }

  // 6. 英語ロケールの月名 "Sep 6, 2026 ..." / "September 6, 2026"
  const englishMonth = /\b([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(trimmed)
  if (englishMonth) {
    const monthIndex = ENGLISH_MONTH_ABBREVIATIONS.indexOf(englishMonth[1].slice(0, 3).toLowerCase())
    if (monthIndex >= 0) {
      const key = buildDateKey(Number(englishMonth[3]), monthIndex + 1, Number(englishMonth[2]))
      if (key) {
        return key
      }
    }
  }

  return null
}

function coerceNonNegativeNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }
  return null
}

export type HealthDataTrackerParseResult =
  | { status: 'ok'; field: HealthDataTrackerTargetField; logDate: string; value: number }
  | { status: 'unrecognized_cargo'; cargoId: string }
  | { status: 'unparseable_time'; cargoId: string }
  | { status: 'invalid_value'; cargoId: string }
  | { status: 'weight_date_too_old'; cargoId: string; logDate: string }

// Health Data Tracker の1サンプル（cargo_id / value / time）を解釈する。
// nowJstDateKey を渡すと、体重（weight_kg）について既存の Health Auto Export 経路と同じ
// isWeightWritableForDate（受信時点から2日以内）の制限を適用し、古すぎれば
// weight_date_too_old を返す（過去分でストリークが遡って伸びるのを防ぐため）。
export function parseHealthDataTrackerSample(
  payload: { cargo_id?: unknown; value?: unknown; time?: unknown },
  nowJstDateKey?: string,
): HealthDataTrackerParseResult {
  const cargoId = typeof payload.cargo_id === 'string' ? payload.cargo_id : String(payload.cargo_id ?? '')
  const field = resolveHealthDataTrackerField(payload.cargo_id)
  if (!field) {
    return { status: 'unrecognized_cargo', cargoId }
  }

  const logDate = parseHealthDataTrackerDate(payload.time)
  if (!logDate) {
    return { status: 'unparseable_time', cargoId }
  }

  const value = coerceNonNegativeNumber(payload.value)
  if (value === null) {
    return { status: 'invalid_value', cargoId }
  }

  if (field === 'weight_kg' && nowJstDateKey !== undefined && !isWeightWritableForDate(logDate, nowJstDateKey)) {
    return { status: 'weight_date_too_old', cargoId, logDate }
  }

  return { status: 'ok', field, logDate, value }
}

// 「type が無く、data.metrics も無く、cargo_id と value を持つ」= Health Data Tracker 形式。
// 既存の3種別（type付き）・Health Auto Export 形式（data.metrics 配列）とは排他。
export function isHealthDataTrackerPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false
  }
  const record = payload as Record<string, unknown>
  if (record.type !== undefined) {
    return false
  }
  const data = record.data
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).metrics)) {
    return false
  }
  return record.cargo_id !== undefined && record.value !== undefined
}

// 認証：既存の x-webhook-secret に加えて X-API-Key（Health Data Tracker）も受け付ける。
// ヘッダー名の大文字小文字は区別しない。どちらか一方でも expectedSecret と一致すれば true。
export function isAuthorizedBySharedSecret(
  headers: Record<string, string | string[] | undefined>,
  expectedSecret: string,
): boolean {
  if (!expectedSecret) {
    return false
  }
  const lookup = (name: string): string | undefined => {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === name) {
        return Array.isArray(value) ? value[0] : value
      }
    }
    return undefined
  }
  return [lookup('x-webhook-secret'), lookup('x-api-key')].some((candidate) => candidate === expectedSecret)
}
