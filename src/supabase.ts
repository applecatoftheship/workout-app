import { createClient } from '@supabase/supabase-js'
import type { DailyCondition, DateString, FatigueLevel, MealLog, MealType, TrainingLog } from './types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
)

// --- daily_conditions ---

type DailyConditionRow = {
  id: string
  log_date: string
  weight: number | null
  sleep_hours: number | null
  fatigue: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

function rowToDailyCondition(row: DailyConditionRow): DailyCondition {
  return {
    id: row.id,
    date: row.log_date as DateString,
    weight: row.weight ?? 0,
    sleepHours: row.sleep_hours ?? 0,
    fatigue: (row.fatigue ?? 3) as FatigueLevel,
    notes: row.notes ?? undefined,
    createdAt: row.created_at as DateString,
    updatedAt: row.updated_at as DateString,
  }
}

export async function fetchDailyConditions(): Promise<DailyCondition[]> {
  const { data, error } = await supabase
    .from('daily_conditions')
    .select('*')
    .order('log_date', { ascending: true })

  if (error) {
    throw error
  }

  return (data as DailyConditionRow[]).map(rowToDailyCondition)
}

export async function upsertDailyCondition(condition: DailyCondition): Promise<void> {
  const { error } = await supabase
    .from('daily_conditions')
    .upsert(
      {
        log_date: condition.date,
        weight: condition.weight,
        sleep_hours: condition.sleepHours,
        fatigue: condition.fatigue,
        notes: condition.notes ?? null,
      },
      { onConflict: 'log_date' },
    )

  if (error) {
    throw error
  }
}

export async function syncDailyConditions(conditions: DailyCondition[]): Promise<void> {
  const { data: remoteRows, error: fetchError } = await supabase
    .from('daily_conditions')
    .select('id, log_date')

  if (fetchError) {
    throw fetchError
  }

  const localDates = new Set(conditions.map((condition) => condition.date))
  const idsToDelete = (remoteRows as { id: string; log_date: string }[])
    .filter((row) => !localDates.has(row.log_date as DateString))
    .map((row) => row.id)

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase.from('daily_conditions').delete().in('id', idsToDelete)

    if (deleteError) {
      throw deleteError
    }
  }

  for (const condition of conditions) {
    await upsertDailyCondition(condition)
  }
}

// --- goals ---

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

// --- training_logs ---

type TrainingLogRow = {
  id: string
  log_date: string
  completed: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

type TrainingLogExerciseRow = {
  id: string
  training_log_id: string
  name: string
  sets: number
  target_reps: string
  target_weight: string | null
}

function rowToTrainingLog(row: TrainingLogRow, exerciseRows: TrainingLogExerciseRow[]): TrainingLog {
  return {
    id: row.id,
    date: row.log_date as DateString,
    completed: row.completed,
    notes: row.notes ?? undefined,
    exercises: exerciseRows.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      sets: exercise.sets,
      targetReps: exercise.target_reps,
      targetWeight: exercise.target_weight ?? undefined,
    })),
    createdAt: row.created_at as DateString,
    updatedAt: row.updated_at as DateString,
  }
}

export async function fetchTrainingLogs(): Promise<TrainingLog[]> {
  const { data: logRows, error: logError } = await supabase
    .from('training_logs')
    .select('*')
    .order('log_date', { ascending: true })

  if (logError) {
    throw logError
  }

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from('training_log_exercises')
    .select('*')

  if (exerciseError) {
    throw exerciseError
  }

  return (logRows as TrainingLogRow[]).map((row) =>
    rowToTrainingLog(
      row,
      (exerciseRows as TrainingLogExerciseRow[]).filter((exercise) => exercise.training_log_id === row.id),
    ),
  )
}

export async function upsertTrainingLog(log: TrainingLog): Promise<void> {
  const { data: upsertedLog, error: logError } = await supabase
    .from('training_logs')
    .upsert(
      {
        id: log.id,
        log_date: log.date,
        completed: log.completed,
        notes: log.notes ?? null,
      },
      { onConflict: 'log_date' },
    )
    .select()
    .single()

  if (logError) {
    throw logError
  }

  const trainingLogId = (upsertedLog as TrainingLogRow).id

  const { error: deleteExercisesError } = await supabase
    .from('training_log_exercises')
    .delete()
    .eq('training_log_id', trainingLogId)

  if (deleteExercisesError) {
    throw deleteExercisesError
  }

  if (log.exercises.length > 0) {
    const { error: insertError } = await supabase.from('training_log_exercises').insert(
      log.exercises.map((exercise) => ({
        training_log_id: trainingLogId,
        name: exercise.name,
        sets: exercise.sets,
        target_reps: exercise.targetReps,
        target_weight: exercise.targetWeight ?? null,
      })),
    )

    if (insertError) {
      throw insertError
    }
  }
}

export async function syncTrainingLogs(logs: TrainingLog[]): Promise<void> {
  const { data: remoteRows, error: fetchError } = await supabase
    .from('training_logs')
    .select('id, log_date')

  if (fetchError) {
    throw fetchError
  }

  const localDates = new Set(logs.map((log) => log.date))
  const idsToDelete = (remoteRows as { id: string; log_date: string }[])
    .filter((row) => !localDates.has(row.log_date as DateString))
    .map((row) => row.id)

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase.from('training_logs').delete().in('id', idsToDelete)

    if (deleteError) {
      throw deleteError
    }
  }

  for (const log of logs) {
    await upsertTrainingLog(log)
  }
}

