// デプロイ直後の真っ白画面対策（2026年11月1日）：
// 古いバージョンの画面を開いたまま新しいバージョンがデプロイされると、遅延読み込み
// （React.lazy）で取りに行くファイル（例：RecordFormModal-*.js）が既に存在せず、
// `Failed to fetch dynamically imported module` で画面が真っ白になる。
// 再読み込みすれば新しいバージョンのファイル名で読み直せるため、読み込みに失敗した
// ときだけページを1回自動で再読み込みする。
// 無限ループ防止：直前の自動再読み込みから一定時間内に再び失敗した場合は再読み込み
// せず、エラーをそのまま投げる（従来と同じ挙動）。時刻は sessionStorage に保存する。

export const LAZY_RELOAD_STORAGE_KEY = 'workout-app:lazy-reload-at'
export const LAZY_RELOAD_COOLDOWN_MS = 10_000

/** 直前の自動再読み込み時刻（なければ null）から、今回再読み込みしてよいかを判定する。 */
export function shouldReloadAfterImportError(
  lastReloadAt: number | null,
  now: number,
  cooldownMs: number = LAZY_RELOAD_COOLDOWN_MS,
): boolean {
  if (lastReloadAt === null || !Number.isFinite(lastReloadAt)) {
    return true
  }
  return now - lastReloadAt >= cooldownMs
}

export interface LazyReloadDeps {
  readLastReloadAt: () => number | null
  writeLastReloadAt: (at: number) => void
  reload: () => void
  now: () => number
}

function readStoredReloadAt(): number | null {
  try {
    const raw = window.sessionStorage.getItem(LAZY_RELOAD_STORAGE_KEY)
    if (raw === null) return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function writeStoredReloadAt(at: number): void {
  try {
    window.sessionStorage.setItem(LAZY_RELOAD_STORAGE_KEY, String(at))
  } catch {
    // 保存できない環境（プライベートブラウズ等）でも再読み込み自体は行う
  }
}

const browserDeps: LazyReloadDeps = {
  readLastReloadAt: readStoredReloadAt,
  writeLastReloadAt: writeStoredReloadAt,
  reload: () => window.location.reload(),
  now: () => Date.now(),
}

/**
 * React.lazy に渡す import 関数を包む。失敗したら1回だけページを再読み込みする。
 * 再読み込みする場合は、画面が切り替わるまで解決しない Promise を返す（エラー画面を出さない）。
 */
export function importWithReload<T>(importer: () => Promise<T>, deps: LazyReloadDeps = browserDeps): Promise<T> {
  return importer().catch((error: unknown) => {
    const now = deps.now()
    if (!shouldReloadAfterImportError(deps.readLastReloadAt(), now)) {
      throw error
    }
    deps.writeLastReloadAt(now)
    deps.reload()
    return new Promise<T>(() => {})
  })
}
