import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  ensureTrainingLogForDate,
  fetchExercises,
  fetchLatestExerciseRecord,
  fetchTrainingLogs,
  insertTrainingLogExercise,
  replaceTrainingSets,
} from '../../api/trainingLogs'
import type { LatestExerciseRecord } from '../../api/trainingLogs'
import { completeScheduleForDate } from '../../api/trainingSchedules'
import { fetchSoccerLogs } from '../../api/soccerLogs'
import { getMatchDayStatus } from '../../utils/periodizationHelpers'
import { detectPersonalRecords } from '../../utils/prHelpers'
import { calculateCurrentStreak, isStreakMilestone } from '../../utils/streakHelpers'
import { toDateKey } from '../../utils/chartHelpers'
import { bulkFromSets, detailedSetsFromBulk, isUniformSets } from '../../utils/trainingSetHelpers'
import type { ComparableSet } from '../../utils/trainingSetHelpers'
import { ExerciseNameInput } from './ExerciseNameInput'
import { ExercisePicker } from './ExercisePicker'
import { TrainingSetCard } from './TrainingSetCard'
import { WorkoutForm } from './WorkoutForm'
import type { TrainingSetCardValue } from './TrainingSetCard'
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

type Mode = 'bulk' | 'detailed'

type BulkInput = { sets: string; reps: string; weight: string }

let setKeyCounter = 0
function createSetKey() {
  setKeyCounter += 1
  return `edit-set-${setKeyCounter}`
}

function toComparable(reps: string, weight: string): ComparableSet {
  return {
    reps: reps.trim() === '' ? null : Number(reps),
    weight: weight.trim() === '' ? null : Number(weight),
  }
}

function detailedInputFromComparable(sets: ComparableSet[]): TrainingSetCardValue[] {
  return sets.map((set) => ({
    key: createSetKey(),
    reps: set.reps != null ? String(set.reps) : '',
    weight: set.weight != null ? String(set.weight) : '',
  }))
}

