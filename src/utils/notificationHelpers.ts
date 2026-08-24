// プッシュ通知機能 Phase 1b（2026年8月24日）：通知の生成要否・内容を判定する
// 純粋関数群。api/send-reminder.ts（Vercel Cron、1日1回）から呼び出される想定。
// DBアクセス・push送信自体はここでは行わない（既存のacwrHelpers.ts・
// streakHelpers.tsと同じく、判定ロジックのみを担当する層として分離）。
import { calculateACWR } from './acwrHelpers.js'
import { calculateCurrentStreak } from './streakHelpers.js'
import type { DailyCondition, DateString, MealLog, NotificationType, SoccerLog, TrainingLog } from '../types.js'

export type NotificationCandidate = {
  type: NotificationType
  title: string
  message: string
}

type ExistingNotificationLike = {
  type: string
  createdAt: string
}

function toDateOnly(isoOrDate: string): string {
  return isoOrDate.slice(0, 10)
}

// 本日（targetDate）すでに同タイプの通知が存在する場合は新規作成しない
// （1日に同じ内容の通知を何度も送らないための重複防止）。
export function shouldCreateNotification(
  existingNotifications: ExistingNotificationLike[],
  newType: NotificationType,
  targetDate: DateString,
): boolean {
  const alreadyExists = existingNotifications.some(
    (notification) => notification.type === newType && toDateOnly(notification.createdAt) === targetDate,
  )
  return !alreadyExists
}

function previousDateString(date: DateString): DateString {
  const cursor = new Date(`${date}T00:00:00`)
  cursor.setDate(cursor.getDate() - 1)
  const year = cursor.getFullYear()
  const month = String(cursor.getMonth() + 1).padStart(2, '0')
  const day = String(cursor.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}` as DateString
}

// ACWR（急性:慢性負荷比）が1.5を超えている場合に警戒通知の候補を返す。
// acwrHelpers.tsのcalculateACWRをそのまま再利用し、判定式自体は複製しない
// （4段階ステータスのうち'danger'は他の条件でも成立するため、ここでは
// タスク指定通り「acwr > 1.5」を直接判定する）。
export function detectAcwrDangerNotification(
  trainingLogs: TrainingLog[],
  soccerLogs: SoccerLog[],
  targetDate: DateString,
  todaySorenessLevel: DailyCondition['muscleSorenessLevel'],
  todaySorenessLocation: DailyCondition['muscleSorenessLocation'],
): NotificationCandidate | null {
  const result = calculateACWR(trainingLogs, soccerLogs, targetDate, todaySorenessLevel, todaySorenessLocation)
  if (!result || result.acwr <= 1.5) {
    return null
  }

  return {
    type: 'acwr_danger',
    title: '急性負荷が急増しています',
    message: `ACWRが${result.acwr.toFixed(2)}です。怪我リスクが高まっているため、今日は負荷を抑えることを検討してください。`,
  }
}

// 「昨日まで継続していた記録のストリークが、今日はまだ記録が無く途切れている」
// 状態を検知する。streakHelpers.tsのcalculateCurrentStreakを、targetDateと
// その前日の2時点でそれぞれ呼び出して比較する（ロジック自体は複製しない）。
export function detectStreakBrokenNotification(
  trainingLogs: TrainingLog[],
  soccerLogs: SoccerLog[],
  mealLogs: MealLog[],
  dailyConditions: DailyCondition[],
  targetDate: DateString,
): NotificationCandidate | null {
  const targetDay = new Date(`${targetDate}T00:00:00`)
  const yesterday = previousDateString(targetDate)
  const yesterdayDay = new Date(`${yesterday}T00:00:00`)

  const streakYesterday = calculateCurrentStreak(trainingLogs, soccerLogs, mealLogs, dailyConditions, yesterdayDay)
  const streakToday = calculateCurrentStreak(trainingLogs, soccerLogs, mealLogs, dailyConditions, targetDay)

  if (streakYesterday <= 0 || streakToday > 0) {
    return null
  }

  return {
    type: 'streak_broken',
    title: '記録の連続日数が途切れそうです',
    message: `${streakYesterday}日間続いていた記録が今日はまだありません。トレーニング・食事・体調のいずれかを記録して連続記録を継続しましょう。`,
  }
}
