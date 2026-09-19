import { Modal } from './Modal'
import './ConfirmDialog.css'

// 既存モーダル（RecordFormModal・RestTimerModal等）はタイトルバー＋X閉じるボタンを
// 持つが、確認ダイアログは「キャンセル/削除する」の2択ボタン自体が明確な操作導線に
// なるため、タイトルバーは持たずメッセージ＋ボタン2つのみの軽量な構成にした（判断理由）。
type ConfirmDialogProps = {
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ message, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal
      ariaLabel={message}
      maxWidth={360}
      align="center"
      zIndex={200}
      mobileFullscreen={false}
      overlayPadding="24px 16px"
      role="alertdialog"
      onOverlayClick={onCancel}
      className="confirm-dialog"
    >
      <p className="confirm-dialog__message">{message}</p>
      <div className="confirm-dialog__actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="btn-danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
