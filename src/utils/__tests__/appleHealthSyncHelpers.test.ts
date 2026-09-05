import { describe, expect, it } from 'vitest'
import {
  APPLE_HEALTH_SYNC_SHORTCUT_NAME,
  buildAppleHealthSyncUrl,
  isIosDevice,
  parseHealthSyncQuery,
} from '../appleHealthSyncHelpers'

describe('buildAppleHealthSyncUrl', () => {
  it('name・x-success・x-errorをすべてencodeURIComponentしたx-callback-url形式で組み立てる', () => {
    const url = buildAppleHealthSyncUrl('https://workout-app-suke4.vercel.app')
    expect(url).toBe(
      'shortcuts://x-callback-url/run-shortcut?' +
        `name=${encodeURIComponent(APPLE_HEALTH_SYNC_SHORTCUT_NAME)}` +
        `&x-success=${encodeURIComponent('https://workout-app-suke4.vercel.app/settings?healthSync=success')}` +
        `&x-error=${encodeURIComponent('https://workout-app-suke4.vercel.app/settings?healthSync=error')}`,
    )
  })

  it('originをハードコードせず引数の値をそのまま使う（開発環境等でも動くように）', () => {
    const url = buildAppleHealthSyncUrl('http://localhost:5173')
    expect(url).toContain(encodeURIComponent('http://localhost:5173/settings?healthSync=success'))
    expect(url).toContain(encodeURIComponent('http://localhost:5173/settings?healthSync=error'))
  })
})

describe('parseHealthSyncQuery', () => {
  it('healthSync=successを検出する', () => {
    expect(parseHealthSyncQuery('?healthSync=success')).toEqual({ status: 'success', errorMessage: null })
  })

  it('healthSync=errorとerrorMessageを検出する', () => {
    expect(parseHealthSyncQuery('?healthSync=error&errorMessage=Shortcut%20not%20found')).toEqual({
      status: 'error',
      errorMessage: 'Shortcut not found',
    })
  })

  it('healthSync=errorのみ（errorMessage無し）でも検出しerrorMessageはnull', () => {
    expect(parseHealthSyncQuery('?healthSync=error')).toEqual({ status: 'error', errorMessage: null })
  })

  it('healthSyncパラメータが無い・無効な値の場合はnull', () => {
    expect(parseHealthSyncQuery('')).toBeNull()
    expect(parseHealthSyncQuery('?foo=bar')).toBeNull()
    expect(parseHealthSyncQuery('?healthSync=unknown')).toBeNull()
  })
})

describe('isIosDevice', () => {
  const IPHONE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36'
  const DESKTOP_MAC_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15'

  it('iPhone/iPad/iPodのUser-Agentはtrue', () => {
    expect(isIosDevice({ userAgent: IPHONE_UA })).toBe(true)
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' })).toBe(true)
    expect(isIosDevice({ userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 18_0 like Mac OS X)' })).toBe(true)
  })

  it('iPadOS 13以降（Macintoshを騙るUser-Agent）はplatform/maxTouchPointsから推定してtrue', () => {
    expect(isIosDevice({ userAgent: DESKTOP_MAC_UA, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
  })

  it('実際のMac（マウス操作、maxTouchPoints=0）はfalse', () => {
    expect(isIosDevice({ userAgent: DESKTOP_MAC_UA, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
    expect(isIosDevice({ userAgent: DESKTOP_MAC_UA, platform: 'MacIntel' })).toBe(false)
  })

  it('Android・その他の環境はfalse', () => {
    expect(isIosDevice({ userAgent: ANDROID_UA })).toBe(false)
    expect(isIosDevice({ userAgent: ANDROID_UA, platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false)
  })
})
