import { describe, expect, it, vi } from 'vitest'
import { retryOnFailure } from '../retryHelpers'

type Result = { status: 'ok'; value: string } | { status: 'error'; reason: string }

describe('retryOnFailure', () => {
  it('1回目で成功すれば1回しか呼ばない', async () => {
    const attempt = vi.fn<(attemptNumber: number) => Promise<Result>>().mockResolvedValue({ status: 'ok', value: 'a' })
    const onRetry = vi.fn()

    const result = await retryOnFailure(attempt, { maxAttempts: 2, onRetry })

    expect(result).toEqual({ status: 'ok', value: 'a' })
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('1回目が失敗し2回目で成功すれば ok を返し、onRetry が1回目失敗の内容で呼ばれる', async () => {
    const attempt = vi
      .fn<(attemptNumber: number) => Promise<Result>>()
      .mockResolvedValueOnce({ status: 'error', reason: 'timeout' })
      .mockResolvedValueOnce({ status: 'ok', value: 'b' })
    const onRetry = vi.fn()

    const result = await retryOnFailure(attempt, { maxAttempts: 2, onRetry })

    expect(result).toEqual({ status: 'ok', value: 'b' })
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(attempt).toHaveBeenNthCalledWith(1, 1)
    expect(attempt).toHaveBeenNthCalledWith(2, 2)
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith(1, { status: 'error', reason: 'timeout' })
  })

  it('maxAttempts 回すべて失敗すれば最後の失敗結果を返す（例外にしない）', async () => {
    const attempt = vi
      .fn<(attemptNumber: number) => Promise<Result>>()
      .mockResolvedValueOnce({ status: 'error', reason: '1回目失敗' })
      .mockResolvedValueOnce({ status: 'error', reason: '2回目失敗' })
    const onRetry = vi.fn()

    const result = await retryOnFailure(attempt, { maxAttempts: 2, onRetry })

    expect(result).toEqual({ status: 'error', reason: '2回目失敗' })
    expect(attempt).toHaveBeenCalledTimes(2)
    // 最終試行（2回目）の失敗では onRetry は呼ばれない（リトライしないため）。
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith(1, { status: 'error', reason: '1回目失敗' })
  })

  it('maxAttempts:1 なら失敗しても1回しか呼ばず onRetry も呼ばれない', async () => {
    const attempt = vi.fn<(attemptNumber: number) => Promise<Result>>().mockResolvedValue({ status: 'error', reason: '失敗' })
    const onRetry = vi.fn()

    const result = await retryOnFailure(attempt, { maxAttempts: 1, onRetry })

    expect(result).toEqual({ status: 'error', reason: '失敗' })
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('maxAttempts に0や負数を渡しても1回として扱う', async () => {
    const attempt = vi.fn<(attemptNumber: number) => Promise<Result>>().mockResolvedValue({ status: 'ok', value: 'x' })

    await retryOnFailure(attempt, { maxAttempts: 0 })
    await retryOnFailure(attempt, { maxAttempts: -3 })

    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('onRetry を省略しても動作する', async () => {
    const attempt = vi
      .fn<(attemptNumber: number) => Promise<Result>>()
      .mockResolvedValueOnce({ status: 'error', reason: 'x' })
      .mockResolvedValueOnce({ status: 'ok', value: 'y' })

    const result = await retryOnFailure(attempt, { maxAttempts: 2 })

    expect(result).toEqual({ status: 'ok', value: 'y' })
  })
})
