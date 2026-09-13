// データエクスポート機能（設定画面「データをエクスポート」ボタン、2026年9月13日新設）：
// ユーザー自身の全データをJSON単一ファイルとしてダウンロードする機能の純粋ロジック。
// 実際のSupabaseへの読み取り（src/api/dataExport.ts）とDOM操作（Blob生成・
// ダウンロードトリガー、Settings.tsx側）は本ファイルには含めない。

// 【対象テーブル一覧の選定について】リポジトリ全体を横断確認し、user_id列を持つ
// テーブルのうち以下を対象とした：
//   - 元の指示リスト（16テーブル）：training_logs・training_log_exercises・
//     training_sets・meal_logs・meal_log_food_items・dishes・dish_food_items・
//     food_items・daily_conditions・training_schedules・sport_logs・workouts・
//     health_metrics・user_badges・goals・profiles・exercises
//   - 追加で発見した2テーブル：training_templates・training_template_exercises
//     （テンプレート管理UIで作成するuser_idスコープのユーザーデータのため、
//     元のリストへの記載漏れと判断し追加。ユーザー確認済み）。
//   - soccer_logs：2026年9月13日のサッカー機能統合でアプリからの参照は廃止したが、
//     sport_logsへ移行済みの実データ（user_idスコープ）がテーブルに残っているため、
//     「全データエクスポート」の趣旨に沿い対象に追加（ユーザー確認済み）。
// 【対象外としたテーブルとその理由】
//   - meal_sizes：user_id列はnullable（food_items・exercisesと同じ「共有カタログ」
//     パターン）だが、実際にユーザーが新規作成する手段（API・UI）が存在せず、
//     全行が事実上プリセットのため対象外とした（RLSポリシーも"authenticated only"
//     で所有権の概念を持たない、他の12テーブルの"user can manage own rows"とは
//     異なるパターン）。
//   - notifications・push_subscriptions：指示により明示的に対象外。
//   - avatars：Supabase Storageのバケット（DBテーブルではない）のため対象外。
//     プロフィール画像自体のエクスポートは今回のスコープ外（判断理由）。
// exercises・food_itemsはis_preset=true/user_id IS NULLがプリセット行のため、
// user_id=自分のIDでの絞り込みだけで自動的にプリセットが除外される
// （is_presetの追加フィルタは不要）。
export const EXPORT_TABLE_NAMES = [
  'training_logs',
  'training_log_exercises',
  'training_sets',
  'training_templates',
  'training_template_exercises',
  'training_schedules',
  'daily_conditions',
  'meal_logs',
  'meal_log_food_items',
  'dishes',
  'dish_food_items',
  'goals',
  'soccer_logs',
  'exercises',
  'food_items',
  'sport_logs',
  'workouts',
  'health_metrics',
  'user_badges',
  'profiles',
] as const

export type ExportTableName = (typeof EXPORT_TABLE_NAMES)[number]

export type ExportPayload = {
  exported_at: string
  user_id: string
  tables: Record<string, unknown[]>
}

// テーブルごとに取得済みの生データ（select('*')の結果をそのまま）から、
// エクスポートファイル全体のJSON構造を組み立てる。テーブル側のデータ加工・
// アプリ側の型変換は一切行わない（指示通り「生の行データをそのまま」）。
export function buildExportPayload(userId: string, tables: Record<string, unknown[]>, now: Date = new Date()): ExportPayload {
  return {
    exported_at: now.toISOString(),
    user_id: userId,
    tables,
  }
}

// ダウンロードファイル名（JST基準の実行日）を組み立てる。
// acwrHelpers.tsのtoJstDateKeyFromIso・api/generate-daily-comments.tsの
// yesterdayInJstと同じIntl.DateTimeFormatベースの変換方式を踏襲。
export function buildExportFilename(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return `workout-app-export-${year}-${month}-${day}.json`
}
