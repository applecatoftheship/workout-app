import { getCurrentUserId, supabase } from './client'
import type { AvatarType, DateString, Profile } from '../types'

type ProfileRow = {
  user_id: string
  display_name: string | null
  age: number | null
  height_cm: number | null
  body_fat_percentage: number | null
  avatar_type: string | null
  avatar_value: string | null
  created_at: string
  updated_at: string
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    userId: row.user_id,
    displayName: row.display_name ?? undefined,
    age: row.age ?? undefined,
    heightCm: row.height_cm ?? undefined,
    bodyFatPercentage: row.body_fat_percentage ?? undefined,
    avatarType: (row.avatar_type as AvatarType | null) ?? undefined,
    avatarValue: row.avatar_value ?? undefined,
    createdAt: row.created_at as DateString,
    updatedAt: row.updated_at as DateString,
  }
}

// profilesは1ユーザー1行（user_idが主キー）。まだ一度も保存していないユーザーは
// 行自体が存在しないため、その場合はnullを返す（呼び出し側は「未設定」として扱う）。
export async function fetchProfile(): Promise<Profile | null> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle()

  if (error) {
    throw error
  }

  return data ? rowToProfile(data as ProfileRow) : null
}

export type ProfileInput = {
  displayName?: string
  age?: number
  heightCm?: number
  bodyFatPercentage?: number
  avatarType?: AvatarType
  avatarValue?: string
}

// profilesの全列はこの画面のみが書き込む（他機能との共有列が無い）ため、
// daily_conditions.weightのような部分列upsert（upsertWeightOnly参照）にはせず、
// フォームの現在値をそのまま全体upsertする（既存のupsertDailyCondition等と
// 同じ「全体upsert」方式）。
export async function upsertProfile(input: ProfileInput): Promise<void> {
  const userId = await getCurrentUserId()
  const { error } = await supabase.from('profiles').upsert(
    {
      user_id: userId,
      display_name: input.displayName ?? null,
      age: input.age ?? null,
      height_cm: input.heightCm ?? null,
      body_fat_percentage: input.bodyFatPercentage ?? null,
      avatar_type: input.avatarType ?? null,
      avatar_value: input.avatarValue ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    throw error
  }
}

// アイコン写真アップロード（2026年8月27日）：Supabase Storageの公開バケット
// avatarsへ、本人のuser_idフォルダ配下にアップロードする（RLSポリシーで
// 本人のフォルダ以外への書き込みは拒否される想定、supabase/migrations/参照）。
// 同一ユーザーが複数回アップロードしても既存ファイルを上書きしないよう、
// ファイル名にタイムスタンプを含めて一意にしている（upsert: trueにはしていない
// ＝古い画像はバケットに残り続けるが、今回のスコープでは削除処理までは行わない）。
export async function uploadAvatarFile(file: File): Promise<string> {
  const userId = await getCurrentUserId()
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/${Date.now()}.${extension}`

  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })

  if (uploadError) {
    throw uploadError
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return data.publicUrl
}
