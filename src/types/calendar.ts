// カレンダー実績アイコン機能（日付ベース簡易マッチング方式、2026年8月20日）
// 予定（training_schedules）と実績（training_logs等）を日付単位で
// 突き合わせ、達成状況をカレンダーセルに表示するための型。

export type CellActivityStatus = 'planned' | 'completed_planned' | 'completed_unplanned' | 'missed'

// Apple Health連携（2026年8月27日）：'appleWorkout'はworkoutsテーブル
// （Apple Watch自動記録）由来のアイコンを表す。既存の'workout'（training_schedules
// 起点の予定・実績アイコン）とは意味が異なるため、混同を避けるため別の値とした。
// スポーツ記録機能（Tier 4-2、2026年9月12日）：'sport'はsport_logs
// （汎用スポーツ記録）由来のアイコンを表す（🏆汎用、種目ごとの出し分けはしない）。
// サッカー機能統合（2026年9月13日）：soccer_logs専用の'soccer'は廃止し、
// サッカー・フットサルは'sport'に統合した。
export type ActivityType = 'workout' | 'appleWorkout' | 'sport'

export interface CalendarCellItem {
  type: ActivityType
  icon: string
  status: CellActivityStatus
}
