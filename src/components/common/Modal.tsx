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
  /** オーバーレイのalign-items（デスクトップ側、640px以下では後述のmobileFullscreen
   *  が優先される）。省略時'start'＝flex-start（Step2a移行8ファイルと同じ）。
   *  'center'指定でConfirmDialog・AvatarCropModalのような中央寄せダイアログに対応する。 */
  align?: 'start' | 'center'
  /** オーバーレイのz-index。省略時100（Step2a移行8ファイルと同じ）。
   *  ConfirmDialogは既存の200を維持するため指定する。 */
  zIndex?: number
  /** trueの場合、カード側のmax-height: calc(100vh - 48px)（640px以下では既定の
   *  80dvh相当）を適用しない。AvatarCropModalは元々max-height指定を持たない
   *  ダイアログのため、この場合に指定する。 */
  disableMaxHeight?: boolean
  /** 640px以下でのフルスクリーン化（余白ゼロ・角丸拡大・オーバーレイ引き伸ばし）を
   *  行うかどうか。省略時true＝Step2a移行8ファイル・AvatarCropModalと同じ。
   *  ConfirmDialogはモバイルでもフルスクリーン化せず既存の中央寄せ小型ダイアログの
   *  ままにするため、falseを渡す。 */
  mobileFullscreen?: boolean
  /** カードのrole。省略時'dialog'（Step2a移行8ファイルと同じ）。
   *  ConfirmDialogは既存の'alertdialog'（確認・警告の割り込み操作であることを
   *  支援技術に伝える意味的な違いがあるため）を維持する。 */
  role?: 'dialog' | 'alertdialog'
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
  align,
  zIndex,
  disableMaxHeight,
  mobileFullscreen,
  role,
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
  if (disableMaxHeight) {
    style['--modal-max-height'] = 'none'
    style['--modal-mobile-max-height'] = 'none'
  }
  if (mobileMaxHeight) {
    style['--modal-mobile-max-height'] = mobileMaxHeight
  }
  if (align === 'center') {
    style['--modal-align-items'] = 'center'
  }
  if (zIndex !== undefined) {
    style['--modal-z-index'] = String(zIndex)
  }

  const overlayClassName =
    mobileFullscreen === false ? 'modal__overlay modal__overlay--no-mobile-fullscreen' : 'modal__overlay'

  return (
    <div className={overlayClassName} role="presentation" onClick={onOverlayClick} style={style}>
      <div
        className={className ? `modal ${className}` : 'modal'}
        role={role ?? 'dialog'}
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
