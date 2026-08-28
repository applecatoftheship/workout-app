// 設定画面拡張 Phase 4（ゲーミフィケーション、2026年8月28日）：バッジのマスタ定義。
// DB側にはマスタテーブルを作らず（user_badges.badge_idはtext自由入力）、
// この定数をアプリ側の唯一の定義元とする。新しいバッジを追加する場合は
// BadgeId・BADGE_DEFINITIONS・BADGE_ORDERの3箇所に追加する。
export type BadgeId = 'first_step' | 'streak_7' | 'streak_30' | 'sleep_master' | 'optimal_zone'

export interface BadgeDefinition {
  id: BadgeId
  name: string
  description: string
  icon: string
}

export const BADGE_DEFINITIONS: Record<BadgeId, BadgeDefinition> = {
  first_step: {
    id: 'first_step',
    name: 'はじめの一歩',
    description: 'いずれかのログを初めて記録した',
    icon: '🌱',
  },
  streak_7: {
    id: 'streak_7',
    name: '習慣の芽',
    description: '7日連続で記録を達成した',
    icon: '🔥',
  },
  streak_30: {
    id: 'streak_30',
    name: '鉄の意志',
    description: '30日連続で記録を達成した',
    icon: '💪',
  },
  sleep_master: {
    id: 'sleep_master',
    name: '快眠生活',
    description: '直近7日間の平均睡眠時間が7.5時間以上を達成した',
    icon: '😴',
  },
  optimal_zone: {
    id: 'optimal_zone',
    name: 'コンディショニングプロ',
    description: 'ACWRが「適正」範囲のまま7日間継続した',
    icon: '🎯',
  },
}

// バッジ図鑑UI（Task 4）でのグリッド表示順。
export const BADGE_ORDER: BadgeId[] = ['first_step', 'streak_7', 'streak_30', 'sleep_master', 'optimal_zone']
