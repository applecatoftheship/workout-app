import { useEffect, useMemo, useState } from 'react'
import type { DailyCondition, DateString, FatigueLevel, MuscleLocation, SorenessLevel } from '../../types'
import { formatConditionSummary } from '../../utils/calendarHelpers'
import { MUSCLE_LOCATION_LABELS, SORENESS_LEVEL_LABELS } from '../../utils/acwrHelpers'
import { deleteDailyConditionRemote, fetchDailyConditions, upsertDailyCondition } from '../../api/dailyConditions'
import { useToast } from '../../hooks/useToast'

const MUSCLE_LOCATIONS: MuscleLocation[] = ['none', 'calf_l', 'calf_r', 'hamstring', 'quad', 'groin', 'other']
const SORENESS_LEVELS: SorenessLevel[] = ['none', 'mild', 'severe']

type ConditionFormState = {
  weight: string
  sleepHours: string
  fatigue: FatigueLevel | ''
  notes: string
  muscleSorenessLocation: MuscleLocation
  muscleSorenessLevel: SorenessLevel
}

type ConditionFormErrors = {
  weight?: string
  sleepHours?: string
  fatigue?: string
  muscleSorenessLocation?: string
}

const createEmptyConditionFormState = (): ConditionFormState => ({
  weight: '',
  sleepHours: '',
  fatigue: '',
  notes: '',
  muscleSorenessLocation: 'none',
  muscleSorenessLevel: 'none',
})

const createEmptyConditionFormErrors = (): ConditionFormErrors => ({})

type ConditionFormProps = {
  dailyConditions: DailyCondition[]
  setDailyConditions: React.Dispatch<React.SetStateAction<DailyCondition[]>>
  selectedDate: DateString
  isConditionFormOpen: boolean
  setIsConditionFormOpen: React.Dispatch<React.SetStateAction<boolean>>
  setIsFormOpen: React.Dispatch<React.SetStateAction<boolean>>
  setIsMealFormOpen: React.Dispatch<React.SetStateAction<boolean>>
  /** RecordFormModal（Phase B）からの自動オープン用。既存利用への影響なし。 */
  autoOpenToken?: number
}

