// 一時的：backup_*テーブルの棚卸し用エンドポイント（読み取り専用）。
// バックアップテーブル削除SQL準備のため、実在するテーブル名と対応する
// 本体テーブルの件数を正確に取得する目的。確認後にこのファイルごと削除する。
//
// PostgRESTはinformation_schemaを直接公開していないため、information_schema
// への問い合わせではなく、フェーズBのSTEP 1（20260825010000_phase_b_auth_cutover_
// DRAFT.sql）で実際にCREATE TABLEした15テーブル分の候補名を直接probeし、
// 実在するものだけを結果に含める方式にした（推測ではなく実際にDBへ
// アクセスして存在確認する）。
import { createClient } from '@supabase/supabase-js'

const TEST_TOKEN = 'a7f3c9e1-verify-2026-08-25-backup-audit'

const CANDIDATE_TABLES = [
  'training_logs',
  'training_log_exercises',
  'training_sets',
  'training_templates',
  'training_template_exercises',
  'training_schedules',
  'daily_conditions',
  'meal_logs',
  'meal_log_food_items',
  'dishes',
  'dish_food_items',
  'goals',
  'soccer_logs',
  'exercises',
  'food_items',
]

export default async function handler(
  req: { headers: Record<string, string | string[] | undefined> },
  res: { status: (code: number) => { json: (body: unknown) => void } },
) {
  if (req.headers['x-test-notification'] !== TEST_TOKEN) {
    res.status(403).json({ error: 'forbidden' })
    return
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'missing required environment variables' })
    return
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const results: {
    backupTable: string
    sourceTable: string
    backupExists: boolean
    backupCount: number | null
    sourceCount: number | null
    error: string | null
  }[] = []

  for (const sourceTable of CANDIDATE_TABLES) {
    const backupTable = `backup_${sourceTable}`

    const backupResult = await supabase.from(backupTable).select('*', { count: 'exact', head: true })
    const backupExists = !backupResult.error
    const backupCount = backupExists ? (backupResult.count ?? null) : null

    const sourceResult = await supabase.from(sourceTable).select('*', { count: 'exact', head: true })
    const sourceCount = sourceResult.error ? null : (sourceResult.count ?? null)

    results.push({
      backupTable,
      sourceTable,
      backupExists,
      backupCount,
      sourceCount,
      error: backupExists ? (sourceResult.error ? sourceResult.error.message : null) : (backupResult.error?.message ?? null),
    })
  }

  res.status(200).json({ results })
}
