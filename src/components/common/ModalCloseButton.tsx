import { CloseIcon } from '../icons'
import './ModalCloseButton.css'

// 共有の閉じるボタン（UIブラッシュアップPhase2 Step2a、2026年9月18日）。
// 従来はSVGアイコン版（6ファイル）と文字「×」版（3ファイル）の2サブパターンが
// 並存していたが、SVGアイコン版に統一する。aria-labelは全ファイルで
// 「閉じる」に統一されていたため固定文言にしている。
type ModalCloseButtonProps = {
  onClick: () => void
}

export function ModalCloseButton({ onClick }: ModalCloseButtonProps) {
  return (
    <button type="button" className="modal-close-button" onClick={onClick} aria-label="閉じる">
      <CloseIcon />
    </button>
  )
}
