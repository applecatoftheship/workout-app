import { useEffect, useState } from 'react'
import { bulkCreateSchedules, deleteSchedulesInRange } from '../../api/trainingSchedules'
import { fetchTrainingTemplates } from '../../api/trainingTemplates'
import { useToast } from '../../hooks/useToast'
import type { DateString, TrainingTemplate } from '../../types'
import './BulkScheduleImportModal.css'

const PROMPT_TEXT = `以下のトレーニング予定を JSON 配列形式のみで出力してください。解説テキストやマークダウン装飾は不要です。
[
  {
    "scheduledDate": "YYYY-MM-DD",
    "title": "予定のタイトル",
    "emoji": "🏋️",
    "templateName": "既存テンプレート名 (任意)",
    "notes": "注意事項やメモ (任意)"
  }
]`

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type ParsedScheduleItem = {
  scheduledDate: DateString
  title: string
  emoji: string
  templateName?: string
  notes?: string
  templateId: string | null
}

type ImportMode = 'append' | 'overwrite'

type BulkScheduleImportModalProps = {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}

export function BulkScheduleImportModal({ isOpen, onClose, onImported }: BulkScheduleImportModalProps) {
  const { showToast } = useToast()
  const [jsonText, setJsonText] = useState('')
  const [parsedItems, setParsedItems] = useState<ParsedScheduleItem[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<TrainingTemplate[]>([])
  const [importMode, setImportMode] = useState<ImportMode>('append')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  useEffect(() => {
    if (!isOpen) {
      setJsonText('')
      setParsedItems(null)
      setParseError(null)
      setSubmitError(null)
      setImportMode('append')
      setCopyStatus('idle')
      return
    }

    fetchTrainingTemplates()
      .then(setTemplates)
      .catch((error) => {
        console.error('Supabaseからテンプレート一覧の取得に失敗しました', error)
      })
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_TEXT)
      setCopyStatus('copied')
      setTimeout(() => setCopyStatus('idle'), 2000)
    } catch (error) {
      console.error('クリップボードへのコピーに失敗しました', error)
      setCopyStatus('error')
    }
  }

  const handleParse = () => {
    setParseError(null)
    setParsedItems(null)

    let data: unknown
    try {
      data = JSON.parse(jsonText)
    } catch {
      setParseError('JSONの解析に失敗しました。正しいJSON配列形式か確認してください')
      return
    }

    if (!Array.isArray(data)) {
      setParseError('JSON配列形式で入力してください（先頭・末尾は [ ] である必要があります）')
      return
    }

    if (data.length === 0) {
      setParseError('予定が1件も含まれていません')
      return
    }

    const items: ParsedScheduleItem[] = []

    for (let index = 0; index < data.length; index += 1) {
      const raw = data[index]

      if (typeof raw !== 'object' || raw === null) {
        setParseError(`${index + 1}件目: オブジェクト形式ではありません`)
        return
      }

      const record = raw as Record<string, unknown>
      const scheduledDate = record.scheduledDate

      if (typeof scheduledDate !== 'string' || !DATE_PATTERN.test(scheduledDate)) {
        setParseError(`${index + 1}件目: scheduledDateはYYYY-MM-DD形式の文字列で指定してください`)
        return
      }

      const title = record.title
      if (typeof title !== 'string' || title.trim() === '') {
        setParseError(`${index + 1}件目: titleは必須です`)
        return
      }

      const emoji = typeof record.emoji === 'string' && record.emoji.trim() !== '' ? record.emoji.trim() : '🏋️'
      const templateName = typeof record.templateName === 'string' && record.templateName.trim() !== '' ? record.templateName.trim() : undefined
      const notes = typeof record.notes === 'string' && record.notes.trim() !== '' ? record.notes.trim() : undefined

      const matchedTemplate = templateName
        ? templates.find((template) => template.name.trim() === templateName)
        : undefined

      items.push({
        scheduledDate: scheduledDate as DateString,
        title: title.trim(),
        emoji,
        templateName,
        notes,
        templateId: matchedTemplate?.id ?? null,
      })
    }

    setParsedItems(items)
  }

  const handleImport = async () => {
    if (!parsedItems || parsedItems.length === 0) {
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      if (importMode === 'overwrite') {
        const sortedDates = [...parsedItems].map((item) => item.scheduledDate).sort()
        const startDate = sortedDates[0]
        const endDate = sortedDates[sortedDates.length - 1]
        await deleteSchedulesInRange(startDate, endDate)
      }

      await bulkCreateSchedules(
        parsedItems.map((item) => ({
          scheduledDate: item.scheduledDate,
          title: item.title,
          emoji: item.emoji,
          templateId: item.templateId,
          status: 'scheduled' as const,
          notes: item.notes ?? null,
        })),
      )

      onImported()
      onClose()
      showToast(`${parsedItems.length}件の予定を登録しました`, 'success')
    } catch (error) {
      console.error('Supabaseへの一括予定登録に失敗しました', error)
      setSubmitError('登録に失敗しました。もう一度お試しください')
      showToast('予定の一括登録に失敗しました', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bulk-import-modal__overlay" role="presentation" onClick={onClose}>
      <div
        className="bulk-import-modal"
        role="dialog"
        aria-modal="true"
        aria-label="AI予定一括取り込み"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bulk-import-modal__header">
          <h3>✨ AI予定一括取り込み</h3>
          <button type="button" className="bulk-import-modal__close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        <div className="bulk-import-modal__body">
          <section className="bulk-import-modal__section">
            <p className="bulk-import-modal__description">
              下のプロンプトをコピーしてChatGPTやGeminiなどのAIに渡し、出力されたJSONをそのまま次の欄に貼り付けてください。
            </p>
            <pre className="bulk-import-modal__prompt">{PROMPT_TEXT}</pre>
            <button type="button" className="calendar-detail__secondary-button" onClick={handleCopyPrompt}>
              {copyStatus === 'copied' ? 'コピーしました ✓' : copyStatus === 'error' ? 'コピーに失敗しました' : 'プロンプトをコピー'}
            </button>
          </section>

          <section className="bulk-import-modal__section">
            <label className="calendar-detail__field calendar-detail__field--full">
              <span>AIの出力結果（JSON）を貼り付け</span>
              <textarea
                className="bulk-import-modal__textarea"
                rows={6}
                value={jsonText}
                onChange={(event) => {
                  setJsonText(event.target.value)
                  setParsedItems(null)
                  setParseError(null)
                }}
                placeholder='[{"scheduledDate": "2026-08-20", "title": "上半身トレーニング", "emoji": "🏋️"}]'
              />
            </label>
            {parseError ? <p className="calendar-detail__form-error">{parseError}</p> : null}
          </section>

          {parsedItems ? (
            <section className="bulk-import-modal__section">
              <h4>プレビュー（{parsedItems.length}件）</h4>
              <div className="bulk-import-modal__table-wrapper">
                <table className="bulk-import-modal__table">
                  <thead>
                    <tr>
                      <th>日付</th>
                      <th>絵文字</th>
                      <th>タイトル</th>
                      <th>テンプレート</th>
                      <th>メモ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedItems.map((item, index) => (
                      <tr key={`${item.scheduledDate}-${index}`}>
                        <td>{item.scheduledDate}</td>
                        <td>{item.emoji}</td>
                        <td>{item.title}</td>
                        <td>
                          {item.templateName ? (
                            item.templateId ? (
                              <span className="bulk-import-modal__template-match">{item.templateName}</span>
                            ) : (
                              <span className="bulk-import-modal__template-nomatch">{item.templateName}（未一致）</span>
                            )
                          ) : (
                            '-'
                          )}
                        </td>
                        <td>{item.notes ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="calendar-detail__field">
                <span>取り込みモード</span>
                <label className="bulk-import-modal__radio">
                  <input
                    type="radio"
                    name="bulk-import-mode"
                    checked={importMode === 'append'}
                    onChange={() => setImportMode('append')}
                  />
                  既存予定に残して追加（追加登録）
                </label>
                <label className="bulk-import-modal__radio">
                  <input
                    type="radio"
                    name="bulk-import-mode"
                    checked={importMode === 'overwrite'}
                    onChange={() => setImportMode('overwrite')}
                  />
                  期間内の既存予定を削除して置き換え（上書き登録）
                </label>
              </div>

              {submitError ? <p className="calendar-detail__form-error">{submitError}</p> : null}
            </section>
          ) : null}
        </div>

        <div className="bulk-import-modal__footer">
          {parsedItems ? (
            <div className="calendar-detail__actions">
              <button type="button" className="calendar-detail__button" onClick={handleImport} disabled={isSubmitting}>
                {isSubmitting ? '登録中...' : `${parsedItems.length}件を登録する`}
              </button>
              <button type="button" className="calendar-detail__secondary-button" onClick={onClose} disabled={isSubmitting}>
                キャンセル
              </button>
            </div>
          ) : (
            <button type="button" className="calendar-detail__button" onClick={handleParse} disabled={!jsonText.trim()}>
              解析してプレビュー
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
