import { getCurrentUserId, supabase } from './client'

export type Goals = {
  yearMonth: string
  targetWeight: number
  targetSleepHours: number
  weeklyTrainingGoal: number
  monthlyTrainingGoal: number
  dailyCalorieGoal: number
  dailyProteinGoal: number
  dailyFatGoal: number
  dailyCarbohydrateGoal: number
}

type GoalsRow = {
  id: string
  year_month: string
  target_weight: number
  target_sleep_hours: number
  weekly_training_goal: number
  monthly_training_goal: number
  daily_calorie_goal: number
  daily_protein_goal: number
  daily_fat_goal: number
  daily_carbohydrate_goal: number
}

function rowToGoals(row: GoalsRow): Goals {
  return {
    yearMonth: row.year_month,
    targetWeight: row.target_weight,
    targetSleepHours: row.target_sleep_hours,
    weeklyTrainingGoal: row.weekly_training_goal,
    monthlyTrainingGoal: row.monthly_training_goal,
    dailyCalorieGoal: row.daily_calorie_goal,
    dailyProteinGoal: row.daily_protein_goal,
    dailyFatGoal: row.daily_fat_goal,
    dailyCarbohydrateGoal: row.daily_carbohydrate_goal,
  }
}

/**
 * 指定した年月（YYYY-MM）の目標を取得する。存在しない場合は、直近過去月の
 * 目標をコピーして当月分として新規作成する（月が変わった直後にgoalsが
 * 空になるのを防ぐフォールバック）。過去分が1件もない場合はnullを返す。
 */
export async function fetchGoalsByMonth(yearMonth: string): Promise<Goals | null> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('year_month', yearMonth)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (data) {
    return rowToGoals(data as GoalsRow)
  }

  const { data: pastRows, error: pastError } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .lt('year_month', yearMonth)
    .order('year_month', { ascending: false })
    .limit(1)

  if (pastError) {
    throw pastError
  }

  const pastRow = (pastRows as GoalsRow[])[0]
  if (!pastRow) {
    return null
  }

  const carriedForward: Goals = { ...rowToGoals(pastRow), yearMonth }
  await upsertGoals(carriedForward)
  return carriedForward
}

/**
 * 指定した年月（YYYY-MM）の目標を取得する。fetchGoalsByMonthと異なり、
 * データが存在しない場合はnullを返すのみで、直近過去月からの繰り越し・
 * DBへの新規作成は行わない（過去月の一覧閲覧UI専用の読み取り専用版。
 * 閲覧しただけで意図せず新しいgoals行が作成されるのを防ぐため）。
 */
export async function fetchGoalsByMonthReadOnly(yearMonth: string): Promise<Goals | null> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('year_month', yearMonth)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data ? rowToGoals(data as GoalsRow) : null
}

/** データが存在する年月（YYYY-MM）の一覧を新しい順に取得する（過去月選択UI用）。 */
export async function fetchGoalYearMonths(): Promise<string[]> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('goals')
    .select('year_month')
    .eq('user_id', userId)
    .order('year_month', { ascending: false })

  if (error) {
    throw error
  }

  return (data as { year_month: string }[]).map((row) => row.year_month)
}

export async function upsertGoals(goals: Goals): Promise<void> {
  const userId = await getCurrentUserId()
  const { error } = await supabase
    .from('goals')
    .upsert(
      {
        user_id: userId,
        year_month: goals.yearMonth,
        target_weight: goals.targetWeight,
        target_sleep_hours: goals.targetSleepHours,
        weekly_training_goal: goals.weeklyTrainingGoal,
        monthly_training_goal: goals.monthlyTrainingGoal,
        daily_calorie_goal: goals.dailyCalorieGoal,
        daily_protein_goal: goals.dailyProteinGoal,
        daily_fat_goal: goals.dailyFatGoal,
        daily_carbohydrate_goal: goals.dailyCarbohydrateGoal,
      },
      { onConflict: 'user_id,year_month' },
    )

  if (error) {
    throw error
  }
}

// goalsに論理削除の概念（is_deleted列）はないため物理削除とする（technical
// debt #8対応、2026年8月18日）。呼び出し元（GoalPanel.tsx）で当月の削除は
// UI上できないようにガードしている（当月のgoalsはDashboardの進捗比較カード等が
// 常に存在する前提で参照しているため）。
export async function deleteGoalByMonth(yearMonth: string): Promise<void> {
  const userId = await getCurrentUserId()
  const { error } = await supabase.from('goals').delete().eq('user_id', userId).eq('year_month', yearMonth)

  if (error) {
    throw error
  }
}
