import { getCurrentUserId, supabase } from './client'
import { fetchFoodItems } from './foodItems'
import type { DateString, MealLog, MealLogFoodItem, MealType } from '../types'

export type MealLogFoodItemInput = {
  foodItemId: string
  amount: number
  calories: number
  protein: number
  fat: number
  carbohydrates: number
}

export type MealLogInput = {
  id: string
  date: DateString
  mealType: MealType
  notes?: string
  items: MealLogFoodItemInput[]
  // リカバリー窓機能（スプリント4 Phase 1）：この食事をとった時刻（ISO 8601、timestamptz）。
  // 未指定の場合はNULLのまま保存する。
  mealTime?: string
}

type MealLogRow = {
  id: string
  log_date: string
  meal_type: string
  notes: string | null
  meal_time: string | null
  created_at: string
  updated_at: string
}

type MealLogFoodItemRow = {
  meal_log_id: string
  food_item_id: string
  amount: number | null
  calories: number | null
  protein: number | null
  fat: number | null
  carbohydrates: number | null
}

export async function fetchMealLogs(): Promise<MealLog[]> {
  const userId = await getCurrentUserId()
  const { data: logRows, error: logError } = await supabase
    .from('meal_logs')
    .select('*')
    .eq('user_id', userId)
    .order('log_date', { ascending: true })

  if (logError) {
    throw logError
  }

  const { data: linkRows, error: linkError } = await supabase.from('meal_log_food_items').select('*')

  if (linkError) {
    throw linkError
  }

  const foodItems = await fetchFoodItems()
  const foodItemMap = new Map(foodItems.map((item) => [item.id as string, item]))

  return (logRows as MealLogRow[]).map((row) => {
    const links = (linkRows as MealLogFoodItemRow[]).filter((link) => link.meal_log_id === row.id)

    const totals = links.reduce(
      (acc, link) => ({
        calories: acc.calories + (link.calories ?? 0),
        protein: acc.protein + (link.protein ?? 0),
        fat: acc.fat + (link.fat ?? 0),
        carbohydrates: acc.carbohydrates + (link.carbohydrates ?? 0),
        foods: [...acc.foods, foodItemMap.get(link.food_item_id)?.name ?? '不明な食材'],
      }),
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
      mealTime: row.meal_time ?? undefined,
      createdAt: row.created_at as DateString,
      updatedAt: row.updated_at as DateString,
    }
  })
}

export async function upsertMealLog(input: MealLogInput): Promise<void> {
  const userId = await getCurrentUserId()
  const { error: logError } = await supabase.from('meal_logs').upsert({
    id: input.id,
    user_id: userId,
    log_date: input.date,
    meal_type: input.mealType,
    notes: input.notes ?? null,
    meal_time: input.mealTime ?? null,
  })

  if (logError) {
    throw logError
  }

  const { error: deleteError } = await supabase.from('meal_log_food_items').delete().eq('meal_log_id', input.id)

  if (deleteError) {
    throw deleteError
  }

  if (input.items.length > 0) {
    // meal_log_food_itemsのuser_id列にはDB側でDEFAULT_USER_ID相当のデフォルト値が
    // 設定されているため、明示的に指定しなくてもエラーにはならない。ただし
    // フェーズB移行後もそのデフォルト値は自動更新されないため、ここで明示的に
    // 指定して依存を断つ（アカウント/ログイン機能フェーズA、2026年8月25日）。
    const { error: insertError } = await supabase.from('meal_log_food_items').insert(
      input.items.map((item) => ({
        meal_log_id: input.id,
        user_id: userId,
        food_item_id: item.foodItemId,
        amount: item.amount,
        calories: item.calories,
        protein: item.protein,
        fat: item.fat,
        carbohydrates: item.carbohydrates,
      })),
    )

    if (insertError) {
      throw insertError
    }
  }
}

export async function deleteMealLogRemote(id: string): Promise<void> {
  const userId = await getCurrentUserId()
  const { error } = await supabase.from('meal_logs').delete().eq('id', id).eq('user_id', userId)

  if (error) {
    throw error
  }
}

export async function fetchMealLogItems(mealLogId: string): Promise<MealLogFoodItem[]> {
  const { data, error } = await supabase.from('meal_log_food_items').select('*').eq('meal_log_id', mealLogId)

  if (error) {
    throw error
  }

  const foodItems = await fetchFoodItems()
  const foodItemMap = new Map(foodItems.map((item) => [item.id as string, item]))

  return (data as MealLogFoodItemRow[]).map((row) => ({
    foodItemId: row.food_item_id,
    foodItem: foodItemMap.get(row.food_item_id),
    amount: row.amount ?? 0,
    calories: row.calories ?? 0,
    protein: row.protein ?? 0,
    fat: row.fat ?? 0,
    carbohydrates: row.carbohydrates ?? 0,
  }))
}
