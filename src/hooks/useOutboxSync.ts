import { useCallback, useEffect, useRef, useState } from 'react'
import { readOutbox, removeOutboxEntry, subscribeOutbox } from '../offline/outbox'
import type { OutboxEntry } from '../offline/outbox'
import { flushOutbox } from '../offline/syncOutbox'
import type { FlushResult } from '../offline/syncOutbox'
import { getNavigatorOnline } from '../utils/networkErrors'

// オフライン記録対応（2026年10月31日）：未送信の記録（アウトボックス）の自動送信。
// 送信のきっかけ：ログイン状態の確定時／オンライン復帰（online イベント）／
// アプリが前面に戻った時（visibilitychange）／未送信がある間は1分ごと。

const RETRY_INTERVAL_MS = 60_000

type UseOutboxSyncOptions = {
  /** ログイン中のユーザーID（未ログインなら null。送信も件数表示もしない） */
  userId: string | null
  /** 1件以上送信できたときに呼ばれる（一覧の再取得・通知用） */
  onSynced: (result: FlushResult) => void
}

export function useOutboxSync({ userId, onSynced }: UseOutboxSyncOptions) {
  const [entries, setEntries] = useState<OutboxEntry[]>(() => readOutbox())
  const [isOnline, setIsOnline] = useState<boolean>(() => getNavigatorOnline())
  const [isSyncing, setIsSyncing] = useState(false)
  const onSyncedRef = useRef(onSynced)
  onSyncedRef.current = onSynced

  useEffect(() => subscribeOutbox(setEntries), [])

  const sync = useCallback(async () => {
    if (!userId || !getNavigatorOnline()) {
      return
    }
    if (!readOutbox().some((entry) => entry.userId === userId)) {
      return
    }
    setIsSyncing(true)
    try {
      const result = await flushOutbox()
      if (result.synced.length > 0) {
        onSyncedRef.current(result)
      }
    } finally {
      setIsSyncing(false)
      setEntries(readOutbox())
    }
  }, [userId])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      void sync()
    }
    const handleOffline = () => setIsOnline(false)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setIsOnline(getNavigatorOnline())
        void sync()
      }
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibility)
    void sync()
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [sync])

  const myEntries = userId ? entries.filter((entry) => entry.userId === userId) : []
  const hasPending = myEntries.length > 0

  // 「オンラインだが通信できない」（電波が弱い等）で端末保存された記録の再送用。
  useEffect(() => {
    if (!hasPending || !isOnline) {
      return
    }
    const timer = window.setInterval(() => {
      void sync()
    }, RETRY_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [hasPending, isOnline, sync])

  /** 利用者の明示操作で1件を破棄する（呼び出し側で必ず確認ダイアログを出すこと）。 */
  const discard = useCallback((entryId: string) => {
    removeOutboxEntry(entryId)
  }, [])

  return {
    isOnline,
    isSyncing,
    pendingEntries: myEntries,
    failedEntries: myEntries.filter((entry) => !!entry.lastError),
    retry: sync,
    discard,
  }
}
