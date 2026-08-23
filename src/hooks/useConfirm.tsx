import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { ConfirmDialog } from '../components/common/ConfirmDialog'

// window.confirm()のカスタムモーダル化（2026年8月23日）：Native Dialogは
// claude-in-chromeのブラウザ自動操作をブロック・フリーズさせる問題があったため、
// ToastProvider・CelebrationProviderと同じContext+Providerパターンで置き換えた。
// window.confirmと異なり非同期（Promiseで結果を返す）ため、呼び出し側は
// `const confirmed = await confirm(message)`のようにawaitする必要がある
// （既存の削除ハンドラは全てasync関数だったため、この変更のみで対応できた）。

type ConfirmOptions = {
  confirmLabel?: string
  cancelLabel?: string
}

type PendingConfirm = {
  message: string
  confirmLabel: string
  cancelLabel: string
  resolve: (result: boolean) => void
}

type ConfirmContextValue = {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const confirm = useCallback((message: string, options?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({
        message,
        confirmLabel: options?.confirmLabel ?? '削除する',
        cancelLabel: options?.cancelLabel ?? 'キャンセル',
        resolve,
      })
    })
  }, [])

  const settle = useCallback((result: boolean) => {
    setPending((current) => {
      current?.resolve(result)
      return null
    })
  }, [])

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending ? (
        <ConfirmDialog
          message={pending.message}
          confirmLabel={pending.confirmLabel}
          cancelLabel={pending.cancelLabel}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      ) : null}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirm は ConfirmProvider の内側でのみ使用できます')
  }
  return context.confirm
}
