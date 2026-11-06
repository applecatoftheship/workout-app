import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PolarAngleAxis, RadialBar, RadialBarChart } from 'recharts'
import './Dashboard.css'
import { ACWRGaugeCard } from '../components/ACWRGaugeCard'
import { TrackRing } from '../components/TrackRing'
import { WeeklyACWRDetailModal } from '../components/WeeklyACWRDetailModal'
import { CharacterStatusCard } from '../components/CharacterStatusCard'
import { RecommendationCard } from '../components/RecommendationCard'
import {
  BellIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FatigueIcon,
  SleepIcon,
  TimerIcon,
  WeightIcon,
} from '../components/icons'
import { RestTimerModal } from '../components/timer/RestTimerModal'
import { NotificationModal } from '../components/NotificationModal'
import { fetchTrainingSchedules } from '../api/trainingSchedules'
import { fetchSportLogs } from '../api/sportLogs'
import { fetchWorkouts } from '../api/workouts'
import { fetchNotifications, markNotificationRead } from '../api/notifications'
import { getScheduleIcon, buildActivityByDate, getCalendarCellState, toDateKey, toJstDateKeyFromIso, weekDays } from '../utils/calendarHelpers'
import { calculateACWR, calculateDailyACWRSeries, daysUntilACWRAvailable, hasConsecutiveDangerDays, hasConsecutiveOptimalDays } from '../utils/acwrHelpers'
import { calculateAdjustedGoals, getMatchDayStatus } from '../utils/periodizationHelpers'
import { calculateCurrentStreak } from '../utils/streakHelpers'
import { calculateDailyAchievement } from '../utils/weeklyAchievementHelpers'
import { useBadgeEvaluator } from '../hooks/useBadgeEvaluator'
import { calculateMovingAverage, getTrendTone, toDateKey as toChartDateKey } from '../utils/chartHelpers'
import type { MAPoint } from '../utils/chartHelpers'
import type { Goals } from '../api/goals'
import type {
  AppNotification,
  DailyCondition,
  DateString,
  MealLog,
  SportLog,
  TrainingLog,
  TrainingSchedule,
  Workout,
} from '../types'

/**
 * スプリント2（2026年8月17日）：統計カードの「前週比」用に、移動平均データ列から
 * 指定日のちょうど7日前のポイントを探す。該当日に記録がなければnull
 * （既存のweightTrend等と同様、比較対象が無い場合はトレンドバッジを非表示にする）。
 */
function findPointDaysBefore(points: MAPoint[], latestDate: string, daysBefore: number): MAPoint | null {
  const latest = new Date(`${latestDate}T00:00:00`)
  const target = new Date(latest)
  target.setDate(target.getDate() - daysBefore)
  const targetKey = toChartDateKey(target)
  return points.find((point) => point.date === targetKey) ?? null
}

/**
 * ホーム日付選択（2026年8月17日）：移動平均データ列から、ちょうどその日付の
 * ポイントを探す。「本日」のように直近の記録日にフォールバックせず、
 * その日に記録が無ければnullを返す（選択日にデータが無いカードは非表示にする仕様のため）。
 */
function findMAPointForDate(points: MAPoint[], dateKey: string): MAPoint | null {
  return points.find((point) => point.date === dateKey) ?? null
}

function formatSelectedDateLabel(dateKey: string) {
  return new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(
    new Date(`${dateKey}T00:00:00`),
  )
}

