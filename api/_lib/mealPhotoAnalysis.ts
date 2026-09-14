// Gemini画像解析による食事入力（指示書2026-09-14）：Gemini呼び出し本体。
// api/analyze-meal-photo.ts（ログイン中ユーザーのセッションで直接叩かれる
// エンドポイント）から使う。process.env.GEMINI_API_KEY を参照する Node 専用コード
// のため、api/_lib/dishIngredientSuggestion.tsと同じ理由でapi/_lib/に置く。
//
// 【既存パターンの踏襲】GEMINI_API_KEY・GEMINI_MODEL・generativelanguage
// エンドポイント・1回だけの自動リトライ（retryOnFailure）は、いずれも
// api/_lib/dishIngredientSuggestion.tsと同一のものを再利用する（新規の依存関係は
// 追加しない）。画像入力のみ、Gemini APIの inline_data パートを追加している点が異なる。
//
// 【タイムアウト】画像解析はテキストのみの材料提案（15秒）よりやや重いと想定し、
// 20秒に設定。2回試行しても最悪ケースで合計40秒程度に収まり、Vercel Fluid Compute
// 既定の300秒に対して十分な余裕がある（dishIngredientSuggestion.tsのコメント参照）。
import { GEMINI_MODEL } from './dailyCommentGeneration.js'
import { buildMealPhotoPrompt, parseMealPhotoAnalysis } from '../../src/utils/mealPhotoHelpers.js'
import type { MealPhotoAnalysisResult, MealPhotoHint } from '../../src/utils/mealPhotoHelpers.js'
import { retryOnFailure } from '../../src/utils/retryHelpers.js'

const GEMINI_TIMEOUT_MS = 20000
const MAX_ATTEMPTS = 2

export type MealPhotoAnalysisApiResult =
  | { status: 'ok'; result: MealPhotoAnalysisResult }
  | { status: 'error'; reason: string }

// Gemini呼び出し1回分（リトライなし）。タイムアウト／通信エラー／非OKレスポンス／
// レスポンス解析失敗のいずれも { status: 'error' } として返す（例外は投げない）。
async function attemptAnalyzeMealPhotoViaGemini(
  imageBase64: string,
  mimeType: string,
  hint: MealPhotoHint | undefined,
  apiKey: string,
): Promise<MealPhotoAnalysisApiResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mimeType, data: imageBase64 } },
                { text: buildMealPhotoPrompt(hint) },
              ],
            },
          ],
          // 料理写真は最大10食材×栄養4項目＋カテゴリを返すため、材料提案と同じ余裕を持たせる。
          generationConfig: { maxOutputTokens: 1600, temperature: 0.4 },
        }),
        signal: controller.signal,
      },
    )

    if (!response.ok) {
      console.error('Gemini APIがエラーを返しました（写真解析）', response.status, await response.text().catch(() => ''))
      return { status: 'error', reason: 'AIの呼び出しに失敗しました' }
    }

    const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    const parsed = parseMealPhotoAnalysis(text)
    if (parsed === null) {
      console.error('Gemini APIの写真解析レスポンスを解析できませんでした', JSON.stringify(data).slice(0, 500))
      return { status: 'error', reason: 'AIが写真の内容を読み取れませんでした。別の写真でお試しください' }
    }

    return { status: 'ok', result: parsed }
  } catch (error) {
    // AbortError（タイムアウト）も含む。
    console.error('Gemini API呼び出しに失敗しました（写真解析、通信エラーまたはタイムアウト）', error)
    return { status: 'error', reason: 'AIの呼び出しに失敗しました（通信エラーまたはタイムアウト）' }
  } finally {
    clearTimeout(timeoutId)
  }
}

// 失敗時に同じ画像で1回だけ自動リトライする（最大2回試行、上記コメント参照）。
// GEMINI_API_KEY 未設定は環境の問題でリトライしても解決しないため、リトライ対象外。
export async function analyzeMealPhotoViaGemini(
  imageBase64: string,
  mimeType: string,
  hint?: MealPhotoHint,
): Promise<MealPhotoAnalysisApiResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { status: 'error', reason: 'AI機能が設定されていません（GEMINI_API_KEY 未設定）' }
  }

  return retryOnFailure(() => attemptAnalyzeMealPhotoViaGemini(imageBase64, mimeType, hint, apiKey), {
    maxAttempts: MAX_ATTEMPTS,
    onRetry: (attemptNumber, failedResult) => {
      console.error(
        `Gemini APIの写真解析に失敗したため${attemptNumber}回目の結果を破棄しリトライします（写真解析）`,
        failedResult.reason,
      )
    },
  })
}
