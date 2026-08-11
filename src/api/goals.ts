import { supabase } from './client'

const GOALS_ROW_ID = '00000000-0000-0000-0000-000000000001'

export type Goals = {
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

export async function fetchGoals(): Promise<Goals | null> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('id', GOALS_ROW_ID)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data ? rowToGoals(data as GoalsRow) : null
}

export async function upsertGoals(goals: Goals): Promise<void> {
  const { error } = await supabase
    .from('goals')
    .upsert(
      {
        id: GOALS_ROW_ID,
        target_weight: goals.targetWeight,
        target_sleep_hours: goals.targetSleepHours,
        weekly_training_goal: goals.weeklyTrainingGoal,
        monthly_training_goal: goals.monthlyTrainingGoal,
        daily_calorie_goal: goals.dailyCalorieGoal,
        daily_protein_goal: goals.dailyProteinGoal,
        daily_fat_goal: goals.dailyFatGoal,
        daily_carbohydrate_goal: goals.dailyCarbohydrateGoal,
      },
      { onConflict: 'id' },
    )

  if (error) {
    throw error
  }
}
