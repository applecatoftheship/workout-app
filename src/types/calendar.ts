// カレンダー実績アイコン機能（日付ベース簡易マッチング方式、2026年8月20日）
// 予定（training_schedules）と実績（training_logs・soccer_logs）を日付単位で
// 突き合わせ、達成状況をカレンダーセルに表示するための型。

export type CellActivityStatus = 'planned' | 'completed_planned' | 'completed_unplanned' | 'missed'

export type ActivityType = 'workout' | 'soccer'

export interface CalendarCellItem {
  type: ActivityType
  icon: string
  status: CellActivityStatus
}
