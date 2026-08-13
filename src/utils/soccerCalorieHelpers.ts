// MET値・自動計算係数はCompendium of Physical Activities（国際的な運動強度基準）の実測値に準拠。
// フットサルは直接の文献値がないため、練習とサッカーの中間値として推定した参考値。
export const MET_DEFAULT = 6.0 // その他（自由入力）時のデフォルト値

export const ACTIVITY_TYPE_PRESETS = ['練習', 'フットサル', 'サッカー']

export interface AutoFillRates {
  distancePerMinuteKm: number
  sprintsPerMinute: number
  maxSpeedKmh: number | null // null = 最高速度の概念なし（非表示）
  met: number
}

export const AUTO_FILL_RATES: Record<string, AutoFillRates> = {
  サッカー: {
    distancePerMinuteKm: 5.5 / 90, // アマチュア想定 90分で約5.5km
    sprintsPerMinute: 20 / 90, // アマチュア想定 90分で約20回
    maxSpeedKmh: 26, // 固定値（アマチュア想定）
    met: 9.5, // Compendium: soccer, competitive
  },
  フットサル: {
    distancePerMinuteKm: 4.5 / 40, // アマチュア想定 40分で約4.5km
    sprintsPerMinute: 30 / 40, // アマチュア想定 40分で約30回
    maxSpeedKmh: 24, // 固定値（コートが狭いため想定やや低め）
    met: 8.0, // Compendiumに直接記載なし。練習とサッカーの中間値として推定
  },
}

export const TRAINING_MENU_RATES: Record<string, AutoFillRates> = {
  ウォーキング: {
    distancePerMinuteKm: 5 / 60, // 時速5km換算
    sprintsPerMinute: 0,
    maxSpeedKmh: null,
    met: 3.5,
  },
  ランニング: {
    distancePerMinuteKm: 8 / 60, // 時速8km換算
    sprintsPerMinute: 0,
    maxSpeedKmh: null,
    met: 8.5,
  },
}

export const TRAINING_MENUS = Object.keys(TRAINING_MENU_RATES)

export function calculateAutoFillValues(durationMinutes: number, rates: AutoFillRates) {
  return {
    distanceKm: Math.round(rates.distancePerMinuteKm * durationMinutes * 10) / 10,
    sprintCount: Math.round(rates.sprintsPerMinute * durationMinutes),
    maxSpeedKmh: rates.maxSpeedKmh,
  }
}

export function resolveAutoFillRates(activityType: string, trainingMenu: string | null): AutoFillRates | null {
  if (activityType === '練習') {
    return trainingMenu ? TRAINING_MENU_RATES[trainingMenu] ?? null : null
  }
  return AUTO_FILL_RATES[activityType] ?? null
}

export function resolveMet(activityType: string, trainingMenu: string | null): number | null {
  if (activityType === '練習') {
    return trainingMenu ? TRAINING_MENU_RATES[trainingMenu]?.met ?? null : null
  }
  return AUTO_FILL_RATES[activityType]?.met ?? MET_DEFAULT
}

export function estimateCaloriesBurned(met: number, durationMinutes: number, weightKg: number): number {
  const hours = durationMinutes / 60
  return Math.round(met * weightKg * hours * 1.05)
}
