import { getCurrentUserId, supabase } from './client'
import { fetchFoodItems } from './foodItems'
import type { Dish, DishCategory, DishFoodItem, DishWithDetails, MealSize } from '../types'

type DishRow = {
  id: string
  user_id: string | null
  name: string
  category: string | null
  emoji: string | null
  created_at: string
}

type DishFoodItemRow = {
  dish_id: string
  food_item_id: string
  amount: number
  unit: string
}

type MealSizeRow = {
  id: string
  name: string
  multiplier: number
  sort_order: number
}

function rowToDish(row: DishRow): Dish {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    name: row.name,
    category: (row.category as DishCategory | null) ?? undefined,
    emoji: row.emoji ?? undefined,
    createdAt: row.created_at as Dish['createdAt'],
  }
}

function rowToMealSize(row: MealSizeRow): MealSize {
  return {
    id: row.id,
    name: row.name,
    multiplier: row.multiplier,
    sortOrder: row.sort_order,
  }
}

export async function fetchDishesWithDetails(): Promise<DishWithDetails[]> {
  const userId = await getCurrentUserId()
  const { data: dishRows, error: dishError } = await supabase
    .from('dishes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (dishError) {
    throw dishError
  }

  const { data: itemRows, error: itemError } = await supabase.from('dish_food_items').select('*')

  if (itemError) {
    throw itemError
  }

  const foodItems = await fetchFoodItems()
  const foodItemMap = new Map(foodItems.map((item) => [item.id as string, item]))

  return (dishRows as DishRow[]).map((dishRow) => {
    const items: DishFoodItem[] = (itemRows as DishFoodItemRow[])
      .filter((item) => item.dish_id === dishRow.id)
      .map((item) => ({
        dishId: item.dish_id,
        foodItemId: item.food_item_id,
        foodItem: foodItemMap.get(item.food_item_id),
        amount: item.amount,
        unit: item.unit,
      }))

    const totals = items.reduce(
      (acc, item) => {
        const foodItem = item.foodItem
        if (!foodItem) {
          return acc
        }
        const ratio = item.amount / foodItem.servingAmount
        return {
          calories: acc.calories + foodItem.calories * ratio,
          protein: acc.protein + foodItem.protein * ratio,
          fat: acc.fat + foodItem.fat * ratio,
          carbohydrates: acc.carbohydrates + foodItem.carbohydrates * ratio,
        }
      },
      { calories: 0, protein: 0, fat: 0, carbohydrates: 0 },
    )

    return {
      ...rowToDish(dishRow),
      items,
      totalCalories: totals.calories,
      totalProtein: totals.protein,
      totalFat: totals.fat,
      totalCarbohydrates: totals.carbohydrates,
    }
  })
}

export type DishItemInput = {
  foodItemId: string
  amount: number
  unit: string
}

export type DishInput = {
  name: string
  category?: DishCategory
  emoji?: string
  items: DishItemInput[]
}

// dish_food_itemsのuser_id列にはDB側でDEFAULT_USER_ID相当のデフォルト値が
// 設定されているため、明示的に指定しなくてもエラーにはならない。ただし
// フェーズB移行後もそのデフォルト値は自動更新されないため、ここで明示的に
// 指定して依存を断つ（アカウント/ログイン機能フェーズA、2026年8月25日）。
async function insertDishFoodItems(dishId: string, userId: string, items: DishItemInput[]): Promise<void> {
  if (items.length === 0) {
    return
  }
  const { error } = await supabase.from('dish_food_items').insert(
    items.map((item) => ({
      dish_id: dishId,
      user_id: userId,
      food_item_id: item.foodItemId,
      amount: item.amount,
      unit: item.unit,
    })),
  )
  if (error) {
    throw error
  }
}

export async function createDish(input: DishInput): Promise<void> {
  const userId = await getCurrentUserId()
  const { data: insertedDish, error: dishError } = await supabase
    .from('dishes')
    .insert({ name: input.name, category: input.category ?? null, emoji: input.emoji ?? null, user_id: userId })
    .select()
    .single()

  if (dishError) {
    throw dishError
  }

  await insertDishFoodItems((insertedDish as DishRow).id, userId, input.items)
}

// 料理編集（2026年9月3日）：名前・カテゴリ・絵文字を UPDATE し、
// dish_food_items は対象 dish_id 分のみ全削除→再登録する子テーブル入れ替え方式
// （updateTrainingTemplate と同じパターン。全件diff同期ではなく、対象が確定済みの
// 1レコード分の入れ替えに限定した安全な範囲）。dishes 本体（ID）は削除しないため
// meal_log_food_items のスナップショット（過去の食事記録）には一切影響しない。
export async function updateDish(dishId: string, input: DishInput): Promise<void> {
  const userId = await getCurrentUserId()

  const { error: dishError } = await supabase
    .from('dishes')
    .update({ name: input.name, category: input.category ?? null, emoji: input.emoji ?? null })
    .eq('id', dishId)
    .eq('user_id', userId)

  if (dishError) {
    throw dishError
  }

  const { error: deleteError } = await supabase
    .from('dish_food_items')
    .delete()
    .eq('dish_id', dishId)
    .eq('user_id', userId)

  if (deleteError) {
    throw deleteError
  }

  await insertDishFoodItems(dishId, userId, input.items)
}

export async function deleteDish(dishId: string): Promise<void> {
  const userId = await getCurrentUserId()
  // user_idでの絞り込みは、RLSが全許可のためセキュリティ境界にはならないが、
  // アプリ側の誤操作（他ユーザーのIDを誤って渡すバグ等）を防ぐガードとして付与している
  // （技術的負債5番、2026年8月18日の調査を踏まえた対応）。
  const { error: itemsError } = await supabase
    .from('dish_food_items')
    .delete()
    .eq('dish_id', dishId)
    .eq('user_id', userId)

  if (itemsError) {
    throw itemsError
  }

  const { error: dishError } = await supabase.from('dishes').delete().eq('id', dishId).eq('user_id', userId)

  if (dishError) {
    throw dishError
  }
}

export async function fetchMealSizes(): Promise<MealSize[]> {
  const { data, error } = await supabase.from('meal_sizes').select('*').order('sort_order', { ascending: true })

  if (error) {
    throw error
  }

  return (data as MealSizeRow[]).map(rowToMealSize)
}
