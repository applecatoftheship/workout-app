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
  // この食事をとった時刻（ISO 8601、timestamptz。スプリント4 Phase 1追加）。
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

export type LatestFoodItemRecord = {
  amount: number
  logDate: DateString
}

// 食事記録画面UI/UX刷新（2026年8月29日）：食材ごとの「前回の実測量」を入力欄の
// プレースホルダーとして表示するための新規関数（読み取り専用）。
// trainingLogs.tsのfetchLatestExerciseRecordと同じ二段階クエリのパターンを踏襲
// （meal_log_food_itemsをfood_item_idで検索→該当meal_log_idを収集→meal_logsを
// user_id・除外日付で絞り込み直近日付を特定→その日のamountを引く）。
// excludeDateは編集中の日付自身を「前回」として自己参照しないための引数
// （fetchLatestExerciseRecordの同名引数と同じ意図）。
export async function fetchLatestFoodItemRecord(
  foodItemId: string,
  excludeDate?: DateString,
): Promise<LatestFoodItemRecord | null> {
  const userId = await getCurrentUserId()
  const { data: linkRows, error: linkError } = await supabase
    .from('meal_log_food_items')
    .select('meal_log_id, amount')
    .eq('food_item_id', foodItemId)

  if (linkError) {
    throw linkError
  }

  const links = linkRows as { meal_log_id: string; amount: number | null }[]
  if (links.length === 0) {
    return null
  }

  const mealLogIds = Array.from(new Set(links.map((link) => link.meal_log_id)))

  let logQuery = supabase.from('meal_logs').select('id, log_date').eq('user_id', userId).in('id', mealLogIds)

  if (excludeDate) {
    logQuery = logQuery.neq('log_date', excludeDate)
  }

  const { data: logRows, error: logError } = await logQuery.order('log_date', { ascending: false }).limit(1)

  if (logError) {
    throw logError
  }

  const latestLog = (logRows as { id: string; log_date: string }[])[0]
  if (!latestLog) {
    return null
  }

  const latestLink = links.find((link) => link.meal_log_id === latestLog.id)
  if (!latestLink || latestLink.amount == null) {
    return null
  }

  return {
    amount: latestLink.amount,
    logDate: latestLog.log_date as DateString,
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
