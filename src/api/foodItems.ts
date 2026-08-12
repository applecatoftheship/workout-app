import { supabase } from './client'
import type { FoodItem } from '../types'

type FoodItemRow = {
  id: string
  name: string
  serving_amount: number
  serving_unit: string
  calories: number
  protein: number
  fat: number
  carbohydrates: number
  is_deleted: boolean
}

function rowToFoodItem(row: FoodItemRow): FoodItem {
  return {
    id: row.id,
    name: row.name,
    servingAmount: row.serving_amount,
    servingUnit: row.serving_unit,
    calories: row.calories,
    protein: row.protein,
    fat: row.fat,
    carbohydrates: row.carbohydrates,
    isDeleted: row.is_deleted,
  }
}

export async function fetchFoodItems(): Promise<FoodItem[]> {
  const { data, error } = await supabase
    .from('food_items')
    .select('*')
    .eq('is_deleted', false)
    .order('name', { ascending: true })

  if (error) {
    throw error
  }

  return (data as FoodItemRow[]).map(rowToFoodItem)
}

export async function createFoodItem(input: {
  name: string
  servingAmount: number
  servingUnit: string
  calories: number
  protein: number
  fat: number
  carbohydrates: number
}): Promise<FoodItem> {
  const { data, error } = await supabase
    .from('food_items')
    .insert({
      name: input.name,
      serving_amount: input.servingAmount,
      serving_unit: input.servingUnit,
      calories: input.calories,
      protein: input.protein,
      fat: input.fat,
      carbohydrates: input.carbohydrates,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return rowToFoodItem(data as FoodItemRow)
}

export async function deleteFoodItem(id: string): Promise<void> {
  const { error } = await supabase.from('food_items').update({ is_deleted: true }).eq('id', id)

  if (error) {
    throw error
  }
}
