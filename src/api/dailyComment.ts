import { supabase } from './client'
import type { ACWRResult, DateString, FatigueLevel } from '../types'

// AIコンディショニングアドバイザー（設定画面拡張Phase 3、2026年8月28日）：
// api/generate-daily-comment.ts（Vercel Serverless Function）を呼び出す
// クライアント側ラッパー。このAPIはユーザー本人のdaily_conditions行のみを
// 読み書きするため、他のAPIルート（api/sync-apple-health.ts等）のような
// 共有シークレット方式ではなく、ログイン中セッションのアクセストークンを
// Authorizationヘッダーで送り、サーバー側でsupabase.auth.getUser(token)により
// 検証する方式とした（アカウント/ログイン機能フェーズB以降、実ユーザーごとの
// データになっているため）。
export type GenerateDailyCommentInput = {
  date: DateString
  acwr: number | null
  acwrStatus: ACWRResult['status'] | null
  sleepHours: number
  fatigueLevel: FatigueLevel
  workoutSummary: string
}

export type GenerateDailyCommentResult = {
  aiComment: string | null
}

export async function generateDailyComment(input: GenerateDailyCommentInput): Promise<GenerateDailyCommentResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) {
    throw new Error('ログインが必要です')
  }

  const response = await fetch('/api/generate-daily-comment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(`AIコンディショニングコメントの生成に失敗しました（status: ${response.status}）`)
  }

  return (await response.json()) as GenerateDailyCommentResult
}
