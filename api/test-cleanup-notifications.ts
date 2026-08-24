// 一時的：残存テスト通知（2026年8月25日のブラウザ確認で作成、自動化用
// device_idのみ）を削除するためだけのエンドポイント。確認完了後にこの
// ファイルごと削除する。
import { createClient } from '@supabase/supabase-js'

const TEST_TOKEN = 'a7f3c9e1-verify-2026-08-25-badge-test'

export default async function handler(
  req: { headers: Record<string, string | string[] | undefined>; query: Record<string, string | string[] | undefined> },
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

  const deviceId = req.query.deviceId
  if (!deviceId || typeof deviceId !== 'string') {
    res.status(400).json({ error: 'deviceId query param is required' })
    return
  }

  const { error, count } = await supabase
    .from('notifications')
    .delete({ count: 'exact' })
    .eq('device_id', deviceId)
    .like('title', 'テスト：%')

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.status(200).json({ deleted: count })
}
