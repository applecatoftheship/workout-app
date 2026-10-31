import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  fetchExercises,
  fetchLatestExerciseRecord,
  fetchTrainingLogs,
  replaceTrainingSets,
} from '../../api/trainingLogs'
import { useAuth } from '../../hooks/useAuth'
import { enqueueOutbox } from '../../offline/outbox'
import type { OutboxTrainingAddEntry } from '../../offline/outbox'
import { withOfflineCache } from '../../offline/offlineCache'
import { runTrainingAdd } from '../../offline/syncOutbox'
import { getNavigatorOnline, isNetworkError } from '../../utils/networkErrors'
import type { LatestExerciseRecord } from '../../api/trainingLogs'
import { completeScheduleForDate } from '../../api/trainingSchedules'
import { fetchSportLogs } from '../../api/sportLogs'
import { getMatchDayStatus } from '../../utils/periodizationHelpers'
import { detectPersonalRecords } from '../../utils/prHelpers'
import { calculateCurrentStreak, isStreakMilestone } from '../../utils/streakHelpers'
import { toDateKey } from '../../utils/chartHelpers'
import { bulkFromSets } from '../../utils/trainingSetHelpers'
import type { ComparableSet } from '../../utils/trainingSetHelpers'
import { getRecentExerciseIds } from '../../utils/exerciseSelectorHelpers'
import { ExerciseSelector } from './ExerciseSelector'
import { TrainingSetTable } from './TrainingSetTable'
import type { TrainingSetRowValue } from './TrainingSetTable'
import { WorkoutForm } from './WorkoutForm'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../hooks/useConfirm'
import { useCelebration } from '../celebration/CelebrationProvider'
import type {
  DailyCondition,
  DateString,
  ExerciseDefinition,
  MealLog,
  TrainingLog,
  TrainingLogExercise,
  TrainingSchedule,
  TrainingSet,
} from '../../types'
import './TrainingExercise.css'
import './CalendarForms.css'

// スプリント3（MD基準の栄養・トレーニング調整、2026年8月18日）由来。
// 種目カード＋編集モーダル分離（2026年8月28日）で旧TrainingLogForm.tsxから移設。
const LEG_WARNING_MD_STATUSES = new Set(['MD-2', 'MD-1', 'MD'])

const LEG_WARNING_DAY_PHRASE: Record<string, string> = {
  'MD-2': '2日後は試合日',
  'MD-1': '明日は試合日（MD-1）',
  MD: '今日は試合日',
}

function buildLegDayMdWarningMessage(mdStatus: string): string {
  const dayPhrase = LEG_WARNING_DAY_PHRASE[mdStatus] ?? '試合日が近づいています'
  return `⚠️ ${dayPhrase}です。下半身（脚）の高負荷トレーニングは疲労蓄積を防ぐため控えめを推奨します`
}

let setKeyCounter = 0
function createSetKey() {
  setKeyCounter += 1
  return `edit-set-${setKeyCounter}`
}

function rowsFromComparable(sets: ComparableSet[]): TrainingSetRowValue[] {
  return sets.map((set) => ({
    key: createSetKey(),
    reps: set.reps != null ? String(set.reps) : '',
    weight: set.weight != null ? String(set.weight) : '',
  }))
}

// 記録画面ブラッシュアップ（2026年11月1日）：新規追加時のセット行の初期状態。
// 従来の一括モードの初期値（前回記録なし＝3セット×10回、前回記録あり＝空欄で
// 前回値を薄く表示）と同じ考え方を、セット行の形に置き換えたもの。
function initialRowsFor(previousSetsCount: number | null): TrainingSetRowValue[] {
  if (previousSetsCount && previousSetsCount > 0) {
    return Array.from({ length: previousSetsCount }, () => ({ key: createSetKey(), reps: '', weight: '' }))
  }
  return Array.from({ length: 3 }, () => ({ key: createSetKey(), reps: '10', weight: '' }))
}

type FormErrors = {
  name?: string
  sets?: string
  rows?: Array<{ reps?: string; weight?: string }>
}

type TrainingExerciseEditModalProps = {
  trainingLogs: TrainingLog[]
  setTrainingLogs: Dispatch<SetStateAction<TrainingLog[]>>
  mealLogs: MealLog[]
  dailyConditions: DailyCondition[]
  selectedDate: DateString
  /** 未指定の場合は新規種目の追加（種目選択UIを表示する）。 */
  trainingLogExerciseId?: string
  schedulesForMdCheck?: TrainingSchedule[]
  onClose: () => void
}

