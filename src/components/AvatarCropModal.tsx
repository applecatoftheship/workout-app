import { useState } from 'react'
import type { Area } from 'react-easy-crop'
import Cropper from 'react-easy-crop'
import { CloseIcon } from './icons'
import { getCroppedImageBlob } from '../utils/cropImage'
import './AvatarCropModal.css'

type AvatarCropModalProps = {
  imageSrc: string
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}

export function AvatarCropModal({ imageSrc, onCancel, onConfirm }: AvatarCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleConfirm = async () => {
    if (!croppedAreaPixels) {
      return
    }
    setIsProcessing(true)
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels)
      onConfirm(blob)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="avatar-crop-modal__overlay" role="presentation" onClick={onCancel}>
      <div
        className="avatar-crop-modal"
        role="dialog"
        aria-modal="true"
        aria-label="アイコンを調整"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="avatar-crop-modal__header">
          <h3>アイコンを調整</h3>
          <button type="button" className="avatar-crop-modal__close" onClick={onCancel} aria-label="閉じる">
            <CloseIcon />
          </button>
        </div>

        <div className="avatar-crop-modal__body">
          <div className="avatar-crop-modal__cropper">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
            />
          </div>
          <input
            type="range"
            className="avatar-crop-modal__zoom-slider"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            aria-label="ズーム"
          />
        </div>

        <div className="avatar-crop-modal__actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={isProcessing}>
            キャンセル
          </button>
          <button type="button" className="btn-primary" onClick={() => void handleConfirm()} disabled={isProcessing}>
            {isProcessing ? '処理中...' : '適用'}
          </button>
        </div>
      </div>
    </div>
  )
}
