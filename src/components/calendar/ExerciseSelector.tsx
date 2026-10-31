import { useMemo, useState } from 'react'
import { createExercise, deleteExercise } from '../../api/trainingLogs'
import { useConfirm } from '../../hooks/useConfirm'
import { useToast } from '../../hooks/useToast'
import type { BodyPart, ExerciseDefinition } from '../../types'
import { filterExercises, hasExactExerciseMatch } from '../../utils/exerciseSelectorHelpers'
import { findMostSimilarName } from '../../utils/nameMatching'
import { SwipeableRow } from '../common/SwipeableRow'
import './ExerciseSelector.css'

// 記録画面ブラッシュアップ（2026年11月1日）：トレーニング記録の種目選択を1つに統合。
// 従来は「部位チップ→プルダウン（ExercisePicker）」「削除用プルダウン」「自由入力＋
// 新規登録（ExerciseNameInput）」が縦に並んでいたため、Hevy・Strong 等の記録アプリと
// 同じく「検索欄＋部位チップ＋タップで選べる一覧」にまとめた。
// - 検索も部位も未指定のときは「最近の種目」を表示（よく使う種目を最短で選べる）
// - 種目の削除は一覧の行を左スワイプ（従来の削除用プルダウンを置き換え。確認ダイアログは従来どおり）
// - 一致する種目が無い検索語は、その場で新規登録できる（類似名の確認は従来の
//   ExerciseNameInput と同じ findMostSimilarName を使う）

const BODY_PART_OPTIONS: BodyPart[] = ['胸', '肩', '腕', '背', '脚', '腹', '有酸素', 'その他']

type ExerciseSelectorProps = {
  exercises: ExerciseDefinition[]
  recentExerciseIds: string[]
  onSelect: (exercise: ExerciseDefinition) => void
  onExerciseCreated: (exercise: ExerciseDefinition) => void
  onExerciseDeleted: () => void
  error?: string
}

