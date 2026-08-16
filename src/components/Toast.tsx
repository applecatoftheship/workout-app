import './Toast.css'
import type { ToastVariant } from '../hooks/useToast'

type ToastProps = {
  message: string
  variant: ToastVariant
  onDismiss: () => void
}

export function Toast({ message, variant, onDismiss }: ToastProps) {
  return (
    <div className={`toast toast--${variant}`} role="status" onClick={onDismiss}>
      {message}
    </div>
  )
}
