import { useEffect, useMemo, useState } from 'react'
import './BadgeGallery.css'
import { BADGE_DEFINITIONS, BADGE_ORDER } from '../constants/badges'
import { useBadgeEvaluator } from '../hooks/useBadgeEvaluator'
import { fetchSoccerLogs } from '../api/soccerLogs'
import { fetchWorkouts } from '../api/workouts'
import { calculateCurrentStreak } from '../utils/streakHelpers'
import { calculateMovingAverage, toDateKey } from '../utils/chartHelpers'
import { hasConsecutiveOptimalDays } from '../utils/acwrHelpers'
import type { DailyCondition, DateString, MealLog, SoccerLog, TrainingLog, Workout } from '../types'

// streak_30バッジ（30日連続）の判定に十分な余裕を持たせた取得幅。
const BADGE_STREAK_WINDOW_DAYS = 35

type BadgeGalleryProps = {
  trainingLogs: TrainingLog[]
  mealLogs: MealLog[]
  dailyConditions: DailyCondition[]
  today: Date
  todayString: DateString
}

// 設定画面拡張 Phase 4（ゲーミフィケーション、2026年8月28日）：バッジ図鑑UI。
// Settings.tsxに埋め込む想定。Dashboard.tsxと異なりこの画面はACWR計算用データ
// （soccerLogs・workouts）を保持していないため、判定に必要な最小限の範囲
// （BADGE_STREAK_WINDOW_DAYS日分）をここで独立に取得する
// （Settings.tsx側に元々存在しないデータのため、これは重複フェッチではない）。
export function BadgeGallery({ trainingLogs, mealLogs, dailyConditions, today, todayString }: BadgeGalleryProps) {
  const [soccerLogs, setSoccerLogs] = useState<SoccerLog[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [isDataLoading, setIsDataLoading] = useState(true)

  const windowStartKey = useMemo(() => {
    const start = new Date(today)
    start.setDate(start.getDate() - (BADGE_STREAK_WINDOW_DAYS - 1))
    return toDateKey(start) as DateString
  }, [today])

  useEffect(() => {
    let isMounted = true

    Promise.all([fetchSoccerLogs(windowStartKey, todayString), fetchWorkouts(windowStartKey, todayString)])
      .then(([soccerData, workoutData]) => {
        if (isMounted) {
          setSoccerLogs(soccerData)
          setWorkouts(workoutData)
        }
      })
      .catch((error) => {
        console.error('Supabaseからバッジ判定用のサッカー記録・ワークアウト記録の取得に失敗しました', error)
      })
      .finally(() => {
        if (isMounted) {
          setIsDataLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [windowStartKey, todayString])

  const currentStreak = useMemo(
    () => calculateCurrentStreak(trainingLogs, soccerLogs, mealLogs, dailyConditions, today),
    [trainingLogs, soccerLogs, mealLogs, dailyConditions, today],
  )
  const hasAnyRecord = trainingLogs.length > 0 || soccerLogs.length > 0 || mealLogs.length > 0 || dailyConditions.length > 0
  const sleepMA = useMemo(() => calculateMovingAverage(dailyConditions, 'date', 'sleepHours'), [dailyConditions])
  const sleepMovingAverageHours = sleepMA.length > 0 ? sleepMA[sleepMA.length - 1].movingAvg : null
  const isOptimalZoneStreak = useMemo(
    () => hasConsecutiveOptimalDays(trainingLogs, soccerLogs, dailyConditions, todayString, 7, workouts),
    [trainingLogs, soccerLogs, dailyConditions, todayString, workouts],
  )

  const { userBadges, isLoading: isBadgesLoading } = useBadgeEvaluator({
    hasAnyRecord,
    currentStreak,
    sleepMovingAverageHours,
    isOptimalZoneStreak,
  })

  const unlockedIds = new Set(userBadges.map((badge) => badge.badgeId))
  const isLoading = isDataLoading || isBadgesLoading

  return (
    <section className="panel-card badge-gallery">
      <h2 className="panel-card__title">獲得バッジ図鑑</h2>
      {isLoading ? (
        <p className="panel-card__description">読み込み中...</p>
      ) : (
        <div className="badge-gallery__grid">
          {BADGE_ORDER.map((badgeId) => {
            const badge = BADGE_DEFINITIONS[badgeId]
            const isUnlocked = unlockedIds.has(badgeId)
            return (
              <article
                key={badgeId}
                className={`badge-gallery__item ${isUnlocked ? 'badge-gallery__item--unlocked' : 'badge-gallery__item--locked'}`}
              >
                <span className="badge-gallery__icon" aria-hidden="true">
                  {isUnlocked ? badge.icon : '🔒'}
                </span>
                <strong className="badge-gallery__name">{badge.name}</strong>
                <p className="badge-gallery__description">{badge.description}</p>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
