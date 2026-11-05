import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './App.css'
import { BottomNav } from './components/BottomNav'
import { RecordSheet } from './components/RecordSheet'
import type { RecordModalRequest } from './components/RecordFormModal'
import { fetchDailyConditions } from './api/dailyConditions'
import { fetchGoalsByMonth } from './api/goals'
import { fetchTrainingLogs } from './api/trainingLogs'
import { fetchMealLogs } from './api/mealLogs'
import { fetchProfile } from './api/profiles'
import { useTheme } from './hooks/useTheme'
import { ToastProvider, useToast } from './hooks/useToast'
import { ConfirmProvider } from './hooks/useConfirm'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { CelebrationProvider } from './components/celebration/CelebrationProvider'
import { SplashScreen } from './components/SplashScreen'
import { OfflineStatusBanner } from './components/OfflineStatusBanner'
import { useOutboxSync } from './hooks/useOutboxSync'
import { withOfflineCache } from './offline/offlineCache'
import { isTrainingOutboxEntry } from './offline/outbox'
import { prefetchOfflineReferenceData } from './offline/prefetchReferenceData'
import { getNavigatorOnline } from './utils/networkErrors'
import { OfflineWaitTimeoutError, waitWithOfflineLimit } from './utils/offlineTimeout'
import { applyAccentColor } from './utils/accentColor'
import { importWithReload } from './utils/lazyReload'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import type { Goals } from './api/goals'
import type { DateString, DailyCondition, MealLog, Profile, TrainingLog } from './types'

// パフォーマンス改善フェーズ2（2026年9月16日）：ルート単位のコード分割。
// Dashboard・MonthlyCalendar・ProgressGraph・Settings・UserProfileはBottomNav経由の
// 画面遷移でのみ必要になるため、初回バンドルから分離する。RecordFormModal（「＋」タップ時
// にのみ必要、MealLogWizardModal等の大型フォームを内包し単体でも重い）も同様に分割対象と
// した。Login/Signupは未ログイン時の初回表示に必須のため分割対象から除外している
// （分割してもAuthGate側に別途Suspense境界が必要になるだけでメリットが薄いため）。
// 2026年11月1日：デプロイ直後に古い画面から遅延読み込みすると真っ白になる問題への対策として、
// 各 import を importWithReload で包む（失敗時に1回だけ自動再読み込み。詳細は utils/lazyReload.ts）。
const Dashboard = lazy(() => importWithReload(() => import('./pages/Dashboard')).then((m) => ({ default: m.Dashboard })))
const MonthlyCalendar = lazy(() => importWithReload(() => import('./pages/MonthlyCalendar')).then((m) => ({ default: m.MonthlyCalendar })))
const ProgressGraph = lazy(() => importWithReload(() => import('./pages/ProgressGraph')).then((m) => ({ default: m.ProgressGraph })))
const Settings = lazy(() => importWithReload(() => import('./pages/Settings')).then((m) => ({ default: m.Settings })))
const UserProfile = lazy(() => importWithReload(() => import('./pages/UserProfile')).then((m) => ({ default: m.UserProfile })))
const RecordFormModal = lazy(() =>
  importWithReload(() => import('./components/RecordFormModal')).then((m) => ({ default: m.RecordFormModal })),
)

// アプリ起動演出刷新（ART DECO CLASSICテーマ、2026年8月28日）：SplashScreen.tsxの
// CSSアニメーション一式（リング描画→ダンベルスライドイン→心拍ライン描画→
// タイトル/サブタイトルのフェードイン）の再生完了が約750〜800msのため、
// 500msから800msに変更した。Promise.allは元々「配列内の全Promiseの完了」＝
// 「データ取得完了とこのタイマーのうち遅い方」を待つ構造のため、値の変更のみで
// 「アニメーション再生完了とデータ取得完了の両方が終わった時点でフェードアウト」
// という要件を満たす（Promise.all自体のロジック変更は不要）。
const SPLASH_MINIMUM_VISIBLE_MS = 800

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

// オフラインで開けない不具合の対応（2026年11月5日）：体調・目標の初期値。初回の取得が遅れて
// 届いたときは、state がまだこの初期値のまま（＝画面側で更新されていない）場合だけ反映する
const INITIAL_DAILY_CONDITIONS: DailyCondition[] = []

type LoadStatus = 'loading' | 'loaded' | 'failed'
const INITIAL_GOALS: Goals = { ...defaultGoals }

