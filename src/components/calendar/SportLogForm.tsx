import { useEffect, useMemo, useState } from 'react'
import type { DateString, SportLog } from '../../types'
import { createOrUpdateSportLog, deleteSportLog } from '../../api/sportLogs'
import { fetchRecentWeight } from '../../api/dailyConditions'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../hooks/useConfirm'
import { estimateCaloriesBurned } from '../../utils/soccerCalorieHelpers'
import { OTHER_SPORT_TYPE, SPORT_TYPE_PRESETS, resolveSportMet } from '../../utils/sportCalorieHelpers'

// スポーツ記録機能（Tier 4-2：競技の拡張、2026年9月12日）：SoccerLogForm.tsxと
// 同等の構成（1日1件・find-by-date・upsert）。RPEは任意入力で、入力があれば
// RPE換算のMETを優先し、無ければプリセットのMETを使うハイブリッド方式
// （resolveSportMet、John承認済み）。

const RPE_UNSPECIFIED = ''
const RPE_OPTIONS = Array.from({ length: 10 }, (_, index) => index + 1) // 1〜10

type SportLogFormState = {
  selectedPreset: string
  customSportName: string
  durationMinutes: string
  // RPE_UNSPECIFIED（空文字）= 未入力。
  rpe: string
  caloriesBurned: string
  resultNote: string
  notes: string
}

type SportLogFormErrors = {
  sportType?: string
  durationMinutes?: string
  caloriesBurned?: string
}

const createEmptyFormState = (): SportLogFormState => ({
  selectedPreset: '',
  customSportName: '',
  durationMinutes: '',
  rpe: RPE_UNSPECIFIED,
  caloriesBurned: '',
  resultNote: '',
  notes: '',
})

function formStateFromLog(log: SportLog): SportLogFormState {
  const isPreset = (SPORT_TYPE_PRESETS as readonly string[]).includes(log.sportType)
  return {
    selectedPreset: isPreset ? log.sportType : OTHER_SPORT_TYPE,
    customSportName: isPreset ? '' : log.sportType,
    durationMinutes: String(log.durationMinutes),
    rpe: log.rpe !== undefined ? String(log.rpe) : RPE_UNSPECIFIED,
    caloriesBurned: log.caloriesBurned !== undefined ? String(log.caloriesBurned) : '',
    resultNote: log.resultNote ?? '',
    notes: log.notes ?? '',
  }
}

function validateOptionalPositiveNumber(value: string): boolean {
  if (value.trim() === '') {
    return true
  }
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue >= 0
}

type SportLogFormProps = {
  sportLogs: SportLog[]
  setSportLogs: React.Dispatch<React.SetStateAction<SportLog[]>>
  selectedDate: DateString
  isSportFormOpen: boolean
  setIsSportFormOpen: React.Dispatch<React.SetStateAction<boolean>>
  /** RecordFormModalからの自動オープン用。既存利用への影響なし（SoccerLogFormと同じ）。 */
  autoOpenToken?: number
}

