import { supabase } from './client'
import type { MealPhotoAnalysisResult, MealPhotoHint } from '../utils/mealPhotoHelpers'

// Gemini画像解析による食事入力（指示書2026-09-14）：api/analyze-meal-photo.ts
// （Vercel Serverless Function）を呼び出すクライアント側ラッパー。
// src/api/dishIngredients.ts と同じく、ログイン中セッションのアクセストークンを
// Authorization ヘッダーで送り、サーバー側で supabase.auth.getUser(token) により検証する。
export async function analyzeMealPhoto(
  imageBase64: string,
  mimeType: string,
  hint?: MealPhotoHint,
): Promise<MealPhotoAnalysisResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) {
    throw new Error('ログインが必要です')
  }

  const response = await fetch('/api/analyze-meal-photo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ imageBase64, mimeType, hint }),
  })

  if (!response.ok) {
    let reason = ''
    try {
      reason = ((await response.json()) as { error?: string }).error ?? ''
    } catch {
      // レスポンスボディが JSON でない場合は無視して汎用メッセージにフォールバック
    }
    throw new Error(reason || `写真の解析に失敗しました（status: ${response.status}）`)
  }

  const data = (await response.json()) as { result?: MealPhotoAnalysisResult }
  if (!data.result) {
    throw new Error('写真の解析に失敗しました')
  }
  return data.result
}