// --- food_items ---

export type FoodItem = {
  id: string
  name: string
  calories: number
  protein: number
  fat: number
  carbohydrates: number
}

type FoodItemRow = {
  id: string
  name: string
  calories: number
  protein: number
  fat: number
  carbohydrates: number
}

function rowToFoodItem(row: FoodItemRow): FoodItem {
  return {
    id: row.id,
    name: row.name,
    calories: row.calories,
    protein: row.protein,
    fat: row.fat,
    carbohydrates: row.carbohydrates,
  }
}

export async function fetchFoodItems(): Promise<FoodItem[]> {
  const { data, error } = await supabase.from('food_items').select('*').order('name', { ascending: true })

  if (error) {
    throw error
  }

  return (data as FoodItemRow[]).map(rowToFoodItem)
}

export async function createFoodItem(input: {
  name: string
  calories: number
  protein: number
  fat: number
  carbohydrates: number
}): Promise<FoodItem> {
  const { data, error } = await supabase.from('food_items').insert(input).select().single()

  if (error) {
    throw error
  }

  return rowToFoodItem(data as FoodItemRow)
}

// --- meal_logs ---

export type MealLogFoodSelection = {
  foodItemId: string
  customMultiplier?: number
}

export type MealLogInput = {
  id: string
  date: DateString
  mealType: MealType
  notes?: string
  selections: MealLogFoodSelection[]
}

type MealLogRow = {
  id: string
  log_date: string
  meal_type: string
  notes: string | null
  created_at: string
  updated_at: string
}

type MealLogFoodItemRow = {
  meal_log_id: string
  food_item_id: string
  custom_multiplier: number | null
}

export async function fetchMealLogs(): Promise<MealLog[]> {
  const { data: logRows, error: logError } = await supabase
    .from('meal_logs')
    .select('*')
    .order('log_date', { ascending: true })

  if (logError) {
    throw logError
  }

  const { data: linkRows, error: linkError } = await supabase.from('meal_log_food_items').select('*')

  if (linkError) {
    throw linkError
  }

  const foodItems = await fetchFoodItems()
  const foodItemMap = new Map(foodItems.map((item) => [item.id, item]))

  return (logRows as MealLogRow[]).map((row) => {
    const links = (linkRows as MealLogFoodItemRow[]).filter((link) => link.meal_log_id === row.id)

    const totals = links.reduce(
      (acc, link) => {
        const foodItem = foodItemMap.get(link.food_item_id)
        if (!foodItem) {
          return acc
        }
        const multiplier = link.custom_multiplier ?? 1
        return {
          calories: acc.calories + foodItem.calories * multiplier,
          protein: acc.protein + foodItem.protein * multiplier,
          fat: acc.fat + foodItem.fat * multiplier,
          carbohydrates: acc.carbohydrates + foodItem.carbohydrates * multiplier,
          foods: [...acc.foods, foodItem.name],
        }
      },
      { calories: 0, protein: 0, fat: 0, carbohydrates: 0, foods: [] as string[] },
    )

    return {
      id: row.id,
      date: row.log_date as DateString,
      mealType: row.meal_type as MealType,
      foods: totals.foods,
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein),
      fat: Math.round(totals.fat),
      carbohydrates: Math.round(totals.carbohydrates),
      notes: row.notes ?? undefined,
      createdAt: row.created_at as DateString,
      updatedAt: row.updated_at as DateString,
    }
  })
}

export async function upsertMealLog(input: MealLogInput): Promise<void> {
  const { error: logError } = await supabase.from('meal_logs').upsert({
    id: input.id,
    log_date: input.date,
    meal_type: input.mealType,
    notes: input.notes ?? null,
  })

  if (logError) {
    throw logError
  }

  const { error: deleteError } = await supabase.from('meal_log_food_items').delete().eq('meal_log_id', input.id)

  if (deleteError) {
    throw deleteError
  }

  if (input.selections.length > 0) {
    const { error: insertError } = await supabase.from('meal_log_food_items').insert(
      input.selections.map((selection) => ({
        meal_log_id: input.id,
        food_item_id: selection.foodItemId,
        custom_multiplier: selection.customMultiplier ?? null,
      })),
    )

    if (insertError) {
      throw insertError
    }
  }
}

export async function deleteMealLogRemote(id: string): Promise<void> {
  const { error } = await supabase.from('meal_logs').delete().eq('id', id)

  if (error) {
    throw error
  }
}

export async function fetchMealLogSelections(mealLogId: string): Promise<MealLogFoodSelection[]> {
  const { data, error } = await supabase
    .from('meal_log_food_items')
    .select('food_item_id, custom_multiplier')
    .eq('meal_log_id', mealLogId)

  if (error) {
    throw error
  }

  return (data as { food_item_id: string; custom_multiplier: number | null }[]).map((row) => ({
    foodItemId: row.food_item_id,
    customMultiplier: row.custom_multiplier ?? undefined,
  }))
}