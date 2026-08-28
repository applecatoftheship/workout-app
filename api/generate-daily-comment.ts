// AIコンディショニングアドバイザー（設定画面拡張Phase 3、Geminiの実装指示書、
// 2026年8月28日。2026年8月29日、AIコメント生成タイミング見直しで大幅改訂）：
// DailyReportModal.tsx・ConditionForm.tsxの🔄手動再生成ボタンから呼び出される
// エンドポイント。フロントエンドから直接叩かれる（cronでもwebhookでもない）
// 唯一のAPIルートのため、api/sync-apple-health.tsの共有シークレット方式・
// api/send-reminder.tsのCRON_SECRET方式のどちらとも異なり、ログイン中
// ユーザー本人のセッションアクセストークン（Authorizationヘッダー）を
// supabase.auth.getUser(token)で検証する方式とした（アカウント/ログイン機能
// フェーズB以降、daily_conditionsは実ユーザーごとのRLSで保護されているため、
// このエンドポイントもservice_role接続後は同じuser_idスコープを自前で
// 徹底する必要がある）。
//
// 【2026年8月29日の改訂】通常の自動生成（cronによる前日分の一括生成）は
// api/generate-daily-comments.ts（複数形、新設）に移管した。このファイルは
// 「ユーザーが🔄を押したときだけ」呼ばれる想定に変わったため、処理フローを
// 単純化した：
//  1. forceRegenerateが無ければ、日付を問わずDB上のai_comment（無ければnull）を
//     そのまま返す。LLM呼び出しは行わない。
//  2. forceRegenerateがあれば、日付を問わずGEMINI_API_KEYを使いGemini APIを
//     呼び出し、成功したらdaily_conditions.ai_commentにUPDATE（部分列upsert）
//     してから返す。
//  3. 通信エラー・3秒タイムアウト・APIキー未設定時は定型文フォールバックを返し、
//     DB保存はスキップする（次回リトライ可能にするため）。
// 【変更理由】旧実装は「dateが本日でない場合は常にキャッシュのみ」という
// ガードがあり、forceRegenerateを指定しても過去日ではLLM呼び出しが一切
// 発生しなかった（実質、過去日の手動再生成が機能していなかった）。cronによる
// 自動生成が何らかの理由（Gemini APIエラー等）で失敗した場合、唯一のフォール
// バック手段が「手動再生成ボタン」になるため、日付に関わらずforceRegenerate
// なら再生成できるようこのガードを撤廃した。
//
// 【モデル名について】指示書で指定された"gemini-3.5-flash-lite"をそのまま
// 使用している。2026年8月時点でこのモデル名の実在をClaude Codeは確認できて
// いない（Gemini APIが404等を返した場合は下記フォールバックが機能し、
// アプリの動作自体は壊れない設計にしてある）。GEMINI_API_KEY発行後、実際の
// レスポンスで実在するモデル名かどうか改めて確認が必要。
import { createClient } from '@supabase/supabase-js'
import { generateDailyCommentViaGemini } from './_lib/dailyCommentGeneration.js'
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
  // 手動再生成ボタン（DailyReportModal.tsx・ConditionForm.tsx）専用のフラグ。
  // 2026年8月29日以降、このエンドポイントはforceRegenerate:trueの場合のみ
  // LLM呼び出しを行う（未指定時はfalse相当＝常にキャッシュ済みの値を返す）。
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

  // forceRegenerateが無ければ、日付を問わずキャッシュ済みの値をそのまま返す
  // （2026年8月29日改訂：以前は「本日以外は常にキャッシュのみ」だったが、
  // forceRegenerateの有無だけで判定するように単純化した。通常の自動生成は
  // api/generate-daily-comments.ts（cron）が担うため、このエンドポイントは
  // 手動再生成ボタンからforceRegenerate:trueで呼ばれる場合がほとんどになる）。
  if (!payload.forceRegenerate) {
    res.status(200).json({ aiComment: existingComment })
    return
  }

  const generated = await generateDailyCommentViaGemini(payload)

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
