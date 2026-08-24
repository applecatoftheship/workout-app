import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PolarAngleAxis, RadialBar, RadialBarChart } from 'recharts'
import './Dashboard.css'
import { GoalPanel } from '../components/GoalPanel'
import { ACWRGaugeCard } from '../components/ACWRGaugeCard'
import { RecoveryWindowCard } from '../components/RecoveryWindowCard'
import { BellIcon, ChevronLeftIcon, ChevronRightIcon, FatigueIcon, HistoryIcon, SleepIcon, TimerIcon, WeightIcon } from '../components/icons'
import { RestTimerModal } from '../components/timer/RestTimerModal'
import { NotificationModal } from '../components/NotificationModal'
import { fetchTrainingSchedules } from '../api/trainingSchedules'
import { fetchSoccerLogs } from '../api/soccerLogs'
import { fetchNotifications, markNotificationRead } from '../api/notifications'
import { getScheduleIcon, buildActivityByDate, getCalendarCellState, toDateKey, weekDays } from '../utils/calendarHelpers'
import { APP_VIEW_PATHS } from '../utils/appViewPaths'
import { calculateACWR, daysUntilACWRAvailable, hasConsecutiveDangerDays } from '../utils/acwrHelpers'
import { calculateDailyRecoveryResults, DEFAULT_RECOVERY_WINDOW_CONFIG } from '../utils/recoveryHelpers'
import { calculateAdjustedGoals, getMatchDayStatus } from '../utils/periodizationHelpers'
import { calculateMovingAverage, getTrendTone, toDateKey as toChartDateKey } from '../utils/chartHelpers'
import type { MAPoint } from '../utils/chartHelpers'
import type { Goals } from '../api/goals'
import type {
  AppNotification,
  DailyCondition,
  DateString,
  MealLog,
  SoccerLog,
  TrainingLog,
  TrainingLogExercise,
  TrainingSchedule,
} from '../types'

