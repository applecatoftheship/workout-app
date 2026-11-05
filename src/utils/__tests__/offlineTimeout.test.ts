import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfflineWaitTimeoutError, waitWithOfflineLimit } from '../offlineTimeout'
import { isNetworkError } from '../networkErrors'

describe('waitWithOfflineLimit', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('時間内に返れば、その結果を返す', async () => {
    await expect(waitWithOfflineLimit(Promise.resolve(42), 1000)).resolves.toBe(42)
  })

  it('時間内の失敗は、元のエラーのまま返す', async () => {
    const error = new Error('boom')
    await expect(waitWithOfflineLimit(Promise.reject(error), 1000)).rejects.toBe(error)
  })

  it('時間を過ぎたら OfflineWaitTimeoutError で失敗し、通信エラーと判定される', async () => {
    vi.useFakeTimers()
    const pending = waitWithOfflineLimit(new Promise<number>(() => undefined), 1000)
    const assertion = expect(pending).rejects.toBeInstanceOf(OfflineWaitTimeoutError)
    await vi.advanceTimersByTimeAsync(1001)
    await assertion
    expect(isNetworkError(new OfflineWaitTimeoutError(), true)).toBe(true)
  })
})
