import { useEffect, useMemo, useState } from 'react'
import './GoalPanel.css'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../hooks/useConfirm'
import { deleteGoalByMonth, fetchGoalYearMonths, fetchGoalsByMonthReadOnly, upsertGoals } from '../api/goals'
import type { Goals } from '../api/goals'
import type { DailyCondition, TrainingLog } from '../types'

function formatYearMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-')
  return `${year}年${Number(month)}月`
}

type GoalFormState = {
  targetWeight: string
  targetSleepHours: string
  weeklyTrainingGoal: string
  monthlyTrainingGoal: string
  dailyCalorieGoal: string
  dailyProteinGoal: string
  dailyFatGoal: string
  dailyCarbohydrateGoal: string
}

type GoalFormErrors = {
  targetWeight?: string
  targetSleepHours?: string
  weeklyTrainingGoal?: string
  monthlyTrainingGoal?: string
  dailyCalorieGoal?: string
  dailyProteinGoal?: string
  dailyFatGoal?: string
  dailyCarbohydrateGoal?: string
}

type GoalPanelProps = {
  goals: Goals
  setGoals: React.Dispatch<React.SetStateAction<Goals>>
  trainingLogs: TrainingLog[]
  dailyConditions: DailyCondition[]
  today: Date
}

export function GoalPanel({ goals, setGoals, trainingLogs, dailyConditions, today }: GoalPanelProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [isGoalPanelOpen, setIsGoalPanelOpen] = useState(false)
  const [isEditingGoals, setIsEditingGoals] = useState(false)
  const [goalFormState, setGoalFormState] = useState<GoalFormState>({
    targetWeight: String(goals.targetWeight),
    targetSleepHours: String(goals.targetSleepHours),
    weeklyTrainingGoal: String(goals.weeklyTrainingGoal),
    monthlyTrainingGoal: String(goals.monthlyTrainingGoal),
    dailyCalorieGoal: String(goals.dailyCalorieGoal),
    dailyProteinGoal: String(goals.dailyProteinGoal),
    dailyFatGoal: String(goals.dailyFatGoal),
    dailyCarbohydrateGoal: String(goals.dailyCarbohydrateGoal),
  })
  const [goalFormErrors, setGoalFormErrors] = useState<GoalFormErrors>({})
  const [goalFormSummaryError, setGoalFormSummaryError] = useState<string | null>(null)
  const [isSavingGoals, setIsSavingGoals] = useState(false)

  // goals過去月一覧表示（2026年8月18日追加）。selectedYearMonthが当月
  // （goals.yearMonth）の場合は既存のgoals/setGoals（App.tsx側のstate）を
  // そのまま使い、過去月が選択された場合のみhistoryGoalsを個別に読み込む。
  const [selectedYearMonth, setSelectedYearMonth] = useState(goals.yearMonth)
  const [availableYearMonths, setAvailableYearMonths] = useState<string[]>([goals.yearMonth])
  const [historyGoals, setHistoryGoals] = useState<Goals | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isDeletingGoals, setIsDeletingGoals] = useState(false)

  const isCurrentMonth = selectedYearMonth === goals.yearMonth
  const displayedGoals = isCurrentMonth ? goals : historyGoals

  useEffect(() => {
    if (!isGoalPanelOpen) {
      return
    }
    fetchGoalYearMonths()
      .then((months) => {
        setAvailableYearMonths((current) => {
          const merged = Array.from(new Set([...current, ...months]))
          return merged.sort((a, b) => b.localeCompare(a))
        })
      })
      .catch((error) => {
        console.error('Supabaseから目標設定の月一覧の取得に失敗しました', error)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGoalPanelOpen])

  useEffect(() => {
    if (isCurrentMonth) {
      return
    }
    setIsLoadingHistory(true)
    fetchGoalsByMonthReadOnly(selectedYearMonth)
      .then(setHistoryGoals)
      .catch((error) => {
        console.error('Supabaseから過去月の目標設定の取得に失敗しました', error)
      })
      .finally(() => setIsLoadingHistory(false))
  }, [selectedYearMonth, isCurrentMonth])

  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const currentMonthConditions = dailyConditions.filter((condition) => condition.date.startsWith(currentMonthKey))
  const averageSleepHours =
    currentMonthConditions.length > 0
      ? currentMonthConditions.reduce((sum, condition) => sum + condition.sleepHours, 0) / currentMonthConditions.length
      : null

  // 体重0kg表示バグ対応（2026年9月3日）：体調記録はあるが体重未入力の日
  // （weight=0）を「現在の体重」として拾わないよう、weight>0の直近記録を採る。
  const latestWeight = useMemo(() => {
    let best: DailyCondition | null = null
    for (const condition of dailyConditions) {
      if (condition.weight > 0 && (best === null || condition.date > best.date)) {
        best = condition
      }
    }
    return best ? best.weight : null
  }, [dailyConditions])
  const latestWeightText = latestWeight != null ? `${latestWeight.toFixed(1)}kg` : '記録なし'
  const targetWeightText = `${goals.targetWeight.toFixed(1)}kg`
  const weightDifferenceText = latestWeight != null
    ? `${Math.abs(latestWeight - goals.targetWeight).toFixed(1)}kg`
    : '記録なし'

  const averageSleepText = averageSleepHours != null ? `${averageSleepHours.toFixed(1)}時間` : '記録なし'
  const sleepDifferenceText = averageSleepHours != null
    ? `${(goals.targetSleepHours - averageSleepHours).toFixed(1)}時間`
    : '記録なし'

  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  const weekStartKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`
  const weekEndKey = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`
  // exercises が0件の実績（種目単位削除機能により発生しうる）は
  // 「トレーニングを行った日」としてカウントしない
  const weekTrainingCount = trainingLogs.filter(
    (log) => log.date >= weekStartKey && log.date <= weekEndKey && log.exercises.length > 0,
  ).length

  const openGoalEditor = () => {
    // 過去月にまだ目標データがない場合（displayedGoalsがnull）は、当月の値を
    // 初期値として提案する（fetchGoalsByMonthの繰り越しロジックと同じ考え方。
    // ゼロ埋めより手直しが少なく済むための判断）。
    const baseGoals = displayedGoals ?? goals
    setGoalFormState({
      targetWeight: String(baseGoals.targetWeight),
      targetSleepHours: String(baseGoals.targetSleepHours),
      weeklyTrainingGoal: String(baseGoals.weeklyTrainingGoal),
      monthlyTrainingGoal: String(baseGoals.monthlyTrainingGoal),
      dailyCalorieGoal: String(baseGoals.dailyCalorieGoal),
      dailyProteinGoal: String(baseGoals.dailyProteinGoal),
      dailyFatGoal: String(baseGoals.dailyFatGoal),
      dailyCarbohydrateGoal: String(baseGoals.dailyCarbohydrateGoal),
    })
    setGoalFormErrors({})
    setGoalFormSummaryError(null)
    setIsEditingGoals(true)
  }

  const handleGoalFieldChange = (field: keyof GoalFormState, value: string) => {
    setGoalFormState((current) => ({ ...current, [field]: value }))
  }

  const validateGoalForm = () => {
    const errors: GoalFormErrors = {}
    const targetWeight = Number(goalFormState.targetWeight)
    const targetSleepHours = Number(goalFormState.targetSleepHours)
    const weeklyTrainingGoal = Number(goalFormState.weeklyTrainingGoal)
    const monthlyTrainingGoal = Number(goalFormState.monthlyTrainingGoal)
    const dailyCalorieGoal = Number(goalFormState.dailyCalorieGoal)
    const dailyProteinGoal = Number(goalFormState.dailyProteinGoal)
    const dailyFatGoal = Number(goalFormState.dailyFatGoal)
    const dailyCarbohydrateGoal = Number(goalFormState.dailyCarbohydrateGoal)

    if (!Number.isFinite(targetWeight) || targetWeight <= 0) {
      errors.targetWeight = '目標体重は0より大きい数値で入力してください'
    }
    if (!Number.isFinite(targetSleepHours) || targetSleepHours <= 0 || targetSleepHours > 24) {
      errors.targetSleepHours = '睡眠時間は0より大きく24以下の数値で入力してください'
    }
    if (!Number.isFinite(weeklyTrainingGoal) || !Number.isInteger(weeklyTrainingGoal) || weeklyTrainingGoal < 0) {
      errors.weeklyTrainingGoal = '週の目標回数は0以上の整数で入力してください'
    }
    if (!Number.isFinite(monthlyTrainingGoal) || !Number.isInteger(monthlyTrainingGoal) || monthlyTrainingGoal < 0) {
      errors.monthlyTrainingGoal = '8月の目標回数は0以上の整数で入力してください'
    }
    if (!Number.isFinite(dailyCalorieGoal) || dailyCalorieGoal <= 0) {
      errors.dailyCalorieGoal = '1日の目標カロリーは0より大きい数値で入力してください'
    }
    if (!Number.isFinite(dailyProteinGoal) || dailyProteinGoal <= 0) {
      errors.dailyProteinGoal = '1日の目標タンパク質は0より大きい数値で入力してください'
    }
    if (!Number.isFinite(dailyFatGoal) || dailyFatGoal <= 0) {
      errors.dailyFatGoal = '1日の目標脂質は0より大きい数値で入力してください'
    }
    if (!Number.isFinite(dailyCarbohydrateGoal) || dailyCarbohydrateGoal <= 0) {
      errors.dailyCarbohydrateGoal = '1日の目標炭水化物は0より大きい数値で入力してください'
    }

    const hasErrors = Object.keys(errors).length > 0
    if (hasErrors) {
      setGoalFormSummaryError('入力内容にエラーがあります。各項目を確認してください')
    } else {
      setGoalFormSummaryError(null)
    }
    setGoalFormErrors(errors)
    return !hasErrors
  }

  const saveGoalSettings = async () => {
    if (!validateGoalForm()) {
      return
    }

    const nextGoals: Goals = {
      yearMonth: selectedYearMonth,
      targetWeight: Number(goalFormState.targetWeight),
      targetSleepHours: Number(goalFormState.targetSleepHours),
      weeklyTrainingGoal: Number(goalFormState.weeklyTrainingGoal),
      monthlyTrainingGoal: Number(goalFormState.monthlyTrainingGoal),
      dailyCalorieGoal: Number(goalFormState.dailyCalorieGoal),
      dailyProteinGoal: Number(goalFormState.dailyProteinGoal),
      dailyFatGoal: Number(goalFormState.dailyFatGoal),
      dailyCarbohydrateGoal: Number(goalFormState.dailyCarbohydrateGoal),
    }

    setIsSavingGoals(true)
    try {
      // 保存成功後にのみローカルstateを更新する。App.tsx側の自動同期
      // useEffectは廃止済み（2026年8月17日、データ損失事故の調査を踏まえ、
      // フェッチ失敗時にデフォルト値で上書きされるリスクを避けるため）。
      await upsertGoals(nextGoals)
      if (isCurrentMonth) {
        setGoals(nextGoals)
      } else {
        setHistoryGoals(nextGoals)
        setAvailableYearMonths((current) => (current.includes(selectedYearMonth) ? current : [...current, selectedYearMonth].sort((a, b) => b.localeCompare(a))))
      }
      setIsEditingGoals(false)
      showToast('目標を保存しました', 'success')
    } catch (error) {
      console.error('Supabaseへの目標設定の保存に失敗しました', error)
      setGoalFormSummaryError('保存に失敗しました。もう一度お試しください')
      showToast('目標設定の保存に失敗しました', 'error')
    } finally {
      setIsSavingGoals(false)
    }
  }

  const cancelGoalEdit = () => {
    setIsEditingGoals(false)
    setGoalFormErrors({})
    setGoalFormSummaryError(null)
  }

  const handleSelectYearMonth = (yearMonth: string) => {
    setSelectedYearMonth(yearMonth)
    // 月をまたいで編集フォームを開いたままにすると保存先の月があいまいになるため閉じる
    setIsEditingGoals(false)
    setGoalFormErrors({})
    setGoalFormSummaryError(null)
  }

  // goals削除機能（technical debt #8対応、2026年8月18日）。当月は削除不可
  // （呼び出し元のボタン表示自体を!isCurrentMonthでガードしているため、
  // ここに到達する時点で過去月であることが前提）。
  const handleDeleteGoalMonth = async () => {
    const confirmed = await confirm(`${formatYearMonthLabel(selectedYearMonth)}の目標を削除しますか？この操作は取り消せません`)
    if (!confirmed) {
      return
    }

    setIsDeletingGoals(true)
    try {
      await deleteGoalByMonth(selectedYearMonth)
      setAvailableYearMonths((current) => current.filter((yearMonth) => yearMonth !== selectedYearMonth))
      setHistoryGoals(null)
      setSelectedYearMonth(goals.yearMonth)
      setIsEditingGoals(false)
      showToast('目標を削除しました', 'success')
    } catch (error) {
      console.error('Supabaseへの目標削除に失敗しました', error)
      showToast('削除に失敗しました。もう一度お試しください', 'error')
    } finally {
      setIsDeletingGoals(false)
    }
  }

  return (
    <section className="panel-card accordion-item goal-panel">
      <button
        type="button"
        className="accordion-header"
        onClick={() => setIsGoalPanelOpen((current) => !current)}
      >
        {formatYearMonthLabel(selectedYearMonth)}の目標
        <span className="accordion-chevron">{isGoalPanelOpen ? '▼' : '▶'}</span>
      </button>
      {isGoalPanelOpen ? (
        <div className="accordion-body">
          <div className="panel-card__header-row">
            <p className="panel-card__description">
              {isCurrentMonth ? '今月の進捗を確認し、目標を調整できます。' : `${formatYearMonthLabel(selectedYearMonth)}の目標です。`}
            </p>
            {!isEditingGoals ? (
              <div className="goal-panel__header-actions">
                <button type="button" className="button button--secondary" onClick={openGoalEditor}>
                  {isCurrentMonth ? '目標を編集' : displayedGoals ? '編集' : 'この月の目標を設定する'}
                </button>
                {!isCurrentMonth && historyGoals ? (
                  <button type="button" className="button button--danger" onClick={handleDeleteGoalMonth} disabled={isDeletingGoals}>
                    {isDeletingGoals ? '削除中...' : '削除'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <label className="dashboard-goals-field">
            <span>表示する月</span>
            <select value={selectedYearMonth} onChange={(event) => handleSelectYearMonth(event.target.value)}>
              {availableYearMonths.map((yearMonth) => (
                <option key={yearMonth} value={yearMonth}>
                  {formatYearMonthLabel(yearMonth)}
                </option>
              ))}
            </select>
          </label>

          {isEditingGoals ? (
            <div className="dashboard-goals-form">
              {goalFormSummaryError ? <p className="form-error">{goalFormSummaryError}</p> : null}
              <label className="dashboard-goals-field">
                <span>目標体重 (kg)</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={goalFormState.targetWeight}
                  onChange={(event) => handleGoalFieldChange('targetWeight', event.target.value)}
                />
                {goalFormErrors.targetWeight ? <p className="form-error">{goalFormErrors.targetWeight}</p> : null}
              </label>
              <label className="dashboard-goals-field">
                <span>目標睡眠時間 (時間)</span>
                <input
                  type="number"
                  min="0.1"
                  max="24"
                  step="0.1"
                  value={goalFormState.targetSleepHours}
                  onChange={(event) => handleGoalFieldChange('targetSleepHours', event.target.value)}
                />
                {goalFormErrors.targetSleepHours ? <p className="form-error">{goalFormErrors.targetSleepHours}</p> : null}
              </label>
              <label className="dashboard-goals-field">
                <span>週の目標トレーニング回数</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={goalFormState.weeklyTrainingGoal}
                  onChange={(event) => handleGoalFieldChange('weeklyTrainingGoal', event.target.value)}
                />
                {goalFormErrors.weeklyTrainingGoal ? <p className="form-error">{goalFormErrors.weeklyTrainingGoal}</p> : null}
              </label>
              <label className="dashboard-goals-field">
                <span>{formatYearMonthLabel(selectedYearMonth)}の目標トレーニング回数</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={goalFormState.monthlyTrainingGoal}
                  onChange={(event) => handleGoalFieldChange('monthlyTrainingGoal', event.target.value)}
                />
                {goalFormErrors.monthlyTrainingGoal ? <p className="form-error">{goalFormErrors.monthlyTrainingGoal}</p> : null}
              </label>
              <label className="dashboard-goals-field">
                <span>1日の目標カロリー</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={goalFormState.dailyCalorieGoal}
                  onChange={(event) => handleGoalFieldChange('dailyCalorieGoal', event.target.value)}
                />
                {goalFormErrors.dailyCalorieGoal ? <p className="form-error">{goalFormErrors.dailyCalorieGoal}</p> : null}
              </label>
              <label className="dashboard-goals-field">
                <span>1日の目標タンパク質</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={goalFormState.dailyProteinGoal}
                  onChange={(event) => handleGoalFieldChange('dailyProteinGoal', event.target.value)}
                />
                {goalFormErrors.dailyProteinGoal ? <p className="form-error">{goalFormErrors.dailyProteinGoal}</p> : null}
              </label>
              <label className="dashboard-goals-field">
                <span>1日の目標脂質</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={goalFormState.dailyFatGoal}
                  onChange={(event) => handleGoalFieldChange('dailyFatGoal', event.target.value)}
                />
                {goalFormErrors.dailyFatGoal ? <p className="form-error">{goalFormErrors.dailyFatGoal}</p> : null}
              </label>
              <label className="dashboard-goals-field">
                <span>1日の目標炭水化物</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={goalFormState.dailyCarbohydrateGoal}
                  onChange={(event) => handleGoalFieldChange('dailyCarbohydrateGoal', event.target.value)}
                />
                {goalFormErrors.dailyCarbohydrateGoal ? <p className="form-error">{goalFormErrors.dailyCarbohydrateGoal}</p> : null}
              </label>
              <div className="dashboard-goals-actions">
                <button type="button" className="button button--primary" onClick={saveGoalSettings} disabled={isSavingGoals}>
                  {isSavingGoals ? '保存中...' : '保存する'}
                </button>
                <button type="button" className="button button--secondary" onClick={cancelGoalEdit}>
                  キャンセル
                </button>
              </div>
            </div>
          ) : isCurrentMonth ? (
            <div className="goal-grid">
              <article className="goal-card">
                <div className="goal-card__title">目標体重</div>
                <div className="goal-card__stat">現在 {latestWeightText}</div>
                <div className="goal-card__stat">目標 {targetWeightText}</div>
                <div className="goal-card__note">あと {weightDifferenceText}</div>
              </article>

              <article className="goal-card">
                <div className="goal-card__title">睡眠</div>
                <div className="goal-card__stat">平均 {averageSleepText}</div>
                <div className="goal-card__stat">目標 {goals.targetSleepHours.toFixed(1)}時間</div>
                <div className="goal-card__note">あと {sleepDifferenceText}</div>
              </article>

              <article className="goal-card">
                <div className="goal-card__title">今週のトレーニング</div>
                <div className="goal-card__stat">今週 {weekTrainingCount} / {goals.weeklyTrainingGoal}回</div>
                <div className="goal-card__note">この週の進捗を確認できます。</div>
              </article>
            </div>
          ) : isLoadingHistory ? (
            <p className="panel-card__description">読み込み中...</p>
          ) : historyGoals ? (
            // 過去月は「その月に実際にどれだけ進捗したか」を再計算する機能ではなく、
            // 設定されていた目標値そのものを確認するための一覧表示にとどめる
            // （指示書2-2節「その月の目標値を表示する」の範囲。当月のような
            // 現在値との比較カードは過去月には存在しないため実装していない）。
            <div className="goal-grid">
              <article className="goal-card">
                <div className="goal-card__title">目標体重</div>
                <div className="goal-card__stat">{historyGoals.targetWeight.toFixed(1)}kg</div>
              </article>
              <article className="goal-card">
                <div className="goal-card__title">目標睡眠時間</div>
                <div className="goal-card__stat">{historyGoals.targetSleepHours.toFixed(1)}時間</div>
              </article>
              <article className="goal-card">
                <div className="goal-card__title">週の目標トレーニング回数</div>
                <div className="goal-card__stat">{historyGoals.weeklyTrainingGoal}回</div>
              </article>
              <article className="goal-card">
                <div className="goal-card__title">{formatYearMonthLabel(selectedYearMonth)}の目標トレーニング回数</div>
                <div className="goal-card__stat">{historyGoals.monthlyTrainingGoal}回</div>
              </article>
              <article className="goal-card">
                <div className="goal-card__title">1日の目標カロリー</div>
                <div className="goal-card__stat">{historyGoals.dailyCalorieGoal}kcal</div>
              </article>
              <article className="goal-card">
                <div className="goal-card__title">1日の目標PFC</div>
                <div className="goal-card__stat">
                  P{historyGoals.dailyProteinGoal}g / F{historyGoals.dailyFatGoal}g / C{historyGoals.dailyCarbohydrateGoal}g
                </div>
              </article>
            </div>
          ) : (
            <p className="panel-card__description">この月の目標は設定されていません</p>
          )}
        </div>
      ) : null}
    </section>
  )
}
