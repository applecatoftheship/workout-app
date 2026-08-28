import { getCurrentUserId, supabase } from './client'
import type { UserBadge } from '../types'

type UserBadgeRow = {
  id: string
  user_id: string
  badge_id: string
  unlocked_at: string
}

function rowToUserBadge(row: UserBadgeRow): UserBadge {
  return {
    id: row.id,
    userId: row.user_id,
    badgeId: row.badge_id,
    unlockedAt: row.unlocked_at,
  }
}

export async function fetchUserBadges(): Promise<UserBadge[]> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('user_badges')
    .select('*')
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data as UserBadgeRow[]).map(rowToUserBadge)
}

// 設定画面拡張 Phase 4（ゲーミフィケーション）：新規解放時のみ呼ばれる想定
// （呼び出し側のuseBadgeEvaluatorが未解放バッジのみを対象にフィルタしてから
// 呼ぶ）。ただし複数画面（ホーム・バッジ図鑑）がほぼ同時にマウントされた場合の
// 競合で重複INSERTが発生しうるため、user_badges_user_id_badge_id_key（unique制約）
// による23505エラーは呼び出し側で正常系として扱うこと（詳細はuseBadgeEvaluator.ts参照）。
export async function insertUserBadge(badgeId: string): Promise<UserBadge> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('user_badges')
    .insert({ user_id: userId, badge_id: badgeId })
    .select()
    .single()

  if (error) {
    throw error
  }

  return rowToUserBadge(data as UserBadgeRow)
}