function formatSelectedDateShort(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

type DashboardProps = {
  trainingLogs: TrainingLog[]
  mealLogs: MealLog[]
  dailyConditions: DailyCondition[]
  goals: Goals
  /** 目標を読み込めたか（'missing' は今月の目標が未設定）。読み込めていないときは goals は仮の初期値 */
  goalsStatus: 'loading' | 'loaded' | 'missing' | 'failed'
  /** 体調記録を読み込めたか */
  dailyConditionsStatus: 'loading' | 'loaded' | 'failed'
  /** トレーニング・食事の記録一覧を読み込めたか（端末の控えから出した場合も含む） */
  trainingLogsStatus: 'loading' | 'loaded' | 'failed'
  mealLogsStatus: 'loading' | 'loaded' | 'failed'
  setGoals: React.Dispatch<React.SetStateAction<Goals>>
  today: Date
  todayString: DateString
  formattedDate: string
}

export function Dashboard({
  trainingLogs,
  mealLogs,
  dailyConditions,
  goals,
  goalsStatus,
  dailyConditionsStatus,
  trainingLogsStatus,
  mealLogsStatus,
  // setGoals：ホームの目標パネルを外したため未使用（2026年11月2日）。props の型は App 側との互換のため残す。
  today,
  todayString,
  formattedDate,
}: DashboardProps) {
  const navigate = useNavigate()
  // 休憩タイマー（2026年8月21日新設）：DB保存なし、モーダルを開いている間のみ完結する
  // 機能のため、マウント/アンマウントで状態管理する（isTimerOpen=falseの間は
  // RestTimerModal自体を描画しない）。閉じたら内部状態もリセットされる。
  const [isTimerOpen, setIsTimerOpen] = useState(false)
  // プッシュ通知機能 Phase 1b（2026年8月24日）：通知一覧はDB保存された
  // notificationsテーブルの表示・既読化のみを行う（生成自体は/api/send-reminder.ts
  // が担う）。休憩タイマーと同じくDashboard.tsxローカルで完結させ、App.tsx側の
  // グローバルstateには含めない（他画面から参照されないため）。
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false)
  const unreadNotificationCount = notifications.filter((notification) => !notification.isRead).length

  useEffect(() => {
    let isMounted = true

    const loadNotifications = () => {
      fetchNotifications()
        .then((data) => {
          if (isMounted) {
            setNotifications(data)
          }
        })
        .catch((error) => {
          console.error('Supabaseから通知の取得に失敗しました', error)
        })
    }

    loadNotifications()

    // マウント時の1回だけだと、ホーム画面を開いたままプッシュ通知を受け取っても
    // 未読バッジが更新されない問題があったため（2026年8月25日の調査で確定）、
    // タブ/ウィンドウが再びフォアグラウンドになったタイミングでも再取得する。
    // 既存コードにポーリング/フォーカス再取得の前例が無かったため、PWAとしての
    // 挙動（アプリ切り替え・バックグラウンド復帰）に強いvisibilitychangeを採用した
    // （window.focusイベントより、モバイルでのアプリ切り替えを確実に捕捉できるため）。
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadNotifications()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isMounted = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const handleMarkNotificationRead = (id: string) => {
    setNotifications((current) => current.map((notification) => (notification.id === id ? { ...notification, isRead: true } : notification)))
    markNotificationRead(id).catch((error) => {
      console.error('通知の既読化に失敗しました', error)
    })
  }

  const [weekSchedules, setWeekSchedules] = useState<TrainingSchedule[]>([])
  const [weekSportLogs, setWeekSportLogs] = useState<SportLog[]>([])
  const [weekWorkouts, setWeekWorkouts] = useState<Workout[]>([])
  // 週間達成率リング（2026年11月6日）：今週の予定などを読み込めたか（読み込めていない日は、
  // 予定が分からないのでトレーニングを達成率に含めない）
  const [weekActivityStatus, setWeekActivityStatus] = useState<'loading' | 'loaded' | 'failed'>('loading')
  const [acwrSportLogs, setAcwrSportLogs] = useState<SportLog[]>([])
  // ホーム日付選択（2026年8月17日）：週間ストリップの週移動（A-1）と、
  // 日付タップによるホーム画面全体の日付コンテキスト切り替え（A-2）。
  // 目標ストリップ・ACWRGaugeCardは対象外のため、常にtodayStringを使い続ける。
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDateKey, setSelectedDateKey] = useState<DateString>(todayString)
  const isViewingToday = selectedDateKey === todayString

  // 週を移動したら、直前に選んでいた日付コンテキストは一旦「今日」に戻す。
  // 週送りボタン自体のクリック時点でリセットするため、その後に新しい週のセルを
  // タップして選択する分には影響しない（選択対象は常に現在表示中の週の範囲内になる）。
  useEffect(() => {
    setSelectedDateKey(todayString)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset])

  const weekStart = useMemo(() => {
    const start = new Date(today)
    start.setDate(today.getDate() - today.getDay() + weekOffset * 7)
    return start
  }, [today, weekOffset])

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + index)
      return {
        date,
        dateKey: toDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate()),
      }
    })
  }, [weekStart])

  const weekStartKey = weekDates[0]?.dateKey ?? todayString
  const weekEndKey = weekDates[6]?.dateKey ?? todayString


  useEffect(() => {
    let isMounted = true
    setWeekActivityStatus('loading')

    Promise.all([
      fetchTrainingSchedules(weekStartKey, weekEndKey),
      fetchWorkouts(weekStartKey, weekEndKey),
      fetchSportLogs(weekStartKey, weekEndKey),
    ])
      .then(([scheduleData, workoutData, sportData]) => {
        if (isMounted) {
          setWeekSchedules(scheduleData)
          setWeekWorkouts(workoutData)
          setWeekSportLogs(sportData)
          setWeekActivityStatus('loaded')
        }
      })
      .catch((error) => {
        console.error('Supabaseから今週の予定・ワークアウト記録・スポーツ記録の取得に失敗しました', error)
        if (isMounted) {
          setWeekActivityStatus('failed')
        }
      })

    return () => {
      isMounted = false
    }
  }, [weekStartKey, weekEndKey])

  // ACWR（急性:慢性負荷比、スプリント1）の慢性負荷計算に必要な直近28日分のスポーツ記録。
  // trainingLogsは既に全期間分がApp.tsxから渡されているため別途フェッチ不要だが、
  // sportLogsは範囲指定フェッチのみのため、週間ストリップ用（7日）とは別に取得する。
  const acwrChronicStartKey = useMemo(() => {
    const start = new Date(today)
    start.setDate(today.getDate() - 27)
    return toDateKey(start.getFullYear(), start.getMonth() + 1, start.getDate())
  }, [today])

  // スポーツ記録機能（Tier 4-2、2026年9月12日）：ACWR・ストリークへの反映用に、
  // 「直近28日・常にtoday終端」の範囲でsport_logsを取得する。
  //
  // 暫定値表示バグ対応（UIブラッシュアップ Phase 0.5、2026年9月17日）：
  // マウント直後はacwrSportLogs/acwrWorkoutsが空配列のままacwrResult等が
  // 計算されてしまい、ワークアウト・スポーツ負荷を0扱いにした「誤った暫定値」
  // （例：本来🟢最適なのに🔵低下と表示）が一瞬表示される不具合があった
  // （React Routerの<Routes>切り替えでDashboardが画面遷移のたびにアンマウント/
  // 再マウントされる構造は2026年9月16日のReact.lazy化以前から存在していたが、
  // 同日の変更でDashboard自体のJSチャンク取得が追加で先行するようになり、
  // 「正しい値が出るまでの体感時間」が伸びて目立つようになったと見られる
  // ——2026年9月17日のUI/UX棚卸し・原因調査で判明）。
  // isAcwrSportLogsLoaded/isAcwrWorkoutsLoadedで両fetchの完了（成功・失敗いずれも）
  // を追跡し、両方完了するまではacwrResult等を「データ未確定」を表す値
  // （null・空配列・false）に固定する。acwrHelpers.ts側の計算ロジック自体は
  // 無変更（Dashboard.tsx側の表示タイミング制御のみで対応）。
  const [isAcwrSportLogsLoaded, setIsAcwrSportLogsLoaded] = useState(false)

  useEffect(() => {
    let isMounted = true
    setIsAcwrSportLogsLoaded(false)

    fetchSportLogs(acwrChronicStartKey, todayString)
      .then((data) => {
        if (isMounted) {
          setAcwrSportLogs(data)
        }
      })
      .catch((error) => {
        console.error('Supabaseから疲労残高計算用のスポーツ記録の取得に失敗しました', error)
      })
      .finally(() => {
        if (isMounted) {
          setIsAcwrSportLogsLoaded(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [acwrChronicStartKey, todayString])

  // ACWR機能へのApple Health連携（2026年8月27日）：ACWRの慢性負荷計算（28日）が
  // 必要とするため、acwrSportLogsと全く同じ「直近28日・常にtoday終端」の範囲で
  // workoutsを取得する（週間ストリップ用のweekWorkouts＝weekOffsetで変動する範囲
  // とは別。前回実装した単日のみのtodayWorkouts取得は、このacwrWorkouts
  // （todayを含む上位互換の範囲）に統合し廃止した。リカバリー窓機能でも同じ
  // 範囲を使っていたが、同機能の削除（2026年8月30日）に伴いACWR専用の
  // 取得理由のみが残っている）。
  const [acwrWorkouts, setAcwrWorkouts] = useState<Workout[]>([])
  const [isAcwrWorkoutsLoaded, setIsAcwrWorkoutsLoaded] = useState(false)

  useEffect(() => {
    let isMounted = true
    setIsAcwrWorkoutsLoaded(false)

    fetchWorkouts(acwrChronicStartKey, todayString)
      .then((data) => {
        if (isMounted) {
          setAcwrWorkouts(data)
        }
      })
      .catch((error) => {
        console.error('Supabaseから疲労残高計算用のワークアウト記録の取得に失敗しました', error)
      })
      .finally(() => {
        if (isMounted) {
          setIsAcwrWorkoutsLoaded(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [acwrChronicStartKey, todayString])

  // 両方の取得が完了するまでは「データ未確定」扱いとする（上記コメント参照）。
  const isAcwrWindowDataLoaded = isAcwrSportLogsLoaded && isAcwrWorkoutsLoaded

  // スプリント3（MD基準の栄養調整、2026年8月18日）：MD判定には選択日の前日〜
  // 3日後を含む範囲の予定が必要だが、週間ストリップ用のweekSchedules（週境界で
  // 区切られる）をそのまま使うと、選択日が週の先頭/末尾付近の場合に必要な試合
  // 予定が範囲外になり判定を誤る可能性がある。このため週の取得範囲とは独立して、
  // selectedDateKeyを中心とした専用の窓でスケジュールを取得する。カロリーリング
  // 等の他のカードと同じくselectedDateKey基準（ACWRGaugeCardのようなtodayString
  // 固定カードではない）とした——補正対象のカロリーリング自体がselectedDateKey
  // 基準のため、一致させる方が自然と判断。
  const [mdWindowSchedules, setMdWindowSchedules] = useState<TrainingSchedule[]>([])
  const mdWindowStartKey = useMemo(() => {
    const date = new Date(`${selectedDateKey}T00:00:00`)
    date.setDate(date.getDate() - 1)
    return toChartDateKey(date)
  }, [selectedDateKey])
  const mdWindowEndKey = useMemo(() => {
    const date = new Date(`${selectedDateKey}T00:00:00`)
    date.setDate(date.getDate() + 3)
    return toChartDateKey(date)
  }, [selectedDateKey])

  useEffect(() => {
    let isMounted = true

    fetchTrainingSchedules(mdWindowStartKey, mdWindowEndKey)
      .then((data) => {
        if (isMounted) {
          setMdWindowSchedules(data)
        }
      })
      .catch((error) => {
        console.error('Supabaseから試合日判定用の予定の取得に失敗しました', error)
      })

    return () => {
      isMounted = false
    }
  }, [mdWindowStartKey, mdWindowEndKey])

  const mdStatus = useMemo(
    () => getMatchDayStatus(mdWindowSchedules, selectedDateKey),
    [mdWindowSchedules, selectedDateKey],
  )
  const periodizationTarget = useMemo(() => calculateAdjustedGoals(goals, mdStatus), [goals, mdStatus])
  const mdBadgeLabel = mdStatus === 'MD' ? 'MATCH DAY' : mdStatus

  const weekSchedulesByDate = useMemo(() => {
    const map = new Map<string, TrainingSchedule[]>()
    weekSchedules.forEach((schedule) => {
      const list = map.get(schedule.scheduledDate) ?? []
      list.push(schedule)
      map.set(schedule.scheduledDate, list)
    })
    return map
  }, [weekSchedules])

  const weekSportLogsByDate = useMemo(() => {
    const map = new Map<string, SportLog[]>()
    weekSportLogs.forEach((log) => {
      const list = map.get(log.date) ?? []
      list.push(log)
      map.set(log.date, list)
    })
    return map
  }, [weekSportLogs])

  // カレンダー実績アイコン機能（日付ベース簡易マッチング方式、2026年8月20日）：
  // MonthlyCalendarと同じ判定ロジック（buildActivityByDate・getCalendarCellState）を
  // 使い、月次カレンダーと週間ストリップの表示が食い違わないようにする。
  const trainingLogsByDate = useMemo(() => {
    const map = new Map<string, TrainingLog[]>()
    trainingLogs.forEach((log) => {
      if (log.exercises.length === 0) {
        return
      }
      const list = map.get(log.date) ?? []
      list.push(log)
      map.set(log.date, list)
    })
    return map
  }, [trainingLogs])

  // Apple Health連携（2026年8月27日）：fetchWorkoutsが既にis_primary = trueの
  // 行のみを返すため、ここでの追加フィルタは不要（Task3で確立した既存パターン）。
  const weekWorkoutsByDate = useMemo(() => {
    const map = new Map<string, Workout[]>()
    weekWorkouts.forEach((workout) => {
      const dateKey = toJstDateKeyFromIso(workout.startTime)
      const list = map.get(dateKey) ?? []
      list.push(workout)
      map.set(dateKey, list)
    })
    return map
  }, [weekWorkouts])

  const weekActivityByDate = useMemo(
    () => buildActivityByDate(weekSchedulesByDate, weekWorkoutsByDate, weekSportLogsByDate),
    [weekSchedulesByDate, weekWorkoutsByDate, weekSportLogsByDate],
  )

  // 週間達成率リング（2026年11月6日）：日ごとの達成率（定義は utils/weeklyAchievementHelpers.ts）
  const weekAchievements = useMemo(() => {
    const result = new Map<string, ReturnType<typeof calculateDailyAchievement>>()
    for (const { dateKey } of weekDates) {
      const activity = weekActivityByDate.get(dateKey)
      result.set(
        dateKey,
        calculateDailyAchievement({
          date: dateKey as DateString,
          today: todayString,
          mealLogs,
          dailyConditions,
          // 目標を読み込めていないときは、仮の初期値で判定しないよう目標の月を空にする（カロリー・たんぱく質を数えない）
          // 食事記録を読み込めていないときも、カロリー・たんぱく質は判定できないので同じ扱いにする
          goals: goalsStatus === 'loaded' && mealLogsStatus === 'loaded' ? goals : { ...goals, yearMonth: '' },
          conditionKnown: dailyConditionsStatus === 'loaded',
          // 予定・トレーニング記録のどちらかを読み込めていなければ、トレーニングは数えない
          hasSchedule:
            weekActivityStatus === 'loaded' && trainingLogsStatus === 'loaded' ? (activity?.has('workout') ?? false) : null,
          hasTrainingRecord:
            (trainingLogsByDate.get(dateKey)?.length ?? 0) > 0 ||
            (activity?.has('appleWorkout') ?? false) ||
            (activity?.has('sport') ?? false),
        }),
      )
    }
    return result
  }, [
    weekDates,
    weekActivityByDate,
    weekActivityStatus,
    todayString,
    mealLogs,
    mealLogsStatus,
    dailyConditions,
    dailyConditionsStatus,
    goals,
    goalsStatus,
    trainingLogsByDate,
    trainingLogsStatus,
  ])

  // ACWRGaugeCard・目標ストリップは日付選択の対象外のため、常にtodayString基準の
  // 実測値を使う（ホーム日付選択機能の影響を受けない）。
  const todayCondition = useMemo(
    () => dailyConditions.find((condition) => condition.date === todayString),
    [dailyConditions, todayString],
  )

  // 暫定値表示バグ対応（Phase 0.5、2026年9月17日）：isAcwrWindowDataLoadedが
  // falseの間（acwrWorkouts/acwrSportLogsのfetchが完了していない間）は、
  // 空配列のまま計算した「誤った暫定値」を返さずnullを返す。acwrHelpers.ts側の
  // calculateACWR自体は無変更（データ不足7日未満の場合と同じnull形式を、
  // ロード未完了の場合にも流用する形でDashboard.tsx側のみで対応）。
  const acwrResult = useMemo(
    () =>
      isAcwrWindowDataLoaded
        ? calculateACWR(
            trainingLogs,
            todayString,
            todayCondition?.muscleSorenessLevel,
            todayCondition?.muscleSorenessLocation,
            acwrWorkouts,
            dailyConditions,
            acwrSportLogs,
          )
        : null,
    [isAcwrWindowDataLoaded, trainingLogs, todayString, todayCondition, acwrWorkouts, dailyConditions, acwrSportLogs],
  )
  const acwrDaysUntilAvailable = useMemo(
    () => daysUntilACWRAvailable(trainingLogs, todayString, acwrSportLogs),
    [trainingLogs, todayString, acwrSportLogs],
  )
  // ディロード自動提案（実装指示書Phase C、2026年8月18日）：直近3日連続で
  // 🔴警戒状態が続いている場合に警告を表示する。ACWRGaugeCard同様、日付選択の
  // 対象外でtodayString基準のまま。
  // 暫定値表示バグ対応（Phase 0.5、2026年9月17日）：acwrResultと同じ理由で、
  // ロード未完了の間はfalse（警告なし）とする。
  const showDeloadWarning = useMemo(
    () =>
      isAcwrWindowDataLoaded &&
      hasConsecutiveDangerDays(trainingLogs, dailyConditions, todayString, 3, acwrWorkouts, acwrSportLogs),
    [isAcwrWindowDataLoaded, trainingLogs, dailyConditions, todayString, acwrWorkouts, acwrSportLogs],
  )

  // 週次ACWRインサイト機能（2026年8月25日）：ACWRGaugeCard・目標ストリップと同じく
  // 日付選択（selectedDateKey）の対象外でtodayString基準のまま固定する（「常に本日を
  // 終端とした直近の推移」という指示書の定義に従う）。28日分をここで一度だけ計算し、
  // ミニカードのスパークライン（末尾7件）・詳細モーダルのメイングラフ（全28件）の
  // 両方で使い回す（DBキャッシュせず動的計算する既存方針はACWR機能全体で踏襲）。
  // 暫定値表示バグ対応（Phase 0.5、2026年9月17日）：acwrResultと同じ理由で、
  // ロード未完了の間は空配列とする（ACWRGaugeCard側のisLoading表示に委ねる）。
  const weeklyACWRSeries = useMemo(
    () =>
      isAcwrWindowDataLoaded
        ? calculateDailyACWRSeries(trainingLogs, todayString, 28, acwrWorkouts, dailyConditions, acwrSportLogs)
        : [],
    [isAcwrWindowDataLoaded, trainingLogs, todayString, acwrWorkouts, dailyConditions, acwrSportLogs],
  )
  const [isWeeklyACWRDetailOpen, setIsWeeklyACWRDetailOpen] = useState(false)

  // ホーム日付選択（A-2）：カロリーリング・統計カードは週間ストリップで
  // 選んだ日付（selectedDateKey）基準に切り替わる。閲覧専用で、記録の追加・
  // 編集は既存の「＋」ボタン（常に今日固定）経由でのみ行う。
  const todayMealLogs = useMemo(
    () => mealLogs.filter((log) => log.date === selectedDateKey),
    [mealLogs, selectedDateKey],
  )

  const todayMealTotals = useMemo(() => {
    return todayMealLogs.reduce(
      (acc, log) => ({
        calories: acc.calories + log.calories,
        protein: acc.protein + log.protein,
        fat: acc.fat + log.fat,
        carbohydrates: acc.carbohydrates + log.carbohydrates,
      }),
      { calories: 0, protein: 0, fat: 0, carbohydrates: 0 },
    )
  }, [todayMealLogs])

  // スプリント3（MD基準の栄養調整、2026年8月18日）：カロリーリング自体は
  // periodizationTarget（MD補正後、非補正時は基本目標値と同値）を分母に採用する。
  // （以前あった下部の「栄養詳細」アコーディオンは、2026年11月6日の画面の整理で外した）
  const calorieRingRate = periodizationTarget.calorieTarget > 0
    ? Math.min(100, Math.round((todayMealTotals.calories / periodizationTarget.calorieTarget) * 100))
    : 0
  const calorieRingData = useMemo(
    () => [{ name: 'calorie', value: calorieRingRate, fill: 'var(--color-accent)' }],
    [calorieRingRate],
  )
  // アールデコ調UI刷新 Phase1（2026年9月19日）：カロリーリング弧の先端に
  // 装飾ドットを置くための座標計算。リング本体（下記RadialBarChart）の
  // width/height=180・innerRadius=70/outerRadius=86・startAngle=90・
  // endAngle=-270と完全に一致させる必要があるため、ここで値を揃えて算出する
  // （リング本体の色・機能自体は変更していない、装飾のみの追加）。
  const calorieRingOrnamentPosition = useMemo(() => {
    const centerX = 90
    const centerY = 90
    const radius = (70 + 86) / 2
    const angleDeg = 90 - 360 * (calorieRingRate / 100)
    const angleRad = (angleDeg * Math.PI) / 180
    return {
      left: centerX + radius * Math.cos(angleRad),
      top: centerY - radius * Math.sin(angleRad),
    }
  }, [calorieRingRate])

  // 移動平均（スプリント2、2026年8月17日）：DBにはキャッシュせず、ACWR機能と同じ方針で
  // 呼び出しのたびにdailyConditionsから動的計算する。統計カードのメイン表示を
  // 「本日実測値」から「7日移動平均」に変更し、日々のノイズに惑わされないトレンドを示す。
  const weightMA = useMemo(() => calculateMovingAverage(dailyConditions, 'date', 'weight'), [dailyConditions])
  const sleepMA = useMemo(() => calculateMovingAverage(dailyConditions, 'date', 'sleepHours'), [dailyConditions])
  const fatigueMA = useMemo(() => calculateMovingAverage(dailyConditions, 'date', 'fatigue'), [dailyConditions])

  // 設定画面拡張 Phase 4（ゲーミフィケーション、2026年8月28日）：ストリーク表示・
  // バッジ判定はいずれも「常に本日を終端とした状態」を示す指標のため、
  // ACWRGaugeCard等と同じくselectedDateKeyの影響を受けずtodayString/today基準の
  // まま固定する。streakHelpers.calculateCurrentStreak（既存、変更なし）を再利用。
  // sportLogsはacwrSportLogs（直近28日分、ACWR計算用に既に取得済み）をそのまま
  // 流用する——streak_30バッジ（30日連続）の判定では、対象日がsportLogsのみに
  // 記録がある日かつ29〜30日前だった場合に限り、実際より最大2日ほど短く算出される
  // 可能性がある既知の制限がある（badge判定のためだけに全期間sportLogsを別途
  // 問い合わせることを避けるためのトレードオフ、詳細はPR説明に記載）。
  const currentStreak = useMemo(
    () => calculateCurrentStreak(trainingLogs, mealLogs, dailyConditions, today, acwrSportLogs),
    [trainingLogs, mealLogs, dailyConditions, today, acwrSportLogs],
  )
  const hasAnyRecord =
    trainingLogs.length > 0 || mealLogs.length > 0 || dailyConditions.length > 0 || acwrSportLogs.length > 0
  const todaySleepMovingAverageHours = sleepMA.length > 0 ? sleepMA[sleepMA.length - 1].movingAvg : null
  const isOptimalZoneStreak = useMemo(
    () => hasConsecutiveOptimalDays(trainingLogs, dailyConditions, todayString, 7, acwrWorkouts, acwrSportLogs),
    [trainingLogs, dailyConditions, todayString, acwrWorkouts, acwrSportLogs],
  )

  useBadgeEvaluator({
    hasAnyRecord,
    currentStreak,
    sleepMovingAverageHours: todaySleepMovingAverageHours,
    isOptimalZoneStreak,
  })

  // ホーム日付選択（A-3）：「今日」表示中は既存どおり最新の記録日（必ずしも
  // todayStringと一致しない）にフォールバックする。過去日を選択した場合は
  // 「既存ルール踏襲」の指示に従い、その日にちょうど記録があるときだけ表示し、
  // なければnull（該当カードは非表示）にする——最新値へのフォールバックはしない。
  const latestWeightMA = isViewingToday
    ? weightMA.length > 0
      ? weightMA[weightMA.length - 1]
      : null
    : findMAPointForDate(weightMA, selectedDateKey)
  const latestSleepMA = isViewingToday
    ? sleepMA.length > 0
      ? sleepMA[sleepMA.length - 1]
      : null
    : findMAPointForDate(sleepMA, selectedDateKey)
  const latestFatigueMA = isViewingToday
    ? fatigueMA.length > 0
      ? fatigueMA[fatigueMA.length - 1]
      : null
    : findMAPointForDate(fatigueMA, selectedDateKey)

  // 前週比＝表示中の移動平均値と、そのちょうど7日前の移動平均値との差分
  // （「本日実測」同士の日次比較だったPhase 3のロジックから、移動平均同士の比較に変更）。
  const weightTrend = useMemo(() => {
    if (!latestWeightMA) return null
    const previous = findPointDaysBefore(weightMA, latestWeightMA.date, 7)
    if (!previous) return null
    const diff = latestWeightMA.movingAvg - previous.movingAvg
    const tone = getTrendTone('weight', diff)
    return { text: tone === 'neutral' ? '±0kg' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}kg`, tone }
  }, [weightMA, latestWeightMA])

  const sleepTrend = useMemo(() => {
    if (!latestSleepMA) return null
    const previous = findPointDaysBefore(sleepMA, latestSleepMA.date, 7)
    if (!previous) return null
    const diff = latestSleepMA.movingAvg - previous.movingAvg
    const tone = getTrendTone('sleep_hours', diff)
    return { text: tone === 'neutral' ? '±0h' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}h`, tone }
  }, [sleepMA, latestSleepMA])

  const fatigueTrend = useMemo(() => {
    if (!latestFatigueMA) return null
    const previous = findPointDaysBefore(fatigueMA, latestFatigueMA.date, 7)
    if (!previous) return null
    const diff = latestFatigueMA.movingAvg - previous.movingAvg
    const tone = getTrendTone('fatigue_level', diff)
    return { text: tone === 'neutral' ? '±0' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}`, tone }
  }, [fatigueMA, latestFatigueMA])

  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const currentMonthTrainingCount = trainingLogs.filter((log) => log.date.startsWith(currentMonthKey)).length
  const monthlyAchievementRate = goals.monthlyTrainingGoal > 0
    ? Math.min(100, Math.round((currentMonthTrainingCount / goals.monthlyTrainingGoal) * 100))
    : 0

  // 統計カードの「実測」注記（本日実測 / 実測）は、選択日にちょうど記録があるときだけ表示する。
  const selectedCondition = useMemo(
    () => dailyConditions.find((condition) => condition.date === selectedDateKey),
    [dailyConditions, selectedDateKey],
  )

  const selectedDateLabel = useMemo(() => formatSelectedDateLabel(selectedDateKey), [selectedDateKey])
  const selectedDateShortLabel = useMemo(() => formatSelectedDateShort(selectedDateKey), [selectedDateKey])
  const calorieCardTitle = isViewingToday ? '今日のカロリー' : `${selectedDateShortLabel}のカロリー`

  return (
    <>
      <div className="dashboard-header">
        <div className="dashboard-header__row">
          <div>
            <p className="eyebrow">Workout App</p>
            <h1>{formattedDate}</h1>
          </div>
          <div className="dashboard-header__actions">
            <button
              type="button"
              className="btn-icon dashboard-header__bell-button"
              onClick={() => setIsNotificationModalOpen(true)}
              aria-label={unreadNotificationCount > 0 ? `通知を開く（未読${unreadNotificationCount}件）` : '通知を開く'}
            >
              <BellIcon strokeWidth={1.8} />
              {unreadNotificationCount > 0 ? (
                <span className="dashboard-header__bell-badge">{unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}</span>
              ) : null}
            </button>
            <button
              type="button"
              className="btn-icon dashboard-header__timer-button"
              onClick={() => setIsTimerOpen(true)}
              aria-label="休憩タイマーを開く"
            >
              <TimerIcon strokeWidth={1.8} />
            </button>
          </div>
        </div>
        {!isViewingToday ? (
          <div className="dashboard-date-context">
            <span className="dashboard-date-context__label">📅 {selectedDateLabel}を表示中</span>
            <button
              type="button"
              className="btn-secondary btn-secondary--sm"
              onClick={() => setSelectedDateKey(todayString)}
            >
              ✕ 今日に戻る
            </button>
          </div>
        ) : null}
        {currentStreak > 0 ? (
          <p className="dashboard-streak-badge">
            <TrackRing value={Math.min(100, (currentStreak / 7) * 100)} size={28} strokeWidth={3}>
              <span aria-hidden="true">🔥</span>
            </TrackRing>
            <span className="reveal-fade">{currentStreak}日連続</span>
          </p>
        ) : null}
      </div>

      <section className="panel-card calorie-card">
        <div className="calorie-card__header">
          <h2 className="panel-card__title">{calorieCardTitle}</h2>
          {mdBadgeLabel ? <span className="md-badge">{mdBadgeLabel}</span> : null}
        </div>
        <div className="calorie-ring">
          <RadialBarChart
            width={180}
            height={180}
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={86}
            barSize={12}
            data={calorieRingData}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
            <RadialBar background={{ fill: 'var(--color-ring-track)' }} dataKey="value" cornerRadius={20} />
          </RadialBarChart>
          {calorieRingRate > 0 ? (
            <span
              className="calorie-ring__ornament"
              aria-hidden="true"
              style={{ left: `${calorieRingOrnamentPosition.left}px`, top: `${calorieRingOrnamentPosition.top}px` }}
            />
          ) : null}
          <div className="calorie-ring__center">
            <span className="calorie-ring__value metric-value reveal-fade">{todayMealTotals.calories}</span>
            <span className="calorie-ring__goal reveal-fade">/ {periodizationTarget.calorieTarget} kcal</span>
          </div>
        </div>
        {periodizationTarget.isAdjusted && goals.dailyCalorieGoal > 0 ? (
          <p className="calorie-card__adjustment-note">
            試合前調整 {periodizationTarget.calorieTarget >= goals.dailyCalorieGoal ? '+' : ''}
            {Math.round((periodizationTarget.calorieTarget / goals.dailyCalorieGoal - 1) * 100)}%
          </p>
        ) : null}
        <div className="calorie-ring__pfc">
          <span className="pfc-dot">
            <i className="pfc-dot__marker pfc-dot__marker--protein" />P {todayMealTotals.protein}
            /{periodizationTarget.proteinTarget}g
          </span>
          <span className="pfc-dot">
            <i className="pfc-dot__marker pfc-dot__marker--fat" />F {todayMealTotals.fat}
            /{periodizationTarget.fatTarget}g
          </span>
          <span className="pfc-dot">
            <i className="pfc-dot__marker pfc-dot__marker--carb" />C {todayMealTotals.carbohydrates}
            /{periodizationTarget.carbsTarget}g
          </span>
        </div>
      </section>

      <CharacterStatusCard
        acwrStatus={acwrResult?.status ?? null}
        fatigue={todayCondition?.fatigue}
        sleepHours={todayCondition?.sleepHours}
      />

      <ACWRGaugeCard
        result={acwrResult}
        daysUntilAvailable={acwrDaysUntilAvailable}
        sorenessLocation={todayCondition?.muscleSorenessLocation}
        sorenessLevel={todayCondition?.muscleSorenessLevel}
        showDeloadWarning={showDeloadWarning}
        isLoading={!isAcwrWindowDataLoaded}
        trendPoints={weeklyACWRSeries.slice(-7)}
        onOpenDetail={() => setIsWeeklyACWRDetailOpen(true)}
      />

      <section className="panel-card week-strip">
        <div className="week-strip__header">
          <h2 className="panel-card__title">今週の記録</h2>
          <div className="week-strip__nav">
            {weekOffset !== 0 ? (
              <button
                type="button"
                className="btn-secondary btn-secondary--sm calendar-nav__today"
                onClick={() => setWeekOffset(0)}
              >
                今週に戻る
              </button>
            ) : null}
            <button type="button" className="btn-icon" onClick={() => setWeekOffset((offset) => offset - 1)} aria-label="前週">
              <ChevronLeftIcon />
            </button>
            <button type="button" className="btn-icon" onClick={() => setWeekOffset((offset) => offset + 1)} aria-label="翌週">
              <ChevronRightIcon />
            </button>
          </div>
        </div>
        <div className="week-strip__grid">
          {weekDates.map(({ date, dateKey }, index) => {
            const isToday = dateKey === todayString
            const isSelected = dateKey === selectedDateKey
            const daySchedules = weekSchedulesByDate.get(dateKey) ?? []
            const dayTrainingLogs = trainingLogsByDate.get(dateKey) ?? []
            const achievement = weekAchievements.get(dateKey) ?? null
            const items = getCalendarCellState({
              isPast: dateKey < todayString,
              hasSchedule: weekActivityByDate.get(dateKey)?.has('workout') ?? false,
              scheduleIcon: getScheduleIcon(daySchedules),
              hasTrainingLog: dayTrainingLogs.length > 0,
              hasAppleWorkout: weekActivityByDate.get(dateKey)?.has('appleWorkout') ?? false,
              hasSportLog: weekActivityByDate.get(dateKey)?.has('sport') ?? false,
            })

            return (
              <div key={dateKey} className="week-strip__column">
              <button
                type="button"
                className={`week-strip__cell ${isToday ? 'week-strip__cell--today' : ''} ${isSelected ? 'week-strip__cell--selected' : ''}`}
                onClick={() => setSelectedDateKey(dateKey)}
                aria-pressed={isSelected}
                aria-label={`${date.getMonth() + 1}月${date.getDate()}日の記録を見る`}
              >
                <span className="week-strip__day-label">{weekDays[index]}</span>
                <span className="week-strip__date metric-value">{date.getDate()}</span>
                <span className="week-strip__icons">
                  {items.map((item, itemIndex) => (
                    <span key={`${item.type}-${itemIndex}`} className={`week-strip__item week-strip__item--${item.status}`}>
                      {item.icon}
                      {item.status === 'completed_planned' ? <span className="week-strip__item-badge">✅</span> : null}
                    </span>
                  ))}
                </span>
              </button>
              {/* 週間達成率リング（2026年11月6日）：その日の達成率（定義は utils/weeklyAchievementHelpers.ts） */}
              <div
                className="week-strip__achievement"
                role="img"
                aria-label={
                  achievement
                    ? `${date.getMonth() + 1}月${date.getDate()}日の達成率${achievement.percent}%（${achievement.items
                        .map((item) => `${item.label}${item.achieved ? '達成' : '未達成'}`)
                        .join('、')}）`
                    : dateKey > todayString
                      ? `${date.getMonth() + 1}月${date.getDate()}日はまだ先の日です`
                      : `${date.getMonth() + 1}月${date.getDate()}日は、判定できる項目がありません`
                }
              >
                <TrackRing value={achievement?.percent ?? 0} size={24} strokeWidth={3} />
                <span className="week-strip__achievement-value">{achievement ? achievement.percent : '–'}</span>
              </div>
              </div>
            )
          })}
        </div>
        {/* 画面の整理（2026年11月6日）：リングの定義は畳んでおき、押したときだけ出す（プログレッシブ・ディスクロージャ） */}
        <details className="week-strip__achievement-legend">
          <summary>リング＝その日の達成率</summary>
          カロリー目標の80〜120%・たんぱく質目標の90%以上・体調の記録・予定したトレーニングのうち、達成した割合
        </details>
        {/* 読み込めなかった項目の注記は、判定に関わるため畳まずに出す */}
        {(() => {
          const notes = [
            weekActivityStatus === 'failed' ? '予定を読み込めなかったため、トレーニングは含めていません' : '',
            goalsStatus === 'failed' ? '目標を読み込めなかったため、カロリー・たんぱく質は含めていません' : '',
            goalsStatus === 'missing' ? '今月の目標が未設定のため、カロリー・たんぱく質は含めていません' : '',
            dailyConditionsStatus === 'failed' ? '体調の記録を読み込めなかったため、体調は含めていません' : '',
            mealLogsStatus === 'failed' ? '食事の記録を読み込めなかったため、カロリー・たんぱく質は含めていません' : '',
            trainingLogsStatus === 'failed' ? 'トレーニングの記録を読み込めなかったため、トレーニングは含めていません' : '',
            weekDates.some(({ dateKey }) => dateKey.slice(0, 7) !== goals.yearMonth)
              ? '今月以外の日は、カロリー・たんぱく質を含めていません'
              : '',
          ].filter(Boolean)
          return notes.length > 0 ? <p className="week-strip__achievement-note">{notes.join('。')}</p> : null
        })()}
        <button
          type="button"
          className="detail-link week-strip__calendar-link"
          onClick={() => navigate(`/calendar?date=${selectedDateKey}&tab=training`)}
        >
          {isViewingToday ? '今日' : `${Number(selectedDateKey.slice(5, 7))}月${Number(selectedDateKey.slice(8, 10))}日`}の記録をカレンダーで見る →
        </button>
      </section>

      <RecommendationCard
        mealLogs={mealLogs}
        trainingLogs={trainingLogs}
        goals={goals}
        goalsStatus={goalsStatus}
        mealLogsStatus={mealLogsStatus}
        trainingLogsStatus={trainingLogsStatus}
        todayString={todayString}
      />

      <section className="panel-card stats-card">
        <h2 className="panel-card__title">体調（7日平均）</h2>
        {/* 「実測」注記の0値/未記録表示バグ対応（Phase 1-2、2026年9月14日）：
            selectedConditionは「その日にdaily_conditions行が存在するか」のみを
            表す（例：体重だけ入力した部分upsert行にはsleepHours=0・
            fatigue=undefinedのまま存在しうる）。weight>0の実装（2026年9月3日、
            体重0kg表示バグ対応）は既にあったが、sleepHours・fatigueの「実測」
            注記には同種のガードが漏れていたため、3項目とも実測時のみ表示する
            よう統一した（今回の作業で発見・修正）。 */}
        <div className="stats-grid">
          {isViewingToday || latestWeightMA ? (
            <article className="stat-card">
              <div className="stat-card__header">
                <WeightIcon className="stat-card__icon" strokeWidth={1.8} />
                {weightTrend ? <span className={`trend-badge trend-badge--${weightTrend.tone}`}>{weightTrend.text}</span> : null}
              </div>
              <span className="stat-card__label">体重</span>
              <strong className="stat-card__value metric-value">
                {latestWeightMA ? `${latestWeightMA.movingAvg.toFixed(1)}kg` : '記録なし'}
              </strong>
              {selectedCondition && selectedCondition.weight > 0 ? (
                <span className="stat-card__note">
                  {isViewingToday ? '今日' : 'この日'} {selectedCondition.weight.toFixed(1)}kg
                </span>
              ) : null}
            </article>
          ) : null}

          {isViewingToday || latestSleepMA ? (
            <article className="stat-card">
              <div className="stat-card__header">
                <SleepIcon className="stat-card__icon" strokeWidth={1.8} />
                {sleepTrend ? <span className={`trend-badge trend-badge--${sleepTrend.tone}`}>{sleepTrend.text}</span> : null}
              </div>
              <span className="stat-card__label">睡眠</span>
              <strong className="stat-card__value metric-value">
                {latestSleepMA ? `${latestSleepMA.movingAvg.toFixed(1)}h` : '記録なし'}
              </strong>
              {selectedCondition && selectedCondition.sleepHours > 0 ? (
                <span className="stat-card__note">
                  {isViewingToday ? '今日' : 'この日'} {selectedCondition.sleepHours.toFixed(1)}h
                </span>
              ) : null}
            </article>
          ) : null}

          {isViewingToday || latestFatigueMA ? (
            <article className="stat-card">
              <div className="stat-card__header">
                <FatigueIcon className="stat-card__icon" strokeWidth={1.8} />
                {fatigueTrend ? <span className={`trend-badge trend-badge--${fatigueTrend.tone}`}>{fatigueTrend.text}</span> : null}
              </div>
              <span className="stat-card__label">疲労度</span>
              <strong className="stat-card__value metric-value">
                {latestFatigueMA ? `${latestFatigueMA.movingAvg.toFixed(1)}/5` : '記録なし'}
              </strong>
              {selectedCondition && selectedCondition.fatigue !== undefined ? (
                <span className="stat-card__note">
                  {isViewingToday ? '今日' : 'この日'} {selectedCondition.fatigue}/5
                </span>
              ) : null}
            </article>
          ) : null}

          {!isViewingToday && !latestWeightMA && !latestSleepMA && !latestFatigueMA ? (
            <p className="no-record stats-grid__empty">この日の体調の記録はありません</p>
          ) : null}
          {/* 画面の整理（2026年11月6日）：「直近の記録」と「今週の総挙上重量」のタイルを外した
              （総挙上重量はグラフ画面の総ボリュームと重なるため）。 */}
        </div>
      </section>

      <section className="panel-card goal-strip">
        <div className="goal-strip__header">
          <h2 className="panel-card__title">{today.getMonth() + 1}月の目標</h2>
          <span className="goal-strip__rate">{monthlyAchievementRate}%</span>
        </div>
        <p className="goal-strip__text">
          トレーニング {currentMonthTrainingCount} / {goals.monthlyTrainingGoal}回
        </p>
        <div className="progress-meter" aria-label="今月のトレーニング進捗">
          <div className="progress-meter__fill" style={{ width: `${monthlyAchievementRate}%` }} />
        </div>
      </section>

      {/* 2026年11月2日：目標の表示が重なっていたため、ホームの目標パネル（アコーディオン）を外した
          （Johnさん確認）。ホームは上の「○月の目標」カード、目標の確認・変更は設定画面の目標パネルで行う。 */}

      {isTimerOpen ? <RestTimerModal onClose={() => setIsTimerOpen(false)} /> : null}
      {isWeeklyACWRDetailOpen ? (
        <WeeklyACWRDetailModal
          seriesPoints={weeklyACWRSeries}
          chronicDaysAvailable={acwrResult?.chronicDays ?? 28}
          daysUntilAvailable={acwrDaysUntilAvailable}
          result={acwrResult}
          onClose={() => setIsWeeklyACWRDetailOpen(false)}
        />
      ) : null}
      {isNotificationModalOpen ? (
        <NotificationModal
          notifications={notifications}
          onMarkRead={handleMarkNotificationRead}
          onClose={() => setIsNotificationModalOpen(false)}
        />
      ) : null}
    </>
  )
}
