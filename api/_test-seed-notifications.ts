// 一時的：未読バッジ/既読化機能のブラウザ確認用テストデータ投入エンドポイント
// （2026年8月25日）。notifications.INSERT/DELETEはanon/authenticatedに
// grantしていない（api/send-reminder.ts側でservice_role経由のみ許可する設計）
// ため、ブラウザ確認用のテスト通知を用意するにはservice_role経由が必要。
// 確認完了後にこのファイルごと削除する。
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

  const action = req.query.action

  if (action === 'cleanup') {
    const { error } = await supabase.from('notifications').delete().eq('device_id', deviceId).like('title', 'テスト：%')
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    res.status(200).json({ cleaned: true })
    return
  }

  // typeは実際のUIスタイル（danger/warningの色分け）を確認するため本物の値を使う。
  // クリーンアップ時の識別はtitleの「テスト：」接頭辞で行う。
  const { error } = await supabase.from('notifications').insert([
    {
      device_id: deviceId,
      type: 'acwr_danger',
      title: 'テスト：急性負荷が急増しています',
      message: 'ACWRが1.62です。怪我リスクが高まっているため、今日は負荷を抑えることを検討してください。',
      is_read: false,
    },
    {
      device_id: deviceId,
      type: 'streak_broken',
      title: 'テスト：記録の連続日数が途切れそうです',
      message: '5日間続いていた記録が今日はまだありません。トレーニング・食事・体調のいずれかを記録して連続記録を継続しましょう。',
      is_read: false,
    },
  ])
  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  res.status(200).json({ seeded: true })
}
