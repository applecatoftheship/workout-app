// オフライン記録対応（2026年10月31日）：
// 「通信できなかった（＝オフライン扱いで端末に保存すべき）」エラーかどうかを判定する。
// サーバーが応答したうえでのエラー（RLS違反・制約違反等）は対象外（端末に保存しても
// 再送で必ず同じ失敗をするため、従来どおりその場でエラー表示する）。
//
// 判定材料：
// - ブラウザがオフライン（navigator.onLine === false）
// - Supabase Auth の AuthRetryableFetchError（name で判定。node 環境のテストから
//   @supabase/supabase-js を読み込まずに済むよう、クラスではなく名前で見る）
// - fetch 失敗時のメッセージ（Chrome: "Failed to fetch"、Firefox: "NetworkError ...",
//   Safari: "Load failed"、Node/undici: "fetch failed"）。PostgREST クライアントは
//   fetch 失敗を `{ message: 'TypeError: Failed to fetch' }` のようなエラーで返す
const NETWORK_ERROR_MESSAGE_PATTERN = /Failed to fetch|NetworkError|Load failed|fetch failed|Network request failed/i

export function isNetworkError(error: unknown, isOnline: boolean = getNavigatorOnline()): boolean {
  if (!isOnline) {
    return true
  }
  if (!error || typeof error !== 'object') {
    return typeof error === 'string' && NETWORK_ERROR_MESSAGE_PATTERN.test(error)
  }
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (name === 'AuthRetryableFetchError') {
    return true
  }
  return typeof message === 'string' && NETWORK_ERROR_MESSAGE_PATTERN.test(message)
}

/** ブラウザがオンラインかどうか（navigator が無い環境ではオンライン扱い）。 */
export function getNavigatorOnline(): boolean {
  return typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean' ? true : navigator.onLine
}
