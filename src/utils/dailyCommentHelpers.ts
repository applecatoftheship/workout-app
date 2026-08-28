import type { DateString, MealLog, SoccerLog, TrainingLog, Workout } from '../types'
import { formatTrainingLogItem, toJstDateKeyFromIso } from './calendarHelpers'

// AIコメント生成タイミング見直し（2026年8月29日）：自動生成トリガー廃止に伴い、
// 「本日分はまだ生成されていない（cronが翌日05:00 JSTに実行するため）」を案内する
// プレースホルダー文言。ConditionForm.tsx・DailyReportModal.tsxの両方で表示文言を
// 統一するため、ここに定数として集約する（AiCommentCard.tsxのplaceholderText prop
// へ渡す形で使う）。
export const AI_COMMENT_PENDING_TEXT = 'AIコメントは翌日の朝に生成されます'

// AIコンディショニングアドバイザー（設定画面拡張Phase 3、2026年8月28日。
// 食事データの追加により2026年8月28日にbuildWorkoutSummaryTextから改名・拡張）：
// api/generate-daily-comment.tsへ渡すdailySummary（LLMプロンプト用の
// 日本語テキスト要約）を組み立てる。DailyReportModal.tsx・ConditionForm.tsxの
// 両方から共通利用するため、既存のformatTrainingLogItem（calendarHelpers.ts、
// DailyReportModal.tsxで既に使用）をそのまま流用し、表示ロジックを重複させない。
// 食事の合計値も、CalendarDaySummaries.tsxのMealSummary・DailyReportModal.tsxの
// mealTotalsと同じ集計パターン（reduceでcalories/protein/fat/carbohydratesを
// 合算）を踏襲する。個々の食品名は羅列せず合計のみとし、プロンプトの
// データ量を抑える（食品名の内訳が必要なほど詳細なアドバイスは想定していない）。
export function buildDailySummaryText(
  trainingLogs: TrainingLog[],
  soccerLogs: SoccerLog[],
  workouts: Workout[],
  mealLogs: MealLog[],
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

  const dayMealLogs = mealLogs.filter((log) => log.date === date)
  if (dayMealLogs.length > 0) {
    const mealTotals = dayMealLogs.reduce(
      (acc, log) => ({
        calories: acc.calories + log.calories,
        protein: acc.protein + log.protein,
        fat: acc.fat + log.fat,
        carbohydrates: acc.carbohydrates + log.carbohydrates,
      }),
      { calories: 0, protein: 0, fat: 0, carbohydrates: 0 },
    )
    parts.push(
      `食事: 合計${mealTotals.calories}kcal（P${mealTotals.protein}g F${mealTotals.fat}g C${mealTotals.carbohydrates}g、${dayMealLogs.length}件）`,
    )
  }

  return parts.length > 0 ? parts.join(' / ') : '運動・食事の記録なし'
}
