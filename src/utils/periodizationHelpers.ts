import type { DateString, PeriodizationTarget, TrainingSchedule } from '../types'

// スプリント3：試合日（MD）基準の栄養・トレーニング調整（2026年8月18日）
// ACWR・移動平均と同じく、DBにはキャッシュせず呼び出しのたびに動的計算する。

export interface PeriodizationRatio {
  energy: number // カロリー倍率
  protein: number // タンパク質倍率
  fat: number // 脂質倍率
}

// MD（試合日）前後の補正率テーブル（調整可能な定数として分離）
export const MD_ADJUSTMENT_TABLE: Record<string, PeriodizationRatio> = {
  'MD-3': { energy: 1.0, protein: 1.0, fat: 0.95 },
  'MD-2': { energy: 1.0, protein: 1.0, fat: 0.95 },
  'MD-1': { energy: 1.15, protein: 1.0, fat: 0.8 }, // カーボローディング
  MD: { energy: 1.25, protein: 1.0, fat: 0.7 }, // 試合当日
  'MD+1': { energy: 1.1, protein: 1.2, fat: 0.9 }, // リカバリー
}

function daysBetween(from: DateString, to: DateString): number {
  const fromTime = new Date(`${from}T00:00:00`).getTime()
  const toTime = new Date(`${to}T00:00:00`).getTime()
  return Math.round((toTime - fromTime) / 86_400_000)
}

/**
 * schedulesから schedule_type === 'match' かつ status !== 'cancelled' の
 * 予定のうち、targetDateに最も近い日付を検索し、日数差に応じたラベル
 * （'MD-3' 〜 'MD+1'）を返す。範囲外・該当試合なしの場合はnullを返す。
 *
 * 呼び出し側は、targetDateの前後（少なくとも当日+3日・前日）を含む範囲の
 * schedulesを渡す必要がある（週表示に紐づく取得範囲をそのまま流用すると、
 * 週境界付近で対象の試合予定が範囲外になり判定を誤る可能性があるため注意）。
 */
export function getMatchDayStatus(schedules: TrainingSchedule[], targetDate: DateString): string | null {
  const matchDates = schedules
    .filter((schedule) => schedule.scheduleType === 'match' && schedule.status !== 'cancelled')
    .map((schedule) => schedule.scheduledDate)

  if (matchDates.length === 0) {
    return null
  }

  // targetDateに最も近い試合日を採用（同着の場合はdaysBetweenが小さい方＝未来優先ではなく絶対値優先）
  let closestMatchDate: DateString | null = null
  let closestDiff = Infinity
  for (const matchDate of matchDates) {
    const diff = Math.abs(daysBetween(matchDate, targetDate))
    if (diff < closestDiff) {
      closestDiff = diff
      closestMatchDate = matchDate
    }
  }

  if (!closestMatchDate) {
    return null
  }

  // targetDate - matchDate: 正の値なら試合後、負の値なら試合前
  const offset = daysBetween(closestMatchDate, targetDate)

  if (offset === -3) return 'MD-3'
  if (offset === -2) return 'MD-2'
  if (offset === -1) return 'MD-1'
  if (offset === 0) return 'MD'
  if (offset === 1) return 'MD+1'
  return null
}

export type BaseGoalsForPeriodization = {
  dailyCalorieGoal: number
  dailyProteinGoal: number
  dailyFatGoal: number
  dailyCarbohydrateGoal: number
}

/**
 * MD_ADJUSTMENT_TABLEを参照し、PFC目標を逆算方式で算出する。
 * エネルギー目標を最優先し、タンパク質・脂質を確定させた後、残りのエネルギーを
 * すべて炭水化物に変換する。mdStatusがnullの場合は補正なし（基本目標値のまま）。
 *
 * 補正なしの場合はbaseGoals.dailyCarbohydrateGoal（Settingsで設定された実際の値）を
 * そのまま返す。カロリー・タンパク質・脂質の合計から逆算した値で置き換えると、
 * ユーザーが設定した値と一致しない場合に補正が発動していない通常の日でも
 * 表示上の炭水化物量が変わってしまうため（例：デフォルト値の場合、逆算すると
 * 265gになるが実際の設定値は250g）。逆算はMD補正が実際に発動している場合のみ行う。
 */
export function calculateAdjustedGoals(
  baseGoals: BaseGoalsForPeriodization,
  mdStatus: string | null,
): PeriodizationTarget {
  const ratio = mdStatus ? MD_ADJUSTMENT_TABLE[mdStatus] : undefined

  if (!ratio) {
    return {
      statusLabel: mdStatus ?? '',
      calorieTarget: baseGoals.dailyCalorieGoal,
      proteinTarget: baseGoals.dailyProteinGoal,
      carbsTarget: baseGoals.dailyCarbohydrateGoal,
      fatTarget: baseGoals.dailyFatGoal,
      isAdjusted: false,
    }
  }

  const calorieTarget = Math.round(baseGoals.dailyCalorieGoal * ratio.energy)
  const proteinTarget = Math.round(baseGoals.dailyProteinGoal * ratio.protein)
  const fatTarget = Math.round(baseGoals.dailyFatGoal * ratio.fat)
  const residualEnergy = calorieTarget - (proteinTarget * 4 + fatTarget * 9)
  const carbsTarget = Math.max(0, Math.round(residualEnergy / 4))

  return {
    statusLabel: mdStatus as string,
    calorieTarget,
    proteinTarget,
    carbsTarget,
    fatTarget,
    isAdjusted: true,
  }
}
