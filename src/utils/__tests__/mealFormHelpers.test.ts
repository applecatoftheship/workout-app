import { describe, expect, it } from 'vitest'
import { filterDishes, filterFoodItems, getDishGenre, guessMealTypeFromTime, listFoodCategories, UNCATEGORIZED_FOOD_FILTER } from '../mealFormHelpers'
import { DISH_CATEGORIES, DISH_GENRES } from '../../types'
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
    { id: '1', name: '醤油ラーメン', category: 'ラーメン・中華麺', items: [], totalCalories: 600, totalProtein: 0, totalFat: 0, totalCarbohydrates: 0 },
    { id: '2', name: 'カレーライス', category: 'カレー・ハヤシ', items: [], totalCalories: 700, totalProtein: 0, totalFat: 0, totalCarbohydrates: 0 },
    { id: '3', name: 'ナポリタン', category: 'パスタ', items: [], totalCalories: 650, totalProtein: 0, totalFat: 0, totalCarbohydrates: 0 },
  ] as DishWithDetails[]
  it('未指定なら全件（名前順）、小分類・検索で絞り込める', () => {
    expect(filterDishes(dishes, { query: '', category: '' }).map((d) => d.id)).toEqual(['2', '3', '1'])
    expect(filterDishes(dishes, { query: 'かれー', category: '' }).map((d) => d.id)).toEqual(['2'])
    expect(filterDishes(dishes, { query: '', category: 'ラーメン・中華麺' }).map((d) => d.id)).toEqual(['1'])
  })
  it('大分類で絞り込める（小分類が選ばれていればそちらを優先）', () => {
    expect(filterDishes(dishes, { query: '', category: '', genre: '洋食' }).map((d) => d.id)).toEqual(['2', '3'])
    expect(filterDishes(dishes, { query: '', category: 'パスタ', genre: '洋食' }).map((d) => d.id)).toEqual(['3'])
    expect(filterDishes(dishes, { query: '', category: '', genre: '中華' }).map((d) => d.id)).toEqual(['1'])
  })
})

describe('料理ジャンル（DISH_GENRES）', () => {
  it('すべての小分類がちょうど1つの大分類に属する', () => {
    const grouped = DISH_GENRES.flatMap((group) => group.categories)
    expect([...grouped].sort()).toEqual([...DISH_CATEGORIES].sort())
    expect(new Set(grouped).size).toBe(grouped.length)
  })
  it('getDishGenre は小分類から大分類を返す（不明な値は undefined）', () => {
    expect(getDishGenre('パスタ')).toBe('洋食')
    expect(getDishGenre('丼もの')).toBe('和食')
    expect(getDishGenre('麺類')).toBeUndefined()
    expect(getDishGenre(undefined)).toBeUndefined()
  })
})
