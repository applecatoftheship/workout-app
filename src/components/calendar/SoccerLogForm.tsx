import { useEffect, useMemo, useState } from 'react'
import type { DateString, SoccerLog } from '../../types'
import { createOrUpdateSoccerLog, deleteSoccerLog } from '../../api/soccerLogs'
import { fetchRecentWeight } from '../../api/dailyConditions'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../hooks/useConfirm'
import { getCurrentTimeHHMM, combineDateAndTimeToISO, extractTimeHHMMFromISO } from '../../utils/calendarHelpers'
import {
  ACTIVITY_TYPE_PRESETS,
  TRAINING_MENUS,
  calculateAutoFillValues,
  estimateCaloriesBurned,
  resolveAutoFillRates,
  resolveMet,
} from '../../utils/soccerCalorieHelpers'

const ACTIVITY_PRESETS = ACTIVITY_TYPE_PRESETS
const OTHER_ACTIVITY = 'その他'
const TRAINING_ACTIVITY = '練習'

type SoccerLogFormState = {
  selectedPreset: string
  customActivityType: string
  trainingMenu: string
  durationMinutes: string
  distanceKm: string
  sprintCount: string
  maxSpeedKmh: string
  caloriesBurned: string
  notes: string
  // リカバリー窓機能（スプリント4 Phase 1）：input type="time"用のHH:MM文字列。
  // 空文字の場合は「保存」ボタン押下時の時刻をデフォルトとして使う（TrainingLogForm.tsxと同じ扱い）。
  endTime: string
}

type SoccerLogFormErrors = {
  activityType?: string
  durationMinutes?: string
  distanceKm?: string
  sprintCount?: string
  maxSpeedKmh?: string
  caloriesBurned?: string
}

const createEmptyFormState = (): SoccerLogFormState => ({
  selectedPreset: '',
  customActivityType: '',
  trainingMenu: '',
  durationMinutes: '',
  distanceKm: '',
  sprintCount: '',
  maxSpeedKmh: '',
  caloriesBurned: '',
  notes: '',
  endTime: '',
})

function formStateFromLog(log: SoccerLog): SoccerLogFormState {
  const isPreset = ACTIVITY_PRESETS.includes(log.activityType)
  return {
    selectedPreset: isPreset ? log.activityType : OTHER_ACTIVITY,
    customActivityType: isPreset ? '' : log.activityType,
    trainingMenu: log.trainingMenu ?? '',
    durationMinutes: log.durationMinutes !== undefined ? String(log.durationMinutes) : '',
    distanceKm: log.distanceKm !== undefined ? String(log.distanceKm) : '',
    sprintCount: log.sprintCount !== undefined ? String(log.sprintCount) : '',
    maxSpeedKmh: log.maxSpeedKmh !== undefined ? String(log.maxSpeedKmh) : '',
    caloriesBurned: log.caloriesBurned !== undefined ? String(log.caloriesBurned) : '',
    notes: log.notes ?? '',
    endTime: log.endTime ? extractTimeHHMMFromISO(log.endTime) : '',
  }
}

function validateOptionalPositiveNumber(value: string): boolean {
  if (value.trim() === '') {
    return true
  }
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue >= 0
}

type SoccerLogFormProps = {
  soccerLogs: SoccerLog[]
  setSoccerLogs: React.Dispatch<React.SetStateAction<SoccerLog[]>>
  selectedDate: DateString
  isSoccerFormOpen: boolean
  setIsSoccerFormOpen: React.Dispatch<React.SetStateAction<boolean>>
  /** RecordFormModal（Phase B）からの自動オープン用。既存利用への影響なし。 */
  autoOpenToken?: number
}

