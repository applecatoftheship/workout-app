import { useEffect, useMemo, useState } from 'react'
import { createSchedule, deleteSchedule, updateSchedule } from '../../api/trainingSchedules'
import { fetchTrainingTemplates } from '../../api/trainingTemplates'
import { useToast } from '../../hooks/useToast'
import type { DateString, TrainingSchedule, TrainingScheduleStatus, TrainingTemplate } from '../../types'

const QUICK_EMOJIS = ['🏋️', '🏃', '🧘', '💪', '🚴', '😴']

type ScheduleFormState = {
  title: string
  emoji: string
  status: TrainingScheduleStatus
  notes: string
  templateId: string
}

const createEmptyScheduleFormState = (): ScheduleFormState => ({
  title: '',
  emoji: '🏋️',
  status: 'scheduled',
  notes: '',
  templateId: '',
})

const statusLabel: Record<TrainingScheduleStatus, string> = {
  scheduled: '予定',
  completed: '完了',
  cancelled: 'キャンセル',
}

type ScheduleFormProps = {
  schedules: TrainingSchedule[]
  setSchedules: React.Dispatch<React.SetStateAction<TrainingSchedule[]>>
  selectedDate: DateString
  isScheduleFormOpen: boolean
  setIsScheduleFormOpen: React.Dispatch<React.SetStateAction<boolean>>
  /** RecordFormModal（Phase B）からの自動オープン用。既存利用への影響なし。 */
  autoOpenToken?: number
  autoOpenScheduleId?: string
}

