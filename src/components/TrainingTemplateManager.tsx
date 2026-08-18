import { useEffect, useState } from 'react'
import './calendar/CalendarForms.css'
import { createTrainingTemplate, deleteTrainingTemplate, fetchTrainingTemplates } from '../api/trainingTemplates'
import { fetchExercises } from '../api/trainingLogs'
import { useToast } from '../hooks/useToast'
import { ExercisePicker } from './calendar/ExercisePicker'
import type { RecordModalRequest } from './RecordFormModal'
import type { DateString, ExerciseDefinition, TrainingTemplate } from '../types'

type TemplateExerciseSlot = {
  key: string
  exerciseId: string | null
  exerciseName: string
}

let slotKeyCounter = 0
function createSlotKey() {
  slotKeyCounter += 1
  return `template-slot-${slotKeyCounter}`
}

const createEmptySlot = (): TemplateExerciseSlot => ({ key: createSlotKey(), exerciseId: null, exerciseName: '' })

type TrainingTemplateManagerProps = {
  todayString: DateString
  openRecordModal: (request: Omit<RecordModalRequest, 'requestId'>) => void
}

// テンプレート管理UI（技術的負債#7対応、2026年8月18日）。Phase F（2026年8月16日）で
// 廃止したのは「実績記録時にその場でテンプレートを適用する」機能であり、
// テンプレート自体の作成・一覧・削除を行う本UIは別機能として新設する。
export function TrainingTemplateManager({ todayString, openRecordModal }: TrainingTemplateManagerProps) {
  const { showToast } = useToast()
  const [templates, setTemplates] = useState<TrainingTemplate[]>([])
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true)
  const [exercises, setExercises] = useState<ExerciseDefinition[]>([])
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [slots, setSlots] = useState<TemplateExerciseSlot[]>([createEmptySlot()])
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const loadTemplates = () => {
    setIsLoadingTemplates(true)
    fetchTrainingTemplates()
      .then(setTemplates)
      .catch((error) => {
        console.error('Supabaseからテンプレート一覧の取得に失敗しました', error)
      })
      .finally(() => setIsLoadingTemplates(false))
  }

  const loadExercises = () => {
    fetchExercises()
      .then(setExercises)
      .catch((error) => {
        console.error('Supabaseから種目一覧の取得に失敗しました', error)
      })
  }

  useEffect(() => {
    loadTemplates()
    loadExercises()
  }, [])

  const openCreateForm = () => {
    setTemplateName('')
    setSlots([createEmptySlot()])
    setFormError(null)
    setIsFormOpen(true)
  }

  const addSlot = () => {
    setSlots((current) => [...current, createEmptySlot()])
  }

  const removeSlot = (key: string) => {
    setSlots((current) => current.filter((slot) => slot.key !== key))
  }

  const handleSlotSelect = (key: string, exerciseId: string, name: string) => {
    setSlots((current) => current.map((slot) => (slot.key === key ? { ...slot, exerciseId, exerciseName: name } : slot)))
  }

  const saveTemplate = async () => {
    const trimmedName = templateName.trim()
    if (!trimmedName) {
      setFormError('テンプレート名は必須です')
      return
    }

    const selectedExerciseIds = slots.map((slot) => slot.exerciseId).filter((id): id is string => Boolean(id))
    if (selectedExerciseIds.length === 0) {
      setFormError('少なくとも1つの種目を選択してください')
      return
    }

    setIsSaving(true)
    setFormError(null)
    try {
      await createTrainingTemplate(trimmedName, selectedExerciseIds)
      loadTemplates()
      setIsFormOpen(false)
      showToast('テンプレートを作成しました', 'success')
    } catch (error) {
      console.error('Supabaseへのテンプレート作成に失敗しました', error)
      setFormError('作成に失敗しました。もう一度お試しください')
      showToast('テンプレートの作成に失敗しました', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteTemplate = async (template: TrainingTemplate) => {
    const confirmed = window.confirm(`『${template.name}』を削除しますか？この操作は取り消せません`)
    if (!confirmed) {
      return
    }

    try {
      await deleteTrainingTemplate(template.id as string)
      loadTemplates()
      showToast('テンプレートを削除しました', 'success')
    } catch (error) {
      console.error('Supabaseからのテンプレート削除に失敗しました', error)
      showToast('削除に失敗しました。もう一度お試しください', 'error')
    }
  }

  const handleCreateScheduleFromTemplate = (template: TrainingTemplate) => {
    openRecordModal({ type: 'schedule', date: todayString, templateId: template.id })
  }

  return (
    <section className="panel-card">
      <div className="panel-card__header-row">
        <h3 className="settings-section__title">トレーニングテンプレート</h3>
        {!isFormOpen ? (
          <button type="button" className="button button--secondary" onClick={openCreateForm}>
            新規作成
          </button>
        ) : null}
      </div>

      {isLoadingTemplates ? <p className="panel-card__description">読み込み中...</p> : null}

      {!isLoadingTemplates && !isFormOpen && templates.length === 0 ? (
        <p className="panel-card__description">登録済みのテンプレートはありません</p>
      ) : null}

      {!isFormOpen && templates.length > 0 ? (
        <ul className="calendar-detail__log-list">
          {templates.map((template) => (
            <li key={template.id} className="calendar-detail__log-item">
              <div className="calendar-detail__log-head">
                <span>
                  {template.name}（{template.exercises.length}種目）
                </span>
                <div className="calendar-detail__log-actions">
                  <button
                    type="button"
                    className="calendar-detail__edit-button"
                    onClick={() => handleCreateScheduleFromTemplate(template)}
                  >
                    予定を作成
                  </button>
                  <button type="button" className="calendar-detail__delete-button" onClick={() => handleDeleteTemplate(template)}>
                    削除
                  </button>
                </div>
              </div>
              <p className="calendar-detail__description">
                {template.exercises.length > 0
                  ? template.exercises.map((exercise) => exercise.exercise?.name ?? '不明な種目').join('・')
                  : '種目未登録'}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {isFormOpen ? (
        <div className="calendar-detail__form">
          {formError ? <p className="calendar-detail__form-error">{formError}</p> : null}

          <label className="calendar-detail__field calendar-detail__field--full">
            <span>テンプレート名</span>
            <input
              type="text"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="例: 上半身の日"
            />
          </label>

          {slots.map((slot) => (
            <div key={slot.key} className="calendar-detail__exercise-form">
              <ExercisePicker
                exercises={exercises}
                onSelect={(exerciseId, name) => handleSlotSelect(slot.key, exerciseId, name)}
                onExerciseDeleted={loadExercises}
              />
              {slot.exerciseName ? <p className="calendar-detail__description">選択中: {slot.exerciseName}</p> : null}
              {slots.length > 1 ? (
                <button type="button" className="calendar-detail__delete-button" onClick={() => removeSlot(slot.key)}>
                  この種目を削除
                </button>
              ) : null}
            </div>
          ))}

          <div className="calendar-detail__actions">
            <button type="button" className="calendar-detail__secondary-button" onClick={addSlot}>
              種目を追加
            </button>
          </div>

          <div className="calendar-detail__actions">
            <button type="button" className="calendar-detail__button" onClick={saveTemplate} disabled={isSaving}>
              {isSaving ? '保存中...' : '保存する'}
            </button>
            <button type="button" className="calendar-detail__secondary-button" onClick={() => setIsFormOpen(false)}>
              キャンセル
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
