// 料理追加時のAI材料提案（2026年9月7日）：DishFormModal の「AIで材料を提案」
// ボタンから叩かれるエンドポイント。api/generate-daily-comment.ts と同じく
// フロントエンドから直接叩かれるため、共有シークレット方式ではなく、ログイン中
// ユーザー本人のセッションアクセストークン（Authorization: Bearer）を
// supabase.auth.getUser(token) で検証する。
//
// このエンドポイントは Gemini に料理名を渡して材料候補（食材名＋概算グラム）を
// 生成させて返すだけで、DB には一切書き込まない（DishFormModal 側でユーザーが
// 確認・保存するまで永続化しない設計）。DBアクセスは認証（getUser）のみ。
import { createClient } from '@supabase/supabase-js'
import { suggestDishIngredientsViaGemini } from './_lib/dishIngredientSuggestion.js'

const MAX_DISH_NAME_LENGTH = 100

export default async function handler(
  req: { headers: Record<string, string | string[] | undefined>; body: unknown; method?: string },
  res: { status: (code: number) => { json: (body: unknown) => void } },
) {
  if (req.method && req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'missing required environment variables' })
    return
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const authHeader = req.headers['authorization']
  const token =
    typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  let payload: Record<string, unknown> | null | undefined
  try {
    payload = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as
      | Record<string, unknown>
      | null
      | undefined
  } catch (parseError) {
    console.error('AI材料提案リクエストのJSONパースに失敗しました', parseError)
    res.status(400).json({ error: 'invalid JSON body' })
    return
  }

  const dishNameRaw = payload && typeof payload.dishName === 'string' ? payload.dishName.trim() : ''
  if (!dishNameRaw) {
    res.status(400).json({ error: 'dishName is required' })
    return
  }
  if (dishNameRaw.length > MAX_DISH_NAME_LENGTH) {
    res.status(400).json({ error: 'dishName is too long' })
    return
  }

  const result = await suggestDishIngredientsViaGemini(dishNameRaw)
  if (result.status === 'error') {
    // AI呼び出しの失敗はクライアントに理由付きで返す（DishFormModal 側はエラー表示のみ）。
    res.status(502).json({ error: result.reason })
    return
  }

  res.status(200).json({ ingredients: result.ingredients })
}