export function SoccerLogForm({
  soccerLogs,
  setSoccerLogs,
  selectedDate,
  isSoccerFormOpen,
  setIsSoccerFormOpen,
  autoOpenToken,
}: SoccerLogFormProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [formState, setFormState] = useState<SoccerLogFormState>(createEmptyFormState())
  const [formErrors, setFormErrors] = useState<SoccerLogFormErrors>({})
  const [formSummaryError, setFormSummaryError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [recentWeight, setRecentWeight] = useState<number | null>(null)

  const selectedLog = useMemo(() => soccerLogs.find((log) => log.date === selectedDate), [soccerLogs, selectedDate])

  useEffect(() => {
    setIsSoccerFormOpen(false)
  }, [selectedDate, setIsSoccerFormOpen])

  useEffect(() => {
    if (autoOpenToken === undefined) {
      return
    }
    openForm()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenToken])

  useEffect(() => {
    fetchRecentWeight(selectedDate)
      .then(setRecentWeight)
      .catch((error) => {
        console.error('Supabaseから直近の体重記録の取得に失敗しました', error)
        setRecentWeight(null)
      })
  }, [selectedDate])

  const openForm = () => {
    setFormState(selectedLog ? formStateFromLog(selectedLog) : createEmptyFormState())
    setFormErrors({})
    setFormSummaryError(null)
    setIsSoccerFormOpen(true)
  }

  const handleFieldChange = (field: keyof SoccerLogFormState, value: string) => {
    setFormState((current) => ({ ...current, [field]: value }))
  }

  const activityType = formState.selectedPreset === OTHER_ACTIVITY ? formState.customActivityType.trim() : formState.selectedPreset
  const isTrainingSelected = formState.selectedPreset === TRAINING_ACTIVITY
  const trainingMenuValue = isTrainingSelected ? formState.trainingMenu : ''

  const durationValue = Number(formState.durationMinutes)
  const hasValidDuration = Number.isFinite(durationValue) && durationValue > 0

  const autoFillRates = resolveAutoFillRates(activityType, trainingMenuValue || null)
  const isAutoFilled = Boolean(autoFillRates)
  const showSprintAndSpeedFields = !autoFillRates || autoFillRates.maxSpeedKmh !== null
  const autoFillValues = autoFillRates && hasValidDuration ? calculateAutoFillValues(durationValue, autoFillRates) : null

  const displayDistanceKm = isAutoFilled ? (autoFillValues ? String(autoFillValues.distanceKm) : '') : formState.distanceKm
  const displaySprintCount = isAutoFilled ? (autoFillValues ? String(autoFillValues.sprintCount) : '') : formState.sprintCount
  const displayMaxSpeedKmh = isAutoFilled
    ? autoFillRates?.maxSpeedKmh != null
      ? String(autoFillRates.maxSpeedKmh)
      : ''
    : formState.maxSpeedKmh

  const met = resolveMet(activityType, trainingMenuValue || null)
  const estimatedCalories = met !== null && hasValidDuration && recentWeight ? estimateCaloriesBurned(met, durationValue, recentWeight) : null

  const validateForm = () => {
    const errors: SoccerLogFormErrors = {}

    if (!activityType) {
      errors.activityType = '活動種別を選択してください'
    }
    if (!validateOptionalPositiveNumber(formState.durationMinutes)) {
      errors.durationMinutes = '活動時間は0以上の数値で入力してください'
    }
    if (!isAutoFilled) {
      if (!validateOptionalPositiveNumber(formState.distanceKm)) {
        errors.distanceKm = '走行距離は0以上の数値で入力してください'
      }
      if (!validateOptionalPositiveNumber(formState.sprintCount)) {
        errors.sprintCount = 'スプリント回数は0以上の数値で入力してください'
      }
      if (!validateOptionalPositiveNumber(formState.maxSpeedKmh)) {
        errors.maxSpeedKmh = '最高速度は0以上の数値で入力してください'
      }
    }
    if (!validateOptionalPositiveNumber(formState.caloriesBurned)) {
      errors.caloriesBurned = '消費カロリーは0以上の数値で入力してください'
    }

    const hasErrors = Object.keys(errors).length > 0
    setFormSummaryError(hasErrors ? '入力内容にエラーがあります。各項目を確認してください' : null)
    setFormErrors(errors)
    return !hasErrors
  }

  const parseOptionalNumber = (value: string) => (value.trim() === '' ? undefined : Number(value))

  const saveSoccerLog = async () => {
    if (!validateForm()) {
      return
    }

    setIsSaving(true)
    setFormSummaryError(null)
    try {
      // リカバリー窓機能（スプリント4 Phase 1）：手動調整されていなければ「保存」ボタン
      // 押下時（＝今この瞬間）の時刻をend_timeのデフォルトとする（TrainingLogForm.tsxと同じ扱い）。
      const endTimeHHMM = formState.endTime || getCurrentTimeHHMM()

      const saved = await createOrUpdateSoccerLog({
        date: selectedDate,
        activityType,
        trainingMenu: isTrainingSelected ? formState.trainingMenu || undefined : undefined,
        durationMinutes: parseOptionalNumber(formState.durationMinutes),
        distanceKm: parseOptionalNumber(displayDistanceKm),
        sprintCount: showSprintAndSpeedFields ? parseOptionalNumber(displaySprintCount) : undefined,
        maxSpeedKmh: showSprintAndSpeedFields ? parseOptionalNumber(displayMaxSpeedKmh) : undefined,
        caloriesBurned: parseOptionalNumber(formState.caloriesBurned),
        notes: formState.notes.trim() || undefined,
        endTime: combineDateAndTimeToISO(selectedDate, endTimeHHMM),
      })

      setSoccerLogs((current) => {
        const exists = current.some((log) => log.date === saved.date)
        return exists ? current.map((log) => (log.date === saved.date ? saved : log)) : [...current, saved]
      })
      setIsSoccerFormOpen(false)
      showToast('サッカー記録を保存しました', 'success')
    } catch (error) {
      console.error('Supabaseへのサッカー記録の保存に失敗しました', error)
      setFormSummaryError('保存に失敗しました。もう一度お試しください')
      showToast('サッカー記録の保存に失敗しました', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const removeSoccerLog = async () => {
    if (!selectedLog?.id) {
      return
    }

    const confirmed = await confirm(`${selectedLog.date}のサッカー記録（${selectedLog.activityType}）を削除しますか？`)
    if (!confirmed) {
      return
    }

    try {
      await deleteSoccerLog(selectedLog.id)
      setSoccerLogs((current) => current.filter((log) => log.date !== selectedDate))
      setIsSoccerFormOpen(false)
      showToast('サッカー記録を削除しました', 'success')
    } catch (error) {
      console.error('Supabaseからのサッカー記録の削除に失敗しました', error)
      showToast('削除に失敗しました。もう一度お試しください', 'error')
    }
  }

  return (
    <div className="calendar-detail__section">
      <div className="calendar-detail__section-header">
        <h4>サッカー</h4>
        <button type="button" className="calendar-detail__secondary-button" onClick={openForm}>
          {selectedLog ? '記録を編集' : '記録を追加'}
        </button>
      </div>

      {selectedLog && !isSoccerFormOpen ? (
        <div className="calendar-detail__item">
          <p>
            ⚽ {selectedLog.activityType}
            {selectedLog.trainingMenu ? `（${selectedLog.trainingMenu}）` : ''}
            {selectedLog.durationMinutes !== undefined ? ` / ${selectedLog.durationMinutes}分` : ''}
            {selectedLog.caloriesBurned !== undefined ? ` / ${selectedLog.caloriesBurned}kcal` : ''}
          </p>
          {selectedLog.distanceKm !== undefined ? <p className="calendar-detail__description">走行距離: {selectedLog.distanceKm}km</p> : null}
          {selectedLog.sprintCount !== undefined ? (
            <p className="calendar-detail__description">スプリント: {selectedLog.sprintCount}回</p>
          ) : null}
          {selectedLog.maxSpeedKmh !== undefined ? (
            <p className="calendar-detail__description">最高速度: {selectedLog.maxSpeedKmh}km/h</p>
          ) : null}
          {selectedLog.notes ? <p className="calendar-detail__description">メモ: {selectedLog.notes}</p> : null}
          <div className="calendar-detail__condition-actions">
            <button type="button" className="calendar-detail__delete-button" onClick={removeSoccerLog}>
              削除
            </button>
          </div>
        </div>
      ) : isSoccerFormOpen ? (
        <div className="calendar-detail__form">
          {formSummaryError ? <p className="calendar-detail__form-error">{formSummaryError}</p> : null}

          <div className="calendar-detail__field calendar-detail__field--full">
            <span>活動種別</span>
            <div className="calendar-detail__category-filter">
              {[...ACTIVITY_PRESETS, OTHER_ACTIVITY].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`calendar-detail__category-chip${
                    formState.selectedPreset === preset ? ' calendar-detail__category-chip--active' : ''
                  }`}
                  onClick={() => handleFieldChange('selectedPreset', preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
            {formState.selectedPreset === OTHER_ACTIVITY ? (
              <input
                type="text"
                value={formState.customActivityType}
                onChange={(event) => handleFieldChange('customActivityType', event.target.value)}
                placeholder="例: ビーチサッカー"
              />
            ) : null}
            {isTrainingSelected ? (
              <div className="calendar-detail__category-filter">
                {TRAINING_MENUS.map((menu) => (
                  <button
                    key={menu}
                    type="button"
                    className={`calendar-detail__category-chip${
                      formState.trainingMenu === menu ? ' calendar-detail__category-chip--active' : ''
                    }`}
                    onClick={() => handleFieldChange('trainingMenu', menu)}
                  >
                    {menu}
                  </button>
                ))}
              </div>
            ) : null}
            {formErrors.activityType ? <p className="calendar-detail__error">{formErrors.activityType}</p> : null}
          </div>

          <label className="calendar-detail__field">
            <span>活動時間（分）</span>
            <input
              type="number"
              min="0"
              value={formState.durationMinutes}
              onChange={(event) => handleFieldChange('durationMinutes', event.target.value)}
              placeholder="例: 90"
            />
            {formErrors.durationMinutes ? <p className="calendar-detail__error">{formErrors.durationMinutes}</p> : null}
          </label>

          <label className="calendar-detail__field">
            <span>走行距離（km・任意）</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={displayDistanceKm}
              onChange={(event) => handleFieldChange('distanceKm', event.target.value)}
              placeholder={isAutoFilled ? '活動時間から自動計算' : '例: 8.5'}
              disabled={isAutoFilled}
              readOnly={isAutoFilled}
            />
            {formErrors.distanceKm ? <p className="calendar-detail__error">{formErrors.distanceKm}</p> : null}
          </label>

          {showSprintAndSpeedFields ? (
            <>
              <label className="calendar-detail__field">
                <span>スプリント回数（任意）</span>
                <input
                  type="number"
                  min="0"
                  value={displaySprintCount}
                  onChange={(event) => handleFieldChange('sprintCount', event.target.value)}
                  placeholder={isAutoFilled ? '活動時間から自動計算' : '例: 15'}
                  disabled={isAutoFilled}
                  readOnly={isAutoFilled}
                />
                {formErrors.sprintCount ? <p className="calendar-detail__error">{formErrors.sprintCount}</p> : null}
              </label>

              <label className="calendar-detail__field">
                <span>最高速度（km/h・任意）</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={displayMaxSpeedKmh}
                  onChange={(event) => handleFieldChange('maxSpeedKmh', event.target.value)}
                  placeholder={isAutoFilled ? '固定値' : '例: 24.3'}
                  disabled={isAutoFilled}
                  readOnly={isAutoFilled}
                />
                {formErrors.maxSpeedKmh ? <p className="calendar-detail__error">{formErrors.maxSpeedKmh}</p> : null}
              </label>
            </>
          ) : null}

          <label className="calendar-detail__field calendar-detail__field--full">
            <span>消費カロリー（kcal）</span>
            <input
              type="number"
              min="0"
              value={formState.caloriesBurned}
              onChange={(event) => handleFieldChange('caloriesBurned', event.target.value)}
              placeholder={estimatedCalories !== null ? `推定: 約${estimatedCalories}kcal` : '手入力してください'}
            />
            {estimatedCalories !== null ? (
              <p className="calendar-detail__description">
                推定: 約{estimatedCalories}kcal（体重{recentWeight}kg換算）。入力すればそちらを優先して保存します
              </p>
            ) : isTrainingSelected && !formState.trainingMenu ? (
              <p className="calendar-detail__description">メニューを選択すると推定値が表示されます</p>
            ) : recentWeight === null ? (
              <p className="calendar-detail__description">体重記録がないため推定値は計算されません。手入力してください</p>
            ) : null}
            {formErrors.caloriesBurned ? <p className="calendar-detail__error">{formErrors.caloriesBurned}</p> : null}
          </label>

          <label className="calendar-detail__field">
            <span>終了時刻（任意）</span>
            <input type="time" value={formState.endTime} onChange={(event) => handleFieldChange('endTime', event.target.value)} />
            <p className="calendar-detail__description">未入力の場合は「保存」を押した時刻を使用します</p>
          </label>

          <label className="calendar-detail__field calendar-detail__field--full">
            <span>メモ</span>
            <textarea
              rows={3}
              value={formState.notes}
              onChange={(event) => handleFieldChange('notes', event.target.value)}
              placeholder="今日のプレーの感想など"
            />
          </label>

          <div className="calendar-detail__actions">
            <button type="button" className="calendar-detail__button" onClick={saveSoccerLog} disabled={isSaving}>
              {isSaving ? '保存中...' : '保存する'}
            </button>
            {selectedLog ? (
              <button type="button" className="calendar-detail__delete-button" onClick={removeSoccerLog}>
                この記録を削除
              </button>
            ) : null}
            <button type="button" className="calendar-detail__secondary-button" onClick={() => setIsSoccerFormOpen(false)}>
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <p className="calendar-detail__empty">記録なし</p>
      )}
    </div>
  )
}
