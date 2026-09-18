import type { CSSProperties, ReactNode } from 'react'
import './Modal.css'

// 共有モーダル土台（UIブラッシュアップPhase2 Step2a、2026年9月18日）。
// NotificationModal・RecordFormModal・WeeklyACWRDetailModal・
// BulkScheduleImportModal・DailyReportModal・DishFormModal・
// FoodItemFormModal・RestTimerModalの8個で、max-width以外のオーバーレイ・
// カード土台のCSSが完全一致していたため集約した。このコンポーネント自体は
// 「常に開いている」前提で、開閉の条件分岐は呼び出し元（親のconditional
// レンダー、またはこのコンポーネントを描画する側のisOpenガード）に委ねる
// （対象8ファイルはいずれもこの方式で、RecordSheet.tsxのような常時マウント
// ＋CSSクラストグル方式は採用していなかったため、より単純なこちらを選んだ）。
type ModalProps = {
  /** role="dialog"のaria-label。各モーダルの見出しテキストと同じ値を渡す。 */
  ariaLabel: string
  /** カードのmax-width（デスクトップ）。数値はpx、文字列はそのままCSS値として使う。 */
  maxWidth: number | string
  /** 640px以下でのカードmax-width。指定がなければ全モーダル共通の32rem。
   *  RestTimerModalのみ既存の見た目に合わせ26remを渡す。 */
  mobileMaxWidth?: string
  /** 640px以下でのカードmax-height。指定がなければ全モーダル共通の80dvh。
   *  DailyReportModalのみ既存の見た目に合わせ90dvhを渡す。 */
  mobileMaxHeight?: string
  /** オーバーレイ（背景）クリック時に呼ぶ。既存実装のonCloseをそのまま渡す想定。 */
  onOverlayClick: () => void
  /** カード側に追加するクラス名（例："record-form-modal"）。
   *  モーダル固有のヘッダー・本文・フッターのCSSはこのクラスを起点に各ファイル側で定義する。 */
  className?: string
  children: ReactNode
}

export function Modal({
  ariaLabel,
  maxWidth,
  mobileMaxWidth,
  mobileMaxHeight,
  onOverlayClick,
  className,
  children,
}: ModalProps) {
  const style: CSSProperties & Record<string, string> = {
    '--modal-max-width': typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth,
  }
  if (mobileMaxWidth) {
    style['--modal-mobile-max-width'] = mobileMaxWidth
  }
  if (mobileMaxHeight) {
    style['--modal-mobile-max-height'] = mobileMaxHeight
  }

  return (
    <div className="modal__overlay" role="presentation" onClick={onOverlayClick}>
      <div
        className={className ? `modal ${className}` : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        style={style}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