export function SportLogForm({
  sportLogs,
  setSportLogs,
  selectedDate,
  isSportFormOpen,
  setIsSportFormOpen,
  autoOpenToken,
}: SportLogFormProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [formState, setFormState] = useState<SportLogFormState>(createEmptyFormState())
  const [formErrors, setFormErrors] = useState<SportLogFormErrors>({})
  const [formSummaryError, setFormSummaryError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [recentWeight, setRecentWeight] = useState<number | null>(null)

  const selectedLog = useMemo(() => sportLogs.find((log) => log.date === selectedDate), [sportLogs, selectedDate])

  useEffect(() => {
    setIsSportFormOpen(false)
  }, [selectedDate, setIsSportFormOpen])

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
    setIsSportFormOpen(true)
  }

  const handleFieldChange = (field: keyof SportLogFormState, value: string) => {
    setFormState((current) => ({ ...current, [field]: value }))
  }

  const sportType = formState.selectedPreset === OTHER_SPORT_TYPE ? formState.customSportName.trim() : formState.selectedPreset

  const durationValue = Number(formState.durationMinutes)
  const hasValidDuration = Number.isFinite(durationValue) && durationValue > 0
  const rpeValue = formState.rpe === RPE_UNSPECIFIED ? undefined : Number(formState.rpe)

  const met = sportType ? resolveSportMet(sportType, rpeValue) : null
  const estimatedCalories =
    met !== null && hasValidDuration && recentWeight ? estimateCaloriesBurned(met, durationValue, recentWeight) : null

  const validateForm = () => {
    const errors: SportLogFormErrors = {}

    if (!sportType) {
      errors.sportType = '競技を選択してください'
    }
    if (!hasValidDuration) {
      errors.durationMinutes = '実施時間は0より大きい数値で入力してください'
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

  const saveSportLog = async () => {
    if (!validateForm()) {
      return
    }

    setIsSaving(true)
    setFormSummaryError(null)
    try {
      // 消費カロリーは手入力があればそちらを優先し、無ければハイブリッド方式
      // （RPE優先、無ければプリセット）で推定した値を保存する。
      const caloriesToSave = parseOptionalNumber(formState.caloriesBurned) ?? estimatedCalories ?? undefined

      const saved = await createOrUpdateSportLog({
        date: selectedDate,
        sportType,
        customSportName: formState.selectedPreset === OTHER_SPORT_TYPE ? sportType : undefined,
        durationMinutes: durationValue,
        rpe: rpeValue,
        caloriesBurned: caloriesToSave,
        resultNote: formState.resultNote.trim() || undefined,
        notes: formState.notes.trim() || undefined,
      })

      setSportLogs((current) => {
        const exists = current.some((log) => log.date === saved.date)
        return exists ? current.map((log) => (log.date === saved.date ? saved : log)) : [...current, saved]
      })
      setIsSportFormOpen(false)
      showToast('スポーツ記録を保存しました', 'success')
    } catch (error) {
      console.error('Supabaseへのスポーツ記録の保存に失敗しました', error)
      setFormSummaryError('保存に失敗しました。もう一度お試しください')
      showToast('スポーツ記録の保存に失敗しました', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const removeSportLog = async () => {
    if (!selectedLog?.id) {
      return
    }

    const label = selectedLog.sportType === OTHER_SPORT_TYPE ? selectedLog.customSportName ?? OTHER_SPORT_TYPE : selectedLog.sportType
    const confirmed = await confirm(`${selectedLog.date}のスポーツ記録（${label}）を削除しますか？`)
    if (!confirmed) {
      return
    }

    try {
      await deleteSportLog(selectedLog.id)
      setSportLogs((current) => current.filter((log) => log.date !== selectedDate))
      setIsSportFormOpen(false)
      showToast('スポーツ記録を削除しました', 'success')
    } catch (error) {
      console.error('Supabaseからのスポーツ記録の削除に失敗しました', error)
      showToast('削除に失敗しました。もう一度お試しください', 'error')
    }
  }

  const displayLabel = (log: SportLog) => (log.sportType === OTHER_SPORT_TYPE ? log.customSportName ?? OTHER_SPORT_TYPE : log.sportType)

  return (
    <div className="calendar-detail__section">
      <div className="calendar-detail__section-header">
        <h4>スポーツ</h4>
        <button type="button" className="calendar-detail__secondary-button" onClick={openForm}>
          {selectedLog ? '記録を編集' : '記録を追加'}
        </button>
      </div>

      {selectedLog && !isSportFormOpen ? (
        <div className="calendar-detail__item">
          <p>
            🏆 {displayLabel(selectedLog)}
            {` / ${selectedLog.durationMinutes}分`}
            {selectedLog.rpe !== undefined ? ` / RPE${selectedLog.rpe}` : ''}
            {selectedLog.caloriesBurned !== undefined ? ` / ${selectedLog.caloriesBurned}kcal` : ''}
          </p>
          {selectedLog.resultNote ? <p className="calendar-detail__description">スコア・結果: {selectedLog.resultNote}</p> : null}
          {selectedLog.notes ? <p className="calendar-detail__description">メモ: {selectedLog.notes}</p> : null}
          <div className="calendar-detail__condition-actions">
            <button type="button" className="calendar-detail__delete-button" onClick={removeSportLog}>
              削除
            </button>
          </div>
        </div>
      ) : isSportFormOpen ? (
        <div className="calendar-detail__form">
          {formSummaryError ? <p className="calendar-detail__form-error">{formSummaryError}</p> : null}

          <div className="calendar-detail__field calendar-detail__field--full">
            <span>競技</span>
            <div className="calendar-detail__category-filter">
              {[...SPORT_TYPE_PRESETS, OTHER_SPORT_TYPE].map((preset) => (
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
            {formState.selectedPreset === OTHER_SPORT_TYPE ? (
              <input
                type="text"
                value={formState.customSportName}
                onChange={(event) => handleFieldChange('customSportName', event.target.value)}
                placeholder="例: ボルダリング"
              />
            ) : null}
            {formErrors.sportType ? <p className="calendar-detail__error">{formErrors.sportType}</p> : null}
          </div>

          <label className="calendar-detail__field">
            <span>実施時間（分）</span>
            <input
              type="number"
              min="0"
              value={formState.durationMinutes}
              onChange={(event) => handleFieldChange('durationMinutes', event.target.value)}
              placeholder="例: 60"
            />
            {formErrors.durationMinutes ? <p className="calendar-detail__error">{formErrors.durationMinutes}</p> : null}
          </label>

          <label className="calendar-detail__field">
            <span>RPE（主観的運動強度・任意）</span>
            <select value={formState.rpe} onChange={(event) => handleFieldChange('rpe', event.target.value)}>
              <option value={RPE_UNSPECIFIED}>未入力</option>
              {RPE_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <p className="calendar-detail__description">
              入力すると、競技ごとの標準的な強度の代わりにRPEから推定した強度で消費カロリーを計算します
            </p>
          </label>

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
            ) : recentWeight === null ? (
              <p className="calendar-detail__description">体重記録がないため推定値は計算されません。手入力してください</p>
            ) : null}
            {formErrors.caloriesBurned ? <p className="calendar-detail__error">{formErrors.caloriesBurned}</p> : null}
          </label>

          <label className="calendar-detail__field calendar-detail__field--full">
            <span>スコア・得点・勝敗（任意）</span>
            <input
              type="text"
              value={formState.resultNote}
              onChange={(event) => handleFieldChange('resultNote', event.target.value)}
              placeholder="例: 3-1勝利"
            />
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
            <button type="button" className="calendar-detail__button" onClick={saveSportLog} disabled={isSaving}>
              {isSaving ? '保存中...' : '保存する'}
            </button>
            {selectedLog ? (
              <button type="button" className="calendar-detail__delete-button" onClick={removeSportLog}>
                この記録を削除
              </button>
            ) : null}
            <button type="button" className="calendar-detail__secondary-button" onClick={() => setIsSportFormOpen(false)}>
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