export function TrainingExerciseEditModal({
  trainingLogs,
  setTrainingLogs,
  mealLogs,
  dailyConditions,
  selectedDate,
  trainingLogExerciseId,
  schedulesForMdCheck,
  onClose,
}: TrainingExerciseEditModalProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const { showPRCelebration, showStreakCelebration } = useCelebration()
  const { user } = useAuth()

  const [masterExercises, setMasterExercises] = useState<ExerciseDefinition[]>([])
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null)
  const [selectedExerciseName, setSelectedExerciseName] = useState('')
  // 記録画面ブラッシュアップ（2026年11月1日）：「一括入力」と「セット別詳細」の
  // 2モードを廃止し、セット行（rows）に一本化した。
  const [rows, setRows] = useState<TrainingSetRowValue[]>([])
  const [previousRecord, setPreviousRecord] = useState<LatestExerciseRecord | null>(null)
  const [errors, setErrors] = useState<FormErrors>({})
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // 現在選択中の種目について、ユーザーがセット行を編集したか
  // （編集済みなら前回記録の取得完了後も初期値で上書きしない）。
  const rowsTouchedRef = useRef(false)

  const isNewExercise = trainingLogExerciseId === undefined

  // 記録画面ブラッシュアップ（2026年11月1日）：種目一覧の「最近の種目」用。
  const recentExerciseIds = useMemo(() => getRecentExerciseIds(trainingLogs), [trainingLogs])

  const loadExercises = () => {
    // オフライン記録対応（2026年10月31日）：オフラインでも種目を選べるよう、
    // 最後に取得できた種目一覧を端末に控えておき、通信できない時はそれを使う。
    withOfflineCache('exercises', () => fetchExercises())
      .then(setMasterExercises)
      .catch((error) => {
        console.error('Supabaseから種目一覧の取得に失敗しました', error)
      })
  }

  useEffect(() => {
    loadExercises()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 既存種目を編集する場合の初期値読み込み（マウント時の1回のみでよい）。
  useEffect(() => {
    if (!trainingLogExerciseId) {
      return
    }
    const dayLog = trainingLogs.find((log) => log.date === selectedDate)
    const existing = dayLog?.exercises.find((exercise) => exercise.id === trainingLogExerciseId)
    if (!existing) {
      return
    }

    setSelectedExerciseId(existing.exerciseId)
    setSelectedExerciseName(existing.exercise?.name ?? '')

    const comparable: ComparableSet[] = existing.sets.map((set) => ({
      weight: set.weight ?? null,
      reps: set.reps ?? null,
    }))

    setRows(rowsFromComparable(comparable))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 前回記録の取得。「前回」は選択中の日付以外の直近記録を指す
  // （選択中の日付自身の記録を「前回」として自己参照しないようexcludeDateで除外する）。
  useEffect(() => {
    if (!selectedExerciseId) {
      setPreviousRecord(null)
      return
    }
    let cancelled = false
    // セット行の初期値決定（取得結果が確定してから。前回記録なし＝3セット×10回、
    // 前回記録あり＝前回と同じセット数の空欄で前回値を薄く表示、手入力済み・編集時＝変更しない）。
    const applyInitialRows = (previousSetsCount: number | null) => {
      if (!isNewExercise || rowsTouchedRef.current) {
        return
      }
      setRows(initialRowsFor(previousSetsCount))
    }
    fetchLatestExerciseRecord(selectedExerciseId, selectedDate)
      .then((record) => {
        if (cancelled) {
          return
        }
        setPreviousRecord(record)
        applyInitialRows(record ? record.sets.length : null)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }
        console.error('Supabaseから前回の記録の取得に失敗しました', error)
        // 取得失敗時も「前回記録なし」として扱い、汎用既定値 3/10 を入れる
        // （変更前は useState 初期値が常に 3/10 だったため、その耐障害性を維持する）。
        applyInitialRows(null)
      })
    return () => {
      cancelled = true
    }
  }, [selectedExerciseId, selectedDate, isNewExercise])

  const selectedExercise = masterExercises.find((candidate) => candidate.id === selectedExerciseId)

  const mdStatus = getMatchDayStatus(schedulesForMdCheck ?? [], selectedDate)
  const showLegDayMdWarning =
    mdStatus != null && LEG_WARNING_MD_STATUSES.has(mdStatus) && selectedExercise?.bodyPart === '脚'

  // 有酸素運動の時間ベース記録への移行（2026年9月3日）：新規追加で body_part が
  // '有酸素' の種目を選んだ場合は、重量×回数フォームではなく WorkoutForm
  // （時間→距離・カロリー自動計算、保存先は workouts テーブル）を表示する。
  // 既存の training_log 実績の編集（!isNewExercise）は、旧データ移行が別途行われる
  // までは従来フォームのまま扱う。
  const isCardioNewEntry = isNewExercise && selectedExercise?.bodyPart === '有酸素'

  const handleExerciseChosen = (exercise: ExerciseDefinition) => {
    if (exercise.id !== selectedExerciseId) {
      rowsTouchedRef.current = false
      setRows([])
    }
    setSelectedExerciseName(exercise.name)
    setSelectedExerciseId(exercise.id ?? null)
    setErrors((current) => ({ ...current, name: undefined }))
  }

  // 種目を選び直す（新規追加時のみ）。入力済みのセットは種目が変わった時点でリセットする。
  const handleChangeExercise = () => {
    setSelectedExerciseId(null)
    setSelectedExerciseName('')
    setPreviousRecord(null)
  }

  const handleExerciseCreated = (exercise: ExerciseDefinition) => {
    setMasterExercises((current) => [...current, exercise].sort((a, b) => a.name.localeCompare(b.name)))
  }

  const handleRowChange = (index: number, field: 'reps' | 'weight', value: string) => {
    rowsTouchedRef.current = true
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  const removeRow = (index: number) => {
    rowsTouchedRef.current = true
    setRows((current) => current.filter((_, i) => i !== index))
  }

  const addRow = () => {
    rowsTouchedRef.current = true
    setRows((current) => {
      const last = current[current.length - 1]
      return [...current, { key: createSetKey(), reps: last?.reps ?? '', weight: last?.weight ?? '' }]
    })
  }

  const handleCopyPrevious = () => {
    if (!previousRecord) {
      return
    }
    rowsTouchedRef.current = true
    setRows(rowsFromComparable(previousRecord.sets.map((set) => ({ weight: set.weight, reps: set.reps }))))
  }

  const validate = (): boolean => {
    if (!selectedExerciseId) {
      setErrors({ name: '候補から選択するか、新規登録してください' })
      setSummaryError('入力内容にエラーがあります。各項目を確認してください')
      return false
    }

    if (rows.length === 0) {
      setErrors({ sets: '少なくとも1セット入力してください' })
      setSummaryError('入力内容にエラーがあります。各項目を確認してください')
      return false
    }

    const rowErrors = rows.map((set) => {
      const setError: { reps?: string; weight?: string } = {}
      const repsValue = Number(set.reps)
      const weightValue = set.weight.trim() === '' ? NaN : Number(set.weight)

      if (!Number.isFinite(repsValue) || repsValue < 1) {
        setError.reps = '回数は1以上の数値で入力してください'
      }
      if (set.weight.trim() !== '' && (!Number.isFinite(weightValue) || weightValue < 0)) {
        setError.weight = '重量は0以上の数値で入力してください'
      }

      return setError
    })

    setErrors({ rows: rowErrors })
    const hasError = rowErrors.some((setError) => setError.reps || setError.weight)
    setSummaryError(hasError ? '入力内容にエラーがあります。各項目を確認してください' : null)
    return !hasError
  }

  const buildSets = (): TrainingSet[] => {
    return rows.map((set, index) => ({
      setNumber: index + 1,
      reps: set.reps.trim() === '' ? undefined : Number(set.reps),
      weight: set.weight.trim() === '' ? undefined : Number(set.weight),
      isWarmup: false,
    }))
  }

  const handleSave = async () => {
    if (!validate()) {
      return
    }

    // 【追加仕様】保存前の確認ダイアログ（2026年8月28日）：「はい」を選んだ場合のみ
    // 実際の保存処理に進む。「いいえ」の場合はformState（セット行等）を
    // 一切変更せずreturnするため、モーダルの入力内容はそのまま保持される。
    const confirmed = await confirm('記録しますか？', { confirmLabel: 'はい', cancelLabel: 'いいえ' })
    if (!confirmed) {
      return
    }

    setIsSaving(true)
    try {
      const sets = buildSets()
      const exerciseDefinition = masterExercises.find((candidate) => candidate.id === selectedExerciseId)
      let targetId = trainingLogExerciseId

      if (!targetId) {
        // オフライン記録対応（2026年10月31日）：種目の新規追加は、端末側で採番した
        // id で「追加操作」を組み立ててから実行する（src/offline/syncOutbox.ts の
        // runTrainingAdd）。オフライン、または途中で通信が切れた場合は、その操作を
        // 進捗ごと端末に保存し、オンライン復帰時に自動で再送する。
        // 並び順（order_index）は端末の一覧ではなくサーバー上の件数から決める
        // （従来は端末側の一覧 trainingLogs の件数を使っていた）。
        if (!user) {
          throw new Error('ログインが必要です')
        }
        const exerciseName = exerciseDefinition?.name ?? selectedExerciseName
        let entry: OutboxTrainingAddEntry = {
          kind: 'trainingAdd',
          id: crypto.randomUUID(),
          userId: user.id,
          createdAt: new Date().toISOString(),
          attempts: 0,
          label: `${selectedDate.slice(5).replace('-', '/')} ${exerciseName} ${sets.length}セット`,
          date: selectedDate,
          exerciseId: selectedExerciseId as string,
          trainingLogExerciseId: crypto.randomUUID(),
          exerciseInserted: false,
          sets,
        }

        const saveToDevice = () => {
          if (enqueueOutbox(entry)) {
            showToast('オフラインのため端末に保存しました。オンラインに戻ると自動で反映します', 'info')
            onClose()
          } else {
            setSummaryError('端末に保存できませんでした。ストレージの空き容量やプライベートブラウズ設定を確認してください')
            showToast('トレーニング実績を保存できませんでした', 'error')
          }
        }

        if (!getNavigatorOnline()) {
          saveToDevice()
          return
        }
        try {
          entry = await runTrainingAdd(entry, (next) => {
            entry = next
          })
        } catch (error) {
          if (isNetworkError(error)) {
            console.error('通信エラーのためトレーニング実績を端末に保存します', error)
            saveToDevice()
            return
          }
          throw error
        }
        targetId = entry.trainingLogExerciseId
      } else {
        await replaceTrainingSets(targetId, sets)
      }

      const refreshed = await fetchTrainingLogs()
      setTrainingLogs(refreshed)

      const savedExercise: TrainingLogExercise = {
        id: targetId,
        exerciseId: selectedExerciseId as string,
        orderIndex: 0,
        exercise: exerciseDefinition,
        sets,
      }

      // PR判定：保存前のtrainingLogs（クロージャに捕捉済み）を比較対象とする
      // （既存のTrainingLogForm.tsxの設計をそのまま踏襲、新規DBクエリ不要）。
      const personalRecords = detectPersonalRecords(trainingLogs, [savedExercise])
      personalRecords.forEach((record) => {
        showPRCelebration(record.exerciseName, record.before, record.after)
      })

      try {
        const today = new Date()
        const streakWindowStart = new Date(today)
        streakWindowStart.setDate(streakWindowStart.getDate() - 900)
        const sportLogsForStreak = await fetchSportLogs(toDateKey(streakWindowStart), toDateKey(today))
        const streakDays = calculateCurrentStreak(refreshed, mealLogs, dailyConditions, today, sportLogsForStreak)
        if (isStreakMilestone(streakDays)) {
          showStreakCelebration(streakDays)
        }
      } catch (error) {
        console.error('Supabaseからストリーク判定用のスポーツ記録の取得に失敗しました', error)
      }

      const refreshedDayLog = refreshed.find((log) => log.date === selectedDate)
      if (refreshedDayLog?.completed) {
        // 2026年8月28日のバグ修正：ここをawaitせずにonClose()すると、
        // MonthlyCalendar.tsx側の「RecordFormModalが閉じたタイミングでschedules
        // を再取得する」仕組み（isRecordModalOpen遷移を監視するuseEffect）が、
        // このDB更新の完了より先に発火してしまい、再取得結果が旧ステータス
        // （scheduled）のままになる競合状態があった（保存直後の画面では「予定」の
        // ままで、リロード後にだけ「完了」に切り替わって見える不具合）。
        // completeScheduleForDateの完了を待ってからonClose()する順序に修正し、
        // 呼び出し元の再取得が更新後の状態を正しく拾えるようにした。
        try {
          await completeScheduleForDate(selectedDate)
        } catch (error) {
          console.error('Supabaseへの予定の完了連動に失敗しました', error)
          showToast('予定の完了連動に失敗しました', 'error')
        }
      }

      showToast('トレーニング実績を保存しました', 'success')
      onClose()
    } catch (error) {
      console.error('Supabaseへのトレーニング実績の保存に失敗しました', error)
      // オフライン記録対応（2026年10月31日）：既存記録の編集はオフライン非対応。
      if (trainingLogExerciseId && isNetworkError(error)) {
        setSummaryError('オフライン中は既存の記録を編集できません。オンラインに戻ってから保存してください')
      } else {
        setSummaryError('保存に失敗しました。もう一度お試しください')
      }
      showToast('トレーニング実績の保存に失敗しました', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // 前回記録の要約（例：「前回 10/19・40kg×10回×3セット」）。
  let previousHintText: string | null = null
  if (previousRecord) {
    const comparable: ComparableSet[] = previousRecord.sets.map((set) => ({ weight: set.weight, reps: set.reps }))
    const { setsCount, weight, reps } = bulkFromSets(comparable)
    const isUniform = comparable.every((set) => set.weight === comparable[0]?.weight && set.reps === comparable[0]?.reps)
    const summary = isUniform
      ? `${weight != null ? `${weight}kg` : '-'}×${reps != null ? `${reps}回` : '-'}×${setsCount}セット`
      : `${setsCount}セット`
    previousHintText = `前回 ${previousRecord.logDate.slice(5).replace('-', '/')}・${summary}`
  }

  const selectedMeta = selectedExercise
    ? `${selectedExercise.bodyPart}${selectedExercise.equipmentType ? `・${selectedExercise.equipmentType}` : ''}`
    : ''

  // 記録画面ブラッシュアップ（2026年11月1日）：
  // ①種目を選ぶまでは種目選択（検索＋部位チップ＋一覧）だけを表示し、
  // ②選んだら選択済みカード（「変更」で選び直し）＋前回記録＋セット行＋保存、の順に表示する。
  return (
    <div className="calendar-detail__form training-exercise-form">
      {summaryError ? <p className="calendar-detail__form-error">{summaryError}</p> : null}

      {isNewExercise && !selectedExerciseId ? (
        <ExerciseSelector
          exercises={masterExercises}
          recentExerciseIds={recentExerciseIds}
          onSelect={handleExerciseChosen}
          onExerciseCreated={handleExerciseCreated}
          onExerciseDeleted={loadExercises}
          error={errors.name}
        />
      ) : (
        <div className="training-exercise-form__selected">
          <div className="training-exercise-form__selected-text">
            <span className="training-exercise-form__selected-name">{selectedExerciseName}</span>
            {selectedMeta ? <span className="training-exercise-form__selected-meta">{selectedMeta}</span> : null}
          </div>
          {isNewExercise ? (
            <button type="button" className="training-exercise-form__change" onClick={handleChangeExercise} disabled={isSaving}>
              変更
            </button>
          ) : null}
        </div>
      )}

      {isCardioNewEntry ? (
        <WorkoutForm activityType={selectedExerciseName} selectedDate={selectedDate} onClose={onClose} />
      ) : null}

      {selectedExerciseId && !isCardioNewEntry ? (
        <>
          {previousHintText ? (
            <div className="training-exercise-modal__previous">
              <span>{previousHintText}</span>
              <button type="button" className="training-exercise-form__copy" onClick={handleCopyPrevious}>
                前回をコピー
              </button>
            </div>
          ) : null}

          {showLegDayMdWarning ? (
            <p className="calendar-detail__warning">{buildLegDayMdWarningMessage(mdStatus as string)}</p>
          ) : null}

          {errors.sets ? <p className="calendar-detail__error">{errors.sets}</p> : null}
          <TrainingSetTable
            rows={rows}
            previousSets={isNewExercise ? (previousRecord?.sets.map((set) => ({ weight: set.weight, reps: set.reps })) ?? null) : null}
            errors={errors.rows}
            onChange={handleRowChange}
            onDelete={removeRow}
            onAdd={addRow}
          />

          <div className="calendar-detail__actions">
            <button type="button" className="calendar-detail__button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? '保存中...' : '保存する'}
            </button>
            <button type="button" className="calendar-detail__secondary-button record-form__cancel" onClick={onClose} disabled={isSaving}>
              キャンセル
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
