import { describe, expect, it, vi } from 'vitest'
import { importWithReload, LAZY_RELOAD_COOLDOWN_MS, shouldReloadAfterImportError, type LazyReloadDeps } from '../lazyReload'

function makeDeps(lastReloadAt: number | null, now = 100_000) {
  const deps: LazyReloadDeps = {
    readLastReloadAt: vi.fn(() => lastReloadAt),
    writeLastReloadAt: vi.fn(),
    reload: vi.fn(),
    now: () => now,
  }
  return deps
}

describe('shouldReloadAfterImportError', () => {
  it('まだ自動再読み込みしていなければ再読み込みする', () => {
    expect(shouldReloadAfterImportError(null, 1000)).toBe(true)
  })
  it('直前の自動再読み込みから一定時間内なら再読み込みしない（無限ループ防止）', () => {
    expect(shouldReloadAfterImportError(1000, 1000 + LAZY_RELOAD_COOLDOWN_MS - 1)).toBe(false)
  })
  it('一定時間を過ぎていれば再び再読み込みしてよい（次回のデプロイ時）', () => {
    expect(shouldReloadAfterImportError(1000, 1000 + LAZY_RELOAD_COOLDOWN_MS)).toBe(true)
  })
  it('壊れた値は未実施扱い', () => {
    expect(shouldReloadAfterImportError(Number.NaN, 1000)).toBe(true)
  })
})

describe('importWithReload', () => {
  it('読み込みに成功したらそのまま返し、再読み込みしない', async () => {
    const deps = makeDeps(null)
    await expect(importWithReload(() => Promise.resolve('ok'), deps)).resolves.toBe('ok')
    expect(deps.reload).not.toHaveBeenCalled()
  })

  it('初回の失敗では時刻を記録して1回だけ再読み込みする', async () => {
    const deps = makeDeps(null, 5000)
    const pending = importWithReload(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')), deps)
    let settled = false
    pending.then(() => { settled = true }, () => { settled = true })
    await new Promise((r) => setTimeout(r, 0))
    expect(deps.writeLastReloadAt).toHaveBeenCalledWith(5000)
    expect(deps.reload).toHaveBeenCalledTimes(1)
    expect(settled).toBe(false)
  })

  it('再読み込み直後に再び失敗したらエラーを投げ、再読み込みしない', async () => {
    const deps = makeDeps(5000, 6000)
    const error = new TypeError('Failed to fetch dynamically imported module')
    await expect(importWithReload(() => Promise.reject(error), deps)).rejects.toBe(error)
    expect(deps.reload).not.toHaveBeenCalled()
  })
})