function AppShell() {
  const { theme, setTheme } = useTheme()
  const { showToast } = useToast()
  const { user } = useAuth()
  const [isRecordSheetOpen, setIsRecordSheetOpen] = useState(false)
  const [recordModalRequest, setRecordModalRequest] = useState<RecordModalRequest | null>(null)
  const [trainingLogs, setTrainingLogs] = useState<TrainingLog[]>([])
  const [mealLogs, setMealLogs] = useState<MealLog[]>([])
  // 初回の読み込みで画面に出した一覧（控えを含む）。遅れて届いた取得結果は、
  // その後に画面側で一覧が更新されていない場合だけ反映する（新しい更新を古い結果で消さないため）
  const initialTrainingLogsRef = useRef<TrainingLog[] | null>(null)
  const initialMealLogsRef = useRef<MealLog[] | null>(null)
  // 今の一覧（遅れて届いた結果を反映するかの判定用。2026年11月6日）
  const trainingLogsRef = useRef<TrainingLog[]>(trainingLogs)
  const mealLogsRef = useRef<MealLog[]>(mealLogs)
  useEffect(() => {
    trainingLogsRef.current = trainingLogs
  }, [trainingLogs])
  useEffect(() => {
    mealLogsRef.current = mealLogs
  }, [mealLogs])
  const [dailyConditions, setDailyConditions] = useState<DailyCondition[]>(INITIAL_DAILY_CONDITIONS)
  const [goals, setGoals] = useState<Goals>(INITIAL_GOALS)
  const [profile, setProfile] = useState<Profile | null>(null)
  // 週間達成率リング・おすすめ（2026年11月6日）：目標・体調記録を読み込めたか。読み込めていない
  // ときに、仮の初期値（目標）や空の一覧（体調）で判定しないようにするため
  const [goalsStatus, setGoalsStatus] = useState<LoadStatus | 'missing'>('loading')
  const [dailyConditionsStatus, setDailyConditionsStatus] = useState<LoadStatus>('loading')
  const [trainingLogsStatus, setTrainingLogsStatus] = useState<LoadStatus>('loading')
  const [mealLogsStatus, setMealLogsStatus] = useState<LoadStatus>('loading')
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
          setDailyConditions((current) => (current === INITIAL_DAILY_CONDITIONS ? data : current))
          setDailyConditionsStatus('loaded')
        }
      })
      .catch((error) => {
        console.error('Supabaseから体調記録の取得に失敗しました', error)
        if (isMounted) {
          setDailyConditionsStatus('failed')
        }
        // オフライン記録対応（2026年10月31日）：オフライン中は画面上部のバナーで
        // 伝えるため、読み込み失敗のトーストは出さない（以下の目標・トレーニングも同様）。
        if (isMounted && getNavigatorOnline()) {
          showToast('体調記録の読み込みに失敗しました。ページを再読み込みしてください', 'error')
        }
      })

    const goalsPromise = fetchGoalsByMonth(currentYearMonth)
      .then((data) => {
        if (isMounted && data) {
          setGoals((current) => (current === INITIAL_GOALS ? data : current))
        }
        if (isMounted) {
          setGoalsStatus(data ? 'loaded' : 'missing')
        }
      })
      .catch((error) => {
        console.error('Supabaseから目標設定の取得に失敗しました', error)
        if (isMounted) {
          setGoalsStatus('failed')
        }
        if (isMounted && getNavigatorOnline()) {
          showToast('目標設定の読み込みに失敗しました。ページを再読み込みしてください', 'error')
        }
      })

    // オフライン記録対応（2026年10月31日）：トレーニング・食事の記録一覧は、
    // オフライン時に最後に取得できた内容を表示できるよう端末に控えておく。
    // オフラインで開けない不具合の対応（2026年11月5日）：オフライン判定で待ち時間を超えて控えを
    // 表示した後に、取得が遅れて成功したら画面にも反映する
    const trainingLogsPromise = withOfflineCache('trainingLogs', () => fetchTrainingLogs(), (data) => {
      if (!isMounted) {
        return
      }
      const current = trainingLogsRef.current
      const canReplace =
        initialTrainingLogsRef.current === null ? current.length === 0 : current === initialTrainingLogsRef.current
      // 画面側で一覧が更新されていたら置き換えない（その場合、全件が入っていないので「読み込めた」にもしない）
      if (canReplace) {
        setTrainingLogs(data)
        setTrainingLogsStatus('loaded')
      }
    })
      .then((data) => {
        if (isMounted) {
          initialTrainingLogsRef.current = data
          setTrainingLogs(data)
          setTrainingLogsStatus('loaded')
        }
      })
      .catch((error) => {
        console.error('Supabaseからトレーニング記録の取得に失敗しました', error)
        if (isMounted) {
          setTrainingLogsStatus((current) => (current === 'loaded' ? current : 'failed'))
        }
        // 待ち時間切れ（OfflineWaitTimeoutError）の場合は、取得が続いていて遅れて反映されうるので案内しない
        if (isMounted && getNavigatorOnline() && !(error instanceof OfflineWaitTimeoutError)) {
          showToast('トレーニング記録の読み込みに失敗しました。ページを再読み込みしてください', 'error')
        }
      })

    const mealLogsPromise = withOfflineCache('mealLogs', () => fetchMealLogs(), (data) => {
      if (!isMounted) {
        return
      }
      const current = mealLogsRef.current
      const canReplace = initialMealLogsRef.current === null ? current.length === 0 : current === initialMealLogsRef.current
      // 画面側で一覧が更新されていたら置き換えない（その場合、全件が入っていないので「読み込めた」にもしない）
      if (canReplace) {
        setMealLogs(data)
        setMealLogsStatus('loaded')
      }
    })
      .then((data) => {
        if (isMounted) {
          initialMealLogsRef.current = data
          setMealLogs(data)
          setMealLogsStatus('loaded')
        }
      })
      .catch((error) => {
        console.error('Supabaseから食事記録の取得に失敗しました', error)
        if (isMounted) {
          setMealLogsStatus((current) => (current === 'loaded' ? current : 'failed'))
        }
      })

    // プロフィール機能（2026年8月27日）：設定画面のサマリーカード・ユーザー詳細
    // 画面の両方で使うため、他のグローバルstate（goals・dailyConditions等）と
    // 同じくAppShellで一度だけ取得する。未保存ユーザーはfetchProfileがnullを
    // 返す（profilesは1行も作られていない状態がありうるテーブルのため）。
    const profilePromise = fetchProfile()
      .then((data) => {
        if (isMounted) {
          setProfile((current) => (current === null ? data : current))
        }
      })
      .catch((error) => {
        console.error('Supabaseからプロフィールの取得に失敗しました', error)
      })

    const minimumSplashDuration = new Promise<void>((resolve) => {
      setTimeout(resolve, SPLASH_MINIMUM_VISIBLE_MS)
    })

    // オフラインで開けない不具合の対応（2026年11月5日）：オフライン判定のときは、初回の読み込みの
    // 完了を一定時間（OFFLINE_WAIT_LIMIT_MS）までしか待たずにスプラッシュを終える。読み込み自体は
    // 止めず、遅れて取得できたものはそれぞれの .then で画面に反映される
    const dataLoads = Promise.all([dailyConditionsPromise, goalsPromise, trainingLogsPromise, mealLogsPromise, profilePromise])
    const dataLoadsGate = getNavigatorOnline() ? dataLoads : waitWithOfflineLimit(dataLoads).catch(() => undefined)
    Promise.all([dataLoadsGate, minimumSplashDuration]).then(
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
  // オフライン記録対応・控えの先読み（2026年10月31日）：初回データ取得が終わってから
  // （起動時の表示を待たせないよう少し間を置いて）、記録フォーム用の一覧の控えを作る。
  useEffect(() => {
    if (!isInitialLoadComplete || !user?.id) {
      return
    }
    const timer = window.setTimeout(() => {
      void prefetchOfflineReferenceData()
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [isInitialLoadComplete, user?.id])

  useEffect(() => {
    applyAccentColor(profile?.accentColor, theme)
  }, [profile?.accentColor, theme])

  // オフライン記録対応（2026年10月31日）：オフライン中に端末保存した記録の自動送信。
  // 1件以上反映できたら一覧を取り直して画面に反映する。
  const outbox = useOutboxSync({
    userId: user?.id ?? null,
    onSynced: (result) => {
      showToast(`オフライン中の記録${result.synced.length}件を反映しました`, 'success')
      if (result.synced.some(isTrainingOutboxEntry)) {
        withOfflineCache('trainingLogs', () => fetchTrainingLogs())
          .then((data) => {
            setTrainingLogs(data)
            setTrainingLogsStatus('loaded')
          })
          .catch((error) => console.error('Supabaseからトレーニング記録の再取得に失敗しました', error))
      }
      if (result.synced.some((entry) => entry.kind === 'mealUpsert' || entry.kind === 'mealDelete')) {
        withOfflineCache('mealLogs', () => fetchMealLogs())
          .then((data) => {
            setMealLogs(data)
            setMealLogsStatus('loaded')
          })
          .catch((error) => console.error('Supabaseから食事記録の再取得に失敗しました', error))
      }
    },
  })

  // オフラインでの編集・削除（2026年11月6日）：未送信の操作を破棄したら、その操作を先に反映して
  // いた一覧を取り直す（取得した一覧には、残っている未送信の操作だけが重なる）。オフラインで
  // 取り直せない場合は、オンラインに戻った時点で取り直す。
  const refreshListsAfterDiscard = (kind: 'training' | 'meal') => {
    const refresh = () => {
      if (kind === 'training') {
        withOfflineCache('trainingLogs', () => fetchTrainingLogs())
          .then((data) => {
            setTrainingLogs(data)
            setTrainingLogsStatus('loaded')
          })
          .catch((error) => console.error('Supabaseからトレーニング記録の再取得に失敗しました', error))
      } else {
        withOfflineCache('mealLogs', () => fetchMealLogs())
          .then((data) => {
            setMealLogs(data)
            setMealLogsStatus('loaded')
          })
          .catch((error) => console.error('Supabaseから食事記録の再取得に失敗しました', error))
      }
    }
    if (getNavigatorOnline()) {
      refresh()
    } else {
      window.addEventListener('online', refresh, { once: true })
    }
  }
  const handleDiscardOutboxEntry = (entryId: string) => {
    const entry = outbox.pendingEntries.find((candidate) => candidate.id === entryId)
    outbox.discard(entryId)
    if (entry && entry.kind !== 'trainingAdd' && entry.kind !== 'mealUpsert') {
      refreshListsAfterDiscard(isTrainingOutboxEntry(entry) ? 'training' : 'meal')
    } else if (entry?.kind === 'mealUpsert') {
      // 食事の upsert は新規・編集のどちらもありうる。編集だった場合に備えて取り直す
      refreshListsAfterDiscard('meal')
    }
  }

  const openRecordModal = (request: Omit<RecordModalRequest, 'requestId'>) => {
    setRecordModalRequest({ ...request, requestId: Date.now() })
  }

  return (
    <>
      <SplashScreen isLoadComplete={isInitialLoadComplete} />

      <main className="app-shell">
        <OfflineStatusBanner
          isOnline={outbox.isOnline}
          isSyncing={outbox.isSyncing}
          pendingEntries={outbox.pendingEntries}
          failedEntries={outbox.failedEntries}
          onRetry={() => void outbox.retry()}
          onDiscard={handleDiscardOutboxEntry}
        />
        <Suspense fallback={null}>
        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                trainingLogs={trainingLogs}
                mealLogs={mealLogs}
                dailyConditions={dailyConditions}
                goals={goals}
                goalsStatus={goals !== INITIAL_GOALS ? 'loaded' : goalsStatus}
                dailyConditionsStatus={dailyConditions !== INITIAL_DAILY_CONDITIONS ? 'loaded' : dailyConditionsStatus}
                trainingLogsStatus={trainingLogsStatus}
                mealLogsStatus={mealLogsStatus}
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
                dailyConditions={dailyConditions}
                mealLogs={mealLogs}
                targetWeight={goals.targetWeight}
                targetSleepHours={goals.targetSleepHours}
                weeklyTrainingGoal={goals.weeklyTrainingGoal}
                monthlyTrainingGoal={goals.monthlyTrainingGoal}
                dailyCalorieGoal={goals.dailyCalorieGoal}
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
        </Suspense>
      </main>

      <BottomNav onOpenRecordSheet={() => setIsRecordSheetOpen(true)} />

      <RecordSheet
        isOpen={isRecordSheetOpen}
        onClose={() => setIsRecordSheetOpen(false)}
        onSelect={(type) => {
          setIsRecordSheetOpen(false)
          // 種目カード＋編集モーダル分離（2026年8月28日）：トレーニングは
          // 常に新規種目の追加として開く（既存実績の有無を見て分岐する必要が
          // なくなった。種目単位の編集はカレンダー画面の各カードから行う）。
          openRecordModal({ type, date: todayString })
        }}
      />

      {/* コード分割（2026年9月16日）：RecordFormModal自体は元々request===null時にnullを
          返すのみでアンマウント時の退場アニメーション等の状態は持たないため
          （内部useEffectもrequestの変化のたびに毎回状態を作り直す設計）、
          request!==nullの時だけ条件付きマウントに変更しても挙動は変わらない。
          こうすることで「＋」タップ（＝recordModalRequestが初めてnullでなくなる瞬間）
          まで実際にチャンクのダウンロードを遅延できる（常時マウントのままだと
          Suspense境界があってもチャンク取得自体は初回描画時に走ってしまうため）。 */}
      {recordModalRequest !== null ? (
        <Suspense fallback={null}>
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
        </Suspense>
      ) : null}
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
