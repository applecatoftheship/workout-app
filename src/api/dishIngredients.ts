import { supabase } from './client'
import type { DishIngredientSuggestion } from '../utils/dishIngredientHelpers'

// 料理追加時のAI材料提案（2026年9月7日）：api/suggest-dish-ingredients.ts
// （Vercel Serverless Function）を呼び出すクライアント側ラッパー。
// api/dailyComment.ts の generateDailyComment と同じく、ログイン中セッションの
// アクセストークンを Authorization ヘッダーで送り、サーバー側で
// supabase.auth.getUser(token) により検証する方式。
export async function suggestDishIngredients(dishName: string): Promise<DishIngredientSuggestion[]> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) {
    throw new Error('ログインが必要です')
  }

  const response = await fetch('/api/suggest-dish-ingredients', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ dishName }),
  })

  if (!response.ok) {
    let reason = ''
    try {
      reason = ((await response.json()) as { error?: string }).error ?? ''
    } catch {
      // レスポンスボディが JSON でない場合は無視して汎用メッセージにフォールバック
    }
    throw new Error(reason || `AIの材料提案に失敗しました（status: ${response.status}）`)
  }

  const data = (await response.json()) as { ingredients?: DishIngredientSuggestion[] }
  return data.ingredients ?? []
}
