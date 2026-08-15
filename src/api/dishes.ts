import { supabase } from './client'
import { fetchFoodItems } from './foodItems'
import { DEFAULT_USER_ID } from './trainingLogs'
import type { Dish, DishFoodItem, DishWithDetails, MealSize } from '../types'

type DishRow = {
  id: string
  user_id: string | null
  name: string
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
  const { data: dishRows, error: dishError } = await supabase
    .from('dishes')
    .select('*')
    .eq('user_id', DEFAULT_USER_ID)
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

export async function createDish(name: string, items: DishItemInput[]): Promise<void> {
  const { data: insertedDish, error: dishError } = await supabase
    .from('dishes')
    .insert({ name, user_id: DEFAULT_USER_ID })
    .select()
    .single()

  if (dishError) {
    throw dishError
  }

  const dishId = (insertedDish as DishRow).id

  if (items.length > 0) {
    const { error: itemsError } = await supabase.from('dish_food_items').insert(
      items.map((item) => ({
        dish_id: dishId,
        food_item_id: item.foodItemId,
        amount: item.amount,
        unit: item.unit,
      })),
    )

    if (itemsError) {
      throw itemsError
    }
  }
}

export async function deleteDish(dishId: string): Promise<void> {
  const { error: itemsError } = await supabase.from('dish_food_items').delete().eq('dish_id', dishId)

  if (itemsError) {
    throw itemsError
  }

  const { error: dishError } = await supabase.from('dishes').delete().eq('id', dishId)

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
