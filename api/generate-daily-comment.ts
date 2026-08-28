// AIコンディショニングアドバイザー（設定画面拡張Phase 3、Geminiの実装指示書、
// 2026年8月28日）：DailyReportModal.tsx・ConditionForm.tsxから呼び出される
// エンドポイント。フロントエンドから直接叩かれる（cronでもwebhookでもない）
// 唯一のAPIルートのため、api/sync-apple-health.tsの共有シークレット方式・
// api/send-reminder.tsのCRON_SECRET方式のどちらとも異なり、ログイン中
// ユーザー本人のセッションアクセストークン（Authorizationヘッダー）を
// supabase.auth.getUser(token)で検証する方式とした（アカウント/ログイン機能
// フェーズB以降、daily_conditionsは実ユーザーごとのRLSで保護されているため、
// このエンドポイントもservice_role接続後は同じuser_idスコープを自前で
// 徹底する必要がある）。
//
// 【処理フロー（指示書通り）】
//  1. dateが本日（JST基準）でない場合：DB上のai_comment（無ければnull）を
//     そのまま返す。LLM呼び出しは行わない。
//  2. dateが本日で、DB上のai_commentが既にあればそれを返す（LLM呼び出しなし）。
//  3. dateが本日で未生成の場合のみ、GEMINI_API_KEYを使いGemini APIを呼び出し、
//     成功したらdaily_conditions.ai_commentにUPDATE（部分列upsert）してから返す。
//  4. 通信エラー・3秒タイムアウト・APIキー未設定時は定型文フォールバックを返し、
//     DB保存はスキップする（次回リトライ可能にするため）。
//
// 【モデル名について】指示書で指定された"gemini-3.5-flash-lite"をそのまま
// 使用している。2026年8月時点でこのモデル名の実在をClaude Codeは確認できて
// いない（Gemini APIが404等を返した場合は下記フォールバックが機能し、
// アプリの動作自体は壊れない設計にしてある）。GEMINI_API_KEY発行後、実際の
// レスポンスで実在するモデル名かどうか改めて確認が必要。
import { createClient } from '@supabase/supabase-js'
import { toJstDateKeyFromIso } from '../src/utils/calendarHelpers.js'
import type { ACWRResult, FatigueLevel } from '../src/types.js'

type RequestBody = {
  date: string
  acwr: number | null
  acwrStatus: ACWRResult['status'] | null
  sleepHours: number
  fatigueLevel: FatigueLevel
  // 2026年8月28日、食事データを含む1日全体の要約に拡張したためworkoutSummaryから
  // dailySummaryへ改名（src/utils/dailyCommentHelpers.tsのbuildDailySummaryText参照）。
  dailySummary: string
  // 手動再生成ボタン（DailyReportModal.tsx、2026年8月28日）専用のフラグ。
  // 本日分かつ既にai_commentが生成済みの場合、通常はLLM呼び出しをスキップして
  // キャッシュをそのまま返すが、これがtrueのときのみキャッシュを無視して
  // 再生成する。未指定時はfalse相当（既存の自動生成時の呼び出しには影響しない）。
  forceRegenerate?: boolean
}

class ValidationError extends Error {}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const FATIGUE_LEVELS = [1, 2, 3, 4, 5]

function validateBody(payload: Record<string, unknown>): asserts payload is RequestBody {
  if (typeof payload.date !== 'string' || !DATE_PATTERN.test(payload.date)) {
    throw new ValidationError('date must be a YYYY-MM-DD string')
  }
  if (payload.acwr !== null && (typeof payload.acwr !== 'number' || !Number.isFinite(payload.acwr))) {
    throw new ValidationError('acwr must be a number or null')
  }
  if (payload.acwrStatus !== null && typeof payload.acwrStatus !== 'string') {
    throw new ValidationError('acwrStatus must be a string or null')
  }
  if (typeof payload.sleepHours !== 'number' || !Number.isFinite(payload.sleepHours)) {
    throw new ValidationError('sleepHours must be a number')
  }
  if (typeof payload.fatigueLevel !== 'number' || !FATIGUE_LEVELS.includes(payload.fatigueLevel)) {
    throw new ValidationError('fatigueLevel must be a number between 1 and 5')
  }
  if (typeof payload.dailySummary !== 'string') {
    throw new ValidationError('dailySummary must be a string')
  }
  if (payload.forceRegenerate !== undefined && typeof payload.forceRegenerate !== 'boolean') {
    throw new ValidationError('forceRegenerate must be a boolean')
  }
}

