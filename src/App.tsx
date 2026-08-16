import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'
import { MonthlyCalendar } from './pages/MonthlyCalendar'
import { ProgressGraph } from './pages/ProgressGraph'
import { Dashboard } from './pages/Dashboard'
import { Settings } from './pages/Settings'
import { BottomNav } from './components/BottomNav'
import { RecordSheet } from './components/RecordSheet'
import { fetchDailyConditions, syncDailyConditions } from './api/dailyConditions'
import { fetchGoalsByMonth, upsertGoals } from './api/goals'
import { fetchTrainingLogs, syncTrainingLogs } from './api/trainingLogs'
import { fetchMealLogs } from './api/mealLogs'
import { useTheme } from './hooks/useTheme'
import { ToastProvider, useToast } from './hooks/useToast'
import type { Goals } from './api/goals'
import type { DateString, DailyCondition, MealLog, TrainingLog } from './types'

const today = new Date()
const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}` as DateString
const currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

const defaultGoals: Goals = {
  yearMonth: currentYearMonth,
  targetWeight: 65,
  targetSleepHours: 7.5,
  weeklyTrainingGoal: 3,
  monthlyTrainingGoal: 12,
  dailyCalorieGoal: 2200,
  dailyProteinGoal: 150,
  dailyFatGoal: 60,
  dailyCarbohydrateGoal: 250,
}
const formattedDate = new Intl.DateTimeFormat('ja-JP', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
}).format(today)

function AppShell() {
  const { theme, setTheme } = useTheme()
  const { showToast } = useToast()
  const [isRecordSheetOpen, setIsRecordSheetOpen] = useState(false)
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
      showToast('体調記録の保存に失敗しました', 'error')
    })
  }, [dailyConditions, areDailyConditionsLoaded, showToast])

  useEffect(() => {
    let isMounted = true

    fetchGoalsByMonth(currentYearMonth)
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
      showToast('目標設定の保存に失敗しました', 'error')
    })
  }, [goals, areGoalsLoaded, showToast])

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
      showToast('トレーニング記録の保存に失敗しました', 'error')
    })
  }, [trainingLogs, areTrainingLogsLoaded, showToast])

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

  const navigate = useNavigate()

  return (
    <>
      <main className="app-shell">
        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                trainingLogs={trainingLogs}
                mealLogs={mealLogs}
                dailyConditions={dailyConditions}
                goals={goals}
                setGoals={setGoals}
                today={today}
                todayString={todayString}
                formattedDate={formattedDate}
              />
            }
          />
          <Route
            path="/calendar"
            element={
              <MonthlyCalendar
                trainingLogs={trainingLogs}
                setTrainingLogs={setTrainingLogs}
                mealLogs={mealLogs}
                setMealLogs={setMealLogs}
                dailyConditions={dailyConditions}
                setDailyConditions={setDailyConditions}
              />
            }
          />
          <Route
            path="/graph"
            element={
              <ProgressGraph
                trainingLogs={trainingLogs}
                dailyConditions={dailyConditions}
                targetWeight={goals.targetWeight}
                targetSleepHours={goals.targetSleepHours}
                weeklyTrainingGoal={goals.weeklyTrainingGoal}
                monthlyTrainingGoal={goals.monthlyTrainingGoal}
              />
            }
          />
          <Route
            path="/settings"
            element={
              <Settings
                goals={goals}
                setGoals={setGoals}
                trainingLogs={trainingLogs}
                dailyConditions={dailyConditions}
                today={today}
                theme={theme}
                setTheme={setTheme}
              />
            }
          />
        </Routes>
      </main>

      <BottomNav onOpenRecordSheet={() => setIsRecordSheetOpen(true)} />

      <RecordSheet
        isOpen={isRecordSheetOpen}
        onClose={() => setIsRecordSheetOpen(false)}
        onSelect={(type) => {
          setIsRecordSheetOpen(false)
          navigate('/calendar', { state: { tab: type, requestId: Date.now() } })
        }}
      />
    </>
  )
}

function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </HashRouter>
  )
}

export default App
