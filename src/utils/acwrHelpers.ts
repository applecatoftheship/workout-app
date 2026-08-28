import type { ACWRResult, DailyCondition, DateString, MuscleLocation, SoccerLog, SorenessLevel, TrainingLog, Workout } from '../types.js'

// 運動負荷の正規化定数（将来的なチューニングに対応できるよう分離）
export const GYM_VOLUME_DIVISOR = 100 // 筋トレ総挙上量(kg) → 負荷スコア換算
export const SOCCER_CALORIE_DIVISOR = 8 // サッカー消費カロリー(kcal) → 負荷スコア換算
export const MAX_SINGLE_LOAD_SCORE = 100 // 単一アクティビティの最大スコア上限

// Apple Health連携（2026年8月27日）：ワークアウト（Apple Watch自動記録）の
// 負荷換算に使う定数。実装指示書の式：
//   推定消費カロリー(kcal) = 体重(kg) × (distance_meters ÷ 1000) × WORKOUT_CALORIE_FACTOR
//   ワークアウトの負荷 = 推定消費カロリー ÷ SOCCER_CALORIE_DIVISOR（サッカーと同じ換算係数）
export const WORKOUT_CALORIE_FACTOR = 1.0 // 体重(kg)×距離(km)あたりの推定消費カロリー係数
export const DEFAULT_WEIGHT_KG = 70 // 体重記録が無い日・ユーザーの場合のフォールバック

const ACUTE_WINDOW_DAYS = 7
const CHRONIC_WINDOW_DAYS = 28
const MIN_DAYS_FOR_CALCULATION = 7

export const MUSCLE_LOCATION_LABELS: Record<MuscleLocation, string> = {
  none: 'なし',
  calf_l: '左ふくらはぎ',
  calf_r: '右ふくらはぎ',
  hamstring: 'ハムストリングス',
  quad: '大腿四頭筋',
  groin: '股関節・鼠蹊部',
  other: 'その他',
}

export const SORENESS_LEVEL_LABELS: Record<SorenessLevel, string> = {
  none: 'なし',
  mild: '違和感（軽度）',
  severe: '強い張り（要注意）',
}

