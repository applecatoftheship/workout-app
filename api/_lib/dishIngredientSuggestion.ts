// 料理追加時のAI材料提案（2026年9月7日）：Gemini呼び出し本体。
// api/suggest-dish-ingredients.ts（ログイン中ユーザーのセッションで直接叩かれる
// エンドポイント）から使う。process.env.GEMINI_API_KEY を参照する Node 専用コード
// のため、api/_lib/（Vercel がルーティング対象から除外するアンダースコア始まりの
// ディレクトリ）に置く（api/_lib/dailyCommentGeneration.ts と同じ理由）。
//
// 【AI連携の再利用】既存の AIコンディショニングアドバイザーと同じ API キー
// （GEMINI_API_KEY）・同じモデル（GEMINI_MODEL）・同じ generativelanguage
// エンドポイントを再利用する。新規の依存関係は追加しない。
//
// 【DB非書き込み】このエンドポイントは提案を返すだけで DB には一切書き込まない
// （ユーザーが DishFormModal で確認・保存するまで永続化しないため）。
import { GEMINI_MODEL } from './dailyCommentGeneration.js'
import {
  buildDishIngredientPrompt,
  parseDishIngredientSuggestions,
} from '../../src/utils/dishIngredientHelpers.js'
import type { DishIngredientSuggestion } from '../../src/utils/dishIngredientHelpers.js'

// 材料提案はコメント生成（3秒）より時間がかかりうるため少し長めに取る。
const GEMINI_TIMEOUT_MS = 8000

export type DishIngredientSuggestionResult =
  | { status: 'ok'; ingredients: DishIngredientSuggestion[] }
  | { status: 'error'; reason: string }

export async function suggestDishIngredientsViaGemini(dishName: string): Promise<DishIngredientSuggestionResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { status: 'error', reason: 'AI機能が設定されていません（GEMINI_API_KEY 未設定）' }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildDishIngredientPrompt(dishName) }] }],
          generationConfig: { maxOutputTokens: 800, temperature: 0.4 },
        }),
        signal: controller.signal,
      },
    )

    if (!response.ok) {
      console.error('Gemini APIがエラーを返しました（材料提案）', response.status, await response.text().catch(() => ''))
      return { status: 'error', reason: 'AIの呼び出しに失敗しました' }
    }

    const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    const parsed = parseDishIngredientSuggestions(text)
    if (parsed === null) {
      console.error('Gemini APIの材料提案レスポンスを解析できませんでした', JSON.stringify(data).slice(0, 500))
      return { status: 'error', reason: 'AIの応答を解析できませんでした' }
    }

    return { status: 'ok', ingredients: parsed }
  } catch (error) {
    // AbortError（タイムアウト）も含む。
    console.error('Gemini API呼び出しに失敗しました（材料提案、通信エラーまたはタイムアウト）', error)
    return { status: 'error', reason: 'AIの呼び出しに失敗しました（通信エラーまたはタイムアウト）' }
  } finally {
    clearTimeout(timeoutId)
  }
}
