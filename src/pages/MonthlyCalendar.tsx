import { useEffect, useMemo, useState } from 'react'
import { mockAppData } from '../mockData'
import type { DailyCondition, DateString, MealLog, TrainingLog } from '../types'
import './MonthlyCalendar.css'
import '../components/calendar/CalendarForms.css'
import { TrainingLogForm } from '../components/calendar/TrainingLogForm'
import { MealLogForm } from '../components/calendar/MealLogForm'
import { ConditionForm } from '../components/calendar/ConditionForm'
import {
  weekDays,
  toDateKey,
  formatMonthLabel,
  getProgramIcon,
  getProgramLabel,
  getProgramSummary,
  formatExerciseSummary,
  formatCardioSummary,
  getProgramForDate,
} from '../utils/calendarHelpers'

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
  const [displayDate, setDisplayDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState<DateString>(toDateKey(today.getFullYear(), today.getMonth() + 1, today.getDate()))
  const [activeDetailTab, setActiveDetailTab] = useState<'training' | 'condition' | 'meal'>('training')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isMealFormOpen, setIsMealFormOpen] = useState(false)
  const [isConditionFormOpen, setIsConditionFormOpen] = useState(false)

  const year = displayDate.getFullYear()
  const month = displayDate.getMonth()
  const monthlyProgram = useMemo(
    () => mockAppData.monthlyPrograms.find((program) => program.year === year && program.month === month + 1),
    [month, year],
  )

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const startDate = new Date(firstDay)
    startDate.setDate(firstDay.getDate() - firstDay.getDay())

    const days: Array<{
      date: Date
      dateKey: DateString
      isCurrentMonth: boolean
      programs: ReturnType<typeof getProgramForDate>
    }> = []

    for (let index = 0; index < 42; index += 1) {
      const currentDate = new Date(startDate)
      currentDate.setDate(startDate.getDate() + index)
      const dateKey = toDateKey(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate())

      days.push({
        date: currentDate,
        dateKey,
        isCurrentMonth: currentDate.getMonth() === month,
        programs: getProgramForDate(monthlyProgram, dateKey),
      })
    }

    return days
  }, [month, monthlyProgram, year])

  const selectedPrograms = useMemo(() => {
    return getProgramForDate(monthlyProgram, selectedDate)
  }, [monthlyProgram, selectedDate])

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
          const isToday =
            day.date.getFullYear() === today.getFullYear() &&
            day.date.getMonth() === today.getMonth() &&
            day.date.getDate() === today.getDate()

          return (
            <button
              key={day.dateKey}
              type="button"
              className={`calendar-day ${day.isCurrentMonth ? '' : 'calendar-day--muted'} ${isSelected ? 'calendar-day--selected' : ''} ${isToday ? 'calendar-day--today' : ''}`}
              onClick={() => setSelectedDate(day.dateKey)}
            >
              <span className="calendar-day__number">{day.date.getDate()}</span>
              <span className="calendar-day__content">
                {day.programs.length > 0 ? getProgramIcon(day.programs[0]) : ''}
              </span>
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
          <div className="calendar-detail__section">
            <h4>トレーニング予定</h4>
            {selectedPrograms.length === 0 ? (
              <p className="calendar-detail__empty">記録なし</p>
            ) : (
              selectedPrograms.map((program) => (
                <div key={`${selectedDate}-${program.title}`} className="calendar-detail__item">
                  <strong>{getProgramLabel(program)}</strong>
                  <p>{getProgramSummary(program)}</p>
                  {program.description ? <p className="calendar-detail__description">{program.description}</p> : null}
                  <p className="calendar-detail__description">種目: {formatExerciseSummary(program.exercises)}</p>
                  <p className="calendar-detail__description">有酸素: {formatCardioSummary(program.cardio)}</p>
                  {program.notes ? <p className="calendar-detail__description">メモ: {program.notes}</p> : null}
                </div>
              ))
            )}
          </div>

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
    </section>
  )
}
