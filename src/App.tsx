import { useEffect, useState } from 'react'
import './App.css'
import { MonthlyCalendar } from './pages/MonthlyCalendar'
import { ProgressGraph } from './pages/ProgressGraph'
import { Dashboard } from './pages/Dashboard'
import { fetchDailyConditions, syncDailyConditions } from './api/dailyConditions'
import { fetchGoals, upsertGoals } from './api/goals'
import { fetchTrainingLogs, syncTrainingLogs } from './api/trainingLogs'
import { fetchMealLogs } from './api/mealLogs'
import { useTheme } from './hooks/useTheme'
import type { Goals } from './api/goals'
import type { DateString, DailyCondition, MealLog, TrainingLog } from './types'

const defaultGoals: Goals = {
  targetWeight: 65,
  targetSleepHours: 7.5,
  weeklyTrainingGoal: 3,
  monthlyTrainingGoal: 12,
  dailyCalorieGoal: 2200,
  dailyProteinGoal: 150,
  dailyFatGoal: 60,
  dailyCarbohydrateGoal: 250,
}

const today = new Date()
const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}` as DateString
const formattedDate = new Intl.DateTimeFormat('ja-JP', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
}).format(today)

function App() {
  useTheme()
  const [activeView, setActiveView] = useState<'dashboard' | 'calendar' | 'progress'>('dashboard')
  const [trainingLogs, setTrainingLogs] = useState<TrainingLog[]>([])
  const [areTrainingLogsLoaded, setAreTrainingLogsLoaded] = useState(false)
  const [mealLogs, setMealLogs] = useState<MealLog[]>([])
  const [dailyConditions, setDailyConditions] = useState<DailyCondition[]>([])
  const [areDailyConditionsLoaded, setAreDailyConditionsLoaded] = useState(false)
  const [goals, setGoals] = useState<Goals>({ ...defaultGoals })
  const [areGoalsLoaded, setAreGoalsLoaded] = useState(false)

  useEffect(() => {
    let isMounted = true

    fetchDailyConditions()
      .then((data) => {
        if (isMounted) {
          setDailyConditions(data)
          setAreDailyConditionsLoaded(true)
        }
      })
      .catch((error) => {
        console.error('Supabaseから体調記録の取得に失敗しました', error)
        if (isMounted) {
          setAreDailyConditionsLoaded(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!areDailyConditionsLoaded) {
      return
    }

    syncDailyConditions(dailyConditions).catch((error) => {
      console.error('Supabaseへの体調記録の保存に失敗しました', error)
    })
  }, [dailyConditions, areDailyConditionsLoaded])

  useEffect(() => {
    let isMounted = true

    fetchGoals()
      .then((data) => {
        if (isMounted && data) {
          setGoals(data)
        }
      })
      .catch((error) => {
        console.error('Supabaseから目標設定の取得に失敗しました', error)
      })
      .finally(() => {
        if (isMounted) {
          setAreGoalsLoaded(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!areGoalsLoaded) {
      return
    }

    upsertGoals(goals).catch((error) => {
      console.error('Supabaseへの目標設定の保存に失敗しました', error)
    })
  }, [goals, areGoalsLoaded])

  useEffect(() => {
    let isMounted = true

    fetchTrainingLogs()
      .then((data) => {
        if (isMounted) {
          setTrainingLogs(data)
          setAreTrainingLogsLoaded(true)
        }
      })
      .catch((error) => {
        console.error('Supabaseからトレーニング記録の取得に失敗しました', error)
        if (isMounted) {
          setAreTrainingLogsLoaded(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!areTrainingLogsLoaded) {
      return
    }

    syncTrainingLogs(trainingLogs).catch((error) => {
      console.error('Supabaseへのトレーニング記録の保存に失敗しました', error)
    })
  }, [trainingLogs, areTrainingLogsLoaded])

  useEffect(() => {
    let isMounted = true

    fetchMealLogs()
      .then((data) => {
        if (isMounted) {
          setMealLogs(data)
        }
      })
      .catch((error) => {
        console.error('Supabaseから食事記録の取得に失敗しました', error)
      })

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <main className="app-shell">
      <div className="view-switcher" role="tablist" aria-label="ビュー切り替え">
        <button
          type="button"
          className={`view-switcher__button ${activeView === 'dashboard' ? 'view-switcher__button--active' : ''}`}
          onClick={() => setActiveView('dashboard')}
        >
          ダッシュボード
        </button>
        <button
          type="button"
          className={`view-switcher__button ${activeView === 'calendar' ? 'view-switcher__button--active' : ''}`}
          onClick={() => setActiveView('calendar')}
        >
          月間カレンダー
        </button>
      </div>

      {activeView === 'calendar' ? (
        <MonthlyCalendar
          trainingLogs={trainingLogs}
          setTrainingLogs={setTrainingLogs}
          mealLogs={mealLogs}
          setMealLogs={setMealLogs}
          dailyConditions={dailyConditions}
          setDailyConditions={setDailyConditions}
        />
      ) : activeView === 'progress' ? (
        <ProgressGraph
          trainingLogs={trainingLogs}
          dailyConditions={dailyConditions}
          targetWeight={goals.targetWeight}
          targetSleepHours={goals.targetSleepHours}
          weeklyTrainingGoal={goals.weeklyTrainingGoal}
          monthlyTrainingGoal={goals.monthlyTrainingGoal}
        />
      ) : (
        <Dashboard
          trainingLogs={trainingLogs}
          mealLogs={mealLogs}
          dailyConditions={dailyConditions}
          goals={goals}
          setGoals={setGoals}
          today={today}
          todayString={todayString}
          formattedDate={formattedDate}
          setActiveView={setActiveView}
        />
      )}
    </main>
  )
}

export default App
