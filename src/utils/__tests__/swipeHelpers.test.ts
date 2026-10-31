import { describe, expect, it } from 'vitest'
import { clampSwipeOffset, resolveDirectionLock, shouldOpenOnRelease } from '../swipeHelpers'

describe('resolveDirectionLock', () => {
  it('しきい値未満の移動は未確定（null）', () => {
    expect(resolveDirectionLock(3, 4, 8)).toBeNull()
    expect(resolveDirectionLock(-7, 7, 8)).toBeNull()
  })

  it('横移動が優勢なら horizontal（左右どちらでも）', () => {
    expect(resolveDirectionLock(-20, 5, 8)).toBe('horizontal')
    expect(resolveDirectionLock(12, -3, 8)).toBe('horizontal')
  })

  it('縦移動が優勢、または同値なら vertical（スクロールに委ねる）', () => {
    expect(resolveDirectionLock(4, 30, 8)).toBe('vertical')
    expect(resolveDirectionLock(10, -10, 8)).toBe('vertical')
  })
})

describe('clampSwipeOffset', () => {
  it('閉じた状態から左へドラッグした分だけ負方向に動く', () => {
    expect(clampSwipeOffset(0, -40, 120)).toBe(-40)
  })

  it('右方向（0より大きい側）にははみ出さない', () => {
    expect(clampSwipeOffset(0, 50, 120)).toBe(0)
    expect(clampSwipeOffset(-120, 200, 120)).toBe(0)
  })

  it('アクション幅を超えて引き出さない（フルスワイプなし）', () => {
    expect(clampSwipeOffset(0, -500, 120)).toBe(-120)
  })

  it('開いた状態を起点に右へ戻すドラッグができる', () => {
    expect(clampSwipeOffset(-120, 30, 120)).toBe(-90)
  })

  it('アクション幅が0以下なら常に0', () => {
    expect(clampSwipeOffset(0, -40, 0)).toBe(0)
    expect(clampSwipeOffset(0, -40, -10)).toBe(0)
  })
})

describe('shouldOpenOnRelease', () => {
  it('アクション幅の40%以上開いていれば開く', () => {
    expect(shouldOpenOnRelease(-48, 120)).toBe(true)
    expect(shouldOpenOnRelease(-120, 120)).toBe(true)
  })

  it('40%未満なら閉じる', () => {
    expect(shouldOpenOnRelease(-47, 120)).toBe(false)
    expect(shouldOpenOnRelease(0, 120)).toBe(false)
  })

  it('アクション幅が0なら開かない', () => {
    expect(shouldOpenOnRelease(-10, 0)).toBe(false)
  })
})
