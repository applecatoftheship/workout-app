import { getNavigatorOnline, isNetworkError } from '../utils/networkErrors'
import { OfflineWaitTimeoutError, waitWithOfflineLimit } from '../utils/offlineTimeout'

// オフライン記録対応（2026年10月31日）：オフラインでも記録フォームを使えるよう、
// 最後にオンラインで取得できたデータを端末（localStorage）に控えておき、
// 通信できないときだけそれを返す。
//
// - 通信に成功したら毎回上書き保存する（常に「最後に取得できた内容」）
// - 通信エラー以外の失敗（権限エラー等）では控えを使わず、従来どおりエラーにする
// - 容量不足などで控えを保存できなくても、本来の取得結果はそのまま返す
// - ログアウト時は clearOfflineCache() で消す（別アカウントに前の人のデータを見せないため）

const CACHE_PREFIX = 'workout-app:cache:v1:'

export type OfflineCacheKey = 'exercises' | 'foodItems' | 'dishesWithDetails' | 'mealSizes' | 'trainingLogs' | 'mealLogs'

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function readOfflineCache<T>(key: OfflineCacheKey): T | undefined {
  const storage = getStorage()
  if (!storage) {
    return undefined
  }
  try {
    const raw = storage.getItem(CACHE_PREFIX + key)
    return raw === null ? undefined : (JSON.parse(raw) as T)
  } catch {
    return undefined
  }
}

function writeOfflineCache(key: OfflineCacheKey, value: unknown): void {
  const storage = getStorage()
  if (!storage) {
    return
  }
  try {
    storage.setItem(CACHE_PREFIX + key, JSON.stringify(value))
  } catch {
    // 容量不足等。控えが古いまま（または無いまま）になるだけで、取得結果には影響しない
  }
}

// 控えの世代と、取得の開始順（2026年11月5日）：オフライン判定時は待ち時間を超えると控えに
// 切り替えるが、元の取得は動き続けて遅れて成功しうる。そのとき、ログアウト（clearOfflineCache）
// の後に前のアカウントのデータを書き戻したり、後から始めた取得が書いた新しい控えを古い結果で
// 上書きしたりしないよう、世代が変わっていない・自分より後に始めた取得がまだ書いていない
// ときだけ書く。
let cacheGeneration = 0
let requestCounter = 0
const lastWrittenRequest = new Map<OfflineCacheKey, number>()

/** 取得に成功したら控えを更新し、通信エラー時は控えを返す（控えが無ければ元のエラー）。 */
export async function withOfflineCache<T>(
  key: OfflineCacheKey,
  fetcher: () => Promise<T>,
  // 待ち時間を超えて控え（またはエラー）を返した後に、元の取得が遅れて成功したときに呼ぶ
  // （画面に最新の結果を反映するため）。ログアウト後・より新しい取得の後は呼ばない
  onLateResult?: (data: T) => void,
): Promise<T> {
  // オフラインで開けない不具合の対応（2026年11月5日）：端末がオフラインと判定されているときは、
  // 取得は試すが、結果を一定時間（OFFLINE_WAIT_LIMIT_MS）までしか待たない。アクセストークンの
  // 期限切れ後にオフラインで起動すると、supabase-js はトークン更新を最大約30秒再試行し、
  // その間すべての取得が待たされるため。判定が誤っていて実際は通信できる場合は、
  // 時間内に返れば最新を使い、遅れて返っても控えは更新する。
  const generationAtStart = cacheGeneration
  requestCounter += 1
  const requestNumber = requestCounter
  let gaveUpWaiting = false
  const request = Promise.resolve().then(fetcher).then((data) => {
    if (generationAtStart === cacheGeneration && requestNumber > (lastWrittenRequest.get(key) ?? 0)) {
      lastWrittenRequest.set(key, requestNumber)
      writeOfflineCache(key, data)
      if (gaveUpWaiting && onLateResult) {
        onLateResult(data)
      }
    }
    return data
  })
  try {
    return getNavigatorOnline() ? await request : await waitWithOfflineLimit(request)
  } catch (error) {
    // 待ち時間を超えた場合も、元の取得の失敗が「未処理の拒否」にならないようにする
    request.catch(() => undefined)
    if (error instanceof OfflineWaitTimeoutError) {
      gaveUpWaiting = true
    }
    if (isNetworkError(error)) {
      const cached = readOfflineCache<T>(key)
      if (cached !== undefined) {
        return cached
      }
    }
    throw error
  }
}

/**
 * 控えの中身を書き換える（オフラインで編集・削除した記録を、次にオフラインで開いたときにも
 * 反映して見せるため。2026年11月6日）。控えが無ければ何もしない。
 */
export function updateOfflineCache<T>(key: OfflineCacheKey, updater: (current: T) => T): void {
  const current = readOfflineCache<T>(key)
  if (current === undefined) {
    return
  }
  writeOfflineCache(key, updater(current))
}

/** 控えをすべて削除する（ログアウト時）。未送信の記録（アウトボックス）には触れない。 */
export function clearOfflineCache(): void {
  cacheGeneration += 1
  lastWrittenRequest.clear()
  const storage = getStorage()
  if (!storage) {
    return
  }
  try {
    const keys: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key && key.startsWith(CACHE_PREFIX)) {
        keys.push(key)
      }
    }
    keys.forEach((key) => storage.removeItem(key))
  } catch {
    // 何もしない
  }
}
