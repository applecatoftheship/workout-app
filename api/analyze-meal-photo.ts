// Gemini画像解析による食事入力（指示書2026-09-14）：食事記録ウィザードの
// 「写真から入力」・FoodItemFormModalの栄養成分ラベル読み取りの両方から共通で
// 叩かれるエンドポイント。api/suggest-dish-ingredients.tsと同じく、ログイン中
// ユーザー本人のセッションアクセストークン（Authorization: Bearer）を
// supabase.auth.getUser(token) で検証する。
//
// Geminiに写真を渡して種別（料理写真／栄養成分ラベル）を自動判別させ、構造化した
// 結果を返すだけで、DBには一切書き込まない（送信された画像そのものも保存しない。
// 指示書の設計判断3：解析に使った写真は保存しない）。DBアクセスは認証（getUser）のみ。
import { createClient } from '@supabase/supabase-js'
import { analyzeMealPhotoViaGemini } from './_lib/mealPhotoAnalysis.js'

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
// クライアント側（src/utils/imagePrep.ts）で長辺1024px・JPEG品質0.85にリサイズ
// 済みの前提だが、念のためのサーバー側ガードとして約8MB相当（Base64文字列の長さ）
// を上限とする。
const MAX_BASE64_LENGTH = 8 * 1024 * 1024

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
    console.error('写真解析リクエストのJSONパースに失敗しました', parseError)
    res.status(400).json({ error: 'invalid JSON body' })
    return
  }

  const imageBase64 = payload && typeof payload.imageBase64 === 'string' ? payload.imageBase64 : ''
  const mimeType = payload && typeof payload.mimeType === 'string' ? payload.mimeType : ''
  const hintRaw = payload && typeof payload.hint === 'string' ? payload.hint : undefined
  const hint = hintRaw === 'label' || hintRaw === 'dish' ? hintRaw : undefined

  if (!imageBase64) {
    res.status(400).json({ error: 'imageBase64 is required' })
    return
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    res.status(400).json({ error: 'unsupported mimeType' })
    return
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    res.status(400).json({ error: 'image is too large' })
    return
  }

  const result = await analyzeMealPhotoViaGemini(imageBase64, mimeType, hint)
  if (result.status === 'error') {
    // AI呼び出しの失敗はクライアントに理由付きで返す（呼び出し元は通常の手入力
    // フローへフォールバックし、エラー表示のみ行う。指示書の設計判断4）。
    res.status(502).json({ error: result.reason })
    return
  }

  res.status(200).json({ result: result.result })
}