function formatExerciseCompact(exercise: TrainingLogExercise) {
  const name = exercise.exercise?.name ?? '不明な種目'

  if (exercise.sets.length === 0) {
    return `${name}（記録なし）`
  }

  const firstSet = exercise.sets[0]
  const weightText = firstSet.weight != null ? `${firstSet.weight}kg` : '-'
  const repsText = firstSet.reps != null ? `${firstSet.reps}回` : '-'
  return `${name} - ${weightText}×${repsText}×${exercise.sets.length}セット`
}

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
  setGoals,
  today,
  todayString,
  formattedDate,
}: DashboardProps) {
  const navigate = useNavigate()
  const [isTodayDetailOpen, setIsTodayDetailOpen] = useState(false)
  const [isNutritionOpen, setIsNutritionOpen] = useState(false)
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
  const [weekSoccerLogs, setWeekSoccerLogs] = useState<SoccerLog[]>([])
  const [acwrSoccerLogs, setAcwrSoccerLogs] = useState<SoccerLog[]>([])
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

    Promise.all([fetchTrainingSchedules(weekStartKey, weekEndKey), fetchSoccerLogs(weekStartKey, weekEndKey)])
      .then(([scheduleData, soccerData]) => {
        if (isMounted) {
          setWeekSchedules(scheduleData)
          setWeekSoccerLogs(soccerData)
        }
      })
      .catch((error) => {
        console.error('Supabaseから今週の予定・サッカー記録の取得に失敗しました', error)
      })

    return () => {
      isMounted = false
    }
  }, [weekStartKey, weekEndKey])

  // ACWR（急性:慢性負荷比、スプリント1）の慢性負荷計算に必要な直近28日分のサッカー記録。
  // trainingLogsは既に全期間分がApp.tsxから渡されているため別途フェッチ不要だが、
  // soccerLogsは範囲指定フェッチのみのため、週間ストリップ用（7日）とは別に取得する。
  const acwrChronicStartKey = useMemo(() => {
    const start = new Date(today)
    start.setDate(today.getDate() - 27)
    return toDateKey(start.getFullYear(), start.getMonth() + 1, start.getDate())
  }, [today])

  useEffect(() => {
    let isMounted = true

    fetchSoccerLogs(acwrChronicStartKey, todayString)
      .then((data) => {
        if (isMounted) {
          setAcwrSoccerLogs(data)
        }
      })
      .catch((error) => {
        console.error('Supabaseから疲労残高計算用のサッカー記録の取得に失敗しました', error)
      })

    return () => {
      isMounted = false
    }
  }, [acwrChronicStartKey, todayString])

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

  const weekSoccerLogsByDate = useMemo(() => {
    const map = new Map<string, SoccerLog[]>()
    weekSoccerLogs.forEach((log) => {
      const list = map.get(log.date) ?? []
      list.push(log)
      map.set(log.date, list)
    })
    return map
  }, [weekSoccerLogs])

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

  const weekActivityByDate = useMemo(
    () => buildActivityByDate(weekSchedulesByDate, weekSoccerLogsByDate),
    [weekSchedulesByDate, weekSoccerLogsByDate],
  )

  // ACWRGaugeCard・目標ストリップは日付選択の対象外のため、常にtodayString基準の
  // 実測値を使う（ホーム日付選択機能の影響を受けない）。
  const todayCondition = useMemo(
    () => dailyConditions.find((condition) => condition.date === todayString),
    [dailyConditions, todayString],
  )

  const acwrResult = useMemo(
    () =>
      calculateACWR(
        trainingLogs,
        acwrSoccerLogs,
        todayString,
        todayCondition?.muscleSorenessLevel,
        todayCondition?.muscleSorenessLocation,
      ),
    [trainingLogs, acwrSoccerLogs, todayString, todayCondition],
  )
  const acwrDaysUntilAvailable = useMemo(
    () => daysUntilACWRAvailable(trainingLogs, acwrSoccerLogs, todayString),
    [trainingLogs, acwrSoccerLogs, todayString],
  )
  // ディロード自動提案（実装指示書Phase C、2026年8月18日）：直近3日連続で
  // 🔴警戒状態が続いている場合に警告を表示する。ACWRGaugeCard同様、日付選択の
  // 対象外でtodayString基準のまま。
  const showDeloadWarning = useMemo(
    () => hasConsecutiveDangerDays(trainingLogs, acwrSoccerLogs, dailyConditions, todayString),
    [trainingLogs, acwrSoccerLogs, dailyConditions, todayString],
  )

  // リカバリー窓機能（スプリント4 Phase 2、2026年8月21日）：ACWRGaugeCard同様、
  // 日付選択（selectedDateKey）の対象外でtodayString基準のまま固定する
  // （「当日のリカバリー状態カード」という実装指示書の定義に従う）。
  // 残り時間表示はレストタイマーと同じくsetIntervalの単純デクリメントにせず、
  // 「終了予定時刻 - 現在時刻」を都度再計算する方式にするため、現在時刻
  // （recoveryNow）をstateとして持ち、それをcalculateDailyRecoveryResultsの
  // 引数に渡すたびに再計算させる。
  const [recoveryNow, setRecoveryNow] = useState(() => new Date())

  const recoveryResults = useMemo(
    () => calculateDailyRecoveryResults(trainingLogs, acwrSoccerLogs, mealLogs, todayString, recoveryNow, DEFAULT_RECOVERY_WINDOW_CONFIG),
    [trainingLogs, acwrSoccerLogs, mealLogs, todayString, recoveryNow],
  )

  // activeなセッションが1つも無くなったら（missed/completedに確定した、または
  // そもそも当日end_timeを持つセッションが無い）1秒ごとの再計算を止める
  // （無駄な再レンダリングを防ぐ）。初回のrecoveryResultsは既にマウント時の
  // recoveryNowで計算済みのため、このゲート判定に循環参照はない。
  const hasActiveRecoverySession = recoveryResults.some((result) => result.status === 'active')
  useEffect(() => {
    if (!hasActiveRecoverySession) {
      return
    }
    const intervalId = window.setInterval(() => setRecoveryNow(new Date()), 1000)
    return () => window.clearInterval(intervalId)
  }, [hasActiveRecoverySession])

  // ホーム日付選択（A-2）：カロリーリング・統計カードは週間ストリップで
  // 選んだ日付（selectedDateKey）基準に切り替わる。閲覧専用で、記録の追加・
  // 編集は既存の「＋」ボタン（常に今日固定）経由でのみ行う。
  const todayTrainingLogs = useMemo(
    () => trainingLogs.filter((log) => log.date === selectedDateKey),
    [trainingLogs, selectedDateKey],
  )
  const todayMealLogs = useMemo(
    () => mealLogs.filter((log) => log.date === selectedDateKey),
    [mealLogs, selectedDateKey],
  )

  const todayLoggedExercises = todayTrainingLogs.flatMap((log) => log.exercises)

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

  const calorieRate = goals.dailyCalorieGoal > 0
    ? Math.min(100, Math.round((todayMealTotals.calories / goals.dailyCalorieGoal) * 100))
    : 0

  // スプリント3（MD基準の栄養調整、2026年8月18日）：カロリーリング自体は
  // periodizationTarget（MD補正後、非補正時は基本目標値と同値）を分母に採用する。
  // 下部の「栄養詳細」アコーディオン（calorieRateを使用）は基本目標値のまま据え置き、
  // 補正の反映範囲はカロリーリング周辺（本カード内）に限定した（指示書5-2節の
  // 「ダッシュボードのカロリーリング周辺」という記載範囲の判断）。
  const calorieRingRate = periodizationTarget.calorieTarget > 0
    ? Math.min(100, Math.round((todayMealTotals.calories / periodizationTarget.calorieTarget) * 100))
    : 0
  const calorieRingData = useMemo(
    () => [{ name: 'calorie', value: calorieRingRate, fill: 'var(--color-accent)' }],
    [calorieRingRate],
  )

  // 移動平均（スプリント2、2026年8月17日）：DBにはキャッシュせず、ACWR機能と同じ方針で
  // 呼び出しのたびにdailyConditionsから動的計算する。統計カードのメイン表示を
  // 「本日実測値」から「7日移動平均」に変更し、日々のノイズに惑わされないトレンドを示す。
  const weightMA = useMemo(() => calculateMovingAverage(dailyConditions, 'date', 'weight'), [dailyConditions])
  const sleepMA = useMemo(() => calculateMovingAverage(dailyConditions, 'date', 'sleepHours'), [dailyConditions])
  const fatigueMA = useMemo(() => calculateMovingAverage(dailyConditions, 'date', 'fatigue'), [dailyConditions])

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

  const mostRecentRecord = useMemo(() => {
    const candidates: { date: DateString; label: string }[] = []
    const latestTraining = [...trainingLogs].sort((a, b) => b.date.localeCompare(a.date))[0]
    if (latestTraining) candidates.push({ date: latestTraining.date, label: 'トレーニング' })
    const latestMeal = [...mealLogs].sort((a, b) => b.date.localeCompare(a.date))[0]
    if (latestMeal) candidates.push({ date: latestMeal.date, label: '食事' })
    const latestCondition = [...dailyConditions].sort((a, b) => b.date.localeCompare(a.date))[0]
    if (latestCondition) candidates.push({ date: latestCondition.date, label: '体調' })

    if (candidates.length === 0) return null
    return candidates.sort((a, b) => b.date.localeCompare(a.date))[0]
  }, [trainingLogs, mealLogs, dailyConditions])

  const mostRecentRecordDaysText = useMemo(() => {
    if (!mostRecentRecord) return null
    if (mostRecentRecord.date === todayString) return '今日'
    const diffDays = Math.round(
      (new Date(todayString).getTime() - new Date(mostRecentRecord.date).getTime()) / 86_400_000,
    )
    return `${diffDays}日前`
  }, [mostRecentRecord, todayString])

  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const currentMonthTrainingCount = trainingLogs.filter((log) => log.date.startsWith(currentMonthKey)).length
  const monthlyAchievementRate = goals.monthlyTrainingGoal > 0
    ? Math.min(100, Math.round((currentMonthTrainingCount / goals.monthlyTrainingGoal) * 100))
    : 0

  // ホーム画面「今日の内容」再構成（2026年8月22日）：旧・今日の運動カード
  // （exercise-card、削除済み）が使っていたtodayLoggedExercises・
  // formatExerciseCompactをそのまま流用し、アコーディオン内の要約テキストとする。
  const todayTrainingSummary = todayLoggedExercises.length > 0
    ? todayLoggedExercises.map((exercise) => formatExerciseCompact(exercise)).join(' / ')
    : '記録なし'

  // 統計カードの「実測」注記（本日実測 / 実測）は、選択日にちょうど記録があるときだけ表示する。
  const selectedCondition = useMemo(
    () => dailyConditions.find((condition) => condition.date === selectedDateKey),
    [dailyConditions, selectedDateKey],
  )

  const selectedDateLabel = useMemo(() => formatSelectedDateLabel(selectedDateKey), [selectedDateKey])
  const selectedDateShortLabel = useMemo(() => formatSelectedDateShort(selectedDateKey), [selectedDateKey])
  const calorieCardTitle = isViewingToday ? '今日のカロリー' : `${selectedDateShortLabel}のカロリー`
  const todayDetailTitle = isViewingToday ? '今日の内容' : `${selectedDateShortLabel}の内容`
  const nutritionDetailTitle = isViewingToday ? '今日の食事・PFC' : `${selectedDateShortLabel}の食事・PFC`

  const quickLinks = [
    {
      title: '月間カレンダー',
      description: '今月の予定と達成状況を確認',
      badge: 'Calendar',
      targetView: 'calendar' as const,
    },
    {
      title: 'トレーニング記録',
      description: 'セット数と負荷を振り返る',
      badge: 'Log',
      targetView: 'calendar' as const,
      query: `?date=${todayString}&tab=training`,
    },
    {
      title: '食事・PFC記録',
      description: '栄養バランスを管理する',
      badge: 'Meal',
      targetView: 'dashboard' as const,
    },
    {
      title: '進捗グラフ',
      description: '体重と体調の推移を見る',
      badge: 'Trend',
      targetView: 'progress' as const,
    },
  ]

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
            <RadialBar background={{ fill: 'var(--color-border)' }} dataKey="value" cornerRadius={20} />
          </RadialBarChart>
          <div className="calorie-ring__center">
            <span className="calorie-ring__value metric-value">{todayMealTotals.calories}</span>
            <span className="calorie-ring__goal">/ {periodizationTarget.calorieTarget} kcal</span>
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

      {recoveryResults.map((result) => (
        <RecoveryWindowCard
          key={`${result.sessionType}-${result.sessionEndTime}`}
          result={result}
          config={DEFAULT_RECOVERY_WINDOW_CONFIG}
          now={recoveryNow}
        />
      ))}

      <ACWRGaugeCard
        result={acwrResult}
        daysUntilAvailable={acwrDaysUntilAvailable}
        sorenessLocation={todayCondition?.muscleSorenessLocation}
        sorenessLevel={todayCondition?.muscleSorenessLevel}
        showDeloadWarning={showDeloadWarning}
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
            const items = getCalendarCellState({
              isPast: dateKey < todayString,
              hasSchedule: weekActivityByDate.get(dateKey)?.has('workout') ?? false,
              scheduleIcon: getScheduleIcon(daySchedules),
              hasTrainingLog: dayTrainingLogs.length > 0,
              hasSoccerLog: weekActivityByDate.get(dateKey)?.has('soccer') ?? false,
            })

            return (
              <button
                key={dateKey}
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
            )
          })}
        </div>
      </section>

      <section className="panel-card stats-card">
        <h2 className="panel-card__title">体調・記録</h2>
        <div className="stats-grid">
          {isViewingToday || latestWeightMA ? (
            <article className="stat-card">
              <div className="stat-card__header">
                <WeightIcon className="stat-card__icon" strokeWidth={1.8} />
                {weightTrend ? <span className={`trend-badge trend-badge--${weightTrend.tone}`}>{weightTrend.text}</span> : null}
              </div>
              <span className="stat-card__label">体重（7日平均）</span>
              <strong className="stat-card__value metric-value">
                {latestWeightMA ? `${latestWeightMA.movingAvg.toFixed(1)}kg` : '記録なし'}
              </strong>
              {selectedCondition ? (
                <span className="stat-card__note">
                  {isViewingToday ? '本日実測' : '実測'}: {selectedCondition.weight.toFixed(1)}kg
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
              <span className="stat-card__label">睡眠（7日平均）</span>
              <strong className="stat-card__value metric-value">
                {latestSleepMA ? `${latestSleepMA.movingAvg.toFixed(1)}h` : '記録なし'}
              </strong>
              {selectedCondition ? (
                <span className="stat-card__note">
                  {isViewingToday ? '本日実測' : '実測'}: {selectedCondition.sleepHours.toFixed(1)}h
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
              <span className="stat-card__label">疲労度（7日平均）</span>
              <strong className="stat-card__value metric-value">
                {latestFatigueMA ? `${latestFatigueMA.movingAvg.toFixed(1)}/5` : '記録なし'}
              </strong>
              {selectedCondition ? (
                <span className="stat-card__note">
                  {isViewingToday ? '本日実測' : '実測'}: {selectedCondition.fatigue}/5
                </span>
              ) : null}
            </article>
          ) : null}

          <article className="stat-card">
            <div className="stat-card__header">
              <HistoryIcon className="stat-card__icon" strokeWidth={1.8} />
            </div>
            <span className="stat-card__label">直近の記録</span>
            <strong className="stat-card__value">{mostRecentRecord ? mostRecentRecord.label : '記録なし'}</strong>
            {mostRecentRecordDaysText ? <span className="stat-card__note">{mostRecentRecordDaysText}</span> : null}
          </article>
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

      <section className="panel-card accordion-item">
        <button
          type="button"
          className="accordion-header"
          onClick={() => setIsTodayDetailOpen((current) => !current)}
        >
          {todayDetailTitle}
          <span className="accordion-chevron">{isTodayDetailOpen ? '▼' : '▶'}</span>
        </button>
        {isTodayDetailOpen ? (
          <div className="accordion-body">
            <p className="panel-card__description">筋トレ・体調を一目で確認できます。</p>
            <div className="detail-list">
              <div className="detail-item">
                <span className="detail-label">トレーニング</span>
                <p>{todayTrainingSummary}</p>
              </div>
              <div className="detail-item">
                <span className="detail-label">体調メモ</span>
                <p>{selectedCondition ? selectedCondition.notes ?? 'メモなし' : '記録なし'}</p>
              </div>
            </div>
            <button
              type="button"
              className="detail-link"
              onClick={() => navigate(`/calendar?date=${selectedDateKey}&tab=training`)}
            >
              詳細を見る →
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel-card accordion-item">
        <button
          type="button"
          className="accordion-header"
          onClick={() => setIsNutritionOpen((current) => !current)}
        >
          {nutritionDetailTitle}
          <span className="accordion-chevron">{isNutritionOpen ? '▼' : '▶'}</span>
        </button>
        {isNutritionOpen ? (
          <div className="accordion-body">
            <p className="panel-card__description">1日の栄養進捗を目標値と比較して表示します。</p>
            {todayMealLogs.length === 0 ? (
              <p className="no-record">{isViewingToday ? '今日の食事記録はありません' : 'この日の食事記録はありません'}</p>
            ) : (
              <div className="nutrition-grid">
                {[
                  {
                    label: 'カロリー',
                    value: `${todayMealTotals.calories} / ${goals.dailyCalorieGoal} kcal`,
                    rate: calorieRate,
                  },
                  {
                    label: 'タンパク質',
                    value: `${todayMealTotals.protein} / ${goals.dailyProteinGoal} g`,
                    rate: goals.dailyProteinGoal > 0
                      ? Math.min(100, Math.round((todayMealTotals.protein / goals.dailyProteinGoal) * 100))
                      : 0,
                  },
                  {
                    label: '脂質',
                    value: `${todayMealTotals.fat} / ${goals.dailyFatGoal} g`,
                    rate: goals.dailyFatGoal > 0
                      ? Math.min(100, Math.round((todayMealTotals.fat / goals.dailyFatGoal) * 100))
                      : 0,
                  },
                  {
                    label: '炭水化物',
                    value: `${todayMealTotals.carbohydrates} / ${goals.dailyCarbohydrateGoal} g`,
                    rate: goals.dailyCarbohydrateGoal > 0
                      ? Math.min(100, Math.round((todayMealTotals.carbohydrates / goals.dailyCarbohydrateGoal) * 100))
                      : 0,
                  },
                ].map((metric) => (
                  <article key={metric.label} className="nutrition-card">
                    <span className="nutrition-card__label">{metric.label}</span>
                    <div className="nutrition-card__value">{metric.value}</div>
                    <div className="nutrition-card__rate">{metric.rate}%</div>
                    <div className="nutrition-progress" aria-label={`${metric.label}進捗`}>
                      <div className="nutrition-progress__fill" style={{ width: `${metric.rate}%` }} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>

      <GoalPanel goals={goals} setGoals={setGoals} trainingLogs={trainingLogs} dailyConditions={dailyConditions} today={today} />

      <section className="links-section" aria-label="機能メニュー">
        {quickLinks.map((link) => (
          <button
            key={link.title}
            type="button"
            className="link-card"
            onClick={() => {
              navigate(APP_VIEW_PATHS[link.targetView] + (link.query ?? ''))
            }}
          >
            <span className="link-card__badge">{link.badge}</span>
            <strong>{link.title}</strong>
            <p>{link.description}</p>
          </button>
        ))}
      </section>

      {isTimerOpen ? <RestTimerModal onClose={() => setIsTimerOpen(false)} /> : null}
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
