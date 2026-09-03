// 有酸素運動（ウォーキング／ランニング／サイクリング）の時間ベース記録用。
// exercises.body_part = '有酸素' の種目を選んだとき、重量×回数ではなく
// 「時間（分）」を入力し、そこから距離・消費カロリーを自動計算する。
// MET値・想定ペースは Compendium of Physical Activities 準拠。
// soccerCalorieHelpers.ts の MET_VALUES / AUTO_FILL_RATES / resolveMet と同一パターン。

export interface CardioRates {
  met: number
  paceKmh: number // 想定ペース（時速km）
}

export const CARDIO_RATES: Record<string, CardioRates> = {
  ウォーキング: { met: 4.3, paceKmh: 5.6 },
  ランニング: { met: 8.3, paceKmh: 8.0 },
  サイクリング: { met: 6.8, paceKmh: 20.0 },
}

export const CARDIO_ACTIVITY_TYPES = Object.keys(CARDIO_RATES)

// MET計算で直近の実測体重が取れなかった場合のフォールバック
// （acwrHelpers.ts の DEFAULT_WEIGHT_KG と揃える）。
export const DEFAULT_CARDIO_WEIGHT_KG = 70

export function isCardioActivity(activityType: string): boolean {
  return Object.prototype.hasOwnProperty.call(CARDIO_RATES, activityType)
}

export function resolveCardioRates(activityType: string): CardioRates | null {
  return CARDIO_RATES[activityType] ?? null
}

export interface CardioAutoValues {
  distanceKm: number
  calories: number
}

// 距離(km)  = 想定ペース(km/h) × 時間(h)
// カロリー(kcal) = MET × 体重(kg) × 時間(h) × 1.05
// 対応外の種目名・時間が不正な場合は null（＝自動計算せず手入力のみ）。
export function calculateCardioAutoValues(
  activityType: string,
  durationMinutes: number,
  weightKg: number,
): CardioAutoValues | null {
  const rates = CARDIO_RATES[activityType]
  if (!rates || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return null
  }
  const hours = durationMinutes / 60
  return {
    distanceKm: Math.round(rates.paceKmh * hours * 100) / 100,
    calories: Math.round(rates.met * weightKg * hours * 1.05),
  }
}
