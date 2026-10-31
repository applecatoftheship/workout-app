import { isNetworkError } from '../utils/networkErrors'

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

/** 取得に成功したら控えを更新し、通信エラー時は控えを返す（控えが無ければ元のエラー）。 */
export async function withOfflineCache<T>(key: OfflineCacheKey, fetcher: () => Promise<T>): Promise<T> {
  try {
    const data = await fetcher()
    writeOfflineCache(key, data)
    return data
  } catch (error) {
    if (isNetworkError(error)) {
      const cached = readOfflineCache<T>(key)
      if (cached !== undefined) {
        return cached
      }
    }
    throw error
  }
}

/** 控えをすべて削除する（ログアウト時）。未送信の記録（アウトボックス）には触れない。 */
export function clearOfflineCache(): void {
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