const GEMINI_MODEL = 'gemini-3.5-flash-lite'
const GEMINI_TIMEOUT_MS = 3000
const MAX_COMMENT_LENGTH = 200
const FALLBACK_COMMENT = '今日の記録を保存しました。十分な睡眠と適切な水分補給を心がけて体をケアしましょう。'

function buildPrompt(input: RequestBody): string {
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

async function generateCommentViaGemini(input: RequestBody): Promise<{ text: string; shouldPersist: boolean }> {
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
          contents: [{ parts: [{ text: buildPrompt(input) }] }],
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
  const token = typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  const userId = userData.user.id

  let payload: Record<string, unknown> | null | undefined
  try {
    payload = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Record<string, unknown> | null | undefined
  } catch (parseError) {
    console.error('AIコンディショニングコメント生成リクエストのJSONパースに失敗しました', parseError)
    res.status(400).json({ error: 'invalid JSON body' })
    return
  }

  if (!payload) {
    res.status(400).json({ error: 'invalid payload' })
    return
  }

  try {
    validateBody(payload)
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error('AIコンディショニングコメント生成リクエストのバリデーションに失敗しました', error)
      res.status(400).json({ error: 'invalid payload' })
      return
    }
    throw error
  }

  let existingComment: string | null = null
  try {
    const { data: existingRow, error: fetchError } = await supabase
      .from('daily_conditions')
      .select('ai_comment')
      .eq('user_id', userId)
      .eq('log_date', payload.date)
      .maybeSingle()

    if (fetchError) {
      throw fetchError
    }
    existingComment = (existingRow as { ai_comment: string | null } | null)?.ai_comment ?? null
  } catch (error) {
    console.error('daily_conditionsの既存ai_comment取得に失敗しました', error)
    res.status(500).json({ error: 'failed to read daily_conditions' })
    return
  }

  const todayJst = toJstDateKeyFromIso(new Date().toISOString())

  // 過去日は常にキャッシュ済みの値をそのまま返す（forceRegenerateが指定されて
  // いてもLLM呼び出しは行わない。過去日のコメント再生成は今回のスコープ外）。
  if (payload.date !== todayJst) {
    res.status(200).json({ aiComment: existingComment })
    return
  }

  // 本日分：手動再生成ボタン（DailyReportModal.tsx）由来のforceRegenerateが
  // trueの場合のみ、既に生成済みでもキャッシュを無視してLLMを再度呼び出す。
  if (existingComment && !payload.forceRegenerate) {
    res.status(200).json({ aiComment: existingComment })
    return
  }

  const generated = await generateCommentViaGemini(payload)

  if (generated.shouldPersist) {
    // 他のdaily_conditions列（weight・sleep_hours等）を上書きしない部分列upsert
    // （sync-apple-health.tsのupdateLastSyncedAt・handleSleepと同じパターン）。
    const { error: upsertError } = await supabase
      .from('daily_conditions')
      .upsert({ user_id: userId, log_date: payload.date, ai_comment: generated.text }, { onConflict: 'user_id,log_date' })

    if (upsertError) {
      // 生成テキスト自体は取得できているため、永続化に失敗してもレスポンスは返す
      // （次回呼び出し時はDBにai_commentが無いため再度生成が試みられる）。
      console.error('daily_conditions.ai_commentの保存に失敗しました', upsertError)
    }
  }

  res.status(200).json({ aiComment: generated.text })
}