export function ExerciseSelector({
  exercises,
  recentExerciseIds,
  onSelect,
  onExerciseCreated,
  onExerciseDeleted,
  error,
}: ExerciseSelectorProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [query, setQuery] = useState('')
  const [bodyPart, setBodyPart] = useState<BodyPart | ''>('')
  const [newBodyPart, setNewBodyPart] = useState<BodyPart | ''>('')
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)
  // 候補が見つかっている間は新規登録欄を畳んでおき、ボタンで開く（入力中の画面を散らかさないため）。
  // 候補が0件のときは最初から開く。
  const [isRegisterExpanded, setIsRegisterExpanded] = useState(false)

  const results = useMemo(
    () => filterExercises(exercises, { query, bodyPart, recentIds: recentExerciseIds }),
    [exercises, query, bodyPart, recentExerciseIds],
  )
  const isShowingRecent = !query.trim() && !bodyPart && recentExerciseIds.length > 0 && results.length > 0
  const trimmedQuery = query.trim()
  const canRegister = trimmedQuery !== '' && !hasExactExerciseMatch(exercises, trimmedQuery)
  const similarMatch = canRegister ? findMostSimilarName(exercises, trimmedQuery) : null

  const handleQueryChange = (value: string) => {
    setQuery(value)
    setDuplicateConfirmed(false)
    setRegisterError(null)
    setIsRegisterExpanded(false)
  }

  const handleDelete = async (exercise: ExerciseDefinition) => {
    if (!exercise.id) {
      return
    }
    const confirmed = await confirm(`『${exercise.name}』を削除しますか？この操作は取り消せません`)
    if (!confirmed) {
      return
    }
    try {
      await deleteExercise(exercise.id)
      onExerciseDeleted()
      showToast('種目を削除しました', 'success')
    } catch (deleteError) {
      console.error('Supabaseからの種目削除に失敗しました', deleteError)
      showToast('削除に失敗しました。もう一度お試しください', 'error')
    }
  }

  const handleRegister = async () => {
    const part = newBodyPart || bodyPart
    if (!part) {
      setRegisterError('部位を選択してください')
      return
    }
    if (similarMatch && !duplicateConfirmed) {
      return
    }
    setIsRegistering(true)
    setRegisterError(null)
    try {
      const created = await createExercise({ name: trimmedQuery, bodyPart: part })
      onExerciseCreated(created)
      onSelect(created)
      showToast('種目を登録しました', 'success')
    } catch (registrationError) {
      console.error('Supabaseへの種目登録に失敗しました', registrationError)
      setRegisterError('種目の登録に失敗しました')
      showToast('種目の登録に失敗しました', 'error')
    } finally {
      setIsRegistering(false)
    }
  }

  const registerBodyPart = newBodyPart || bodyPart
  const showRegisterForm = canRegister && (results.length === 0 || isRegisterExpanded)

  return (
    <div className="exercise-selector">
      <input
        type="search"
        className="exercise-selector__search"
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
        placeholder="種目を検索（例: ベンチ）"
        aria-label="種目を検索"
      />
      <div className="exercise-selector__chips" role="group" aria-label="部位で絞り込む">
        {BODY_PART_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={`calendar-detail__category-chip${bodyPart === option ? ' calendar-detail__category-chip--active' : ''}`}
            aria-pressed={bodyPart === option}
            onClick={() => setBodyPart((current) => (current === option ? '' : option))}
          >
            {option}
          </button>
        ))}
      </div>

      {error ? <p className="calendar-detail__error">{error}</p> : null}

      {isShowingRecent ? <p className="exercise-selector__section-label">最近の種目</p> : null}

      {results.length > 0 ? (
        <ul className="exercise-selector__list">
          {results.map((exercise) => (
            <li key={exercise.id}>
              <SwipeableRow actions={[{ key: 'delete', label: '削除', tone: 'danger', onClick: () => void handleDelete(exercise) }]}>
                <button type="button" className="exercise-selector__item" onClick={() => onSelect(exercise)}>
                  <span className="exercise-selector__item-name">{exercise.name}</span>
                  <span className="exercise-selector__item-meta">
                    {exercise.bodyPart}
                    {exercise.equipmentType ? `・${exercise.equipmentType}` : ''}
                  </span>
                </button>
              </SwipeableRow>
            </li>
          ))}
        </ul>
      ) : trimmedQuery === '' ? (
        <p className="exercise-selector__empty">この部位に登録済みの種目がありません</p>
      ) : null}

      {canRegister && !showRegisterForm ? (
        <button type="button" className="exercise-selector__register-toggle" onClick={() => setIsRegisterExpanded(true)}>
          ＋「{trimmedQuery}」を新しい種目として登録
        </button>
      ) : null}

      {showRegisterForm ? (
        <div className="exercise-selector__register">
          <p className="exercise-selector__register-title">「{trimmedQuery}」を新しい種目として登録</p>
          {similarMatch && !duplicateConfirmed ? (
            <div className="calendar-detail__warning">
              類似の種目「{similarMatch.item.name}」が既に存在します。
              <div className="exercise-selector__register-actions">
                <button type="button" className="calendar-detail__secondary-button" onClick={() => onSelect(similarMatch.item)}>
                  「{similarMatch.item.name}」を使う
                </button>
                <button type="button" className="calendar-detail__secondary-button" onClick={() => setDuplicateConfirmed(true)}>
                  新規登録する
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="exercise-selector__chips" role="group" aria-label="新しい種目の部位">
                {BODY_PART_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`calendar-detail__category-chip${registerBodyPart === option ? ' calendar-detail__category-chip--active' : ''}`}
                    aria-pressed={registerBodyPart === option}
                    onClick={() => setNewBodyPart(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <button type="button" className="calendar-detail__secondary-button" onClick={() => void handleRegister()} disabled={isRegistering}>
                {isRegistering ? '登録中...' : 'この種目を登録して選ぶ'}
              </button>
            </>
          )}
          {registerError ? <p className="calendar-detail__error">{registerError}</p> : null}
        </div>
      ) : null}

      {results.length > 0 ? <p className="exercise-selector__hint">← 左にスワイプで種目を削除</p> : null}
    </div>
  )
}
