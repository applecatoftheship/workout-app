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

// AIコンディショニングアドバイザー（設定画面拡張Phase 3、2026年8月28日。
// 2026年8月29日、AIコメント生成タイミング見直しに伴い全面改訂）：
// DailyReportModal.tsx（閲覧専用の日次レポート）とConditionForm.tsx（体調記録
// フォーム）の両方から使う共通の手動再生成ロジック。
//
// 【2026年8月29日の変更】従来ここにあった「本日・未生成なら自動でLLM呼び出しを
// トリガーする」useEffectを廃止した。記録が出揃う前（トレーニング・食事等が
// 未入力の段階）で生成されてしまう問題への対応。通常の自動生成は
// api/generate-daily-comments.ts（cron、毎日05:00 JST、前日分を対象）が担うため、
// このフックは「ユーザーが🔄ボタンを押したときだけ」api/generate-daily-comment.ts
// を呼び出す。
//
// 併せて、対象日をisToday（当日）に限定していた制限も撤廃した。cronによる
// 前日分の自動生成が何らかの理由（Gemini APIエラー等）で失敗した場合、この
// 手動再生成が唯一のフォールバック手段となるため、過去日でも動作する必要が
// ある（2026年8月29日、当初「過去日を含め手動再生成できる」という想定運用と
// 実装が食い違っていたことが判明したための修正）。慢性負荷ウィンドウ
// （ACWR計算用の直近28日分の取得範囲）も、従来の「今日」基準から
// 「regenerate対象のselectedDate」基準に変更した（過去日を再生成する際に
// 正しい期間のデータを参照するため）。
export function useDailyAiComment(params: {
  condition: DailyCondition | undefined
  selectedDate: DateString
  dailyConditions: DailyCondition[]
  setDailyConditions: Dispatch<SetStateAction<DailyCondition[]>>
}): { isGenerating: boolean; canRegenerate: boolean; regenerate: () => void } {
  const { condition, selectedDate, dailyConditions, setDailyConditions } = params

  const [isGenerating, setIsGenerating] = useState(false)
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const runGeneration = useCallback(
    async (force: boolean) => {
      if (!condition) {
        return
      }

      setIsGenerating(true)

      // 慢性負荷ウィンドウはselectedDate基準（selectedDate - 27日 〜 selectedDate）。
      const selectedDateObj = new Date(`${selectedDate}T00:00:00`)
      const chronicStart = new Date(selectedDateObj)
      chronicStart.setDate(chronicStart.getDate() - (CHRONIC_WINDOW_DAYS - 1))
      const chronicStartKey = toDateKey(chronicStart.getFullYear(), chronicStart.getMonth() + 1, chronicStart.getDate())

      try {
        const [trainingLogs, soccerLogs, workouts, mealLogs] = await Promise.all([
          fetchTrainingLogs(),
          fetchSoccerLogs(chronicStartKey, selectedDate),
          fetchWorkouts(chronicStartKey, selectedDate),
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
    [condition, selectedDate, dailyConditions, setDailyConditions],
  )

  const regenerate = useCallback(() => {
    if (!condition || isGenerating) {
      return
    }
    runGeneration(true)
  }, [condition, isGenerating, runGeneration])

  return { isGenerating, canRegenerate: !!condition, regenerate }
}
