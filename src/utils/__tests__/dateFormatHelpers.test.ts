import { describe, expect, it } from 'vitest'
import { formatSyncedAt } from '../dateFormatHelpers'

describe('formatSyncedAt', () => {
  it('YYYY/MM/DD HH:mm形式で返す', () => {
    const iso = new Date(2026, 7, 28, 9, 5).toISOString() // 2026-08-28 09:05 ローカル時刻
    expect(formatSyncedAt(iso)).toBe('2026/08/28 09:05')
  })

  it('月日時分が1桁の値は0埋めする', () => {
    const iso = new Date(2026, 0, 1, 0, 0).toISOString() // 2026-01-01 00:00 ローカル時刻
    expect(formatSyncedAt(iso)).toBe('2026/01/01 00:00')
  })

  it('時分が2桁の値はそのまま表示する', () => {
    const iso = new Date(2026, 11, 31, 23, 59).toISOString() // 2026-12-31 23:59 ローカル時刻
    expect(formatSyncedAt(iso)).toBe('2026/12/31 23:59')
  })
})
