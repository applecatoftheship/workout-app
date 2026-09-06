// Health Auto Export（サードパーティのiOSネイティブアプリ、HealthKit権限あり）からの
// 自動POSTを api/sync-apple-health.ts で受け取るための純粋関数群（2026年9月6日）。
//
// 【経緯】手組みのiOSショートカット（.shortcut）は、Health系アクションの
// パラメータキーが一次情報で裏付けられず生成を断念した。代わりに Health Auto Export
// から既存エンドポイントへ自動POSTさせる方式に切り替えた。同アプリはカスタム
// HTTPヘッダーを設定できるため、既存の x-webhook-secret 認証はそのまま使える。
//
// 【ペイロード形式】公式ドキュメント
// https://help.healthyapps.dev/en/health-auto-export/export-format/health-metrics
//   { "data": { "metrics": [
//       { "name": "step_count", "units": "count",
//         "data": [ { "qty": 8500, "date": "2024-02-06 14:30:00 -0800", "source": "..." } ] },
//       ...
//   ] } }
//   - date は "yyyy-MM-dd HH:mm:ss Z"（タイムゾーンオフセット付き）
//   - 1回のPOSTに複数指標・複数日付が含まれうる（バックフィル送信）
//   - 指標名は snake_case
//
// 【防御的設計】指標名・単位は公式ドキュメントから読み取ったもので、実際の送信値と
// 細部が異なる可能性がある。このため：
//   - 対応表に無い指標名はエラーにせず無視し、console.warn で通知する
//     （1つの未知指標でリクエスト全体を落とさない）
//   - 想定外の単位の指標はスキップし警告ログを出す（体重・エネルギーのみ単位変換対象）
//   - 集約結果は日付順にソートして返す（レスポンスに含めて初回の実データで対応表を調整する）
// このファイルは api/sync-apple-health.ts（Node/nodenext解決）から読まれるため、
// 兄弟importは拡張子 .js を明示する（calendarHelpers.ts→acwrHelpers.js 等と同じ）。
import { toJstDateKey } from './healthMetricsHelpers.js'

// health_metrics / daily_conditions への保存先。weight_kg のみ daily_conditions.weight、
// 残り4つは health_metrics（healthMetricsHelpers.ts と同じ分離方針）。
export type HealthAutoExportTargetField =
  | 'steps'
  | 'active_energy_kcal'
  | 'resting_heart_rate'
  | 'hrv_ms'
  | 'weight_kg'

// 指標名（snake_case）→ 保存先カラムの対応表。**別名を複数受け付ける**。
// キーはすべて小文字（照合時に name を trim + toLowerCase する）。
export const HEALTH_AUTO_EXPORT_METRIC_ALIASES: Record<string, HealthAutoExportTargetField> = {
  // steps
  step_count: 'steps',
  steps: 'steps',
  // active energy
  active_energy: 'active_energy_kcal',
  active_energy_burned: 'active_energy_kcal',
  active_energy_kcal: 'active_energy_kcal',
  // resting heart rate
  resting_heart_rate: 'resting_heart_rate',
  // heart rate variability
  heart_rate_variability: 'hrv_ms',
  heart_rate_variability_sdnn: 'hrv_ms',
  hrv_ms: 'hrv_ms',
  // body weight（daily_conditions.weight へ）
  weight_body_mass: 'weight_kg',
  'weight_&_body_mass': 'weight_kg',
  body_mass: 'weight_kg',
  weight_kg: 'weight_kg',
}

// 日ごとの集約方法。steps / active_energy_kcal は合計、それ以外は平均。
const SUM_FIELDS = new Set<HealthAutoExportTargetField>(['steps', 'active_energy_kcal'])

const LB_TO_KG = 0.45359237
const KJ_PER_KCAL = 4.184

// units フィールドを見て、qty に掛ける係数を返す。想定外の単位なら null（＝その指標は
// スキップして警告）。単位変換の対象は体重（lb→kg）とエネルギー（kJ→kcal）のみ。
// steps / resting_heart_rate / hrv_ms は変換不要のため常に 1。
export function resolveHealthAutoExportUnitFactor(
  target: HealthAutoExportTargetField,
  units: string,
): number | null {
  const normalized = units.trim().toLowerCase()
  if (target === 'weight_kg') {
    if (normalized === 'kg' || normalized === 'kilogram' || normalized === 'kilograms') {
      return 1
    }
    if (normalized === 'lb' || normalized === 'lbs' || normalized === 'pound' || normalized === 'pounds') {
      return LB_TO_KG
    }
    return null
  }
  if (target === 'active_energy_kcal') {
    if (normalized === 'kcal' || normalized === 'kilocalorie' || normalized === 'kilocalories') {
      return 1
    }
    if (normalized === 'kj' || normalized === 'kilojoule' || normalized === 'kilojoules') {
      return 1 / KJ_PER_KCAL
    }
    return null
  }
  return 1
}

const HAE_DATE_PATTERN =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})$/

