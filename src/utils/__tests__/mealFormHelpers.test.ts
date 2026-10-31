import { describe, expect, it } from 'vitest'
import { filterDishes, filterFoodItems, guessMealTypeFromTime, listFoodCategories, UNCATEGORIZED_FOOD_FILTER } from '../mealFormHelpers'
import type { DishWithDetails, FoodItem } from '../../types'

function food(id: string, name: string, category: string | null): FoodItem {
  return { id, name, category, servingAmount: 100, servingUnit: 'g', calories: 100, protein: 1, fat: 1, carbohydrates: 1 }
}

const foods = [food('a', 'バナナ', '果物・芋類'), food('b', '白米', '穀類'), food('c', '謎の食材', null), food('d', 'から揚げ定食', '料理・定食')]

describe('guessMealTypeFromTime', () => {
  it('時刻帯ごとに推定する', () => {
    expect(guessMealTypeFromTime('07:30')).toBe('breakfast')
    expect(guessMealTypeFromTime('10:29')).toBe('breakfast')
    expect(guessMealTypeFromTime('10:30')).toBe('lunch')
    expect(guessMealTypeFromTime('15:00')).toBe('snack')
    expect(guessMealTypeFromTime('19:00')).toBe('dinner')
    expect(guessMealTypeFromTime('23:30')).toBe('snack')
    expect(guessMealTypeFromTime('03:59')).toBe('snack')
    expect(guessMealTypeFromTime('')).toBe('snack')
  })
})

describe('listFoodCategories', () => {
  it('未分類・料理系を除いて名前順', () => {
    expect(listFoodCategories(foods)).toEqual(['果物・芋類', '穀類'].sort((x, y) => x.localeCompare(y, 'ja')))
  })
})

describe('filterFoodItems', () => {
  it('検索語もジャンルも無ければ空', () => {
    expect(filterFoodItems(foods, { query: '', category: '' })).toEqual([])
  })
  it('ひらがなで検索できる', () => {
    expect(filterFoodItems(foods, { query: 'ばなな', category: '' }).map((f) => f.id)).toEqual(['a'])
  })
  it('ジャンル・未分類で絞り込める', () => {
    expect(filterFoodItems(foods, { query: '', category: '穀類' }).map((f) => f.id)).toEqual(['b'])
    expect(filterFoodItems(foods, { query: '', category: UNCATEGORIZED_FOOD_FILTER }).map((f) => f.id)).toEqual(['c'])
  })
})

describe('filterDishes', () => {
  const dishes = [
    { id: '1', name: '醤油ラーメン', category: '麺類', items: [], totalCalories: 600, totalProtein: 0, totalFat: 0, totalCarbohydrates: 0 },
    { id: '2', name: 'カレーライス', category: '洋食', items: [], totalCalories: 700, totalProtein: 0, totalFat: 0, totalCarbohydrates: 0 },
  ] as DishWithDetails[]
  it('未指定なら全件（名前順）、カテゴリ・検索で絞り込める', () => {
    expect(filterDishes(dishes, { query: '', category: '' }).map((d) => d.id)).toEqual(['2', '1'])
    expect(filterDishes(dishes, { query: 'かれー', category: '' }).map((d) => d.id)).toEqual(['2'])
    expect(filterDishes(dishes, { query: '', category: '麺類' }).map((d) => d.id)).toEqual(['1'])
  })
})
