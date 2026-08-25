import type { ACWRResult, DailyCondition, DateString, MuscleLocation, SoccerLog, SorenessLevel, TrainingLog } from '../types.js'

// 運動負荷の正規化定数（将来的なチューニングに対応できるよう分離）
export const GYM_VOLUME_DIVISOR = 100 // 筋トレ総挙上量(kg) → 負荷スコア換算
export const SOCCER_CALORIE_DIVISOR = 8 // サッカー消費カロリー(kcal) → 負荷スコア換算
export const MAX_SINGLE_LOAD_SCORE = 100 // 単一アクティビティの最大スコア上限

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
 * 日付ごとの統合負荷（筋トレ負荷＋サッカー負荷）を算出する。
 * 記録がない日は0（完全休養日）。DBにはキャッシュせず、呼び出しのたびに算出する。
 */
function calculateDailyLoadMap(trainingLogs: TrainingLog[], soccerLogs: SoccerLog[]): Map<DateString, number> {
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
): ACWRResult | null {
  const earliestDate = findEarliestDate(trainingLogs, soccerLogs)
  if (!earliestDate) {
    return null
  }

  const daysAvailable = Math.min(daysBetween(earliestDate, todayDate), CHRONIC_WINDOW_DAYS)
  if (daysAvailable < MIN_DAYS_FOR_CALCULATION) {
    return null
  }

  const dailyLoadMap = calculateDailyLoadMap(trainingLogs, soccerLogs)
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
): boolean {
  const conditionByDate = new Map(dailyConditions.map((condition) => [condition.date, condition]))
  const todayTime = new Date(`${todayDate}T00:00:00`).getTime()

  for (let offset = 0; offset < consecutiveDays; offset += 1) {
    const date = toDateKey(new Date(todayTime - offset * 86_400_000))
    const condition = conditionByDate.get(date)
    const result = calculateACWR(trainingLogs, soccerLogs, date, condition?.muscleSorenessLevel, condition?.muscleSorenessLocation)

    if (result?.status !== 'danger') {
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
): DailyACWRPoint[] {
  const todayTime = new Date(`${todayDate}T00:00:00`).getTime()
  const points: DailyACWRPoint[] = []

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = toDateKey(new Date(todayTime - offset * 86_400_000))
    const result = calculateACWR(trainingLogs, soccerLogs, date, undefined, undefined)
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
