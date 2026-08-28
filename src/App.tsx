import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
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
import { fetchProfile } from './api/profiles'
import { UserProfile } from './pages/UserProfile'
import { useTheme } from './hooks/useTheme'
import { ToastProvider, useToast } from './hooks/useToast'
import { ConfirmProvider } from './hooks/useConfirm'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { CelebrationProvider } from './components/celebration/CelebrationProvider'
import { SplashScreen } from './components/SplashScreen'
import { applyAccentColor } from './utils/accentColor'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import type { Goals } from './api/goals'
import type { DateString, DailyCondition, MealLog, Profile, TrainingLog } from './types'

const SPLASH_MINIMUM_VISIBLE_MS = 500

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
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false)

  // 体調記録・トレーニング記録・目標設定は、以前は「state変化のたびに
  // ローカルとリモートの差分を取ってリモート側を削除→再作成する」sync方式だった。
  // フェッチが失敗/不完全なまま空のローカルstateで同期されるとリモートの
  // 既存データが全損する構造的な欠陥があったため（2026年8月17日、データ損失
  // 事故の調査で判明）、個別の保存・削除操作の際にAPIを直接呼び出す方式
  // （食事記録・サッカー記録・予定と同じ方式）に統一した。このため、
  // ここでの自動同期useEffectは廃止済み。各フォーム
  // （TrainingLogForm・ConditionForm・GoalPanel）が保存・削除のたびに
  // 個別APIを呼び、成功後にfetchで取得し直したデータでローカルstateを更新する。

  // 初回データ取得＋スプラッシュ画面（設定画面拡張Phase 1、2026年8月28日）：
  // 従来は5つの独立したuseEffectでそれぞれ個別にfetchしていたが、スプラッシュ画面の
  // 「初回データ取得が完了するまで表示」を実現するにはひとつのPromiseにまとめる
  // 必要があるため、1つのuseEffectに統合した。各fetchの個別のcatch（エラートースト・
  // console.error）は従来通り維持しており、1つが失敗してもPromise.all全体は
  // reject させず（catch内でthrowし直していないため）解決する設計にしている
  // （さもないと一部データの取得失敗だけでスプラッシュ画面が消えなくなってしまう）。
  useEffect(() => {
    let isMounted = true

    const dailyConditionsPromise = fetchDailyConditions()
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

    const goalsPromise = fetchGoalsByMonth(currentYearMonth)
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

    const trainingLogsPromise = fetchTrainingLogs()
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

    const mealLogsPromise = fetchMealLogs()
      .then((data) => {
        if (isMounted) {
          setMealLogs(data)
        }
      })
      .catch((error) => {
        console.error('Supabaseから食事記録の取得に失敗しました', error)
      })

    // プロフィール機能（2026年8月27日）：設定画面のサマリーカード・ユーザー詳細
    // 画面の両方で使うため、他のグローバルstate（goals・dailyConditions等）と
    // 同じくAppShellで一度だけ取得する。未保存ユーザーはfetchProfileがnullを
    // 返す（profilesは1行も作られていない状態がありうるテーブルのため）。
    const profilePromise = fetchProfile()
      .then((data) => {
        if (isMounted) {
          setProfile(data)
        }
      })
      .catch((error) => {
        console.error('Supabaseからプロフィールの取得に失敗しました', error)
      })

    const minimumSplashDuration = new Promise<void>((resolve) => {
      setTimeout(resolve, SPLASH_MINIMUM_VISIBLE_MS)
    })

    Promise.all([dailyConditionsPromise, goalsPromise, trainingLogsPromise, mealLogsPromise, profilePromise, minimumSplashDuration]).then(
      () => {
        if (isMounted) {
          setIsInitialLoadComplete(true)
        }
      },
    )

    return () => {
      isMounted = false
    }
  }, [showToast])

  // アクセントカラー設定（設定画面拡張Phase 1、2026年8月28日）：profile.accentColorと
  // 現在のテーマ（ライト/ダーク）の両方に応じてCSS変数（--color-accent等）を
  // document.documentElementへ動的上書きする。テーマ切り替え時も再適用が
  // 必要なため両方をdepsに含めている（src/utils/accentColor.ts参照）。
  useEffect(() => {
    applyAccentColor(profile?.accentColor, theme)
  }, [profile?.accentColor, theme])

  const openRecordModal = (request: Omit<RecordModalRequest, 'requestId'>) => {
    setRecordModalRequest({ ...request, requestId: Date.now() })
  }

  return (
    <>
      <SplashScreen isVisible={!isInitialLoadComplete} />

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
                firstDayOfWeek={profile?.firstDayOfWeek ?? 1}
              />
            }
          />
          <Route
            path="/graph"
            element={
              <ProgressGraph
                trainingLogs={trainingLogs}
                mealLogs={mealLogs}
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
                mealLogs={mealLogs}
                dailyConditions={dailyConditions}
                today={today}
                todayString={todayString}
                theme={theme}
                setTheme={setTheme}
                openRecordModal={openRecordModal}
                profile={profile}
                setProfile={setProfile}
              />
            }
          />
          {/* ユーザー詳細画面（2026年8月27日）：設定画面からのドリルダウン専用の
              サブページのため、BottomNavのタブハイライト用APP_VIEW_PATHSには
              含めていない（あちらは4つのボトムナビ本体のタブ用）。 */}
          <Route
            path="/settings/profile"
            element={<UserProfile profile={profile} setProfile={setProfile} todayString={todayString} />}
          />
        </Routes>
      </main>

      <BottomNav onOpenRecordSheet={() => setIsRecordSheetOpen(true)} />

      <RecordSheet
        isOpen={isRecordSheetOpen}
        onClose={() => setIsRecordSheetOpen(false)}
        onSelect={(type) => {
          setIsRecordSheetOpen(false)
          // 不具合対応（2026年8月26日）：ホーム画面の「＋」からトレーニングを
          // 選んだ場合も、MonthlyCalendar側の「記録を追加」と同じく、当日に
          // 既存のトレーニング実績があれば空フォームではなく既存の種目を
          // 読み込んだ編集経路（trainingLogIndex指定）を再利用する。
          if (type === 'training') {
            const existingIndex = trainingLogs.findIndex((log) => log.date === todayString)
            openRecordModal(
              existingIndex >= 0
                ? { type, date: todayString, trainingLogIndex: existingIndex }
                : { type, date: todayString },
            )
            return
          }
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

// アカウント/ログイン機能 フェーズA（2026年8月25日）：未ログイン時はアプリ全体を
// ログイン画面に置き換えるシンプルなProtected Route相当の実装（単一ユーザー
// アプリのため、ルート単位の個別ガードではなく全体を一括でガードする設計とした・
// 判断理由）。isLoading中（セッション復元中）は一瞬の未ログイン画面フラッシュを
// 避けるため何も描画しない（bodyの背景色は既にindex.cssで設定済みのため、
// 空白でも背景色の不一致は起きない）。
// .status-bar-cover（UI/UXレビュー修正 項目1）はログイン画面・アプリ画面の
// どちらでもステータスバー重なりを防ぐ必要があるため、AppShellの外側
// （常時マウント）に配置している。
function AuthGate() {
  const { session, isLoading } = useAuth()
  // 新規サインアップ機能追加（2026年8月25日）：ログイン/サインアップ画面の
  // 切り替えはルーティングを増やさず、AuthGate内のローカルstateで行う
  // （単一ユーザー限定だった頃と同じく、未ログイン時はアプリ全体を
  // 1画面だけ表示するシンプルな構成を踏襲した・判断理由）。
  const [authView, setAuthView] = useState<'login' | 'signup'>('login')

  if (isLoading) {
    return <div className="status-bar-cover" />
  }

  return (
    <>
      <div className="status-bar-cover" />
      {session ? (
        <AppShell />
      ) : authView === 'login' ? (
        <Login onSwitchToSignup={() => setAuthView('signup')} />
      ) : (
        <Signup onSwitchToLogin={() => setAuthView('login')} />
      )}
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <CelebrationProvider>
            <AuthProvider>
              <AuthGate />
            </AuthProvider>
          </CelebrationProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}

export default App
