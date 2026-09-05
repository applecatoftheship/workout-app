// Apple Health連携：自動計測値（安静時心拍数・HRV・歩数・アクティブエネルギー・
// 体重）の type:"metrics" ペイロード用の純粋関数群（2026年9月4日）。
// api/sync-apple-health.ts（Node専用のVercel Serverless Function）から呼ばれる。
// バリデーション・行組み立てのロジック自体はNode専用APIに依存しないため、
// vitestで直接テストできるよう src/utils/ 側に切り出した
// （api/_lib/ はNode型を含まないtsconfig.app.jsonの対象外でありテスト対象にもならない）。
//
// 【設計判断】自動計測値は daily_conditions ではなく health_metrics に分離する
// （streakHelpers.collectLogDates が daily_conditions の行の有無で連続記録日数を
// 判定するため、混ぜると毎日自動で行ができ streak バッジが実質無条件達成になる）。
// 体重（weight_kg）だけは既存の daily_conditions.weight に保存する
// （ACWR・プロフィール画面が既にこの列を参照しているため）。

export type MetricsPayload = {
  type: 'metrics'
  date: string
  resting_heart_rate?: number
  hrv_ms?: number
  steps?: number
  active_energy_kcal?: number
  weight_kg?: number
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// health_metrics に保存する4項目（体重は daily_conditions 側のため含まない）。
export const HEALTH_METRIC_FIELDS = ['resting_heart_rate', 'hrv_ms', 'steps', 'active_energy_kcal'] as const
export type HealthMetricField = (typeof HEALTH_METRIC_FIELDS)[number]

// バリデーション対象の数値項目（health_metrics の4項目＋weight_kg）。
const ALL_NUMERIC_FIELDS = [...HEALTH_METRIC_FIELDS, 'weight_kg'] as const

// YYYY-MM-DD形式かつ実在する暦日かどうか（2026-02-30等を弾く）。
// UTC固定でDate.UTCに渡し、年月日がラウンドトリップすることを確認する
// （ローカルタイムゾーンやサマータイムの影響を受けないようにするため）。
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) {
    return false
  }
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

// 有限の数値かつ0以上か。
export function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

// 「未指定」とみなす値かどうか（2026年9月4日追加）。
// 送信元のiOSショートカットは「ヘルスケアサンプルを検索」結果が0件（HRVを
// 腕時計を着けずに寝た日等、欠測は日常的に発生する）の場合、辞書アクションの
// 値が空になり "hrv_ms": null や "hrv_ms": "" の形で届く。これらは undefined と
// 同じ「その項目は送られてこなかった」として扱い、エラーにも既存値の上書きにも
// しない（数値の文字列化 "9821" 等への対応は不要。sleep/workoutが typeof==='number'
// の厳密判定で本番稼働できており、送信元が正しい型のJSON数値を送れることは
// 確認済みのため）。
export function isUnspecified(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

// 5項目（resting_heart_rate・hrv_ms・steps・active_energy_kcal・weight_kg）の
// うち1つでも指定されているか（null/""は「未指定」扱いで数えない）。
// 全て未指定（type・dateのみ、または全項目がnull/""）の場合、空行を作らないよう
// 呼び出し元で400にする判定に使う。
export function hasAnyMetric(payload: {
  resting_heart_rate?: unknown
  hrv_ms?: unknown
  steps?: unknown
  active_energy_kcal?: unknown
  weight_kg?: unknown
}): boolean {
  return ALL_NUMERIC_FIELDS.some((field) => !isUnspecified(payload[field]))
}

// type:"metrics" ペイロードの形をチェックし、問題があればエラーメッセージを、
// 問題なければ null を返す（api/sync-apple-health.ts 側で ValidationError に変換する）。
//   - date は必須、YYYY-MM-DD形式かつ実在する日付
//   - 他5項目は任意。null/""は「未指定」として無視する（欠測日の値がこの形で
//     届くため、1項目でも欠測しているとリクエスト全体を400で落としてしまう
//     不具合の修正、2026年9月4日）。指定されている場合のみ有限の数値かつ0以上を要求
//   - 5項目が1つも指定されていなければエラー（空行防止）
export function validateMetricsPayloadShape(payload: Record<string, unknown>): string | null {
  if (!isValidDateKey(payload.date)) {
    return 'date is required and must be a valid YYYY-MM-DD date'
  }
  for (const field of ALL_NUMERIC_FIELDS) {
    if (!isUnspecified(payload[field]) && !isFiniteNonNegative(payload[field])) {
      return `${field} must be a non-negative finite number if provided`
    }
  }
  if (!hasAnyMetric(payload)) {
    return 'at least one metric (resting_heart_rate, hrv_ms, steps, active_energy_kcal, weight_kg) must be provided'
  }
  return null
}

// health_metrics へのupsert行を組み立てる。
//
// 【最重要】送られてきたフィールドだけを含める。未送信の項目を null/undefined で
// オブジェクトに含めると、PostgRESTのupsertはonConflict対象の複合キー以外の
// 渡した列をすべてDO UPDATE SETで上書きするため、既存の値を消してしまう
// （例：今日 steps だけ送られてきたリクエストで resting_heart_rate まで
// row に含めてしまうと、既に保存済みの安静時心拍数がnullで潰される）。
// 4項目すべて未指定（health_metrics に保存すべき値が無い）場合は null を返す
// （weight_kg のみの送信＝daily_conditions側だけ更新、というケースに対応するため）。
export function buildHealthMetricsRow(
  payload: MetricsPayload,
  userId: string,
  logDate: string,
  now: string = new Date().toISOString(),
): Record<string, unknown> | null {
  const row: Record<string, unknown> = { user_id: userId, log_date: logDate, updated_at: now }
  let hasAny = false
  for (const field of HEALTH_METRIC_FIELDS) {
    const value = payload[field]
    // null/""（欠測日にiOSショートカットから届く「未指定」の表現）も
    // undefined と同様にスキップする（2026年9月4日）。
    if (isUnspecified(value)) {
      continue
    }
    // stepsはDB上integer列のため、小数で送られてきても丸めて渡す
    // （HealthKitの歩数は本来整数だが、送信元での丸め誤差等に備えた保険）。
    row[field] = field === 'steps' ? Math.round(value as number) : value
    hasAny = true
  }
  return hasAny ? row : null
}

// daily_conditions.weight への部分列upsert行を組み立てる（handleSleepと同じ
// 「onConflict対象の列以外は含めない」パターン。他の列（sleep_hours・notes等）を
// 上書きしないため）。weight_kg 未指定なら null を返す。
export function buildWeightUpsertRow(
  payload: MetricsPayload,
  userId: string,
  logDate: string,
): { user_id: string; log_date: string; weight: number } | null {
  // null/""（欠測扱い）も未指定として扱う（2026年9月4日）。
  if (isUnspecified(payload.weight_kg)) {
    return null
  }
  return { user_id: userId, log_date: logDate, weight: payload.weight_kg as number }
}
