// Apple Health連携：アプリ内「今すぐ同期」ボタン用の純粋関数群（2026年9月5日）。
// これまでApple Health連携はiOSショートカットのオートメーション（アラーム停止時・
// ワークアウト終了時）による自動送信のみで、ユーザーが任意のタイミングで同期を
// 実行する手段が無かった。PWAからHealthKitを直接読むことはAppleの制約上できないため、
// Shortcutsアプリのx-callback-url URLスキーム
// （https://support.apple.com/guide/shortcuts/use-x-callback-url-apdcd7f20a6f/ios）
// を使い、アプリ内のボタンからショートカットを起動→完了後にアプリへ自動的に戻る
// 体験にする。api/sync-apple-health.ts自体への変更はなく、あくまで既存の
// エンドポイントへ送信するショートカットをユーザー自身の端末で起動するだけ。

// ユーザーが事前にiPhoneの「ショートカット」アプリで作成しておく必要がある
// ショートカットの名前（設定画面の連携手順ガイドにも同じ名前を表示する）。
export const APPLE_HEALTH_SYNC_SHORTCUT_NAME = 'ヘルス指標を送信'

// x-success / x-error の戻り先に付与するクエリパラメータ名（Settings.tsx側の
// parseHealthSyncQueryと対応させる）。
const HEALTH_SYNC_QUERY_KEY = 'healthSync'

// 「今すぐ同期」ボタンから開くURLを組み立てる。name・x-success・x-errorは
// 日本語のショートカット名やネストしたURLを含むため必ずencodeURIComponentする。
// アプリのURLはハードコードせずorigin引数（呼び出し側でwindow.location.originを渡す）
// から組み立てる。
export function buildAppleHealthSyncUrl(origin: string): string {
  const successUrl = `${origin}/settings?${HEALTH_SYNC_QUERY_KEY}=success`
  const errorUrl = `${origin}/settings?${HEALTH_SYNC_QUERY_KEY}=error`
  const query = [
    `name=${encodeURIComponent(APPLE_HEALTH_SYNC_SHORTCUT_NAME)}`,
    `x-success=${encodeURIComponent(successUrl)}`,
    `x-error=${encodeURIComponent(errorUrl)}`,
  ].join('&')
  return `shortcuts://x-callback-url/run-shortcut?${query}`
}

export type HealthSyncQueryResult = {
  status: 'success' | 'error'
  // Shortcutsのx-errorはerrorMessageパラメータでエラー内容を付加してくることがある。
  // 無ければnull。
  errorMessage: string | null
}

// Settingsのマウント時に呼び出し元のURL（location.search）を読み、
// ?healthSync=success / ?healthSync=error を検出する。該当しない場合はnull。
export function parseHealthSyncQuery(search: string): HealthSyncQueryResult | null {
  const params = new URLSearchParams(search)
  const status = params.get(HEALTH_SYNC_QUERY_KEY)
  if (status !== 'success' && status !== 'error') {
    return null
  }
  return { status, errorMessage: params.get('errorMessage') }
}

export type IosDeviceInput = {
  userAgent: string
  // iPadOS 13以降のSafariはデスクトップ版Safariを騙るUser-Agentを送るため
  // （userAgentだけでは"Macintosh"としか判定できない）、platform・maxTouchPoints
  // も補助的に見て実機のタッチ対応から推定する。
  platform?: string
  maxTouchPoints?: number
}

// 「今すぐ同期」ボタンの表示条件（iOS以外では意味がないため非表示にする）。
export function isIosDevice({ userAgent, platform, maxTouchPoints }: IosDeviceInput): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return true
  }
  return platform === 'MacIntel' && (maxTouchPoints ?? 0) > 1
}
