import { describe, expect, it } from 'vitest'
import { EXPORT_TABLE_NAMES, buildExportFilename, buildExportPayload } from '../dataExportHelpers'

describe('EXPORT_TABLE_NAMES', () => {
  it('リポジトリ横断確認で確定した20テーブルを含む（元の指示16件＋発見した3件のうちtraining_templates系2件＋soccer_logs）', () => {
    expect(EXPORT_TABLE_NAMES).toHaveLength(20)
  })

  it('重複が無い', () => {
    expect(new Set(EXPORT_TABLE_NAMES).size).toBe(EXPORT_TABLE_NAMES.length)
  })

  it('元の指示リストにあった16テーブルをすべて含む', () => {
    const originalList = [
      'training_logs',
      'training_log_exercises',
      'training_sets',
      'meal_logs',
      'meal_log_food_items',
      'dishes',
      'dish_food_items',
      'food_items',
      'daily_conditions',
      'training_schedules',
      'sport_logs',
      'workouts',
      'health_metrics',
      'user_badges',
      'goals',
      'exercises',
    ]
    for (const table of originalList) {
      expect(EXPORT_TABLE_NAMES).toContain(table)
    }
    // profilesは指示の対象テーブル列挙とは別の文脈で挙げられていたが、
    // 明示的にリストへ含まれているため合わせて確認する。
    expect(EXPORT_TABLE_NAMES).toContain('profiles')
  })

  it('横断確認で発見した追加3テーブル（training_templates・training_template_exercises・soccer_logs）を含む', () => {
    expect(EXPORT_TABLE_NAMES).toContain('training_templates')
    expect(EXPORT_TABLE_NAMES).toContain('training_template_exercises')
    expect(EXPORT_TABLE_NAMES).toContain('soccer_logs')
  })

  it('対象外と判断したテーブル（meal_sizes・notifications・push_subscriptions）を含まない', () => {
    expect(EXPORT_TABLE_NAMES).not.toContain('meal_sizes')
    expect(EXPORT_TABLE_NAMES).not.toContain('notifications')
    expect(EXPORT_TABLE_NAMES).not.toContain('push_subscriptions')
  })
})

describe('buildExportPayload', () => {
  it('exported_at・user_id・tablesを含む構造を返す', () => {
    const now = new Date('2026-09-13T05:00:00.000Z')
    const tables = { training_logs: [{ id: 'a' }], sport_logs: [] }
    const payload = buildExportPayload('user-123', tables, now)

    expect(payload.user_id).toBe('user-123')
    expect(payload.exported_at).toBe('2026-09-13T05:00:00.000Z')
    expect(payload.tables).toBe(tables)
  })

  it('tablesの中身を加工しない（生データをそのまま格納する）', () => {
    const rawRow = { id: 'x', weird_column: null, nested: { a: 1 } }
    const payload = buildExportPayload('user-1', { daily_conditions: [rawRow] })
    expect(payload.tables.daily_conditions[0]).toBe(rawRow)
  })

  it('nowを省略した場合は現在時刻のISO文字列になる', () => {
    const before = Date.now()
    const payload = buildExportPayload('user-1', {})
    const after = Date.now()
    const exportedAtMs = new Date(payload.exported_at).getTime()
    expect(exportedAtMs).toBeGreaterThanOrEqual(before)
    expect(exportedAtMs).toBeLessThanOrEqual(after)
  })
})

describe('buildExportFilename', () => {
  it('YYYY-MM-DD形式のファイル名を組み立てる', () => {
    // JST 2026-09-13T14:00:00+09:00 相当
    const now = new Date('2026-09-13T05:00:00.000Z')
    expect(buildExportFilename(now)).toBe('workout-app-export-2026-09-13.json')
  })

  it('UTC深夜帯はJSTでは翌日になる（toJstDateKeyFromIsoと同じ変換方式）', () => {
    // UTC 2026-09-12T15:30:00Z = JST 2026-09-13T00:30:00+09:00
    const now = new Date('2026-09-12T15:30:00.000Z')
    expect(buildExportFilename(now)).toBe('workout-app-export-2026-09-13.json')
  })

  it('UTC日中はJSTでも同じ暦日になる', () => {
    // UTC 2026-09-13T01:00:00Z = JST 2026-09-13T10:00:00+09:00
    const now = new Date('2026-09-13T01:00:00.000Z')
    expect(buildExportFilename(now)).toBe('workout-app-export-2026-09-13.json')
  })

  it('月・日が1桁の場合もゼロ埋めされる', () => {
    // JST 2026-01-05T09:00:00+09:00
    const now = new Date('2026-01-05T00:00:00.000Z')
    expect(buildExportFilename(now)).toBe('workout-app-export-2026-01-05.json')
  })

  it('nowを省略した場合は今日の日付になる', () => {
    const filename = buildExportFilename()
    expect(filename).toMatch(/^workout-app-export-\d{4}-\d{2}-\d{2}\.json$/)
  })
})
