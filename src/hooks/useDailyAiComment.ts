import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { DailyCondition, DateString } from '../types'
import { toDateKey } from '../utils/calendarHelpers'
import { calculateACWR } from '../utils/acwrHelpers'
import { buildDailySummaryText } from '../utils/dailyCommentHelpers'
import { fetchTrainingLogs } from '../api/trainingLogs'
import { fetchSoccerLogs } from '../api/soccerLogs'
import { fetchWorkouts } from '../api/workouts'
import { fetchMealLogs } from '../api/mealLogs'
import { generateDailyComment } from '../api/dailyComment'

const CHRONIC_WINDOW_DAYS = 28

// AIコンディショニングアドバイザー（設定画面拡張Phase 3、2026年8月28日）：
// DailyReportModal.tsx（閲覧専用の日次レポート）とConditionForm.tsx（体調記録
// フォーム）の両方から使う共通トリガーロジック。「本日分・未生成」の場合のみ
// api/generate-daily-comment.tsを呼び出す判定と、そのための入力（ACWR・
// dailySummary）の組み立てをこのフックに集約し、2箇所での重複実装を避ける。
//
// ACWR計算に必要なtrainingLogs・soccerLogs・workoutsは、呼び出し元の画面
// （MonthlyCalendar／RecordFormModal）が保持している配列をそのまま使うと
// 表示範囲（月表示等）に限定されておりACUTE/CHRONIC計算に必要な直近28日分を
// 満たさない可能性があるため、Dashboard.tsxのACWRGaugeCard向け取得
// （acwrChronicStartKey～todayString）と同じ範囲でこのフック内で独立に
// 取得する（trainingLogs・mealLogsのみ全期間フェッチで足りるため範囲指定不要、
// 既存のfetchTrainingLogs()／fetchMealLogs()の仕様に合わせた）。
//
// 手動再生成（2026年8月28日、食事データの追加に伴う対応）：「コメント生成後に
// 別の記録が追加された場合」への対応として、自動での再生成トリガーは追加しない
// （データを記録するたびにLLM呼び出しが走るとコスト・レイテンシが予測しづらく
// なるため）。代わりにDailyReportModal.tsxから呼べるregenerate()を公開し、
// forceRegenerate:trueを付けてapi/generate-daily-comment.tsを呼び出すことで、
// ユーザーが明示的にボタンを押したときだけキャッシュを無視して再生成する。
export function useDailyAiComment(params: {
  condition: DailyCondition | undefined
  selectedDate: DateString
  dailyConditions: DailyCondition[]
  setDailyConditions: Dispatch<SetStateAction<DailyCondition[]>>
}): { isGenerating: boolean; canRegenerate: boolean; regenerate: () => void } {
  const { condition, selectedDate, dailyConditions, setDailyConditions } = params

  const now = new Date()
  const todayString = toDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const isToday = selectedDate === todayString
  const shouldGenerate = !!condition && isToday && !condition.aiComment

  const [isGenerating, setIsGenerating] = useState(shouldGenerate)
  const requestedDatesRef = useRef<Set<DateString>>(new Set())
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // 自動生成・手動再生成の両方から呼ばれる共通処理。forceがtrueの場合のみ
  // api/generate-daily-comment.ts側でキャッシュ済みai_commentを無視させる。
  const runGeneration = useCallback(
    async (force: boolean) => {
      if (!condition || !isToday) {
        return
      }

      setIsGenerating(true)

      const chronicStart = new Date(now)
      chronicStart.setDate(chronicStart.getDate() - (CHRONIC_WINDOW_DAYS - 1))
      const chronicStartKey = toDateKey(chronicStart.getFullYear(), chronicStart.getMonth() + 1, chronicStart.getDate())

      try {
        const [trainingLogs, soccerLogs, workouts, mealLogs] = await Promise.all([
          fetchTrainingLogs(),
          fetchSoccerLogs(chronicStartKey, todayString),
          fetchWorkouts(chronicStartKey, todayString),
          fetchMealLogs(),
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
        const dailySummary = buildDailySummaryText(trainingLogs, soccerLogs, workouts, mealLogs, selectedDate)

        const { aiComment } = await generateDailyComment({
          date: selectedDate,
          acwr: acwrResult?.acwr ?? null,
          acwrStatus: acwrResult?.status ?? null,
          sleepHours: condition.sleepHours,
          fatigueLevel: condition.fatigue,
          dailySummary,
          forceRegenerate: force,
        })

        if (!isMountedRef.current) {
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
        if (isMountedRef.current) {
          setIsGenerating(false)
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [condition, selectedDate, isToday, todayString, dailyConditions, setDailyConditions],
  )

  useEffect(() => {
    if (!shouldGenerate) {
      return
    }
    if (requestedDatesRef.current.has(selectedDate)) {
      return
    }
    requestedDatesRef.current.add(selectedDate)
    runGeneration(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldGenerate, selectedDate])

  const regenerate = useCallback(() => {
    if (!condition || !isToday || isGenerating) {
      return
    }
    runGeneration(true)
  }, [condition, isToday, isGenerating, runGeneration])

  return { isGenerating, canRegenerate: !!condition && isToday, regenerate }
}
