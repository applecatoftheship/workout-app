import { useConfirm } from '../hooks/useConfirm'
import type { OutboxEntry } from '../offline/outbox'
import './OfflineStatusBanner.css'

// オフライン記録対応（2026年10月31日）：オフライン中であること・未送信の記録の
// 件数・送信に失敗した記録を画面上部に表示する。何も伝えることが無い
// （オンラインかつ未送信0件）ときは何も表示しない。

type OfflineStatusBannerProps = {
  isOnline: boolean
  isSyncing: boolean
  pendingEntries: OutboxEntry[]
  failedEntries: OutboxEntry[]
  onRetry: () => void
  onDiscard: (entryId: string) => void
}

export function OfflineStatusBanner({
  isOnline,
  isSyncing,
  pendingEntries,
  failedEntries,
  onRetry,
  onDiscard,
}: OfflineStatusBannerProps) {
  const confirm = useConfirm()
  const pendingCount = pendingEntries.length

  if (isOnline && pendingCount === 0) {
    return null
  }

  const handleDiscard = async (entry: OutboxEntry) => {
    const confirmed = await confirm(
      `未送信の記録「${entry.label}」を破棄しますか？この記録は端末にしか無いため、破棄すると元に戻せません`,
      { confirmLabel: '破棄する', cancelLabel: 'やめる' },
    )
    if (confirmed) {
      onDiscard(entry.id)
    }
  }

  let message: string
  if (!isOnline) {
    message =
      pendingCount > 0
        ? `オフライン中・未送信 ${pendingCount}件（オンラインに戻ると自動で反映します）`
        : 'オフライン中：トレーニングと食事の新規記録は端末に保存され、オンラインに戻ると自動で反映します'
  } else if (isSyncing) {
    message = `未送信 ${pendingCount}件を反映しています…`
  } else {
    message = `未送信 ${pendingCount}件（自動で再送します）`
  }

  return (
    <div className="offline-status-banner" role="status" aria-live="polite">
      <p className="offline-status-banner__message">{message}</p>
      {isOnline && failedEntries.length > 0 ? (
        <div className="offline-status-banner__failed">
          <p className="offline-status-banner__failed-title">反映できなかった記録</p>
          <ul className="offline-status-banner__list">
            {failedEntries.map((entry) => (
              <li key={entry.id} className="offline-status-banner__item">
                <span className="offline-status-banner__label">{entry.label}</span>
                <button type="button" className="offline-status-banner__discard" onClick={() => void handleDiscard(entry)}>
                  破棄
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="offline-status-banner__retry" onClick={onRetry} disabled={isSyncing}>
            {isSyncing ? '再送信中…' : '再送信'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
