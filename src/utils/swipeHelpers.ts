// 記録リストのスワイプ操作化（2026年10月31日）：
// SwipeableRow（components/common/SwipeableRow.tsx）のジェスチャー判定のうち、
// DOMに依存しない純粋ロジックをここに切り出す（ユニットテスト対象）。

/** ドラッグ開始からこの距離（px）動くまでは方向を確定させない。 */
export const SWIPE_DIRECTION_LOCK_THRESHOLD = 8

/** 指を離した時点で、アクション領域幅のこの割合以上開いていれば「開く」に確定する。 */
export const SWIPE_OPEN_RATIO = 0.4

export type SwipeDirectionLock = 'horizontal' | 'vertical' | null

/**
 * ドラッグ開始点からの移動量で、横スワイプか縦スクロールかを判定する。
 * しきい値未満の間は null（未確定）を返す。横移動量が縦移動量より大きい場合のみ
 * horizontal とし、同値・縦優勢はスクロールに委ねるため vertical とする。
 */
export function resolveDirectionLock(
  dx: number,
  dy: number,
  threshold: number = SWIPE_DIRECTION_LOCK_THRESHOLD,
): SwipeDirectionLock {
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)
  if (absX < threshold && absY < threshold) {
    return null
  }
  return absX > absY ? 'horizontal' : 'vertical'
}

/**
 * ドラッグ中のコンテンツの横オフセット（px、左方向が負）を計算する。
 * 開いた状態（-actionsWidth）を起点にドラッグを再開できるよう startOffset を受け取り、
 * 結果は [-actionsWidth, 0] にクランプする（右方向へのはみ出し・アクション幅を
 * 超える引き出しはさせない＝フルスワイプ削除は存在しない）。
 */
export function clampSwipeOffset(startOffset: number, dx: number, actionsWidth: number): number {
  const width = Math.max(0, actionsWidth)
  if (width === 0) {
    return 0
  }
  const next = startOffset + dx
  if (next > 0) {
    return 0
  }
  if (next < -width) {
    return -width
  }
  return next
}

/** 指を離した時点のオフセットから、開いた状態で止めるかどうかを決める。 */
export function shouldOpenOnRelease(offset: number, actionsWidth: number, ratio: number = SWIPE_OPEN_RATIO): boolean {
  if (actionsWidth <= 0) {
    return false
  }
  return -offset >= actionsWidth * ratio
}