export function toDateKey(date: Date): DateString {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}` as DateString
}

// Apple Health連携（2026年8月27日）：workouts.startTime（timestamptz）から
// JST基準の暦日を求める。src/utils/calendarHelpers.tsのtoJstDateKeyFromIsoと
// 同じ換算方式だが、calendarHelpers.tsはacwrHelpers.tsのMUSCLE_LOCATION_LABELS等を
// 既に逆方向にimportしているため、ここでcalendarHelpers.tsをimportすると循環参照に
// なる。そのため小さな純関数をこのファイル内に個別実装している
// （api/sync-apple-health.ts・api/send-reminder.ts等、api/配下の各ファイルが
// 同種の変換を個別に持っているのと同じ判断）。
function toJstDateKeyFromIso(isoString: string): DateString {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(isoString))
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return `${year}-${month}-${day}` as DateString
}

// Apple Health連携（2026年8月27日）：workoutsの負荷換算に使う「対象日以前の
// 直近実測体重」。src/api/dailyConditions.tsのfetchRecentWeight（`.lte('log_date',
// beforeDate)`、対象日当日も含む）と同じ「以前」の意味に合わせている。
// 該当する体重記録が無い場合はDEFAULT_WEIGHT_KG（70kg）にフォールバックする。
function findRecentWeightOnOrBefore(dailyConditions: DailyCondition[], date: DateString): number {
  let bestDate: DateString | null = null
  let bestWeight = DEFAULT_WEIGHT_KG

  dailyConditions.forEach((condition) => {
    if (condition.date <= date && condition.weight > 0) {
      if (bestDate === null || condition.date > bestDate) {
        bestDate = condition.date
        bestWeight = condition.weight
      }
    }
  })

  return bestWeight
}

function daysBetween(start: DateString, end: DateString): number {
  const startTime = new Date(`${start}T00:00:00`).getTime()
  const endTime = new Date(`${end}T00:00:00`).getTime()
  return Math.round((endTime - startTime) / 86_400_000) + 1
}

function findEarliestDate(trainingLogs: TrainingLog[], soccerLogs: SoccerLog[]): DateString | null {
  const dates = [...trainingLogs.map((log) => log.date), ...soccerLogs.map((log) => log.date)]
  if (dates.length === 0) {
    return null
  }
  return dates.reduce((earliest, date) => (date < earliest ? date : earliest))
}

/**
 * 日付ごとの統合負荷（筋トレ負荷＋サッカー負荷＋ワークアウト負荷）を算出する。
 * 記録がない日は0（完全休養日）。DBにはキャッシュせず、呼び出しのたびに算出する。
 * workouts・dailyConditionsは省略可（デフォルト空配列、既存呼び出しとの後方互換）。
 */
function calculateDailyLoadMap(
  trainingLogs: TrainingLog[],
  soccerLogs: SoccerLog[],
  workouts: Workout[] = [],
  dailyConditions: DailyCondition[] = [],
): Map<DateString, number> {
  const map = new Map<DateString, number>()

  const volumeByDate = new Map<DateString, number>()
  trainingLogs.forEach((log) => {
    const volume = log.exercises.reduce((exerciseSum, exercise) => {
      const setVolume = exercise.sets.reduce((setSum, set) => setSum + (set.weight ?? 0) * (set.reps ?? 0), 0)
      return exerciseSum + setVolume
    }, 0)
    volumeByDate.set(log.date, (volumeByDate.get(log.date) ?? 0) + volume)
  })

  volumeByDate.forEach((volume, date) => {
    map.set(date, Math.min(MAX_SINGLE_LOAD_SCORE, volume / GYM_VOLUME_DIVISOR))
  })

  soccerLogs.forEach((log) => {
    const soccerLoad = Math.min(MAX_SINGLE_LOAD_SCORE, (log.caloriesBurned ?? 0) / SOCCER_CALORIE_DIVISOR)
    map.set(log.date, (map.get(log.date) ?? 0) + soccerLoad)
  })

  // Apple Health連携（2026年8月27日、実装指示書）：is_primary = trueの行のみ対象
  // （呼び出し元・fetchWorkoutsは既にis_primary=trueのみ返す前提だが、この関数
  // 自体の契約としても明示的にフィルタする）。
  //   推定消費カロリー(kcal) = 体重(kg) × (distance_meters ÷ 1000) × WORKOUT_CALORIE_FACTOR
  //   ワークアウトの負荷 = 推定消費カロリー ÷ SOCCER_CALORIE_DIVISOR（サッカーと同じ係数）
  // 体重はfetchRecentWeightと同じ「対象日以前の直近実測値」パターン、
  // 記録が無ければDEFAULT_WEIGHT_KG（70kg）にフォールバックする。
  workouts
    .filter((workout) => workout.isPrimary)
    .forEach((workout) => {
      const dateKey = toJstDateKeyFromIso(workout.startTime)
      const distanceKm = (workout.distanceMeters ?? 0) / 1000
      const weightKg = findRecentWeightOnOrBefore(dailyConditions, dateKey)
      const estimatedCalories = weightKg * distanceKm * WORKOUT_CALORIE_FACTOR
      const workoutLoad = Math.min(MAX_SINGLE_LOAD_SCORE, estimatedCalories / SOCCER_CALORIE_DIVISOR)
      map.set(dateKey, (map.get(dateKey) ?? 0) + workoutLoad)
    })

  return map
}

function determineACWRStatus(
  acwr: number,
  sorenessLevel: SorenessLevel | undefined,
  sorenessLocation: MuscleLocation | undefined,
): Pick<ACWRResult, 'status' | 'message' | 'hasSorenessWarning'> {
  const soreness = sorenessLevel ?? 'none'
  const locationLabel = sorenessLocation && sorenessLocation !== 'none' ? MUSCLE_LOCATION_LABELS[sorenessLocation] : '該当部位'

  if (acwr > 1.5) {
    return {
      status: 'danger',
      message: '急性オーバーワーク状態（怪我リスク急増）。即座に負荷を抑えてください',
      hasSorenessWarning: false,
    }
  }

  if (acwr < 0.8) {
    return {
      status: 'unload',
      message: '負荷が減少しています。コンディション維持のため適度な刺激が必要です',
      hasSorenessWarning: false,
    }
  }

  if (acwr >= 1.3) {
    if (soreness === 'none') {
      return {
        status: 'warning',
        message: '負荷がやや急増しています。休養またはアクティブレストを検討してください',
        hasSorenessWarning: false,
      }
    }
    return {
      status: 'danger',
      message: '負荷増＋局所疲労が重なっています。怪我リスクが高水準です',
      hasSorenessWarning: true,
    }
  }

  if (soreness === 'severe') {
    return {
      status: 'warning',
      message: `ACWRは適正ですが、${locationLabel}に強めの張りがあります。入念なケアを推奨`,
      hasSorenessWarning: true,
    }
  }

  return {
    status: 'sweet_spot',
    message: 'コンディション良好。怪我リスクが低い理想的な状態です',
    hasSorenessWarning: false,
  }
}

/**
 * ACWR（急性:慢性負荷比）を算出する。DBにキャッシュせず、呼び出しのたびに
 * trainingLogs・soccerLogsから動的に計算する。
 * 記録が7日分未満の場合はnullを返す（呼び出し側で「データ蓄積中」等を表示する）。
 */
export function calculateACWR(
  trainingLogs: TrainingLog[],
  soccerLogs: SoccerLog[],
  todayDate: DateString,
  todaySorenessLevel: SorenessLevel | undefined,
  todaySorenessLocation: MuscleLocation | undefined,
  // Apple Health連携（2026年8月27日）：既存呼び出しとの後方互換のため末尾に
  // 追加、省略時は空配列（ワークアウト負荷ゼロ）扱い。
  workouts: Workout[] = [],
  dailyConditions: DailyCondition[] = [],
): ACWRResult | null {
  // findEarliestDate・daysUntilACWRAvailableはtrainingLogs/soccerLogsのみを見る
  // 既存仕様のまま変更していない（今回の指示範囲はcalculateDailyLoadMapへの
  // 負荷入力追加のみのため）。ワークアウト記録しかない利用者の「データ蓄積中」
  // 判定がずれる可能性がある点は既知の限界として残る。
  const earliestDate = findEarliestDate(trainingLogs, soccerLogs)
  if (!earliestDate) {
    return null
  }

  const daysAvailable = Math.min(daysBetween(earliestDate, todayDate), CHRONIC_WINDOW_DAYS)
  if (daysAvailable < MIN_DAYS_FOR_CALCULATION) {
    return null
  }

  const dailyLoadMap = calculateDailyLoadMap(trainingLogs, soccerLogs, workouts, dailyConditions)
  const todayTime = new Date(`${todayDate}T00:00:00`).getTime()

  const loadForOffset = (offsetDays: number) => {
    const date = new Date(todayTime - offsetDays * 86_400_000)
    return dailyLoadMap.get(toDateKey(date)) ?? 0
  }

  // calculateACWRはdaysAvailable < MIN_DAYS_FOR_CALCULATION(7)の時点でnullを返すため、
  // ここに到達する時点でdaysAvailable >= 7が保証されており、acuteDaysは常に7固定になる。
  // ただし将来MIN_DAYS_FOR_CALCULATIONを変更した場合にも表示側が正しく追従できるよう、
  // 固定値ではなく実際の集計日数をACWRResultに含めて返す。
  const acuteDays = Math.min(ACUTE_WINDOW_DAYS, daysAvailable)
  const chronicDays = daysAvailable

  let acuteSum = 0
  for (let i = 0; i < acuteDays; i += 1) {
    acuteSum += loadForOffset(i)
  }
  const acuteLoad = acuteSum / acuteDays

  let chronicSum = 0
  for (let i = 0; i < chronicDays; i += 1) {
    chronicSum += loadForOffset(i)
  }
  const chronicLoad = chronicSum / chronicDays

  const acwr = chronicLoad > 0 ? acuteLoad / chronicLoad : 0

  const { status, message, hasSorenessWarning } = determineACWRStatus(acwr, todaySorenessLevel, todaySorenessLocation)

  return { acuteLoad, chronicLoad, acuteDays, chronicDays, acwr, status, message, hasSorenessWarning }
}

/**
 * ディロード自動提案（実装指示書Phase C、2026年8月18日）：直近consecutiveDays日
 * （デフォルト3日）が連続して🔴警戒（danger）状態だったかを判定する。DBキャッシュは
 * せず、calculateACWR・determineACWRStatusと同じロジックを日ごとに再利用して
 * 動的に計算する。各日の判定に必要な局所疲労情報は、その日のdaily_conditionsから
 * 取得する（当日の値だけでなく、対象の各日の値をそれぞれ参照する必要があるため）。
 * 判定できない日（データ不足でcalculateACWRがnullを返す日）が1日でもあれば
 * 連続とはみなさずfalseを返す（安全側の判断）。
 */
export function hasConsecutiveDangerDays(
  trainingLogs: TrainingLog[],
  soccerLogs: SoccerLog[],
  dailyConditions: DailyCondition[],
  todayDate: DateString,
  consecutiveDays = 3,
  // Apple Health連携（2026年8月27日）：既存呼び出しとの後方互換のため末尾に追加。
  workouts: Workout[] = [],
): boolean {
  const conditionByDate = new Map(dailyConditions.map((condition) => [condition.date, condition]))
  const todayTime = new Date(`${todayDate}T00:00:00`).getTime()

  for (let offset = 0; offset < consecutiveDays; offset += 1) {
    const date = toDateKey(new Date(todayTime - offset * 86_400_000))
    const condition = conditionByDate.get(date)
    const result = calculateACWR(
      trainingLogs,
      soccerLogs,
      date,
      condition?.muscleSorenessLevel,
      condition?.muscleSorenessLocation,
      workouts,
      dailyConditions,
    )

    if (result?.status !== 'danger') {
      return false
    }
  }

  return true
}

/**
 * 設定画面拡張 Phase 4（ゲーミフィケーション、2026年8月28日、バッジ「コンディショニング
 * プロ」判定用）：直近consecutiveDays日（既定7日）が連続してACWR「適正」
 * （🟢sweet_spot）状態だったかを判定する。hasConsecutiveDangerDaysと対になる関数で、
 * 判定ロジック（calculateACWR・determineACWRStatusを日ごとに再利用し、DBキャッシュ
 * せず動的計算する既存方針）を共有するが、対象ステータスが逆（sweet_spot固定）の
 * ため、hasConsecutiveDangerDaysのstatus引数化ではなく独立した関数として追加した
 * （既存呼び出し元・Dashboard.tsxのshowDeloadWarningの呼び出しシグネチャを変更
 * しないための判断）。判定できない日（データ不足でnullが返る日）が1日でもあれば
 * 連続とはみなさずfalseを返す（安全側の判断、hasConsecutiveDangerDaysと同じ）。
 */
export function hasConsecutiveOptimalDays(
  trainingLogs: TrainingLog[],
  soccerLogs: SoccerLog[],
  dailyConditions: DailyCondition[],
  todayDate: DateString,
  consecutiveDays = 7,
  workouts: Workout[] = [],
): boolean {
  const conditionByDate = new Map(dailyConditions.map((condition) => [condition.date, condition]))
  const todayTime = new Date(`${todayDate}T00:00:00`).getTime()

  for (let offset = 0; offset < consecutiveDays; offset += 1) {
    const date = toDateKey(new Date(todayTime - offset * 86_400_000))
    const condition = conditionByDate.get(date)
    const result = calculateACWR(
      trainingLogs,
      soccerLogs,
      date,
      condition?.muscleSorenessLevel,
      condition?.muscleSorenessLocation,
      workouts,
      dailyConditions,
    )

    if (result?.status !== 'sweet_spot') {
      return false
    }
  }

  return true
}

/** データ蓄積があと何日で7日分に達するか（表示用）。7日分以上ある場合は0。 */
export function daysUntilACWRAvailable(trainingLogs: TrainingLog[], soccerLogs: SoccerLog[], todayDate: DateString): number {
  const earliestDate = findEarliestDate(trainingLogs, soccerLogs)
  if (!earliestDate) {
    return MIN_DAYS_FOR_CALCULATION
  }
  const daysAvailable = daysBetween(earliestDate, todayDate)
  return Math.max(0, MIN_DAYS_FOR_CALCULATION - daysAvailable)
}

export interface DailyACWRPoint {
  date: DateString
  acwr: number | null
}

/**
 * 週次ACWRインサイト機能（2026年8月25日）：todayDateを終端とする直近days日間
 * （既定28日）の日次ACWR推移を返す。既存のcalculateACWRを日ごとに再利用する
 * （hasConsecutiveDangerDaysと同じ設計）ため、DBキャッシュなしで動的計算する
 * 既存方針をそのまま踏襲している。各日についてcalculateACWRがnullを返す場合
 * （その日の時点でまだ7日分のデータが無い、アプリ利用開始直後の期間）は
 * acwr: nullとして返し、グラフ描画側でその日の点を省略する判断に委ねる。
 * 局所疲労（soreness）はこの系列の用途（数値の推移・帯域分類のみ）では
 * 参照しないため、calculateACWR呼び出し時は常にundefinedを渡す。
 */
export function calculateDailyACWRSeries(
  trainingLogs: TrainingLog[],
  soccerLogs: SoccerLog[],
  todayDate: DateString,
  days = 28,
  // Apple Health連携（2026年8月27日）：既存呼び出しとの後方互換のため末尾に追加。
  // calculateACWRの薄いラッパーのため、ここにworkouts/dailyConditionsを渡すだけで
  // 週次ACWR（WeeklyACWRTrendCard・WeeklyACWRDetailModal）にも自動的に反映される。
  workouts: Workout[] = [],
  dailyConditions: DailyCondition[] = [],
): DailyACWRPoint[] {
  const todayTime = new Date(`${todayDate}T00:00:00`).getTime()
  const points: DailyACWRPoint[] = []

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = toDateKey(new Date(todayTime - offset * 86_400_000))
    const result = calculateACWR(trainingLogs, soccerLogs, date, undefined, undefined, workouts, dailyConditions)
    points.push({ date, acwr: result ? result.acwr : null })
  }

  return points
}