type FormErrors = {
  name?: string
  sets?: string
  reps?: string
  weight?: string
  detailed?: Array<{ reps?: string; weight?: string }>
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

  const [masterExercises, setMasterExercises] = useState<ExerciseDefinition[]>([])
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null)
  const [selectedExerciseName, setSelectedExerciseName] = useState('')
  const [mode, setMode] = useState<Mode>('bulk')
  const [bulk, setBulk] = useState<BulkInput>({ sets: '3', reps: '10', weight: '' })
  const [detailedSets, setDetailedSets] = useState<TrainingSetCardValue[]>([])
  const [previousRecord, setPreviousRecord] = useState<LatestExerciseRecord | null>(null)
  const [errors, setErrors] = useState<FormErrors>({})
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isNewExercise = trainingLogExerciseId === undefined

  const loadExercises = () => {
    fetchExercises()
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

    if (isUniformSets(comparable)) {
      const { setsCount, weight, reps } = bulkFromSets(comparable)
      setMode('bulk')
      setBulk({
        sets: String(setsCount),
        weight: weight != null ? String(weight) : '',
        reps: reps != null ? String(reps) : '',
      })
    } else {
      setMode('detailed')
      setDetailedSets(detailedInputFromComparable(comparable))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 前回記録の取得。「前回」は選択中の日付以外の直近記録を指す
  // （選択中の日付自身の記録を「前回」として自己参照しないようexcludeDateで除外する）。
  useEffect(() => {
    if (!selectedExerciseId) {
      setPreviousRecord(null)
      return
    }
    fetchLatestExerciseRecord(selectedExerciseId, selectedDate)
      .then(setPreviousRecord)
      .catch((error) => {
        console.error('Supabaseから前回の記録の取得に失敗しました', error)
      })
  }, [selectedExerciseId, selectedDate])

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

  const handleExerciseChosen = (name: string, exerciseId: string | null) => {
    setSelectedExerciseName(name)
    setSelectedExerciseId(exerciseId)
    setErrors((current) => ({ ...current, name: undefined }))
  }

  const handleExerciseCreated = (exercise: ExerciseDefinition) => {
    setMasterExercises((current) => [...current, exercise].sort((a, b) => a.name.localeCompare(b.name)))
  }

  const handleBulkChange = (field: keyof BulkInput, value: string) => {
    setBulk((current) => ({ ...current, [field]: value }))
  }

  const handleDetailedChange = (index: number, field: 'reps' | 'weight', value: string) => {
    setDetailedSets((current) => current.map((set, i) => (i === index ? { ...set, [field]: value } : set)))
  }

  const removeDetailedSet = (index: number) => {
    setDetailedSets((current) => current.filter((_, i) => i !== index))
  }

  const addDetailedSet = () => {
    setDetailedSets((current) => {
      const last = current[current.length - 1]
      return [...current, { key: createSetKey(), reps: last?.reps ?? '', weight: last?.weight ?? '' }]
    })
  }

  const switchToDetailed = () => {
    const setsCount = Math.max(1, Number(bulk.sets) || 1)
    const comparable = toComparable(bulk.reps, bulk.weight)
    setDetailedSets(detailedInputFromComparable(detailedSetsFromBulk(setsCount, comparable.weight, comparable.reps)))
    setMode('detailed')
  }

  const switchToBulk = async () => {
    if (detailedSets.length === 0) {
      return
    }
    const comparable = detailedSets.map((set) => toComparable(set.reps, set.weight))
    if (!isUniformSets(comparable)) {
      const first = comparable[0]
      const confirmed = await confirm(
        `切り替えると1セット目の値（${first.weight != null ? `${first.weight}kg` : '-'}×${first.reps != null ? `${first.reps}回` : '-'}）に全セットの表示が置き換わります。続けますか？`,
        { confirmLabel: 'はい', cancelLabel: 'いいえ' },
      )
      if (!confirmed) {
        return
      }
    }
    const { setsCount, weight, reps } = bulkFromSets(comparable)
    setBulk({ sets: String(setsCount), weight: weight != null ? String(weight) : '', reps: reps != null ? String(reps) : '' })
    setMode('bulk')
  }

  const handleCopyPrevious = () => {
    if (!previousRecord) {
      return
    }
    const comparable: ComparableSet[] = previousRecord.sets.map((set) => ({ weight: set.weight, reps: set.reps }))
    if (isUniformSets(comparable)) {
      const { setsCount, weight, reps } = bulkFromSets(comparable)
      setMode('bulk')
      setBulk({ sets: String(setsCount), weight: weight != null ? String(weight) : '', reps: reps != null ? String(reps) : '' })
    } else {
      setMode('detailed')
      setDetailedSets(detailedInputFromComparable(comparable))
    }
  }

  const validate = (): boolean => {
    if (!selectedExerciseId) {
      setErrors({ name: '候補から選択するか、新規登録してください' })
      setSummaryError('入力内容にエラーがあります。各項目を確認してください')
      return false
    }

    if (mode === 'bulk') {
      const setsValue = Number(bulk.sets)
      const repsValue = Number(bulk.reps)
      const weightValue = bulk.weight.trim() === '' ? NaN : Number(bulk.weight)
      const next: FormErrors = {}

      if (!Number.isFinite(setsValue) || setsValue < 1) {
        next.sets = 'セット数は1以上の数値で入力してください'
      }
      if (!Number.isFinite(repsValue) || repsValue < 1) {
        next.reps = '回数は1以上の数値で入力してください'
      }
      if (bulk.weight.trim() !== '' && (!Number.isFinite(weightValue) || weightValue < 0)) {
        next.weight = '重量は0以上の数値で入力してください'
      }

      setErrors(next)
      const hasError = Boolean(next.sets || next.reps || next.weight)
      setSummaryError(hasError ? '入力内容にエラーがあります。各項目を確認してください' : null)
      return !hasError
    }

    if (detailedSets.length === 0) {
      setErrors({ sets: '少なくとも1セット入力してください' })
      setSummaryError('入力内容にエラーがあります。各項目を確認してください')
      return false
    }

    const detailedErrors = detailedSets.map((set) => {
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

    setErrors({ detailed: detailedErrors })
    const hasError = detailedErrors.some((setError) => setError.reps || setError.weight)
    setSummaryError(hasError ? '入力内容にエラーがあります。各項目を確認してください' : null)
    return !hasError
  }

  const buildSets = (): TrainingSet[] => {
    if (mode === 'bulk') {
      const count = Number(bulk.sets) || 0
      return Array.from({ length: count }, (_, index) => ({
        setNumber: index + 1,
        reps: bulk.reps.trim() === '' ? undefined : Number(bulk.reps),
        weight: bulk.weight.trim() === '' ? undefined : Number(bulk.weight),
        isWarmup: false,
      }))
    }

    return detailedSets.map((set, index) => ({
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
    // 実際の保存処理に進む。「いいえ」の場合はformState（bulk/detailedSets等）を
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
        const trainingLogId = await ensureTrainingLogForDate(selectedDate)
        const dayLog = trainingLogs.find((log) => log.date === selectedDate)
        const nextOrderIndex = dayLog ? dayLog.exercises.length : 0
        targetId = await insertTrainingLogExercise(trainingLogId, selectedExerciseId as string, nextOrderIndex)
      }

      await replaceTrainingSets(targetId, sets)

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
        const soccerLogsForStreak = await fetchSoccerLogs(toDateKey(streakWindowStart), toDateKey(today))
        const streakDays = calculateCurrentStreak(refreshed, soccerLogsForStreak, mealLogs, dailyConditions, today)
        if (isStreakMilestone(streakDays)) {
          showStreakCelebration(streakDays)
        }
      } catch (error) {
        console.error('Supabaseからストリーク判定用のサッカー記録の取得に失敗しました', error)
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
      setSummaryError('保存に失敗しました。もう一度お試しください')
      showToast('トレーニング実績の保存に失敗しました', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  let previousHintText: string | null = null
  if (previousRecord) {
    const comparable: ComparableSet[] = previousRecord.sets.map((set) => ({ weight: set.weight, reps: set.reps }))
    const { setsCount, weight, reps } = bulkFromSets(comparable)
    previousHintText = `前回（${previousRecord.logDate}）: ${weight != null ? `${weight}kg` : '-'} × ${reps != null ? `${reps}回` : '-'} × ${setsCount}セット`
  }

  return (
    <div className="calendar-detail__form">
      {summaryError ? <p className="calendar-detail__form-error">{summaryError}</p> : null}

      {isNewExercise ? (
        <>
          <ExercisePicker exercises={masterExercises} onSelect={(exerciseId, name) => handleExerciseChosen(name, exerciseId)} onExerciseDeleted={loadExercises} />
          <ExerciseNameInput
            exercises={masterExercises}
            onExerciseCreated={handleExerciseCreated}
            name={selectedExerciseName}
            exerciseId={selectedExerciseId}
            onChange={handleExerciseChosen}
            error={errors.name}
          />
        </>
      ) : (
        <p className="training-exercise-card__name">{selectedExerciseName}</p>
      )}

      {isCardioNewEntry ? (
        <WorkoutForm activityType={selectedExerciseName} selectedDate={selectedDate} onClose={onClose} />
      ) : null}

      {!isCardioNewEntry && previousHintText ? (
        <div className="training-exercise-modal__previous">
          <span>{previousHintText}</span>
          <button type="button" className="calendar-detail__secondary-button" onClick={handleCopyPrevious}>
            前回の内容をコピー
          </button>
        </div>
      ) : null}

      {!isCardioNewEntry && showLegDayMdWarning ? (
        <p className="calendar-detail__warning">{buildLegDayMdWarningMessage(mdStatus as string)}</p>
      ) : null}

      {isCardioNewEntry ? null : mode === 'bulk' ? (
        <>
          <button type="button" className="calendar-detail__secondary-button" onClick={switchToDetailed}>
            セット別詳細モードに切り替える
          </button>
          <div className="calendar-detail__inline-fields">
            <label className="calendar-detail__field">
              <span>セット数</span>
              <input type="number" min="1" value={bulk.sets} onChange={(event) => handleBulkChange('sets', event.target.value)} />
              {errors.sets ? <p className="calendar-detail__error">{errors.sets}</p> : null}
            </label>
            <label className="calendar-detail__field">
              <span>回数</span>
              <input type="number" min="1" value={bulk.reps} onChange={(event) => handleBulkChange('reps', event.target.value)} placeholder="8" />
              {errors.reps ? <p className="calendar-detail__error">{errors.reps}</p> : null}
            </label>
          </div>
          <label className="calendar-detail__field">
            <span>重量 (kg)</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={bulk.weight}
              onChange={(event) => handleBulkChange('weight', event.target.value)}
              placeholder="60"
            />
            {errors.weight ? <p className="calendar-detail__error">{errors.weight}</p> : null}
          </label>
        </>
      ) : (
        <>
          <button
            type="button"
            className="calendar-detail__secondary-button"
            onClick={switchToBulk}
            disabled={detailedSets.length === 0}
          >
            一括入力モードに切り替える
          </button>
          {errors.sets ? <p className="calendar-detail__error">{errors.sets}</p> : null}
          {detailedSets.map((set, index) => (
            <TrainingSetCard
              key={set.key}
              index={index}
              value={set}
              repsError={errors.detailed?.[index]?.reps}
              weightError={errors.detailed?.[index]?.weight}
              onChange={(field, value) => handleDetailedChange(index, field, value)}
              onDelete={() => removeDetailedSet(index)}
            />
          ))}
          <button type="button" className="calendar-detail__secondary-button" onClick={addDetailedSet}>
            セットを追加
          </button>
        </>
      )}

      {isCardioNewEntry ? null : (
        <div className="calendar-detail__actions">
          <button type="button" className="calendar-detail__button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? '保存中...' : '保存する'}
          </button>
          <button type="button" className="calendar-detail__secondary-button" onClick={onClose} disabled={isSaving}>
            キャンセル
          </button>
        </div>
      )}
    </div>
  )
}
