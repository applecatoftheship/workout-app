// 設定画面拡張 Phase 2（2026年8月28日）：Apple Health連携ステータス表示
// （「最終同期: YYYY/MM/DD HH:mm」）用の汎用フォーマッタ。ブラウザのローカル
// タイムゾーンで表示する（api/sync-apple-health.ts側のJST基準日付判定
// （toJstDateKey）とは別の目的・独立した関数）。
export function formatSyncedAt(isoString: string): string {
  const date = new Date(isoString)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
