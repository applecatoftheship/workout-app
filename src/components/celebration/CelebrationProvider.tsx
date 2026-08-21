import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { PRCelebrationCard } from './PRCelebrationCard'
import { StreakCelebrationCard } from './StreakCelebrationCard'
import './Celebration.css'

type PRCelebrationItem = {
  id: number
  type: 'pr'
  exerciseName: string
  before: number
  after: number
}

type StreakCelebrationItem = {
  id: number
  type: 'streak'
  days: number
}

type CelebrationItem = PRCelebrationItem | StreakCelebrationItem

type CelebrationContextValue = {
  showPRCelebration: (exerciseName: string, before: number, after: number) => void
  showStreakCelebration: (days: number) => void
}

const CelebrationContext = createContext<CelebrationContextValue | null>(null)

// Toast（3秒固定）より長めに設定し、Before→Afterの数値を読む時間を確保する。
const CELEBRATION_DURATION_MS = 4000

// 記録更新演出機能（2026年8月21日）：ToastProviderと並列でAppShellにマウントする
// 別Context。PR・ストリークの演出リクエストを配列キューで管理し、1件ずつ表示する
// （Toastの複数同時表示＝配列管理パターンを踏襲しつつ、こちらは同時表示せず
// 1件ずつ順番に見せる点が異なる。呼び出し側がPR→ストリークの順でenqueueすれば、
// 自然に「PR演出→閉じた後にストリーク演出」の順序になる）。
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<CelebrationItem[]>([])
  const nextId = useRef(0)
  const timeoutRef = useRef<number | null>(null)

  const advanceQueue = useCallback(() => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setQueue((current) => current.slice(1))
  }, [])

  const enqueue = useCallback((item: CelebrationItem) => {
    setQueue((current) => [...current, item])
  }, [])

  const showPRCelebration = useCallback(
    (exerciseName: string, before: number, after: number) => {
      const id = nextId.current++
      enqueue({ id, type: 'pr', exerciseName, before, after })
    },
    [enqueue],
  )

  const showStreakCelebration = useCallback(
    (days: number) => {
      const id = nextId.current++
      enqueue({ id, type: 'streak', days })
    },
    [enqueue],
  )

  const activeItem = queue[0] ?? null

  // アクティブなカードが切り替わるたびに自動フェードアウト用タイマーを張り直す。
  useEffect(() => {
    if (!activeItem) {
      return
    }
    timeoutRef.current = window.setTimeout(() => {
      advanceQueue()
    }, CELEBRATION_DURATION_MS)
    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [activeItem, advanceQueue])

  return (
    <CelebrationContext.Provider value={{ showPRCelebration, showStreakCelebration }}>
      {children}
      {activeItem ? (
        <div key={activeItem.id} className="celebration-overlay" role="presentation" onClick={advanceQueue}>
          {activeItem.type === 'pr' ? (
            <PRCelebrationCard exerciseName={activeItem.exerciseName} before={activeItem.before} after={activeItem.after} />
          ) : (
            <StreakCelebrationCard days={activeItem.days} />
          )}
        </div>
      ) : null}
    </CelebrationContext.Provider>
  )
}

export function useCelebration() {
  const context = useContext(CelebrationContext)
  if (!context) {
    throw new Error('useCelebration は CelebrationProvider の内側でのみ使用できます')
  }
  return context
}
