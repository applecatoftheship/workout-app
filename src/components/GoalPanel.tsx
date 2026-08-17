import { useMemo, useState } from 'react'
import './GoalPanel.css'
import { useToast } from '../hooks/useToast'
import { upsertGoals } from '../api/goals'
import type { Goals } from '../api/goals'
import type { DailyCondition, TrainingLog } from '../types'

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

  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const currentMonthConditions = dailyConditions.filter((condition) => condition.date.startsWith(currentMonthKey))
  const averageSleepHours =
    currentMonthConditions.length > 0
      ? currentMonthConditions.reduce((sum, condition) => sum + condition.sleepHours, 0) / currentMonthConditions.length
      : null

  const latestCondition = useMemo(() => {
    return [...dailyConditions].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  }, [dailyConditions])
  const latestWeightText = latestCondition ? `${latestCondition.weight.toFixed(1)}kg` : '記録なし'
  const targetWeightText = `${goals.targetWeight.toFixed(1)}kg`
  const weightDifferenceText = latestCondition
    ? `${Math.abs(latestCondition.weight - goals.targetWeight).toFixed(1)}kg`
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
  const weekTrainingCount = trainingLogs.filter((log) => log.date >= weekStartKey && log.date <= weekEndKey).length

  const openGoalEditor = () => {
    setGoalFormState({
      targetWeight: String(goals.targetWeight),
      targetSleepHours: String(goals.targetSleepHours),
      weeklyTrainingGoal: String(goals.weeklyTrainingGoal),
      monthlyTrainingGoal: String(goals.monthlyTrainingGoal),
      dailyCalorieGoal: String(goals.dailyCalorieGoal),
      dailyProteinGoal: String(goals.dailyProteinGoal),
      dailyFatGoal: String(goals.dailyFatGoal),
      dailyCarbohydrateGoal: String(goals.dailyCarbohydrateGoal),
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
      yearMonth: goals.yearMonth,
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
      setGoals(nextGoals)
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

  return (
    <section className="panel-card accordion-item goal-panel">
      <button
        type="button"
        className="accordion-header"
        onClick={() => setIsGoalPanelOpen((current) => !current)}
      >
        8月の目標
        <span className="accordion-chevron">{isGoalPanelOpen ? '▼' : '▶'}</span>
      </button>
      {isGoalPanelOpen ? (
        <div className="accordion-body">
          <div className="panel-card__header-row">
            <p className="panel-card__description">今月の進捗を確認し、目標を調整できます。</p>
            <button type="button" className="button button--secondary" onClick={openGoalEditor}>
              目標を編集
            </button>
          </div>

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
                <span>8月の目標トレーニング回数</span>
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
          ) : (
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
          )}
        </div>
      ) : null}
    </section>
  )
}
