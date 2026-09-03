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
import { fetchDailyConditions } from '../api/dailyConditions'
import { generateDailyComment } from '../api/dailyComment'

const CHRONIC_WINDOW_DAYS = 28

// AIコンディショニングアドバイザー（設定画面拡張Phase 3、2026年8月28日。
// 2026年8月29日、AIコメント生成タイミング見直しに伴い全面改訂。
// 2026年9月3日、体調記録なしでも生成できるよう改訂）：
// DailyReportModal.tsx（閲覧専用の日次レポート）から使う手動生成ロジック。
//
// 【2026年8月29日の変更】従来ここにあった「本日・未生成なら自動でLLM呼び出しを
// トリガーする」useEffectを廃止した。記録が出揃う前（トレーニング・食事等が
// 未入力の段階）で生成されてしまう問題への対応。通常の自動生成は
// api/generate-daily-comments.ts（cron、毎日05:00 JST、前日分を対象）が担う。
//
// 【2026年9月3日の変更】従来は「体調記録（daily_conditions行）が存在しないと
// 生成ボタンを押せない」制約があったが、AI日次コメントは運動・食事の記録から
// でも有用なため、conditionが無くても生成できるようにした。conditionの各値は
// デフォルト（睡眠0h・疲労度3・局所疲労なし）で補う。サーバー側
// （api/generate-daily-comment.ts）は onConflict:'user_id,log_date' の部分列
// upsert のため、行が無ければ ai_comment だけを持つ行を新規作成する。この場合
// ローカルstateには該当日の行が無いため、生成成功後に fetchDailyConditions で
// 取り直す（行が既にあれば従来通り map で ai_comment のみ差し替える）。
//
// 慢性負荷ウィンドウ（ACWR計算用の直近28日分の取得範囲）は
// regenerate対象のselectedDate基準（selectedDate - 27日 〜 selectedDate）。
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
      setIsGenerating(true)

      // 慢性負荷ウィンドウはselectedDate基準（selectedDate - 27日 〜 selectedDate）。
      const selectedDateObj = new Date(`${selectedDate}T00:00:00`)
      const chronicStart = new Date(selectedDateObj)
      chronicStart.setDate(chronicStart.getDate() - (CHRONIC_WINDOW_DAYS - 1))
      const chronicStartKey = toDateKey(chronicStart.getFullYear(), chronicStart.getMonth() + 1, chronicStart.getDate())

      // 体調記録が無い日でも生成できるようにするためのデフォルト値
      // （src/api/dailyConditions.ts の rowToDailyCondition と同じ既定：
      // 睡眠0h・疲労度3・局所疲労なし）。
      const sleepHours = condition?.sleepHours ?? 0
      const fatigueLevel = condition?.fatigue ?? 3
      const sorenessLevel = condition?.muscleSorenessLevel ?? 'none'
      const sorenessLocation = condition?.muscleSorenessLocation ?? 'none'

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
          sorenessLevel,
          sorenessLocation,
          workouts,
          dailyConditions,
        )
        const dailySummary = buildDailySummaryText(trainingLogs, soccerLogs, workouts, mealLogs, selectedDate)

        const { aiComment } = await generateDailyComment({
          date: selectedDate,
          acwr: acwrResult?.acwr ?? null,
          acwrStatus: acwrResult?.status ?? null,
          sleepHours,
          fatigueLevel,
          dailySummary,
          forceRegenerate: force,
        })

        if (!isMountedRef.current) {
          return
        }
        if (aiComment) {
          const hasRowInState = dailyConditions.some((item) => item.date === selectedDate)
          if (hasRowInState) {
            setDailyConditions((current) =>
              current.map((item) => (item.date === selectedDate ? { ...item, aiComment } : item)),
            )
          } else {
            // サーバー側で ai_comment だけの行が新規作成されたケース。
            // 正しいidを含む行を取り直す。
            try {
              const refreshed = await fetchDailyConditions()
              if (isMountedRef.current) {
                setDailyConditions(refreshed)
              }
            } catch (refetchError) {
              console.error('AIコメント生成後の体調記録の再取得に失敗しました', refetchError)
            }
          }
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
    if (isGenerating) {
      return
    }
    runGeneration(true)
  }, [isGenerating, runGeneration])

  return { isGenerating, canRegenerate: !isGenerating, regenerate }
}