export type ACWRInsightTier = 'unload' | 'recovery' | 'optimal' | 'surge' | 'spike'

export interface ACWRInsight {
  tier: ACWRInsightTier
  title: string
  /** src/styles/tokens.cssのCSSカスタムプロパティ名（例：'--color-warning-text'） */
  colorToken: string
  body: string
}

/**
 * 週次ACWRインサイト機能：ACWR数値のみから5段階のインサイト文言を判定する
 * （Gemini提案の文言をそのまま使用、実装指示書2026年8月25日）。
 * determineACWRStatus（4段階＋局所疲労での補正）とは独立した別ロジック：
 * 既存の4段階判定はACWRGaugeCard向けに局所疲労も加味した判定だが、こちらは
 * 「ACWR数値だけを見た時のインサイト」という指示書の定義通り、局所疲労は
 * 一切考慮しない。境界の不等号は既存のdetermineACWRStatusと同じ厳密な扱い
 * （> 1.5 / < 0.8 / >= 1.3）に、指示書の残り2境界（1.0・0.8）を同じ流儀で追加した。
 */
export function getACWRInsight(acwr: number): ACWRInsight {
  if (acwr > 1.5) {
    return {
      tier: 'spike',
      title: '⚠️怪我リスク高（スパイク）',
      colorToken: '--color-danger-text',
      body: '急性負荷が過大（スパイク）です。怪我発生リスクが大幅に上昇しています。本日はアクティブリカバリーまたは完全休養を強く推奨します。',
    }
  }

  if (acwr < 0.8) {
    return {
      tier: 'unload',
      title: '負荷低下（維持注意）',
      colorToken: '--color-warning-text',
      body: 'トレーニング負荷が低下傾向です。コンディション維持のため、次回セッションの強度または時間を10〜15%程度引き上げることを推奨します。',
    }
  }

  if (acwr >= 1.3) {
    return {
      tier: 'surge',
      title: '負荷急増（警戒）',
      colorToken: '--color-warning-text',
      body: '急性負荷が高まっています。パフォーマンス向上に適した時期ですが疲労の蓄積に注意が必要です。高強度トレーニングの連日は避けましょう。',
    }
  }

  if (acwr >= 1.0) {
    return {
      tier: 'optimal',
      title: '最適トレーニング帯',
      colorToken: '--color-accent-text',
      body: '理想的な負荷コントロールです。怪我リスクを抑えつつ最も効率的にフィットネスを向上できる帯域を維持できています。このペースを継続しましょう。',
    }
  }

  return {
    tier: 'recovery',
    title: 'リカバリー最適期',
    colorToken: '--color-success-text',
    body: '控えめな負荷で疲労が抜けやすい状態です。試合前のピーキングや疲労抜きのタイミングとして理想的な調整ができています。',
  }
}
