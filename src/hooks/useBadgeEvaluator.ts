import { useEffect, useRef, useState } from 'react'
import { fetchUserBadges, insertUserBadge } from '../api/badges'
import { BADGE_DEFINITIONS } from '../constants/badges'
import type { BadgeId } from '../constants/badges'
import { useToast } from './useToast'
import type { UserBadge } from '../types'

export type BadgeEvaluationInput = {
  /** training_logs・soccer_logs・meal_logs・daily_conditionsのいずれかに1件でも記録があるか */
  hasAnyRecord: boolean
  /** streakHelpers.calculateCurrentStreakの戻り値をそのまま渡す */
  currentStreak: number
  /** 直近7日移動平均の睡眠時間（chartHelpers.calculateMovingAverageの最新値）。記録が無ければnull */
  sleepMovingAverageHours: number | null
  /** acwrHelpers.hasConsecutiveOptimalDays（直近7日連続でACWR適正）の判定結果 */
  isOptimalZoneStreak: boolean
}

// 設定画面拡張 Phase 4（ゲーミフィケーション、2026年8月28日）：ホーム画面・
// バッジ図鑑画面の両方のマウント時に呼ばれる共通の判定フック。
//
// 【重複問い合わせの回避について】判定条件（hasAnyRecord・currentStreak・
// sleepMovingAverageHours・isOptimalZoneStreak）は呼び出し側が既に保持している
// データ（trainingLogs・dailyConditions・ACWR計算結果等）から算出済みの値を
// そのまま受け取る設計とし、このフック自身は判定のために追加でSupabaseへ
// 問い合わせない。フック内で新規に発生するSupabase呼び出しは
// 「既存のuser_badges一覧を取得する（1回）」「新規解放時にINSERTする（0〜数回）」
// の2種類のみで、いずれもuser_badgesテーブル自体の読み書きのため代替手段がない。
//
// 【評価タイミングについて】呼び出し元（Dashboard.tsx・BadgeGallery.tsx）は
// currentStreak等の判定用の値をACWR・移動平均と同じく複数の非同期fetch
// （acwrSoccerLogs等）から動的に組み立てているため、コンポーネントの初回
// レンダリング時点ではまだ最新値が揃っていないことがある。このため評価用の
// useEffectはinputの各値を依存配列に含め、値が変化するたび（＝後から届いた
// データで条件が新たに満たされた場合を含め）再評価する。ただし「同じバッジを
// 二重に解放しない」保証は、都度取得し直すuser_badges一覧ではなく、
// ローカルのuserBadges state（楽観的更新済み）とpendingBadgeIdsRef
// （INSERT処理中のバッジIDの集合、同一バッジへの多重INSERT防止）の2つで担保する。
export function useBadgeEvaluator(input: BadgeEvaluationInput): { userBadges: UserBadge[]; isLoading: boolean } {
  const [userBadges, setUserBadges] = useState<UserBadge[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { showToast } = useToast()
  const pendingBadgeIdsRef = useRef<Set<BadgeId>>(new Set())

  // user_badges一覧の取得（マウント時に1回のみ）。
  useEffect(() => {
    let isMounted = true

    fetchUserBadges()
      .then((badges) => {
        if (isMounted) {
          setUserBadges(badges)
          setIsLoading(false)
        }
      })
      .catch((error) => {
        console.error('Supabaseからバッジ一覧の取得に失敗しました', error)
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  // 条件判定：user_badges取得完了後、inputの値が変化するたびに再評価する。
  const { hasAnyRecord, currentStreak, sleepMovingAverageHours, isOptimalZoneStreak } = input

  useEffect(() => {
    if (isLoading) return

    const unlockedIds = new Set(userBadges.map((badge) => badge.badgeId))
    const candidates: BadgeId[] = []

    if (!unlockedIds.has('first_step') && hasAnyRecord) {
      candidates.push('first_step')
    }
    if (!unlockedIds.has('streak_7') && currentStreak >= 7) {
      candidates.push('streak_7')
    }
    if (!unlockedIds.has('streak_30') && currentStreak >= 30) {
      candidates.push('streak_30')
    }
    if (!unlockedIds.has('sleep_master') && sleepMovingAverageHours != null && sleepMovingAverageHours >= 7.5) {
      candidates.push('sleep_master')
    }
    if (!unlockedIds.has('optimal_zone') && isOptimalZoneStreak) {
      candidates.push('optimal_zone')
    }

    const newlyUnlocked = candidates.filter((badgeId) => !pendingBadgeIdsRef.current.has(badgeId))
    if (newlyUnlocked.length === 0) return

    newlyUnlocked.forEach((badgeId) => pendingBadgeIdsRef.current.add(badgeId))
    let isMounted = true

    ;(async () => {
      for (const badgeId of newlyUnlocked) {
        try {
          const created = await insertUserBadge(badgeId)
          if (!isMounted) return
          setUserBadges((current) => [...current, created])
          showToast(`🎉 新しいバッジ「${BADGE_DEFINITIONS[badgeId].name}」を獲得しました！`, 'success')
        } catch (error) {
          // unique_violation（23505）は、ホーム画面とバッジ図鑑画面がほぼ同時に
          // マウントされた場合など、複数箇所からの同時解放が競合した際に
          // 発生しうる正常系のため、エラー扱いにしない。
          if ((error as { code?: string } | null)?.code !== '23505') {
            console.error(`バッジ(${badgeId})の解放処理に失敗しました`, error)
          }
        } finally {
          pendingBadgeIdsRef.current.delete(badgeId)
        }
      }
    })()

    return () => {
      isMounted = false
    }
  }, [isLoading, userBadges, hasAnyRecord, currentStreak, sleepMovingAverageHours, isOptimalZoneStreak, showToast])

  return { userBadges, isLoading }
}
