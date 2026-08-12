import { useEffect, useMemo, useState } from 'react'
import type { DailyCondition, DateString, MealLog, TrainingLog, TrainingSchedule } from '../types'
import './MonthlyCalendar.css'
import '../components/calendar/CalendarForms.css'
import { TrainingLogForm } from '../components/calendar/TrainingLogForm'
import { MealLogForm } from '../components/calendar/MealLogForm'
import { ConditionForm } from '../components/calendar/ConditionForm'
import { ScheduleForm } from '../components/calendar/ScheduleForm'
import { BulkScheduleImportModal } from '../components/calendar/BulkScheduleImportModal'
import { fetchTrainingSchedules } from '../api/trainingSchedules'
import { weekDays, toDateKey, formatMonthLabel, getScheduleDayIcon } from '../utils/calendarHelpers'

type MonthlyCalendarProps = {
  trainingLogs: TrainingLog[]
  setTrainingLogs: React.Dispatch<React.SetStateAction<TrainingLog[]>>
  mealLogs: MealLog[]
  setMealLogs: React.Dispatch<React.SetStateAction<MealLog[]>>
  dailyConditions: DailyCondition[]
  setDailyConditions: React.Dispatch<React.SetStateAction<DailyCondition[]>>
}

export function MonthlyCalendar({
  trainingLogs,
  setTrainingLogs,
  mealLogs,
  setMealLogs,
  dailyConditions,
  setDailyConditions,
}: MonthlyCalendarProps) {
  const today = new Date()
  const todayKey = toDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate())
  const [displayDate, setDisplayDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState<DateString>(todayKey)
  const [activeDetailTab, setActiveDetailTab] = useState<'training' | 'schedule' | 'condition' | 'meal'>('training')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isMealFormOpen, setIsMealFormOpen] = useState(false)
  const [isConditionFormOpen, setIsConditionFormOpen] = useState(false)
  const [isScheduleFormOpen, setIsScheduleFormOpen] = useState(false)
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false)
  const [schedules, setSchedules] = useState<TrainingSchedule[]>([])

  const year = displayDate.getFullYear()
  const month = displayDate.getMonth()

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const startDate = new Date(firstDay)
    startDate.setDate(firstDay.getDate() - firstDay.getDay())

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
  }, [month, year])

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
    setActiveDetailTab('training')
  }, [selectedDate])

  const changeMonth = (direction: -1 | 1) => {
    const nextDate = new Date(displayDate)
    nextDate.setMonth(displayDate.getMonth() + direction)
    setDisplayDate(nextDate)
  }

  return (
    <section className="calendar-card">
      <div className="calendar-card__header">
        <div>
          <p className="calendar-card__eyebrow">月間カレンダー</p>
          <h2>{formatMonthLabel(displayDate)}</h2>
        </div>
        <div className="calendar-nav">
          <button type="button" className="calendar-nav__button" onClick={() => changeMonth(-1)}>
            前月
          </button>
          <button type="button" className="calendar-nav__button" onClick={() => changeMonth(1)}>
            翌月
          </button>
        </div>
      </div>

      <div className="calendar-card__toolbar">
        <button type="button" className="calendar-nav__button" onClick={() => setIsBulkImportOpen(true)}>
          ✨ AI予定一括取り込み
        </button>
      </div>

      <div className="calendar-weekdays" aria-label="曜日">
        {weekDays.map((day) => (
          <div key={day} className="calendar-weekday">
            {day}
          </div>
        ))}
      </div>

      <div className="calendar-grid">
        {calendarDays.map((day) => {
          const isSelected = selectedDate === day.dateKey
          const isToday = day.dateKey === todayKey
          const daySchedules = schedulesByDate.get(day.dateKey) ?? []
          const icon = getScheduleDayIcon(daySchedules, day.dateKey, todayKey)

          return (
            <button
              key={day.dateKey}
              type="button"
              className={`calendar-day ${day.isCurrentMonth ? '' : 'calendar-day--muted'} ${isSelected ? 'calendar-day--selected' : ''} ${isToday ? 'calendar-day--today' : ''}`}
              onClick={() => setSelectedDate(day.dateKey)}
            >
              <span className="calendar-day__number">{day.date.getDate()}</span>
              <span className="calendar-day__content">{icon}</span>
            </button>
          )
        })}
      </div>

      <div className="calendar-detail">
        <div className="calendar-detail__header">
          <h3>{selectedDate}</h3>
          <span className="calendar-detail__badge">詳細</span>
        </div>

        <div className="calendar-detail__group">
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
          </div>

          {activeDetailTab === 'training' ? (
            <TrainingLogForm
              trainingLogs={trainingLogs}
              setTrainingLogs={setTrainingLogs}
              selectedDate={selectedDate}
              isFormOpen={isFormOpen}
              setIsFormOpen={setIsFormOpen}
              onScheduleUpdated={refetchSchedules}
            />
          ) : null}

          {activeDetailTab === 'schedule' ? (
            <ScheduleForm
              schedules={schedules}
              setSchedules={setSchedules}
              selectedDate={selectedDate}
              isScheduleFormOpen={isScheduleFormOpen}
              setIsScheduleFormOpen={setIsScheduleFormOpen}
            />
          ) : null}

          {activeDetailTab === 'condition' ? (
            <ConditionForm
              dailyConditions={dailyConditions}
              setDailyConditions={setDailyConditions}
              selectedDate={selectedDate}
              isConditionFormOpen={isConditionFormOpen}
              setIsConditionFormOpen={setIsConditionFormOpen}
              setIsFormOpen={setIsFormOpen}
              setIsMealFormOpen={setIsMealFormOpen}
            />
          ) : null}

          {activeDetailTab === 'meal' ? (
            <MealLogForm
              mealLogs={mealLogs}
              setMealLogs={setMealLogs}
              selectedDate={selectedDate}
              isMealFormOpen={isMealFormOpen}
              setIsMealFormOpen={setIsMealFormOpen}
              setIsFormOpen={setIsFormOpen}
            />
          ) : null}
        </div>
      </div>

      <BulkScheduleImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onImported={refetchSchedules}
      />
    </section>
  )
}
