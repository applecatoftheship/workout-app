import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { DailyCondition, DateString, FirstDayOfWeek, MealLog, SoccerLog, TrainingLog, TrainingSchedule, Workout } from '../types'
import './MonthlyCalendar.css'
import '../components/calendar/CalendarForms.css'
import { TrainingSummary, ScheduleSummary, ConditionSummary, MealSummary, SoccerSummary, WorkoutSummary } from '../components/calendar/CalendarDaySummaries'
import { BulkScheduleImportModal } from '../components/calendar/BulkScheduleImportModal'
import { DailyReportModal } from '../components/calendar/DailyReportModal'
import { fetchTrainingSchedules } from '../api/trainingSchedules'
import { fetchSoccerLogs } from '../api/soccerLogs'
import { fetchWorkouts } from '../api/workouts'
import {
  toDateKey,
  formatMonthLabel,
  getScheduleIcon,
  buildActivityByDate,
  getCalendarCellState,
  toJstDateKeyFromIso,
  getOrderedWeekDayLabels,
  getCalendarGridStartDate,
} from '../utils/calendarHelpers'
import { ChevronLeftIcon, ChevronRightIcon } from '../components/icons'
import type { RecordModalRequest } from '../components/RecordFormModal'

type DetailTab = 'training' | 'schedule' | 'condition' | 'meal' | 'soccer' | 'workout'
const DETAIL_TABS: DetailTab[] = ['training', 'schedule', 'condition', 'meal', 'soccer', 'workout']
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type MonthlyCalendarProps = {
  trainingLogs: TrainingLog[]
  setTrainingLogs: React.Dispatch<React.SetStateAction<TrainingLog[]>>
  mealLogs: MealLog[]
  setMealLogs: React.Dispatch<React.SetStateAction<MealLog[]>>
  dailyConditions: DailyCondition[]
  setDailyConditions: React.Dispatch<React.SetStateAction<DailyCondition[]>>
  openRecordModal: (request: Omit<RecordModalRequest, 'requestId'>) => void
  isRecordModalOpen: boolean
  firstDayOfWeek: FirstDayOfWeek
}

