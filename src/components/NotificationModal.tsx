import { CloseIcon } from './icons'
import type { AppNotification } from '../types'
import './NotificationModal.css'

// プッシュ通知機能 Phase 1b（2026年8月24日）。通知の一覧表示・既読化のみを行う
// 読み取り中心のモーダル（DailyReportModal.tsxと同じ構造パターンを踏襲）。

// 週次ACWRインサイト機能（2026年8月25日）：weekly_acwr_reportは実装指示書の
// 5区分（最適〜危険）のいずれの重症度でも同一のNotificationType値で送信される
// ため、acwr_danger/streak_brokenのような「型＝常に警戒色」という前提が成立しない
// （AppNotificationはtier別の値を保持していないため、DB上のtypeだけでは区別できない）。
// 誤って常時danger/warning色にすると好調な週次レポートまで警告色になってしまうため、
// 中立トーン（info）を新設した。
const TYPE_TONE: Record<AppNotification['type'], 'danger' | 'warning' | 'info'> = {
  acwr_danger: 'danger',
  streak_broken: 'warning',
  weekly_acwr_report: 'info',
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
