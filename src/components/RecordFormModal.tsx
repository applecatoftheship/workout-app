import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { TrainingExerciseEditModal } from './calendar/TrainingExerciseEditModal'
import { TrainingEditListFlow } from './calendar/TrainingEditListFlow'
import { MealLogWizardModal } from './calendar/MealLogWizardModal'
import { ConditionForm } from './calendar/ConditionForm'
import { ScheduleForm } from './calendar/ScheduleForm'
import { SoccerLogForm } from './calendar/SoccerLogForm'
import { CloseIcon } from './icons'
import { fetchTrainingSchedules } from '../api/trainingSchedules'
import { fetchSoccerLogs } from '../api/soccerLogs'
import { toDateKey } from '../utils/chartHelpers'
import type { RecordType } from './RecordSheet'
import type { DailyCondition, DateString, MealLog, SoccerLog, TrainingLog, TrainingSchedule } from '../types'
import './RecordFormModal.css'

export type RecordModalRequest = {
  requestId: number
  type: RecordType
  date: DateString
  /** 未指定の場合は新規種目の追加（種目選択UIから開始する）。 */
  trainingLogExerciseId?: string
  /** true の場合、その日の記録（種目）一覧 → 選択 → 編集、という画面遷移で開く
   *  （トレーニング実績編集UIの画面遷移化、2026年9月3日）。 */
  trainingEdit?: boolean
  /** 未指定の場合は新規食事エントリの追加。 */
  mealLogId?: string
  scheduleId?: string
  /** テンプレート管理UI（Settings.tsx）の「予定を作成」ボタンから開いた場合、
   * 新規予定フォームにこのテンプレートを事前選択する（2026年8月18日追加）。 */
  templateId?: string
}

const TITLES: Record<RecordType, string> = {
  training: 'トレーニングを記録',
  meal: '食事を記録',
  condition: '体調を記録',
  soccer: 'サッカーを記録',
  schedule: '予定を記録',
}

type RecordFormModalProps = {
  request: RecordModalRequest | null
  onClose: () => void
  trainingLogs: TrainingLog[]
  setTrainingLogs: Dispatch<SetStateAction<TrainingLog[]>>
  mealLogs: MealLog[]
  setMealLogs: Dispatch<SetStateAction<MealLog[]>>
  dailyConditions: DailyCondition[]
  setDailyConditions: Dispatch<SetStateAction<DailyCondition[]>>
}

