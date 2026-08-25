// 一時的：backup_*テーブルの棚卸し用エンドポイント（読み取り専用）。
// 生fetchでPostgRESTに直接アクセスし、実際のHTTPステータス・レスポンス本文を
// そのまま返す（supabase-jsのエラーラッピングでは判別しづらかったため）。
// 確認後にこのファイルを削除する。
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

async function probe(baseUrl: string, serviceRoleKey: string, table: string) {
  const res = await fetch(`${baseUrl}/rest/v1/${table}?select=*&limit=1`, {
    method: 'GET',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  })
  const contentRange = res.headers.get('content-range')
  const bodyText = await res.text()
  return { status: res.status, contentRange, body: bodyText.slice(0, 300) }
}

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

  const results = [];
  for (const sourceTable of CANDIDATE_TABLES) {
    const backupTable = `backup_${sourceTable}`
    const backupProbe = await probe(supabaseUrl, serviceRoleKey, backupTable)
    const sourceProbe = await probe(supabaseUrl, serviceRoleKey, sourceTable)
    results.push({ backupTable, sourceTable, backupProbe, sourceProbe })
  }

  res.status(200).json({ results })
}
