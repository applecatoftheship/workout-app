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
//
// 【1回だけ自動リトライ（2026年9月11日追加）】本番検証で、栄養成分4項目＋
// カテゴリまで毎回生成させる仕様（2026年9月7日）になって以降、タイムアウト・
// 通信エラー・非OKレスポンス・レスポンス解析失敗のいずれかで約33%（6回中2回）
// 失敗する事象が観測された。直後に同じ料理名で素のfetchを5回試したところ全て
// 3〜4秒で成功しており、コード自体の不具合ではなくGemini応答時間のばらつきが
// 原因と判断。タイムアウト延長ではなく「失敗時に1回だけ同じdishNameで自動
// リトライする」方式で対応する（John判断）。
//
// 【1回あたりのタイムアウトを変更しなかった理由】Vercel Functions は
// Fluid Compute有効時（現在は全プラン既定で有効）、Hobby/Pro/Enterpriseいずれも
// デフォルト最大実行時間が300秒（Hobbyはこれが上限でもある）。本プロジェクトは
// vercel.json・各APIファイルのどちらにも maxDuration の指定が無く、既定値の
// 300秒がそのまま適用される。GEMINI_TIMEOUT_MS=15000（15秒）のまま2回試行しても
// 最悪ケースで合計30秒程度に収まり、300秒の制限に対して十分な余裕があるため、
// タイムアウト値自体は変更していない（延長も短縮もしない、という指示のとおり）。
//
// リトライのループ自体は src/utils/retryHelpers.ts の汎用関数 retryOnFailure に
// 切り出してある（fetch/タイマー等のNode依存が無い純粋なロジックのみのため、
// vitestで直接テストできるよう src/utils/ 側に置いた。dishIngredientHelpers.ts
// と同じ判断）。
import { GEMINI_MODEL } from './dailyCommentGeneration.js'
import {
  buildDishIngredientPrompt,
  parseDishIngredientSuggestions,
} from '../../src/utils/dishIngredientHelpers.js'
import type { DishIngredientSuggestion } from '../../src/utils/dishIngredientHelpers.js'
import { retryOnFailure } from '../../src/utils/retryHelpers.js'

// 材料提案はコメント生成（3秒）より応答が長い（最大10食材×栄養4項目＋カテゴリ）
// ため長めに取る。ユーザーが「AIが考え中...」を待つ画面操作なので、多少長くても許容。
const GEMINI_TIMEOUT_MS = 15000

// 失敗時の自動リトライ回数（初回1回＋リトライ1回＝最大2回試行）。
const MAX_ATTEMPTS = 2

export type DishIngredientSuggestionResult =
  | { status: 'ok'; ingredients: DishIngredientSuggestion[] }
  | { status: 'error'; reason: string }

// Gemini呼び出し1回分（リトライなし）。タイムアウト／通信エラー／非OKレスポンス／
// レスポンス解析失敗のいずれも { status: 'error' } として返す（例外は投げない）。
async function attemptSuggestDishIngredientsViaGemini(
  dishName: string,
  apiKey: string,
): Promise<DishIngredientSuggestionResult> {
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
          // 1食材あたり name/grams/栄養4項目/category を返すため、10食材で余裕を持たせる。
          generationConfig: { maxOutputTokens: 1600, temperature: 0.4 },
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

// 失敗時に同じ dishName で1回だけ自動リトライする（最大2回試行、上記コメント参照）。
// GEMINI_API_KEY 未設定は環境の問題でリトライしても解決しないため、リトライ対象外。
export async function suggestDishIngredientsViaGemini(dishName: string): Promise<DishIngredientSuggestionResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { status: 'error', reason: 'AI機能が設定されていません（GEMINI_API_KEY 未設定）' }
  }

  return retryOnFailure(() => attemptSuggestDishIngredientsViaGemini(dishName, apiKey), {
    maxAttempts: MAX_ATTEMPTS,
    onRetry: (attemptNumber, failedResult) => {
      console.error(
        `Gemini APIの材料提案に失敗したため${attemptNumber}回目の結果を破棄しリトライします（材料提案）`,
        failedResult.reason,
      )
    },
  })
}