export function ScheduleForm({
  schedules,
  setSchedules,
  selectedDate,
  isScheduleFormOpen,
  setIsScheduleFormOpen,
  autoOpenToken,
  autoOpenScheduleId,
}: ScheduleFormProps) {
  const { showToast } = useToast()
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [formState, setFormState] = useState<ScheduleFormState>(createEmptyScheduleFormState())
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [templates, setTemplates] = useState<TrainingTemplate[]>([])

  useEffect(() => {
    fetchTrainingTemplates()
      .then(setTemplates)
      .catch((error) => {
        console.error('Supabaseからテンプレート一覧の取得に失敗しました', error)
      })
  }, [])

  const selectedSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.scheduledDate === selectedDate),
    [schedules, selectedDate],
  )

  useEffect(() => {
    setIsScheduleFormOpen(false)
    setEditingScheduleId(null)
  }, [selectedDate, setIsScheduleFormOpen])

  useEffect(() => {
    if (autoOpenToken === undefined) {
      return
    }
    const target = autoOpenScheduleId ? schedules.find((schedule) => schedule.id === autoOpenScheduleId) : undefined
    openForm(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenToken])

  const openForm = (schedule?: TrainingSchedule) => {
    setEditingScheduleId(schedule?.id ?? null)
    setFormState(
      schedule
        ? {
            title: schedule.title,
            emoji: schedule.emoji,
            status: schedule.status,
            notes: schedule.notes ?? '',
            templateId: schedule.templateId ?? '',
          }
        : createEmptyScheduleFormState(),
    )
    setFormError(null)
    setIsScheduleFormOpen(true)
  }

  const saveSchedule = async () => {
    if (!formState.title.trim()) {
      setFormError('タイトルは必須です')
      return
    }

    setIsSaving(true)
    setFormError(null)

    try {
      if (editingScheduleId) {
        const updated = await updateSchedule(editingScheduleId, {
          title: formState.title.trim(),
          emoji: formState.emoji.trim() || '🏋️',
          status: formState.status,
          notes: formState.notes.trim() || null,
          templateId: formState.templateId || null,
        })
        setSchedules((current) => current.map((schedule) => (schedule.id === updated.id ? updated : schedule)))
      } else {
        const created = await createSchedule({
          scheduledDate: selectedDate,
          title: formState.title.trim(),
          emoji: formState.emoji.trim() || '🏋️',
          status: formState.status,
          notes: formState.notes.trim() || null,
          templateId: formState.templateId || null,
        })
        setSchedules((current) => [...current, created])
      }

      setIsScheduleFormOpen(false)
      setEditingScheduleId(null)
      showToast('予定を保存しました', 'success')
    } catch (error) {
      console.error('Supabaseへの予定保存に失敗しました', error)
      setFormError('保存に失敗しました。もう一度お試しください')
      showToast('予定の保存に失敗しました', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const changeStatus = async (schedule: TrainingSchedule, status: TrainingScheduleStatus) => {
    try {
      const updated = await updateSchedule(schedule.id as string, { status })
      setSchedules((current) => current.map((current_) => (current_.id === updated.id ? updated : current_)))
      showToast('予定を更新しました', 'success')
    } catch (error) {
      console.error('Supabaseへの予定ステータス更新に失敗しました', error)
      showToast('予定の更新に失敗しました', 'error')
    }
  }

  const removeSchedule = async (schedule: TrainingSchedule) => {
    const confirmed = window.confirm('この予定を本当に削除しますか？')
    if (!confirmed) {
      return
    }

    try {
      await deleteSchedule(schedule.id as string)
      setSchedules((current) => current.filter((current_) => current_.id !== schedule.id))
      if (editingScheduleId === schedule.id) {
        setIsScheduleFormOpen(false)
        setEditingScheduleId(null)
      }
      showToast('予定を削除しました', 'success')
    } catch (error) {
      console.error('Supabaseへの予定削除に失敗しました', error)
      showToast('予定の削除に失敗しました', 'error')
    }
  }

  return (
    <div className="calendar-detail__section">
      <div className="calendar-detail__section-header">
        <h4>トレーニング予定</h4>
        <button type="button" className="calendar-detail__secondary-button" onClick={() => openForm()}>
          予定を追加
        </button>
      </div>

      {selectedSchedules.length > 0 && !isScheduleFormOpen ? (
        <div className="calendar-detail__log-list">
          {selectedSchedules.map((schedule) => (
            <div key={schedule.id} className="calendar-detail__log-item">
              <div className="calendar-detail__log-head">
                <span>
                  {schedule.emoji} {schedule.title}（{statusLabel[schedule.status]}）
                </span>
                <div className="calendar-detail__log-actions">
                  <button type="button" className="calendar-detail__edit-button" onClick={() => openForm(schedule)}>
                    編集
                  </button>
                  <button type="button" className="calendar-detail__delete-button" onClick={() => removeSchedule(schedule)}>
                    削除
                  </button>
                </div>
              </div>
              {schedule.notes ? <p className="calendar-detail__description">メモ: {schedule.notes}</p> : null}
              <div className="calendar-detail__inline-fields">
                {schedule.status !== 'completed' ? (
                  <button
                    type="button"
                    className="calendar-detail__secondary-button"
                    onClick={() => changeStatus(schedule, 'completed')}
                  >
                    完了にする
                  </button>
                ) : null}
                {schedule.status !== 'scheduled' ? (
                  <button
                    type="button"
                    className="calendar-detail__secondary-button"
                    onClick={() => changeStatus(schedule, 'scheduled')}
                  >
                    予定に戻す
                  </button>
                ) : null}
                {schedule.status !== 'cancelled' ? (
                  <button
                    type="button"
                    className="calendar-detail__secondary-button"
                    onClick={() => changeStatus(schedule, 'cancelled')}
                  >
                    キャンセルにする
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {isScheduleFormOpen ? (
        <div className="calendar-detail__form">
          {formError ? <p className="calendar-detail__form-error">{formError}</p> : null}

          <label className="calendar-detail__field">
            <span>タイトル</span>
            <input
              type="text"
              value={formState.title}
              onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
              placeholder="例: 上半身トレーニング"
            />
          </label>

          <label className="calendar-detail__field">
            <span>絵文字</span>
            <input
              type="text"
              value={formState.emoji}
              onChange={(event) => setFormState((current) => ({ ...current, emoji: event.target.value }))}
              maxLength={4}
            />
          </label>
          <div className="calendar-detail__inline-fields">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="calendar-detail__secondary-button"
                onClick={() => setFormState((current) => ({ ...current, emoji }))}
              >
                {emoji}
              </button>
            ))}
          </div>

          <label className="calendar-detail__field">
            <span>テンプレート（任意）</span>
            <select
              value={formState.templateId}
              onChange={(event) => setFormState((current) => ({ ...current, templateId: event.target.value }))}
            >
              <option value="">選択しない</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          <label className="calendar-detail__field">
            <span>ステータス</span>
            <select
              value={formState.status}
              onChange={(event) =>
                setFormState((current) => ({ ...current, status: event.target.value as TrainingScheduleStatus }))
              }
            >
              <option value="scheduled">予定</option>
              <option value="completed">完了</option>
              <option value="cancelled">キャンセル</option>
            </select>
          </label>

          <label className="calendar-detail__field calendar-detail__field--full">
            <span>メモ</span>
            <textarea
              rows={3}
              value={formState.notes}
              onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))}
              placeholder="任意のメモ"
            />
          </label>

          <div className="calendar-detail__actions">
            <button type="button" className="calendar-detail__button" onClick={saveSchedule} disabled={isSaving}>
              {isSaving ? '保存中...' : '保存する'}
            </button>
            {editingScheduleId ? (
              <button
                type="button"
                className="calendar-detail__delete-button"
                onClick={() => {
                  const target = schedules.find((schedule) => schedule.id === editingScheduleId)
                  if (target) {
                    removeSchedule(target)
                  }
                }}
              >
                この予定を削除
              </button>
            ) : null}
            <button type="button" className="calendar-detail__secondary-button" onClick={() => setIsScheduleFormOpen(false)}>
              キャンセル
            </button>
          </div>
        </div>
      ) : selectedSchedules.length === 0 ? (
        <p className="calendar-detail__empty">予定なし</p>
      ) : null}
    </div>
  )
}
