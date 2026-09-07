import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ACCENT_COLOR_IDS,
  ACCENT_COLOR_LABELS,
  DEFAULT_ACCENT_COLOR,
  readStoredAccentColor,
} from '../accentColor'

// localStorage は vitest の node 環境には無いため、テスト用に最小限のスタブを差し込む。
function stubLocalStorage(): { get: () => string | null; set: (value: string) => void; clear: () => void } {
  let value: string | null = null
  const store = {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next
    },
    removeItem: () => {
      value = null
    },
  }
  ;(globalThis as { localStorage?: unknown }).localStorage = store
  return {
    get: () => value,
    set: (next: string) => {
      value = next
    },
    clear: () => {
      value = null
    },
  }
}

describe('アクセントカラープリセットの整合性', () => {
  it('ACCENT_COLOR_IDS のすべてに日本語ラベルが定義されている', () => {
    for (const id of ACCENT_COLOR_IDS) {
      expect(ACCENT_COLOR_LABELS[id]).toBeTruthy()
    }
  })

  it('既存プリセットと AETHER-FLOW（aetherflow）が選択肢に含まれる', () => {
    expect(ACCENT_COLOR_IDS).toEqual(expect.arrayContaining(['artdeco', 'aetherflow', 'orange', 'teal', 'blue', 'purple']))
    expect(DEFAULT_ACCENT_COLOR).toBe('artdeco')
  })
})

describe('readStoredAccentColor', () => {
  let ls: ReturnType<typeof stubLocalStorage>

  beforeEach(() => {
    ls = stubLocalStorage()
  })

  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  it('保存済みの有効なプリセット名を返す', () => {
    ls.set('aetherflow')
    expect(readStoredAccentColor()).toBe('aetherflow')
  })

  it('未保存なら undefined', () => {
    ls.clear()
    expect(readStoredAccentColor()).toBeUndefined()
  })

  it('未知の値が保存されていても undefined（不正値は無視）', () => {
    ls.set('rainbow')
    expect(readStoredAccentColor()).toBeUndefined()
  })
})
