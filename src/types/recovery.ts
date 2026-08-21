// リカバリー窓機能（スプリント4 Phase 2、2026年8月21日）：運動終了後の栄養摂取
// タイミングを追跡する機能の型定義。Phase 1で保存したtraining_logs.end_time /
// soccer_logs.end_time / meal_logs.meal_timeを元に判定する（src/utils/recoveryHelpers.ts）。

export interface RecoveryWindowConfig {
  windowMinutes: number
  targetProteinGrams: number
  targetCarbGrams: number
}

// 'no_session'（該当セッションなし）は、calculateDailyRecoveryResults側では
// 「その日のRecoveryResult配列が空」という形で表現し、この値自体を持つ
// RecoveryResultは生成しない（sessionType/sessionEndTime等の他フィールドが
// 意味を持たなくなるため）。呼び出し側（Dashboard等）は配列が空の場合に
// no_session相当（カード非表示）として扱う。型としては将来の用途に備えて残す。
export type RecoveryStatus = 'active' | 'completed_full' | 'completed_protein_only' | 'missed' | 'no_session'

export interface RecoveryResult {
  sessionType: 'workout' | 'soccer'
  sessionDate: string
  sessionEndTime: string // timestamptz（ISO 8601）
  windowEndTime: string // sessionEndTime + windowMinutes（ISO 8601）
  status: RecoveryStatus
  consumedProtein: number
  consumedCarbs: number
  matchedMealIds: string[]
}
