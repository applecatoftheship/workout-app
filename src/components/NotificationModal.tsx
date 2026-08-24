import { CloseIcon } from './icons'
import type { AppNotification } from '../types'
import './NotificationModal.css'

// プッシュ通知機能 Phase 1b（2026年8月24日）。通知の一覧表示・既読化のみを行う
// 読み取り中心のモーダル（DailyReportModal.tsxと同じ構造パターンを踏襲）。

const TYPE_TONE: Record<AppNotification['type'], 'danger' | 'warning'> = {
  acwr_danger: 'danger',
  streak_broken: 'warning',
}

function formatNotificationTime(createdAt: string) {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) {
    return createdAt
  }
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

type NotificationModalProps = {
  notifications: AppNotification[]
  onMarkRead: (id: string) => void
  onClose: () => void
}

export function NotificationModal({ notifications, onMarkRead, onClose }: NotificationModalProps) {
  return (
    <div className="notification-modal__overlay" role="presentation" onClick={onClose}>
      <div
        className="notification-modal"
        role="dialog"
        aria-modal="true"
        aria-label="通知"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="notification-modal__header">
          <h3>通知</h3>
          <button type="button" className="notification-modal__close" onClick={onClose} aria-label="閉じる">
            <CloseIcon />
          </button>
        </div>

        <div className="notification-modal__body">
          {notifications.length === 0 ? (
            <p className="notification-modal__empty">通知はありません</p>
          ) : (
            <div className="notification-modal__list">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={`notification-modal__item notification-modal__item--${TYPE_TONE[notification.type]}${
                    notification.isRead ? '' : ' notification-modal__item--unread'
                  }`}
                  onClick={() => {
                    if (!notification.isRead && notification.id) {
                      onMarkRead(notification.id)
                    }
                  }}
                >
                  <div className="notification-modal__item-head">
                    <span className="notification-modal__item-title">{notification.title}</span>
                    <span className="notification-modal__item-time">
                      {notification.createdAt ? formatNotificationTime(notification.createdAt) : ''}
                    </span>
                  </div>
                  <p className="notification-modal__item-message">{notification.message}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