export function MonthlyCalendar({
  trainingLogs,
  setTrainingLogs,
  mealLogs,
  setMealLogs,
  dailyConditions,
  setDailyConditions,
  openRecordModal,
  isRecordModalOpen,
  firstDayOfWeek,
}: MonthlyCalendarProps) {
  const today = new Date()
  const todayKey = toDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate())

  // カレンダーの日付ディープリンク対応（2026年8月22日）：?date=YYYY-MM-DD&tab=training
  // 形式のURLクエリパラメータを読み取り、存在すればselectedDate・activeDetailTab・
  // displayDate（表示月）の初期値として使う。パラメータが無い/不正な場合は
  // 従来通り「今日」で初期化する。
  const [searchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const tabParam = searchParams.get('tab')
  const initialSelectedDate: DateString = dateParam && DATE_KEY_PATTERN.test(dateParam) ? (dateParam as DateString) : todayKey
  const initialDetailTab: DetailTab =
    tabParam && (DETAIL_TABS as string[]).includes(tabParam) ? (tabParam as DetailTab) : 'training'
  const initialDisplayDate = (() => {
    const [year, month] = initialSelectedDate.split('-').map(Number)
    return new Date(year, month - 1, 1)
  })()

  const [displayDate, setDisplayDate] = useState(initialDisplayDate)
  const [selectedDate, setSelectedDate] = useState<DateString>(initialSelectedDate)
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>(initialDetailTab)
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false)
  const [isDailyReportOpen, setIsDailyReportOpen] = useState(false)
  const [schedules, setSchedules] = useState<TrainingSchedule[]>([])
  const [soccerLogs, setSoccerLogs] = useState<SoccerLog[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])

  const year = displayDate.getFullYear()
  const month = displayDate.getMonth()
  const orderedWeekDayLabels = getOrderedWeekDayLabels(firstDayOfWeek)

  const calendarDays = useMemo(() => {
    const startDate = getCalendarGridStartDate(year, month, firstDayOfWeek)

    const days: Array<{
      date: Date
      dateKey: DateString
      isCurrentMonth: boolean
    }> = []

    for (let index = 0; index < 42; index += 1) {
      const currentDate = new Date(startDate)
      currentDate.setDate(startDate.getDate() + index)
      const dateKey = toDateKey(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate())

      days.push({
        date: currentDate,
        dateKey,
        isCurrentMonth: currentDate.getMonth() === month,
      })
    }

    return days
  }, [month, year, firstDayOfWeek])

  const scheduleRangeStart = calendarDays[0]?.dateKey
  const scheduleRangeEnd = calendarDays[calendarDays.length - 1]?.dateKey

  useEffect(() => {
    if (!scheduleRangeStart || !scheduleRangeEnd) {
      return
    }

    let isMounted = true

    fetchTrainingSchedules(scheduleRangeStart, scheduleRangeEnd)
      .then((data) => {
        if (isMounted) {
          setSchedules(data)
        }
      })
      .catch((error) => {
        console.error('Supabaseからトレーニング予定の取得に失敗しました', error)
      })

    return () => {
      isMounted = false
    }
  }, [scheduleRangeStart, scheduleRangeEnd])

  const refetchSchedules = () => {
    if (!scheduleRangeStart || !scheduleRangeEnd) {
      return
    }

    fetchTrainingSchedules(scheduleRangeStart, scheduleRangeEnd)
      .then((data) => setSchedules(data))
      .catch((error) => {
        console.error('Supabaseからトレーニング予定の再取得に失敗しました', error)
      })
  }

  const schedulesByDate = useMemo(() => {
    const map = new Map<string, TrainingSchedule[]>()
    schedules.forEach((schedule) => {
      const list = map.get(schedule.scheduledDate) ?? []
      list.push(schedule)
      map.set(schedule.scheduledDate, list)
    })
    return map
  }, [schedules])

  useEffect(() => {
    if (!scheduleRangeStart || !scheduleRangeEnd) {
      return
    }

    let isMounted = true

    fetchSoccerLogs(scheduleRangeStart, scheduleRangeEnd)
      .then((data) => {
        if (isMounted) {
          setSoccerLogs(data)
        }
      })
      .catch((error) => {
        console.error('Supabaseからサッカー記録の取得に失敗しました', error)
      })

    return () => {
      isMounted = false
    }
  }, [scheduleRangeStart, scheduleRangeEnd])

  // Apple Health連携 Task3（2026年8月27日）：読み取り専用のためRecordFormModal
  // 経由の書き込みが無く、schedules/soccerLogsのような「モーダルを閉じたら
  // 再取得」の仕組みは不要（範囲変更時のみ取得すれば十分）。
  useEffect(() => {
    if (!scheduleRangeStart || !scheduleRangeEnd) {
      return
    }

    let isMounted = true

    fetchWorkouts(scheduleRangeStart, scheduleRangeEnd)
      .then((data) => {
        if (isMounted) {
          setWorkouts(data)
        }
      })
      .catch((error) => {
        console.error('Supabaseからワークアウト記録の取得に失敗しました', error)
      })

    return () => {
      isMounted = false
    }
  }, [scheduleRangeStart, scheduleRangeEnd])

  const soccerLogsByDate = useMemo(() => {
    const map = new Map<string, SoccerLog[]>()
    soccerLogs.forEach((log) => {
      const list = map.get(log.date) ?? []
      list.push(log)
      map.set(log.date, list)
    })
    return map
  }, [soccerLogs])

  // カレンダー実績アイコン機能（日付ベース簡易マッチング方式、2026年8月20日）：
  // training_logsは種目0件の実績を「実施した実績」として扱わない
  // （既存のhasTrainingBlock/weekTrainingCountと同じ判定基準）。
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
  const workoutsByDate = useMemo(() => {
    const map = new Map<string, Workout[]>()
    workouts.forEach((workout) => {
      const dateKey = toJstDateKeyFromIso(workout.startTime)
      const list = map.get(dateKey) ?? []
      list.push(workout)
      map.set(dateKey, list)
    })
    return map
  }, [workouts])

  const activityByDate = useMemo(
    () => buildActivityByDate(schedulesByDate, soccerLogsByDate, workoutsByDate),
    [schedulesByDate, soccerLogsByDate, workoutsByDate],
  )

  const refetchSoccerLogs = () => {
    if (!scheduleRangeStart || !scheduleRangeEnd) {
      return
    }

    fetchSoccerLogs(scheduleRangeStart, scheduleRangeEnd)
      .then((data) => setSoccerLogs(data))
      .catch((error) => {
        console.error('Supabaseからサッカー記録の再取得に失敗しました', error)
      })
  }

  // RecordFormModal（Phase B/C、2026年8月16日）がtraining/meal/conditionは
  // AppShell側の共有state（props経由）を直接更新するため自動的に反映されるが、
  // schedules/soccerLogsはMonthlyCalendarが月範囲で個別に保持しているため、
  // モーダルが閉じたタイミングで再取得して最新化する。
  const [wasRecordModalOpen, setWasRecordModalOpen] = useState(false)
  useEffect(() => {
    if (wasRecordModalOpen && !isRecordModalOpen) {
      refetchSchedules()
      refetchSoccerLogs()
    }
    setWasRecordModalOpen(isRecordModalOpen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecordModalOpen])

  // 日付が変わるたびにトレーニングタブへ戻す（既存の挙動）。ただし初回マウント時は
  // URLパラメータで指定されたタブ（initialDetailTab）を尊重するため、
  // 初回のこの副作用発火だけはリセットをスキップする。
  const isInitialSelectedDateEffect = useRef(true)
  useEffect(() => {
    if (isInitialSelectedDateEffect.current) {
      isInitialSelectedDateEffect.current = false
      return
    }
    setActiveDetailTab('training')
  }, [selectedDate])

  const changeMonth = (direction: -1 | 1) => {
    const nextDate = new Date(displayDate)
    nextDate.setMonth(displayDate.getMonth() + direction)
    setDisplayDate(nextDate)
  }

  const isDisplayingCurrentMonth = year === today.getFullYear() && month === today.getMonth()

  const goToToday = () => {
    setDisplayDate(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDate(todayKey)
  }

  return (
    <section className="calendar-card">
      <div className="calendar-card__header">
        <div>
          <p className="calendar-card__eyebrow">月間カレンダー</p>
          <h2>{formatMonthLabel(displayDate)}</h2>
        </div>
        <div className="calendar-nav">
          {!isDisplayingCurrentMonth ? (
            <button type="button" className="btn-secondary btn-secondary--sm calendar-nav__today" onClick={goToToday}>
              今日に戻る
            </button>
          ) : null}
          <button type="button" className="btn-icon" onClick={() => changeMonth(-1)} aria-label="前月">
            <ChevronLeftIcon />
          </button>
          <button type="button" className="btn-icon" onClick={() => changeMonth(1)} aria-label="翌月">
            <ChevronRightIcon />
          </button>
        </div>
      </div>

      <div className="calendar-card__toolbar">
        <button type="button" className="btn-pill-accent" onClick={() => setIsBulkImportOpen(true)}>
          ✨ AI予定一括取り込み
        </button>
      </div>

      <div className="calendar-weekdays" aria-label="曜日">
        {orderedWeekDayLabels.map((day, index) => {
          // firstDayOfWeek起算のindexから実際の曜日番号（0=日,6=土）に戻して判定する。
          // 週始まりが月曜の場合、表示上の並びは月〜日でindex 6が日曜になる。
          const dayOfWeek = (index + firstDayOfWeek) % 7
          return (
            <div
              key={day}
              className={`calendar-weekday ${dayOfWeek === 0 ? 'calendar-weekday--sunday' : ''} ${dayOfWeek === 6 ? 'calendar-weekday--saturday' : ''}`}
            >
              {day}
            </div>
          )
        })}
      </div>

      <div className="calendar-grid">
        {calendarDays.map((day) => {
          const isSelected = selectedDate === day.dateKey
          const isToday = day.dateKey === todayKey
          const daySchedules = schedulesByDate.get(day.dateKey) ?? []
          const dayTrainingLogs = trainingLogsByDate.get(day.dateKey) ?? []
          const items = getCalendarCellState({
            isPast: day.dateKey < todayKey,
            hasSchedule: activityByDate.get(day.dateKey)?.has('workout') ?? false,
            scheduleIcon: getScheduleIcon(daySchedules),
            hasTrainingLog: dayTrainingLogs.length > 0,
            hasSoccerLog: activityByDate.get(day.dateKey)?.has('soccer') ?? false,
            hasAppleWorkout: activityByDate.get(day.dateKey)?.has('appleWorkout') ?? false,
          })

          return (
            <button
              key={day.dateKey}
              type="button"
              className={`calendar-day ${day.isCurrentMonth ? '' : 'calendar-day--muted'} ${isSelected ? 'calendar-day--selected' : ''} ${isToday ? 'calendar-day--today' : ''}`}
              onClick={() => setSelectedDate(day.dateKey)}
            >
              <span className="calendar-day__number">{day.date.getDate()}</span>
              <span className="calendar-day__content">
                {items.map((item, index) => (
                  <span key={`${item.type}-${index}`} className={`calendar-day__item calendar-day__item--${item.status}`}>
                    {item.icon}
                    {item.status === 'completed_planned' ? <span className="calendar-day__item-badge">✅</span> : null}
                  </span>
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <div className="calendar-detail">
        <div className="calendar-detail__header">
          <h3>{selectedDate}</h3>
          <button
            type="button"
            className="btn-secondary btn-secondary--sm calendar-detail__badge"
            onClick={() => setIsDailyReportOpen(true)}
          >
            詳細
          </button>
        </div>

        <div className="calendar-detail__group">
          {/* UI/UXレビュー修正 項目6（2026年8月25日）：横スクロール自体は既存実装
              （Phase 4、2026年8月16日）で機能していたが、右端の「サッカー」タブが
              スクロール可能であることを示す視覚的な手がかりがなく、見切れて
              壊れているように見えていた。右端にフェードグラデーションを重ねて
              スクロール可能であることを示す（タブの構成・数自体は無変更）。 */}
          <div className="calendar-detail__tabs-wrap">
            <div className="calendar-detail__tabs">
              <button
                type="button"
                className={`calendar-detail__tab ${activeDetailTab === 'training' ? 'calendar-detail__tab--active' : ''}`}
                onClick={() => setActiveDetailTab('training')}
              >
                トレーニング
              </button>
              <button
                type="button"
                className={`calendar-detail__tab ${activeDetailTab === 'schedule' ? 'calendar-detail__tab--active' : ''}`}
                onClick={() => setActiveDetailTab('schedule')}
              >
                予定
              </button>
              <button
                type="button"
                className={`calendar-detail__tab ${activeDetailTab === 'condition' ? 'calendar-detail__tab--active' : ''}`}
                onClick={() => setActiveDetailTab('condition')}
              >
                体調
              </button>
              <button
                type="button"
                className={`calendar-detail__tab ${activeDetailTab === 'meal' ? 'calendar-detail__tab--active' : ''}`}
                onClick={() => setActiveDetailTab('meal')}
              >
                食事
              </button>
              <button
                type="button"
                className={`calendar-detail__tab ${activeDetailTab === 'soccer' ? 'calendar-detail__tab--active' : ''}`}
                onClick={() => setActiveDetailTab('soccer')}
              >
                サッカー
              </button>
              <button
                type="button"
                className={`calendar-detail__tab ${activeDetailTab === 'workout' ? 'calendar-detail__tab--active' : ''}`}
                onClick={() => setActiveDetailTab('workout')}
              >
                ワークアウト
              </button>
            </div>
          </div>

          {activeDetailTab === 'training' ? (
            <TrainingSummary
              trainingLogs={trainingLogs}
              selectedDate={selectedDate}
              onAdd={() => {
                // 不具合対応（2026年8月26日）：対象日に既存のトレーニング実績が
                // あれば、空フォームではなく既存の種目を読み込んだ編集経路
                // （trainingLogIndex指定）を再利用する。training_logsは
                // unique(user_id, log_date)のため対象日1件のみ該当しうる。
                const existingIndex = trainingLogs.findIndex((log) => log.date === selectedDate)
                openRecordModal(
                  existingIndex >= 0
                    ? { type: 'training', date: selectedDate, trainingLogIndex: existingIndex }
                    : { type: 'training', date: selectedDate },
                )
              }}
              onEdit={(index) => openRecordModal({ type: 'training', date: selectedDate, trainingLogIndex: index })}
            />
          ) : null}

          {activeDetailTab === 'schedule' ? (
            <ScheduleSummary
              schedules={schedules}
              selectedDate={selectedDate}
              onAdd={() => openRecordModal({ type: 'schedule', date: selectedDate })}
              onEdit={(scheduleId) => openRecordModal({ type: 'schedule', date: selectedDate, scheduleId })}
            />
          ) : null}

          {activeDetailTab === 'condition' ? (
            <ConditionSummary
              dailyConditions={dailyConditions}
              selectedDate={selectedDate}
              onAdd={() => openRecordModal({ type: 'condition', date: selectedDate })}
              onEdit={() => openRecordModal({ type: 'condition', date: selectedDate })}
            />
          ) : null}

          {activeDetailTab === 'meal' ? (
            <MealSummary
              mealLogs={mealLogs}
              selectedDate={selectedDate}
              onAdd={() => openRecordModal({ type: 'meal', date: selectedDate })}
              onEdit={(index) => openRecordModal({ type: 'meal', date: selectedDate, mealLogIndex: index })}
            />
          ) : null}

          {activeDetailTab === 'soccer' ? (
            <SoccerSummary
              soccerLogs={soccerLogs}
              selectedDate={selectedDate}
              onAdd={() => openRecordModal({ type: 'soccer', date: selectedDate })}
              onEdit={() => openRecordModal({ type: 'soccer', date: selectedDate })}
            />
          ) : null}

          {activeDetailTab === 'workout' ? <WorkoutSummary workouts={workouts} selectedDate={selectedDate} /> : null}
        </div>
      </div>

      <BulkScheduleImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onImported={refetchSchedules}
        trainingLogs={trainingLogs}
        setTrainingLogs={setTrainingLogs}
        setMealLogs={setMealLogs}
        dailyConditions={dailyConditions}
        setDailyConditions={setDailyConditions}
      />

      {isDailyReportOpen ? (
        <DailyReportModal
          selectedDate={selectedDate}
          trainingLogs={trainingLogs}
          schedules={schedules}
          dailyConditions={dailyConditions}
          mealLogs={mealLogs}
          soccerLogs={soccerLogs}
          workouts={workouts}
          setDailyConditions={setDailyConditions}
          onClose={() => setIsDailyReportOpen(false)}
        />
      ) : null}
    </section>
  )
}
