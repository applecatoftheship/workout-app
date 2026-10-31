import { describe, expect, it } from 'vitest'
import { isNetworkError } from '../networkErrors'

describe('isNetworkError', () => {
  it('オフライン時はエラー内容に関係なく true', () => {
    expect(isNetworkError(new Error('duplicate key value'), false)).toBe(true)
  })

  it('各ブラウザの fetch 失敗メッセージを検知する', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'), true)).toBe(true)
    expect(isNetworkError({ message: 'TypeError: Failed to fetch', code: '' }, true)).toBe(true)
    expect(isNetworkError(new TypeError('NetworkError when attempting to fetch resource.'), true)).toBe(true)
    expect(isNetworkError(new TypeError('Load failed'), true)).toBe(true)
    expect(isNetworkError(new TypeError('fetch failed'), true)).toBe(true)
  })

  it('Supabase Auth の AuthRetryableFetchError を検知する', () => {
    const error = Object.assign(new Error('{}'), { name: 'AuthRetryableFetchError' })
    expect(isNetworkError(error, true)).toBe(true)
  })

  it('サーバー応答ありのエラーは false', () => {
    expect(isNetworkError({ message: 'new row violates row-level security policy', code: '42501' }, true)).toBe(false)
    expect(isNetworkError(new Error('ログインが必要です'), true)).toBe(false)
    expect(isNetworkError(null, true)).toBe(false)
    expect(isNetworkError(undefined, true)).toBe(false)
  })
})
