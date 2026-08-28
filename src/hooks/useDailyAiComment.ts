import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { DailyCondition, DateString } from '../types'
import { toDateKey } from '../utils/calendarHelpers'
import { calculateACWR } from '../utils/acwrHelpers'
import { buildWorkoutSummaryText } from '../utils/dailyCommentHelpers'
import { fetchTrainingLogs } from '../api/trainingLogs'
import { fetchSoccerLogs } from '../api/soccerLogs'
import { fetchWorkouts } from '../api/workouts'
import { generateDailyComment } from '../api/dailyComment'

const CHRONIC_WINDOW_DAYS = 28

// AIコンディショニングアドバイザー（設定画面拡張Phase 3、2026年8月28日）：
// DailyReportModal.tsx（閲覧専用の日次レポート）とConditionForm.tsx（体調記録
// フォーム）の両方から使う共通トリガーロジック。「本日分・未生成」の場合のみ
// api/generate-daily-comment.tsを呼び出す判定と、そのための入力（ACWR・
// workoutSummary）の組み立てをこのフックに集約し、2箇所での重複実装を避ける。
//
// ACWR計算に必要なtrainingLogs・soccerLogs・workoutsは、呼び出し元の画面
// （MonthlyCalendar／RecordFormModal）が保持している配列をそのまま使うと
// 表示範囲（月表示等）に限定されておりACUTE/CHRONIC計算に必要な直近28日分を
// 満たさない可能性があるため、Dashboard.tsxのACWRGaugeCard向け取得
// （acwrChronicStartKey～todayString）と同じ範囲でこのフック内で独立に
// 取得する（trainingLogsのみ全期間フェッチで足りるため範囲指定不要、
// 既存のfetchTrainingLogs()の仕様に合わせた）。
export function useDailyAiComment(params: {
  condition: DailyCondition | undefined
  selectedDate: DateString
  dailyConditions: DailyCondition[]
  setDailyConditions: Dispatch<SetStateAction<DailyCondition[]>>
}): { isGenerating: boolean } {
  const { condition, selectedDate, dailyConditions, setDailyConditions } = params

  const now = new Date()
  const todayString = toDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const shouldGenerate = !!condition && selectedDate === todayString && !condition.aiComment

  const [isGenerating, setIsGenerating] = useState(shouldGenerate)
  const requestedDatesRef = useRef<Set<DateString>>(new Set())

  useEffect(() => {
    if (!condition || selectedDate !== todayString || condition.aiComment) {
      return
    }
    if (requestedDatesRef.current.has(selectedDate)) {
      return
    }
    requestedDatesRef.current.add(selectedDate)

    let cancelled = false
    setIsGenerating(true)

    const chronicStart = new Date(now)
    chronicStart.setDate(chronicStart.getDate() - (CHRONIC_WINDOW_DAYS - 1))
    const chronicStartKey = toDateKey(chronicStart.getFullYear(), chronicStart.getMonth() + 1, chronicStart.getDate())

    ;(async () => {
      try {
        const [trainingLogs, soccerLogs, workouts] = await Promise.all([
          fetchTrainingLogs(),
          fetchSoccerLogs(chronicStartKey, todayString),
          fetchWorkouts(chronicStartKey, todayString),
        ])

        const acwrResult = calculateACWR(
          trainingLogs,
          soccerLogs,
          selectedDate,
          condition.muscleSorenessLevel,
          condition.muscleSorenessLocation,
          workouts,
          dailyConditions,
        )
        const workoutSummary = buildWorkoutSummaryText(trainingLogs, soccerLogs, workouts, selectedDate)

        const { aiComment } = await generateDailyComment({
          date: selectedDate,
          acwr: acwrResult?.acwr ?? null,
          acwrStatus: acwrResult?.status ?? null,
          sleepHours: condition.sleepHours,
          fatigueLevel: condition.fatigue,
          workoutSummary,
        })

        if (cancelled) {
          return
        }
        if (aiComment) {
          setDailyConditions((current) =>
            current.map((item) => (item.date === selectedDate ? { ...item, aiComment } : item)),
          )
        }
      } catch (error) {
        console.error('AIコンディショニングコメントの生成に失敗しました', error)
      } finally {
        if (!cancelled) {
          setIsGenerating(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condition, selectedDate, todayString])

  return { isGenerating }
}
