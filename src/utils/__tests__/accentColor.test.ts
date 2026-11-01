import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ACCENT_COLOR_IDS,
  ACCENT_COLOR_LABELS,
  DEFAULT_ACCENT_COLOR,
  getAccentColorTokens,
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

// WCAG のコントラスト比（相対輝度から計算）。
function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
      c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    )
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('アクセント色の地に載せる文字色（onAccent）', () => {
  // 2026年11月2日：黒固定だとライトのオーロラ（3.12）・ブルー（4.15）で読みにくかったため、
  // アクセントごとに黒・白のうちコントラストの高い方を持たせた。
  for (const id of ACCENT_COLOR_IDS) {
    for (const theme of ['light', 'dark'] as const) {
      it(`${id}（${theme}）は黒・白のうちコントラストの高い方を使う`, () => {
        const { accent, onAccent } = getAccentColorTokens(id, theme)
        const black = contrastRatio('#111113', accent)
        const white = contrastRatio('#FFFFFF', accent)
        expect(contrastRatio(onAccent, accent)).toBeCloseTo(Math.max(black, white), 5)
      })
    }
  }
})
