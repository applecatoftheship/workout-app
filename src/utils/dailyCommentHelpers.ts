import type { DateString, SoccerLog, TrainingLog, Workout } from '../types'
import { formatTrainingLogItem, toJstDateKeyFromIso } from './calendarHelpers'

// AIコンディショニングアドバイザー（設定画面拡張Phase 3、2026年8月28日）：
// api/generate-daily-comment.tsへ渡すworkoutSummary（LLMプロンプト用の
// 日本語テキスト要約）を組み立てる。DailyReportModal.tsx・ConditionForm.tsxの
// 両方から共通利用するため、既存のformatTrainingLogItem（calendarHelpers.ts、
// DailyReportModal.tsxで既に使用）をそのまま流用し、表示ロジックを重複させない。
export function buildWorkoutSummaryText(
  trainingLogs: TrainingLog[],
  soccerLogs: SoccerLog[],
  workouts: Workout[],
  date: DateString,
): string {
  const parts: string[] = []

  const dayTrainingLog = trainingLogs.find((log) => log.date === date)
  if (dayTrainingLog && dayTrainingLog.exercises.length > 0) {
    parts.push(`筋トレ: ${dayTrainingLog.exercises.map((exercise) => formatTrainingLogItem(exercise)).join('、')}`)
  }

  const soccerLog = soccerLogs.find((log) => log.date === date)
  if (soccerLog) {
    const duration = soccerLog.durationMinutes !== undefined ? `${soccerLog.durationMinutes}分` : ''
    parts.push(`サッカー: ${soccerLog.activityType}${duration ? `（${duration}）` : ''}`)
  }

  // workouts.start_timeはtimestamptzのため、DailyReportModal.tsxと同じく
  // toJstDateKeyFromIsoでJST暦日に変換してから絞り込む。is_primary=trueのみ対象
  // （acwrHelpers.calculateDailyLoadMapと同じ前提）。
  workouts
    .filter((workout) => workout.isPrimary && toJstDateKeyFromIso(workout.startTime) === date)
    .forEach((workout) => {
      parts.push(`ワークアウト: ${workout.activityType ?? 'ワークアウト'}`)
    })

  return parts.length > 0 ? parts.join(' / ') : '運動記録なし'
}
