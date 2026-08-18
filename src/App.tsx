import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import './App.css'
import { MonthlyCalendar } from './pages/MonthlyCalendar'
import { ProgressGraph } from './pages/ProgressGraph'
import { Dashboard } from './pages/Dashboard'
import { Settings } from './pages/Settings'
import { BottomNav } from './components/BottomNav'
import { RecordSheet } from './components/RecordSheet'
import { RecordFormModal } from './components/RecordFormModal'
import type { RecordModalRequest } from './components/RecordFormModal'
import { fetchDailyConditions } from './api/dailyConditions'
import { fetchGoalsByMonth } from './api/goals'
import { fetchTrainingLogs } from './api/trainingLogs'
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
  const [recordModalRequest, setRecordModalRequest] = useState<RecordModalRequest | null>(null)
  const [trainingLogs, setTrainingLogs] = useState<TrainingLog[]>([])
  const [mealLogs, setMealLogs] = useState<MealLog[]>([])
  const [dailyConditions, setDailyConditions] = useState<DailyCondition[]>([])
  const [goals, setGoals] = useState<Goals>({ ...defaultGoals })

  useEffect(() => {
    let isMounted = true

    fetchDailyConditions()
      .then((data) => {
        if (isMounted) {
          setDailyConditions(data)
        }
      })
      .catch((error) => {
        console.error('Supabaseから体調記録の取得に失敗しました', error)
        if (isMounted) {
          showToast('体調記録の読み込みに失敗しました。ページを再読み込みしてください', 'error')
        }
      })

    return () => {
      isMounted = false
    }
  }, [showToast])

  // 体調記録・トレーニング記録・目標設定は、以前は「state変化のたびに
  // ローカルとリモートの差分を取ってリモート側を削除→再作成する」sync方式だった。
  // フェッチが失敗/不完全なまま空のローカルstateで同期されるとリモートの
  // 既存データが全損する構造的な欠陥があったため（2026年8月17日、データ損失
  // 事故の調査で判明）、個別の保存・削除操作の際にAPIを直接呼び出す方式
  // （食事記録・サッカー記録・予定と同じ方式）に統一した。このため、
  // ここでの自動同期useEffectは廃止済み。各フォーム
  // （TrainingLogForm・ConditionForm・GoalPanel）が保存・削除のたびに
  // 個別APIを呼び、成功後にfetchで取得し直したデータでローカルstateを更新する。

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
        if (isMounted) {
          showToast('目標設定の読み込みに失敗しました。ページを再読み込みしてください', 'error')
        }
      })

    return () => {
      isMounted = false
    }
  }, [showToast])

  useEffect(() => {
    let isMounted = true

    fetchTrainingLogs()
      .then((data) => {
        if (isMounted) {
          setTrainingLogs(data)
        }
      })
      .catch((error) => {
        console.error('Supabaseからトレーニング記録の取得に失敗しました', error)
        if (isMounted) {
          showToast('トレーニング記録の読み込みに失敗しました。ページを再読み込みしてください', 'error')
        }
      })

    return () => {
      isMounted = false
    }
  }, [showToast])

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

  const openRecordModal = (request: Omit<RecordModalRequest, 'requestId'>) => {
    setRecordModalRequest({ ...request, requestId: Date.now() })
  }

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
                openRecordModal={openRecordModal}
                isRecordModalOpen={recordModalRequest !== null}
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
                todayString={todayString}
                theme={theme}
                setTheme={setTheme}
                openRecordModal={openRecordModal}
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
          openRecordModal({ type, date: todayString })
        }}
      />

      <RecordFormModal
        request={recordModalRequest}
        onClose={() => setRecordModalRequest(null)}
        trainingLogs={trainingLogs}
        setTrainingLogs={setTrainingLogs}
        mealLogs={mealLogs}
        setMealLogs={setMealLogs}
        dailyConditions={dailyConditions}
        setDailyConditions={setDailyConditions}
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
