import { supabase } from './client'
import type { DateString, MealLog, MealType } from '../types'

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
