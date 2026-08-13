// MET値はCompendium of Physical Activities（国際的な運動強度基準）の実測値に準拠。
// フットサルのみ直接の文献値がないため、練習とサッカーの中間値として推定した参考値。
export const MET_VALUES: Record<string, number> = {
  練習: 7.0, // Compendium: soccer, casual, general
  フットサル: 8.0, // Compendiumに直接記載なし。練習とサッカーの中間値として推定
  サッカー: 9.5, // Compendium: soccer, competitive
}

export const MET_DEFAULT = 6.0 // その他（自由入力）時のデフォルト値

export function estimateCaloriesBurned(activityType: string, durationMinutes: number, weightKg: number): number {
  const met = MET_VALUES[activityType] ?? MET_DEFAULT
  const hours = durationMinutes / 60
  return Math.round(met * weightKg * hours * 1.05)
}
