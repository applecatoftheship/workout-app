import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { clampSwipeOffset, resolveDirectionLock, shouldOpenOnRelease } from '../../utils/swipeHelpers'
import type { SwipeDirectionLock } from '../../utils/swipeHelpers'
import './SwipeableRow.css'

// 記録リストのスワイプ操作化（2026年10月31日）：
// トレーニング記録・食事記録のカードに常時表示していた「編集」「削除」ボタンを撤去し、
// カードを左へスワイプすると右端にアクションボタンが現れて固定される方式にした
// （iOSのメールアプリ等と同様）。スワイプ距離だけで削除が発火する「フルスワイプ削除」は
// 誤操作防止のため実装しない（削除は必ずボタンのタップ→既存のuseConfirm確認を経る）。
//
// - 入力はPointer Events（タッチ・マウスドラッグ両対応）。新規ライブラリは使わない
// - コンテンツ側に touch-action: pan-y を指定し、縦スクロールはブラウザに委ねる。
//   ドラッグ開始後の移動方向は utils/swipeHelpers.ts の resolveDirectionLock で判定
// - 同時に開けるのは1行のみ（モジュール内の closeActiveRow で管理）。リスト外のタップ・
//   スクロール・右方向スワイプ・開いたカード本体のタップで閉じる
// - キーボード操作：アクションボタンにフォーカスが入ると行を開く（Tabで到達可能）

export type SwipeAction = {
  key: string
  label: string
  tone: 'accent' | 'danger'
  onClick: () => void
}

type SwipeableRowProps = {
  actions: SwipeAction[]
  children: ReactNode
}

type GestureState = {
  pointerId: number
  startX: number
  startY: number
  startOffset: number
  actionsWidth: number
  lock: SwipeDirectionLock
}

// 同時に開けるのは1行のみ：新しく開いた（またはスワイプを始めた）行が、
// 直前に開いていた行の close を呼ぶ。
let closeActiveRow: (() => void) | null = null

export function SwipeableRow({ actions, children }: SwipeableRowProps) {
  const [offset, setOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<GestureState | null>(null)
  const suppressClickRef = useRef(false)
  const isOpen = offset !== 0 && !isDragging

  const close = useCallback(() => {
    setOffset(0)
    setIsDragging(false)
    gestureRef.current = null
    if (closeActiveRow === close) {
      closeActiveRow = null
    }
  }, [])

  const claimActive = useCallback(() => {
    if (closeActiveRow && closeActiveRow !== close) {
      closeActiveRow()
    }
    closeActiveRow = close
  }, [close])

  const open = useCallback(() => {
    claimActive()
    setOffset(-(actionsRef.current?.offsetWidth ?? 0))
  }, [claimActive])

  // アンマウント時に「開いている行」の参照を残さない。
  useEffect(() => {
    return () => {
      if (closeActiveRow === close) {
        closeActiveRow = null
      }
    }
  }, [close])

  // 開いている間だけ、リスト外のタップとスクロールで閉じる。
  useEffect(() => {
    if (!isOpen) {
      return
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && event.target instanceof Node && rootRef.current.contains(event.target)) {
        return
      }
      close()
    }
    const handleScroll = () => close()
    document.addEventListener('pointerdown', handlePointerDown, true)
    // scrollイベントはバブリングしないため、captureでモーダル内等のスクロールも拾う。
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [isOpen, close])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: offset,
      actionsWidth: actionsRef.current?.offsetWidth ?? 0,
      lock: null,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return
    }
    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY

    if (gesture.lock === null) {
      gesture.lock = resolveDirectionLock(dx, dy)
      if (gesture.lock === 'vertical') {
        // 縦スクロールと判定：この操作ではスワイプしない。
        gestureRef.current = null
        return
      }
      if (gesture.lock === 'horizontal') {
        event.currentTarget.setPointerCapture(event.pointerId)
        claimActive()
        setIsDragging(true)
      }
    }

    if (gesture.lock === 'horizontal') {
      setOffset(clampSwipeOffset(gesture.startOffset, dx, gesture.actionsWidth))
    }
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return
    }
    gestureRef.current = null

    if (gesture.lock === 'horizontal') {
      // ドラッグ直後に発火するclickでカード内の要素が反応しないようにする。
      suppressClickRef.current = true
      setIsDragging(false)
      const dx = event.clientX - gesture.startX
      const releasedOffset = clampSwipeOffset(gesture.startOffset, dx, gesture.actionsWidth)
      if (shouldOpenOnRelease(releasedOffset, gesture.actionsWidth)) {
        setOffset(-gesture.actionsWidth)
      } else {
        close()
      }
      return
    }

    // 開いた状態でカード本体をタップした場合は閉じる（タップ先の要素は反応させない）。
    if (gesture.lock === null && gesture.startOffset !== 0) {
      suppressClickRef.current = true
      close()
    }
  }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return
    }
    gestureRef.current = null
    setIsDragging(false)
    if (gesture.startOffset === 0) {
      close()
    } else {
      setOffset(gesture.startOffset)
    }
  }

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const contentClassName = ['swipeable-row__content', isDragging ? 'swipeable-row__content--dragging' : '']
    .filter(Boolean)
    .join(' ')
  const rootClassName = ['swipeable-row', offset !== 0 || isDragging ? 'swipeable-row--revealed' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={rootRef} className={rootClassName}>
      <div ref={actionsRef} className="swipeable-row__actions">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className={`swipeable-row__action swipeable-row__action--${action.tone}`}
            onFocus={() => {
              if (!isOpen) {
                open()
              }
            }}
            onClick={() => {
              close()
              action.onClick()
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
      <div
        className={contentClassName}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClickCapture={handleClickCapture}
      >
        {children}
      </div>
    </div>
  )
}

/** スワイプ操作の存在を知らせる控えめなヒント（リストの直上に1つだけ置く）。 */
export function SwipeHint() {
  return <p className="swipeable-row-hint">← 左にスワイプで編集・削除</p>
}
