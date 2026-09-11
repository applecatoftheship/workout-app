// 汎用の「失敗時に自動リトライする」ヘルパー（2026年9月11日、AI材料提案
// （api/_lib/dishIngredientSuggestion.ts）のGemini呼び出し失敗時の自動リトライ
// 機能から切り出し）。
//
// 【背景】本番検証で、栄養成分4項目＋カテゴリまで毎回生成させる仕様
// （2026年9月7日）になって以降、Gemini呼び出しが約33%（6回中2回）の頻度で
// タイムアウト・通信エラー等で失敗する事象が観測された。直後に同じ入力で
// 素のfetchを5回試すと全て数秒で成功しており、コード自体の不具合ではなく
// 応答時間のばらつきが原因と判断し、タイムアウト延長ではなく「失敗時に1回だけ
// 自動リトライする」方式で対応することにした（John判断）。
//
// fetch・タイマー等のNode/ブラウザ依存が無い純粋なロジックのみを持つため、
// vitestで直接テストできるよう src/utils/ に置く。実際のネットワーク呼び出し
// （Gemini API呼び出し本体）は呼び出し元が attempt 関数として渡す
// （依存性注入。api/_lib/dishIngredientSuggestion.ts 参照）。
export type RetryableStatus = { status: 'ok' | 'error' }

// 失敗時の結果型（T から 'ok' バリアントを除いたもの）。generic な T に対しては
// TS の制御フロー解析だけでは「'ok' ではない」ところまで絞り込めないため、
// onRetry の引数型として明示的に Extract で切り出す。
type FailedResult<T extends RetryableStatus> = Extract<T, { status: 'error' }>

export type RetryOptions<T extends RetryableStatus> = {
  // 最大試行回数（初回を含む。1未満は1として扱う）。
  maxAttempts: number
  // 失敗した試行の直後（最終試行を除く）に呼ばれる。ログ出力等の副作用専用で、
  // 戻り値は使わない。
  onRetry?: (attemptNumber: number, failedResult: FailedResult<T>) => void
}

// attempt を最大 maxAttempts 回まで呼び出し、最初に status:'ok' を返した結果を
// そのまま返す。全て失敗した場合は最後の失敗結果を返す（例外は投げない。
// attempt 自体が reject した場合はそのまま呼び出し元に伝播する）。
export async function retryOnFailure<T extends RetryableStatus>(
  attempt: (attemptNumber: number) => Promise<T>,
  options: RetryOptions<T>,
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts)
  let lastResult: T | undefined
  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
    const result = await attempt(attemptNumber)
    if (result.status === 'ok') {
      return result
    }
    lastResult = result
    if (attemptNumber < maxAttempts) {
      // ここに到達するのは status !== 'ok'（＝ 'error'）のときのみ。
      options.onRetry?.(attemptNumber, result as FailedResult<T>)
    }
  }
  // maxAttempts >= 1 なのでループは必ず1回以上実行され、lastResult は必ず設定されている。
  return lastResult as T
}
