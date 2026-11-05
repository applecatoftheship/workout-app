import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearOfflineCache, readOfflineCache, withOfflineCache } from '../offlineCache'
import { OFFLINE_WAIT_LIMIT_MS } from '../../utils/offlineTimeout'

// node 環境のテストなので、localStorage と navigator.onLine を差し替えて確かめる
function installMemoryStorage(): Map<string, string> {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size
    },
  })
  return data
}

function setOnline(onLine: boolean): void {
  vi.stubGlobal('navigator', { onLine })
}

describe('withOfflineCache', () => {
  beforeEach(() => {
    installMemoryStorage()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('オンラインで取得できたら控えを更新して結果を返す', async () => {
    setOnline(true)
    const result = await withOfflineCache('exercises', async () => ['a'])
    expect(result).toEqual(['a'])
    expect(readOfflineCache('exercises')).toEqual(['a'])
  })

  it('オフラインで控えがあり、取得が待ち時間内に返らなければ控えを返す', async () => {
    setOnline(true)
    await withOfflineCache('exercises', async () => ['cached'])
    setOnline(false)
    vi.useFakeTimers()
    try {
      const pending = withOfflineCache('exercises', () => new Promise<string[]>(() => undefined))
      await vi.advanceTimersByTimeAsync(OFFLINE_WAIT_LIMIT_MS + 1)
      await expect(pending).resolves.toEqual(['cached'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('オフライン判定でも、取得が待ち時間内に返れば最新を使い控えも更新する（判定の誤り対策）', async () => {
    setOnline(true)
    await withOfflineCache('exercises', async () => ['cached'])
    setOnline(false)
    const result = await withOfflineCache('exercises', async () => ['fresh'])
    expect(result).toEqual(['fresh'])
    expect(readOfflineCache('exercises')).toEqual(['fresh'])
  })

  it('オフラインで控えが無ければ、取得を試みて元のエラーを返す', async () => {
    setOnline(false)
    const fetcher = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(withOfflineCache('mealLogs', fetcher)).rejects.toThrow('Failed to fetch')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('オンラインで通信エラーになったら控えを返す（従来どおり）', async () => {
    setOnline(true)
    await withOfflineCache('trainingLogs', async () => [1])
    const result = await withOfflineCache('trainingLogs', async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(result).toEqual([1])
  })

  it('ログアウト（控えの削除）の後に遅れて成功した取得は、控えに書き戻さない', async () => {
    setOnline(true)
    let finish: (value: string[]) => void = () => undefined
    const pending = withOfflineCache('mealLogs', () => new Promise<string[]>((resolve) => { finish = resolve }))
    clearOfflineCache()
    // 取得は1つ後の非同期処理で始まるので、始まってから終わらせる
    await Promise.resolve()
    finish(['前のアカウント'])
    await expect(pending).resolves.toEqual(['前のアカウント'])
    expect(readOfflineCache('mealLogs')).toBeUndefined()
  })

  it('先に始めた取得が遅れて終わっても、後から始めた取得が書いた控えを上書きしない', async () => {
    setOnline(true)
    let finishOld: (value: string[]) => void = () => undefined
    const oldRequest = withOfflineCache('trainingLogs', () => new Promise<string[]>((resolve) => { finishOld = resolve }))
    await withOfflineCache('trainingLogs', async () => ['新しい一覧'])
    finishOld(['古い一覧'])
    await oldRequest
    expect(readOfflineCache('trainingLogs')).toEqual(['新しい一覧'])
  })

  it('オフラインで待ち時間を超えて控えを返した後、取得が遅れて成功したら onLateResult で知らせる', async () => {
    setOnline(true)
    await withOfflineCache('mealLogs', async () => ['控え'])
    setOnline(false)
    vi.useFakeTimers()
    try {
      let finish: (value: string[]) => void = () => undefined
      const onLateResult = vi.fn()
      const pending = withOfflineCache(
        'mealLogs',
        () => new Promise<string[]>((resolve) => { finish = resolve }),
        onLateResult,
      )
      await vi.advanceTimersByTimeAsync(OFFLINE_WAIT_LIMIT_MS + 1)
      await expect(pending).resolves.toEqual(['控え'])
      expect(onLateResult).not.toHaveBeenCalled()
      finish(['最新'])
      await vi.advanceTimersByTimeAsync(0)
      expect(onLateResult).toHaveBeenCalledWith(['最新'])
      expect(readOfflineCache('mealLogs')).toEqual(['最新'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('待ち時間内に返った場合は onLateResult を呼ばない', async () => {
    setOnline(false)
    const onLateResult = vi.fn()
    await withOfflineCache('mealLogs', async () => ['最新'], onLateResult)
    expect(onLateResult).not.toHaveBeenCalled()
  })
})
