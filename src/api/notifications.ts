import { supabase } from './client'
import { getDeviceId } from '../utils/deviceId'
import type { AppNotification, NotificationType } from '../types'

type NotificationRow = {
  id: string
  device_id: string
  type: string
  title: string
  message: string
  is_read: boolean
  created_at: string
}

function rowToNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    deviceId: row.device_id,
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    isRead: row.is_read,
    createdAt: row.created_at as AppNotification['createdAt'],
  }
}

// notifications.device_idはRLSでも自端末分のみに制限されるが（supabase/migrations/
// 20260824000000_push_notifications.sql参照）、他テーブルと同じくアプリ側でも
// 明示的にdevice_idで絞り込む（防御的な二重チェック）。
export async function fetchNotifications(): Promise<AppNotification[]> {
  const deviceId = getDeviceId()
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data as NotificationRow[]).map(rowToNotification)
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id)

  if (error) {
    throw error
  }
}
