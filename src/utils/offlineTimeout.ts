// オフラインで開けない不具合の対応（2026年11月5日）：
// 端末がオフラインと判定されているときに、通信の結果を待つ上限。
// アクセストークンの期限切れ後にオフラインで起動すると、supabase-js はトークン更新を
// 最大約30秒再試行し、その間すべての通信が待たされる。navigator.onLine は誤って
// false になることもある（MDN）ため、通信そのものは止めずに続け、画面の表示だけをこの時間で
// 先に進める（一覧は端末の控えを出し、遅れて取得できたら反映する。offlineCache.ts・App.tsx）。
export const OFFLINE_WAIT_LIMIT_MS = 3000

export class OfflineWaitTimeoutError extends TypeError {
  constructor() {
    // 「Failed to fetch」を含めて、isNetworkError が通信エラーと判定できるようにする
    super('Failed to fetch (offline: no response within the wait limit)')
    this.name = 'OfflineWaitTimeoutError'
  }
}

/** promise を待つが、limitMs を過ぎたら OfflineWaitTimeoutError で失敗させる（元の処理は止めない）。 */
export function waitWithOfflineLimit<T>(promise: Promise<T>, limitMs: number = OFFLINE_WAIT_LIMIT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timerId = setTimeout(() => reject(new OfflineWaitTimeoutError()), limitMs)
    promise.then(
      (value) => {
        clearTimeout(timerId)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timerId)
        reject(error)
      },
    )
  })
}