export function ConditionForm({
  dailyConditions,
  setDailyConditions,
  selectedDate,
  isConditionFormOpen,
  setIsConditionFormOpen,
  setIsFormOpen,
  setIsMealFormOpen,
  autoOpenToken,
}: ConditionFormProps) {
  const { showToast } = useToast()
  const [editingConditionIndex, setEditingConditionIndex] = useState<number | null>(null)
  const [conditionFormState, setConditionFormState] = useState<ConditionFormState>(createEmptyConditionFormState())
  const [conditionFormErrors, setConditionFormErrors] = useState<ConditionFormErrors>(createEmptyConditionFormErrors())
  const [conditionFormSummaryError, setConditionFormSummaryError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const selectedCondition = useMemo(
    () => dailyConditions.find((condition) => condition.date === selectedDate),
    [dailyConditions, selectedDate],
  )

  useEffect(() => {
    setIsConditionFormOpen(false)
    setEditingConditionIndex(null)
  }, [selectedDate, setIsConditionFormOpen])

  useEffect(() => {
    if (autoOpenToken === undefined) {
      return
    }
    const existingIndex = dailyConditions.findIndex((condition) => condition.date === selectedDate)
    openConditionForm(existingIndex >= 0 ? existingIndex : undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenToken])

  const openConditionForm = (conditionIndex?: number) => {
    const existingCondition = typeof conditionIndex === 'number' && conditionIndex >= 0 ? dailyConditions[conditionIndex] : null

    setEditingConditionIndex(typeof conditionIndex === 'number' && conditionIndex >= 0 ? conditionIndex : null)
    setConditionFormState(
      existingCondition
        ? {
            weight: String(existingCondition.weight),
            sleepHours: String(existingCondition.sleepHours),
            fatigue: existingCondition.fatigue,
            notes: existingCondition.notes ?? '',
            muscleSorenessLocation: existingCondition.muscleSorenessLocation ?? 'none',
            muscleSorenessLevel: existingCondition.muscleSorenessLevel ?? 'none',
          }
        : createEmptyConditionFormState(),
    )
    setConditionFormErrors(createEmptyConditionFormErrors())
    setConditionFormSummaryError(null)
    setIsFormOpen(false)
    setIsMealFormOpen(false)
    setIsConditionFormOpen(true)
  }

  const handleConditionFieldChange = (
    field: keyof ConditionFormState,
    value: string | FatigueLevel | MuscleLocation | SorenessLevel | '',
  ) => {
    setConditionFormState((current) => ({ ...current, [field]: value }))
  }

  const validateConditionForm = () => {
    const errors: ConditionFormErrors = {}
    const weightValue = Number(conditionFormState.weight)
    const sleepValue = Number(conditionFormState.sleepHours)

    if (!Number.isFinite(weightValue) || weightValue <= 0) {
      errors.weight = '体重は0より大きい数値で入力してください'
    }
    if (!Number.isFinite(sleepValue) || sleepValue < 0 || sleepValue > 24) {
      errors.sleepHours = '睡眠時間は0以上24以下の数値で入力してください'
    }
    if (!conditionFormState.fatigue) {
      errors.fatigue = '疲労度は必須です'
    }
    if (conditionFormState.muscleSorenessLevel !== 'none' && conditionFormState.muscleSorenessLocation === 'none') {
      errors.muscleSorenessLocation = '張りの度合いを選択した場合は部位も選択してください'
    }

    const hasErrors = Object.keys(errors).length > 0
    if (hasErrors) {
      setConditionFormSummaryError('入力内容にエラーがあります。各項目を確認してください')
    } else {
      setConditionFormSummaryError(null)
    }

    setConditionFormErrors(errors)
    return !hasErrors
  }

  const saveCondition = async () => {
    if (!validateConditionForm()) {
      return
    }

    const nextCondition: DailyCondition = {
      date: selectedDate,
      weight: Number(conditionFormState.weight),
      sleepHours: Number(conditionFormState.sleepHours),
      fatigue: conditionFormState.fatigue as FatigueLevel,
      notes: conditionFormState.notes.trim() || undefined,
      muscleSorenessLocation: conditionFormState.muscleSorenessLocation,
      muscleSorenessLevel: conditionFormState.muscleSorenessLevel,
    }

    setIsSaving(true)
    try {
      await upsertDailyCondition(nextCondition)
      const refreshed = await fetchDailyConditions()
      setDailyConditions(refreshed)
      setIsConditionFormOpen(false)
      setEditingConditionIndex(null)
      showToast('体調記録を保存しました', 'success')
    } catch (error) {
      console.error('Supabaseへの体調記録の保存に失敗しました', error)
      setConditionFormSummaryError('保存に失敗しました。もう一度お試しください')
      showToast('体調記録の保存に失敗しました', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const deleteCondition = async () => {
    if (!selectedCondition?.id) {
      return
    }

    const confirmed = window.confirm(`${selectedCondition.date}の体調記録を削除しますか？`)
    if (!confirmed) {
      return
    }

    try {
      await deleteDailyConditionRemote(selectedCondition.id)
      const refreshed = await fetchDailyConditions()
      setDailyConditions(refreshed)
      setIsConditionFormOpen(false)
      setEditingConditionIndex(null)
      showToast('体調記録を削除しました', 'success')
    } catch (error) {
      console.error('Supabaseからの体調記録の削除に失敗しました', error)
      showToast('削除に失敗しました。もう一度お試しください', 'error')
    }
  }

  return (
    <div className="calendar-detail__section">
      <div className="calendar-detail__section-header">
        <h4>体調</h4>
        <button type="button" className="calendar-detail__secondary-button" onClick={() => openConditionForm()}>
          体調を記録
        </button>
      </div>
      {selectedCondition && !isConditionFormOpen ? (
        <div className="calendar-detail__item">
          <p>{formatConditionSummary(selectedCondition)}</p>
          <div className="calendar-detail__condition-actions">
            <button
              type="button"
              className="calendar-detail__edit-button"
              onClick={() => {
                const conditionIndex = dailyConditions.findIndex((condition) => condition.date === selectedDate)
                if (conditionIndex >= 0) {
                  openConditionForm(conditionIndex)
                }
              }}
            >
              編集
            </button>
            <button type="button" className="calendar-detail__delete-button" onClick={deleteCondition}>
              削除
            </button>
          </div>
          {selectedCondition.notes ? <p className="calendar-detail__description">メモ: {selectedCondition.notes}</p> : null}
        </div>
      ) : isConditionFormOpen ? (
        <div className="calendar-detail__form">
          {conditionFormSummaryError ? <p className="calendar-detail__form-error">{conditionFormSummaryError}</p> : null}
          <label className="calendar-detail__field">
            <span>体重 (kg)</span>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={conditionFormState.weight}
              onChange={(event) => handleConditionFieldChange('weight', event.target.value)}
              placeholder="例: 64.8"
            />
            {conditionFormErrors.weight ? <p className="calendar-detail__error">{conditionFormErrors.weight}</p> : null}
          </label>
          <label className="calendar-detail__field">
            <span>睡眠時間 (時間)</span>
            <input
              type="number"
              min="0"
              max="24"
              step="0.1"
              value={conditionFormState.sleepHours}
              onChange={(event) => handleConditionFieldChange('sleepHours', event.target.value)}
              placeholder="例: 7.0"
            />
            {conditionFormErrors.sleepHours ? <p className="calendar-detail__error">{conditionFormErrors.sleepHours}</p> : null}
          </label>
          <label className="calendar-detail__field">
            <span>疲労度</span>
            <select
              value={conditionFormState.fatigue}
              onChange={(event) => handleConditionFieldChange('fatigue', event.target.value as FatigueLevel | '')}
            >
              <option value="">選択してください</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
            {conditionFormErrors.fatigue ? <p className="calendar-detail__error">{conditionFormErrors.fatigue}</p> : null}
          </label>
          <div className="calendar-detail__field calendar-detail__field--full">
            <span>局所疲労・張りの部位</span>
            <div className="calendar-detail__category-filter">
              {MUSCLE_LOCATIONS.map((location) => (
                <button
                  key={location}
                  type="button"
                  className={`calendar-detail__category-chip${
                    conditionFormState.muscleSorenessLocation === location ? ' calendar-detail__category-chip--active' : ''
                  }`}
                  onClick={() => handleConditionFieldChange('muscleSorenessLocation', location)}
                >
                  {MUSCLE_LOCATION_LABELS[location]}
                </button>
              ))}
            </div>
            {conditionFormErrors.muscleSorenessLocation ? (
              <p className="calendar-detail__error">{conditionFormErrors.muscleSorenessLocation}</p>
            ) : null}
          </div>
          <div className="calendar-detail__field calendar-detail__field--full">
            <span>張りの度合い</span>
            <div className="calendar-detail__category-filter">
              {SORENESS_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`calendar-detail__category-chip${
                    conditionFormState.muscleSorenessLevel === level ? ' calendar-detail__category-chip--active' : ''
                  }`}
                  onClick={() => handleConditionFieldChange('muscleSorenessLevel', level)}
                >
                  {SORENESS_LEVEL_LABELS[level]}
                </button>
              ))}
            </div>
          </div>
          <label className="calendar-detail__field calendar-detail__field--full">
            <span>体調メモ</span>
            <textarea
              rows={3}
              value={conditionFormState.notes}
              onChange={(event) => handleConditionFieldChange('notes', event.target.value)}
              placeholder="今日の体調の特徴や感想"
            />
          </label>
          <div className="calendar-detail__actions">
            <button type="button" className="calendar-detail__button" onClick={saveCondition} disabled={isSaving}>
              {isSaving ? '保存中...' : '保存する'}
            </button>
            {editingConditionIndex !== null ? (
              <button type="button" className="calendar-detail__delete-button" onClick={deleteCondition}>
                この記録を削除
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="calendar-detail__empty">記録なし</p>
      )}
    </div>
  )
}