// "yyyy-MM-dd HH:mm:ss Z"（オフセット付き。"Z" と "+09:00"/"+0900" 両対応）を
// JST の暦日（YYYY-MM-DD）に変換する。パースできなければ null。
// 例: "2026-09-05 23:30:00 -0800" は絶対時刻では 2026-09-06 07:30 UTC → JST 16:30 → "2026-09-06"。
export function parseHealthAutoExportDate(raw: string): string | null {
  if (typeof raw !== 'string') {
    return null
  }
  const match = HAE_DATE_PATTERN.exec(raw.trim())
  if (!match) {
    return null
  }
  const [, datePart, timePart, tzPart] = match
  const normalizedTz =
    tzPart === 'Z' ? 'Z' : tzPart.length === 5 ? `${tzPart.slice(0, 3)}:${tzPart.slice(3)}` : tzPart
  const instant = new Date(`${datePart}T${timePart}${normalizedTz}`)
  if (Number.isNaN(instant.getTime())) {
    return null
  }
  return toJstDateKey(instant.toISOString())
}

// 「type が無く data.metrics が配列である」= Health Auto Export のペイロード。
// 既存の sleep / workout / metrics は payload.type で分岐しているため、type の有無で
// 確実に区別できる。
export function isHealthAutoExportPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false
  }
  const record = payload as Record<string, unknown>
  if (record.type !== undefined) {
    return false
  }
  const data = record.data
  if (!data || typeof data !== 'object') {
    return false
  }
  return Array.isArray((data as Record<string, unknown>).metrics)
}

export type HealthAutoExportPayload = {
  data?: { metrics?: unknown } | null
}

// 日付（JST暦日）ごとに集約した1行。含まれるフィールドだけを持つ。
export type HealthAutoExportDayRow = {
  logDate: string
} & Partial<Record<HealthAutoExportTargetField, number>>

export type HealthAutoExportAggregation = {
  rows: HealthAutoExportDayRow[]
  // 対応表に無かった指標名（重複排除済み。レスポンスに含めて対応表調整の材料にする）。
  unrecognizedMetricNames: string[]
  // 想定外の単位でスキップした指標（"name (units: xxx)" 形式）。
  skippedUnitMetrics: string[]
}

type DayAccumulator = Partial<Record<HealthAutoExportTargetField, { total: number; count: number }>>

// Health Auto Export ペイロードをパースし、JST暦日ごとに集約する（純粋関数）。
// - steps / active_energy_kcal … その日のデータ点の合計
// - resting_heart_rate / hrv_ms / weight_kg … その日のデータ点の平均
export function aggregateHealthAutoExport(payload: HealthAutoExportPayload): HealthAutoExportAggregation {
  const metrics = payload?.data?.metrics
  const unrecognized = new Set<string>()
  const skippedUnitMetrics: string[] = []
  const buckets = new Map<string, DayAccumulator>()

  if (!Array.isArray(metrics)) {
    return { rows: [], unrecognizedMetricNames: [], skippedUnitMetrics: [] }
  }

  for (const rawMetric of metrics) {
    const metric = (rawMetric ?? {}) as Record<string, unknown>
    const name = typeof metric.name === 'string' ? metric.name.trim().toLowerCase() : ''
    const units = typeof metric.units === 'string' ? metric.units : ''
    const target = HEALTH_AUTO_EXPORT_METRIC_ALIASES[name]

    if (!target) {
      const label = name || '(不明)'
      unrecognized.add(label)
      console.warn(`[health-auto-export] 未対応の指標名: ${label}（units: ${units || '不明'}）`)
      continue
    }

    // units は指標単位（データ点ごとではない）ため一度だけ判定する。
    const unitFactor = resolveHealthAutoExportUnitFactor(target, units)
    if (unitFactor === null) {
      skippedUnitMetrics.push(`${name} (units: ${units || '不明'})`)
      console.warn(`[health-auto-export] 未対応の単位のためスキップ: ${name}（units: ${units || '不明'}）`)
      continue
    }

    const points = Array.isArray(metric.data) ? metric.data : []
    for (const rawPoint of points) {
      const point = (rawPoint ?? {}) as Record<string, unknown>
      const qty = point.qty
      if (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 0) {
        continue
      }
      const date = point.date
      if (typeof date !== 'string') {
        continue
      }
      const logDate = parseHealthAutoExportDate(date)
      if (!logDate) {
        continue
      }

      const value = qty * unitFactor
      let bucket = buckets.get(logDate)
      if (!bucket) {
        bucket = {}
        buckets.set(logDate, bucket)
      }
      const entry = bucket[target] ?? { total: 0, count: 0 }
      entry.total += value
      entry.count += 1
      bucket[target] = entry
    }
  }

  const rows: HealthAutoExportDayRow[] = [...buckets.keys()]
    .sort()
    .map((logDate) => {
      const bucket = buckets.get(logDate) as DayAccumulator
      const row: HealthAutoExportDayRow = { logDate }
      for (const field of Object.keys(bucket) as HealthAutoExportTargetField[]) {
        const entry = bucket[field]
        if (!entry || entry.count === 0) {
          continue
        }
        row[field] = SUM_FIELDS.has(field) ? entry.total : entry.total / entry.count
      }
      return row
    })
    // すべてのフィールドがスキップされ logDate だけになった行は除外（通常発生しないが保険）。
    .filter((row) => Object.keys(row).length > 1)

  return {
    rows,
    unrecognizedMetricNames: [...unrecognized].sort(),
    skippedUnitMetrics,
  }
}
