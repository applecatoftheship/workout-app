// AIコンディショニングアドバイザー：Gemini呼び出し共通ロジック（2026年8月29日、
// AIコメント生成タイミング見直しに伴いapi/generate-daily-comment.tsから切り出し）。
//
// api/generate-daily-comment.ts（ユーザーのセッションで直接叩かれる手動再生成
// エンドポイント）と api/generate-daily-comments.ts（cron、前日分の自動生成）の
// 両方から共有する。process.env.GEMINI_API_KEYを参照するNode専用コードのため、
// tsconfig.app.json（src/、ブラウザ向け、Node型なし）配下には置けない
// （buildDailySummaryText・calculateACWR等の純粋関数がsrc/utils/に置けているのは
// process.env等のNode依存が無いため）。api/直下は各ファイルがVercel
// Serverless Functionのルートとして扱われるため、ファイル名アンダースコア始まりの
// ディレクトリ（Vercelがルーティング対象から除外する規約）に置く。
//
// api/send-reminder.ts・api/send-weekly-report.tsは意図的にper-userデータ取得
// ロジックを重複実装しており共通化していない（「既存ファイルに手を加えず
// 影響範囲を最小化する」判断、各ファイルのコメント参照）。今回はこの前例を
// 踏襲しつつ、Gemini呼び出し部分（データ取得を伴わない純粋な入出力変換）のみ
// 新規に共有対象とした（生成ロジック自体は1箇所に保つ方が、プロンプト文言や
// フォールバック文言の食い違いを防げるため）。
import type { ACWRResult, FatigueLevel } from '../../src/types.js'

export type DailyCommentPromptInput = {
  acwr: number | null
  acwrStatus: ACWRResult['status'] | null
  sleepHours: number
  fatigueLevel: FatigueLevel
  dailySummary: string
}

export type DailyCommentGenerationResult = {
  text: string
  shouldPersist: boolean
}

export const GEMINI_MODEL = 'gemini-3.5-flash-lite'
const GEMINI_TIMEOUT_MS = 3000
const MAX_COMMENT_LENGTH = 200
export const FALLBACK_COMMENT = '今日の記録を保存しました。十分な睡眠と適切な水分補給を心がけて体をケアしましょう。'

export function buildDailyCommentPrompt(input: DailyCommentPromptInput): string {
  const acwrText = input.acwr !== null ? `${input.acwr.toFixed(2)}（${input.acwrStatus ?? '不明'}）` : 'データ蓄積中'
  return [
    'あなたはスポーツコンディショニングの専門アドバイザーです。',
    '以下の今日の記録データをもとに、今日から明日に向けたコンディショニング面のアドバイスを、',
    '客観的かつ温かいトーンで、100文字以内（1〜2文）の日本語で生成してください。',
    '数値の羅列・見出し・絵文字は使わず、自然な文章のみを出力してください。',
    '',
    `ACWR（急性:慢性負荷比）: ${acwrText}`,
    `睡眠時間: ${input.sleepHours}時間`,
    `疲労度（1〜5、5が最も疲労）: ${input.fatigueLevel}`,
    `今日の運動・食事の記録: ${input.dailySummary}`,
  ].join('\n')
}

export async function generateDailyCommentViaGemini(input: DailyCommentPromptInput): Promise<DailyCommentGenerationResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { text: FALLBACK_COMMENT, shouldPersist: false }
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
          contents: [{ parts: [{ text: buildDailyCommentPrompt(input) }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.7 },
        }),
        signal: controller.signal,
      },
    )

    if (!response.ok) {
      console.error('Gemini APIがエラーを返しました', response.status, await response.text().catch(() => ''))
      return { text: FALLBACK_COMMENT, shouldPersist: false }
    }

    const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!text) {
      console.error('Gemini APIのレスポンスにテキストが含まれていませんでした', JSON.stringify(data))
      return { text: FALLBACK_COMMENT, shouldPersist: false }
    }

    return { text: text.slice(0, MAX_COMMENT_LENGTH), shouldPersist: true }
  } catch (error) {
    // AbortError（3秒タイムアウト）もここに含まれる。
    console.error('Gemini API呼び出しに失敗しました（通信エラーまたはタイムアウト）', error)
    return { text: FALLBACK_COMMENT, shouldPersist: false }
  } finally {
    clearTimeout(timeoutId)
  }
}
