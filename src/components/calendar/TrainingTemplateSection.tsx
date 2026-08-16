import { useEffect, useState } from 'react'
import { createTrainingTemplate, fetchTrainingTemplates } from '../../api/trainingTemplates'
import type { TrainingTemplateInput } from '../../api/trainingTemplates'
import { useToast } from '../../hooks/useToast'
import type { TrainingTemplate } from '../../types'

type TrainingTemplateSectionProps = {
  currentExerciseTargets: TrainingTemplateInput['exercises']
  onApplyTemplate: (template: TrainingTemplate) => void
}

export function TrainingTemplateSection({ currentExerciseTargets, onApplyTemplate }: TrainingTemplateSectionProps) {
  const { showToast } = useToast()
  const [templates, setTemplates] = useState<TrainingTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [isSaveFormOpen, setIsSaveFormOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetchTrainingTemplates()
      .then(setTemplates)
      .catch((error) => {
        console.error('Supabaseからテンプレート一覧の取得に失敗しました', error)
      })
  }, [])

  const applySelectedTemplate = () => {
    const template = templates.find((current) => current.id === selectedTemplateId)
    if (template) {
      onApplyTemplate(template)
    }
  }

  const openSaveForm = () => {
    setTemplateName('')
    setTemplateDescription('')
    setSaveError(null)
    setIsSaveFormOpen(true)
  }

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      setSaveError('テンプレート名は必須です')
      return
    }
    if (currentExerciseTargets.length === 0) {
      setSaveError('種目が選択されていません')
      return
    }

    setIsSaving(true)
    setSaveError(null)
    try {
      await createTrainingTemplate({
        name: templateName.trim(),
        description: templateDescription.trim() || undefined,
        exercises: currentExerciseTargets,
      })
      const refreshed = await fetchTrainingTemplates()
      setTemplates(refreshed)
      setIsSaveFormOpen(false)
      showToast('テンプレートを保存しました', 'success')
    } catch (error) {
      console.error('Supabaseへのテンプレート保存に失敗しました', error)
      setSaveError('保存に失敗しました。もう一度お試しください')
      showToast('テンプレートの保存に失敗しました', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="calendar-detail__exercise-form">
      <span>テンプレート</span>

      <label className="calendar-detail__field">
        <span>テンプレートから読み込む</span>
        <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
          <option value="">選択してください</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}（{template.exercises.length}種目）
            </option>
          ))}
        </select>
      </label>

      <div className="calendar-detail__inline-fields">
        <button
          type="button"
          className="calendar-detail__secondary-button"
          onClick={applySelectedTemplate}
          disabled={!selectedTemplateId}
        >
          このテンプレートを適用
        </button>
        {!isSaveFormOpen ? (
          <button
            type="button"
            className="calendar-detail__secondary-button"
            onClick={openSaveForm}
            disabled={currentExerciseTargets.length === 0}
          >
            現在の内容をテンプレートとして保存
          </button>
        ) : null}
      </div>

      {isSaveFormOpen ? (
        <>
          {saveError ? <p className="calendar-detail__error">{saveError}</p> : null}
          <label className="calendar-detail__field">
            <span>テンプレート名</span>
            <input
              type="text"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="例: 上半身メニューA"
            />
          </label>
          <label className="calendar-detail__field">
            <span>説明（任意）</span>
            <input type="text" value={templateDescription} onChange={(event) => setTemplateDescription(event.target.value)} />
          </label>
          <div className="calendar-detail__inline-fields">
            <button type="button" className="calendar-detail__button" onClick={saveTemplate} disabled={isSaving}>
              {isSaving ? '保存中...' : 'テンプレートとして保存'}
            </button>
            <button type="button" className="calendar-detail__secondary-button" onClick={() => setIsSaveFormOpen(false)}>
              キャンセル
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
