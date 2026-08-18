import type { ACWRResult, DailyCondition, DateString, MuscleLocation, SoccerLog, SorenessLevel, TrainingLog } from '../types'

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

function toDateKey(date: Date): DateString {
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