export function RecordFormModal({
  request,
  onClose,
  trainingLogs,
  setTrainingLogs,
  mealLogs,
  setMealLogs,
  dailyConditions,
  setDailyConditions,
}: RecordFormModalProps) {
  const [isConditionFormOpen, setIsConditionFormOpen] = useState(true)
  const [isScheduleFormOpen, setIsScheduleFormOpen] = useState(true)
  const [isSoccerFormOpen, setIsSoccerFormOpen] = useState(true)

  const [autoOpenToken, setAutoOpenToken] = useState<number | undefined>(undefined)
  const [modalSchedules, setModalSchedules] = useState<TrainingSchedule[]>([])
  const [modalSoccerLogs, setModalSoccerLogs] = useState<SoccerLog[]>([])
  const [isLoadingSideData, setIsLoadingSideData] = useState(false)

  useEffect(() => {
    if (!request) {
      return
    }

    setIsConditionFormOpen(true)
    setIsScheduleFormOpen(true)
    setIsSoccerFormOpen(true)
    setAutoOpenToken(undefined)

    if (request.type === 'schedule') {
      setIsLoadingSideData(true)
      fetchTrainingSchedules(request.date, request.date)
        .then((data) => {
          setModalSchedules(data)
        })
        .catch((error) => {
          console.error('Supabaseから予定の取得に失敗しました', error)
          setModalSchedules([])
        })
        .finally(() => {
          setIsLoadingSideData(false)
          setAutoOpenToken(request.requestId)
        })
    } else if (request.type === 'soccer') {
      setIsLoadingSideData(true)
      fetchSoccerLogs(request.date, request.date)
        .then((data) => {
          setModalSoccerLogs(data)
        })
        .catch((error) => {
          console.error('Supabaseからサッカー記録の取得に失敗しました', error)
          setModalSoccerLogs([])
        })
        .finally(() => {
          setIsLoadingSideData(false)
          setAutoOpenToken(request.requestId)
        })
    } else if (request.type === 'training') {
      // スプリント3（MD基準の栄養・トレーニング調整、2026年8月18日）：下半身
      // トレーニングの警告表示に、対象日の前後（前日〜3日後）を含む窓で予定を
      // 取得しgetMatchDayStatusの判定に使う。request.dateは単一日付でナビゲート
      // されないため（Dashboard.tsxのselectedDateKeyのような週送りはない）、
      // request.date基準で固定の窓を都度計算すればよい。
      setIsLoadingSideData(true)
      const mdWindowStart = new Date(`${request.date}T00:00:00`)
      mdWindowStart.setDate(mdWindowStart.getDate() - 1)
      const mdWindowEnd = new Date(`${request.date}T00:00:00`)
      mdWindowEnd.setDate(mdWindowEnd.getDate() + 3)
      fetchTrainingSchedules(toDateKey(mdWindowStart), toDateKey(mdWindowEnd))
        .then((data) => {
          setModalSchedules(data)
        })
        .catch((error) => {
          console.error('Supabaseから試合日判定用の予定の取得に失敗しました', error)
          setModalSchedules([])
        })
        .finally(() => {
          setIsLoadingSideData(false)
          setAutoOpenToken(request.requestId)
        })
    } else {
      setAutoOpenToken(request.requestId)
    }
  }, [request])

  useEffect(() => {
    if (request?.type === 'condition' && !isConditionFormOpen) {
      onClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConditionFormOpen])

  useEffect(() => {
    if (request?.type === 'schedule' && !isScheduleFormOpen) {
      onClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScheduleFormOpen])

  useEffect(() => {
    if (request?.type === 'soccer' && !isSoccerFormOpen) {
      onClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSoccerFormOpen])

  if (!request) {
    return null
  }

  const formKey = request.requestId
  const modalTitle =
    request.type === 'training' && request.trainingEdit ? 'トレーニング記録を編集' : TITLES[request.type]

  return (
    <div className="record-form-modal__overlay" role="presentation" onClick={onClose}>
      <div
        className="record-form-modal"
        role="dialog"
        aria-modal="true"
        aria-label={modalTitle}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="record-form-modal__header">
          <h3>
            {modalTitle}（{request.date}）
          </h3>
          <button type="button" className="record-form-modal__close" onClick={onClose} aria-label="閉じる">
            <CloseIcon />
          </button>
        </div>

        <div className="record-form-modal__body">
          {request.type === 'training' && request.trainingEdit ? (
            <TrainingEditListFlow
              key={formKey}
              trainingLogs={trainingLogs}
              setTrainingLogs={setTrainingLogs}
              mealLogs={mealLogs}
              dailyConditions={dailyConditions}
              selectedDate={request.date}
              schedulesForMdCheck={modalSchedules}
              onClose={onClose}
            />
          ) : null}

          {request.type === 'training' && !request.trainingEdit ? (
            <TrainingExerciseEditModal
              key={formKey}
              trainingLogs={trainingLogs}
              setTrainingLogs={setTrainingLogs}
              mealLogs={mealLogs}
              dailyConditions={dailyConditions}
              selectedDate={request.date}
              trainingLogExerciseId={request.trainingLogExerciseId}
              schedulesForMdCheck={modalSchedules}
              onClose={onClose}
            />
          ) : null}

          {request.type === 'meal' ? (
            <MealLogWizardModal
              key={formKey}
              mealLogs={mealLogs}
              setMealLogs={setMealLogs}
              selectedDate={request.date}
              mealLogId={request.mealLogId}
              onClose={onClose}
            />
          ) : null}

          {request.type === 'condition' ? (
            <ConditionForm
              key={formKey}
              dailyConditions={dailyConditions}
              setDailyConditions={setDailyConditions}
              selectedDate={request.date}
              isConditionFormOpen={isConditionFormOpen}
              setIsConditionFormOpen={setIsConditionFormOpen}
              setIsFormOpen={() => {}}
              setIsMealFormOpen={() => {}}
              autoOpenToken={autoOpenToken}
            />
          ) : null}

          {request.type === 'schedule' && !isLoadingSideData ? (
            <ScheduleForm
              key={formKey}
              schedules={modalSchedules}
              setSchedules={setModalSchedules}
              selectedDate={request.date}
              isScheduleFormOpen={isScheduleFormOpen}
              setIsScheduleFormOpen={setIsScheduleFormOpen}
              autoOpenToken={autoOpenToken}
              autoOpenScheduleId={request.scheduleId}
              autoSelectTemplateId={request.templateId}
            />
          ) : null}

          {request.type === 'soccer' && !isLoadingSideData ? (
            <SoccerLogForm
              key={formKey}
              soccerLogs={modalSoccerLogs}
              setSoccerLogs={setModalSoccerLogs}
              selectedDate={request.date}
              isSoccerFormOpen={isSoccerFormOpen}
              setIsSoccerFormOpen={setIsSoccerFormOpen}
              autoOpenToken={autoOpenToken}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
