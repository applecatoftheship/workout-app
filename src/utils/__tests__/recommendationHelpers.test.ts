import { describe, expect, it } from 'vitest'
import type { Goals } from '../../api/goals'
import type { DishWithDetails, ExerciseDefinition, MealLog, TrainingLog } from '../../types'
import { recommendDishes, recommendTraining } from '../recommendationHelpers'

const goals: Goals = {
  yearMonth: '2026-11',
  targetWeight: 70,
  targetSleepHours: 7,
  weeklyTrainingGoal: 3,
  monthlyTrainingGoal: 12,
  dailyCalorieGoal: 2200,
  dailyProteinGoal: 150,
  dailyFatGoal: 60,
  dailyCarbohydrateGoal: 250,
}

function meal(date: string, values: Partial<MealLog>): MealLog {
  return { date: date as MealLog['date'], mealType: 'lunch', foods: [], calories: 0, protein: 0, fat: 0, carbohydrates: 0, ...values }
}

function dish(name: string, kcal: number, protein: number, fat = 10, carbs = 30): DishWithDetails {
  return { id: name, name, items: [], totalCalories: kcal, totalProtein: protein, totalFat: fat, totalCarbohydrates: carbs }
}

const dishes = [dish('鶏むね定食', 500, 45), dish('親子丼', 700, 30), dish('ざるそば', 400, 14), dish('サラダチキン', 120, 25), dish('ラーメン', 800, 25)]

describe('recommendDishes', () => {
  it('昨日までの7日間に食事の記録が無ければ noMeals（今日の記録だけでは判定しない）', () => {
    const logs = [meal('2026-10-29', { protein: 10 }), meal('2026-11-06', { protein: 10 })]
    expect(recommendDishes(logs, dishes, goals, '2026-11-06').status).toBe('noMeals')
  })

  it('たんぱく質・脂質・炭水化物の目標がすべて0なら noGoals', () => {
    const noGoals = { ...goals, dailyProteinGoal: 0, dailyFatGoal: 0, dailyCarbohydrateGoal: 0 }
    expect(recommendDishes([meal('2026-11-05', { protein: 10 })], dishes, noGoals, '2026-11-06').status).toBe('noGoals')
  })

  it('どの栄養素も目標の9割以上なら balanced', () => {
    const logs = [meal('2026-11-05', { calories: 2200, protein: 140, fat: 55, carbohydrates: 240 })]
    expect(recommendDishes(logs, dishes, goals, '2026-11-06')).toEqual({ status: 'balanced', recordedDays: 1 })
  })

  it('いちばん不足している栄養素を、記録のある日の平均で選び、100kcalあたりの量が多い料理を出す', () => {
    const logs = [
      meal('2026-11-05', { calories: 2000, protein: 60, fat: 60, carbohydrates: 250 }),
      meal('2026-11-03', { calories: 2000, protein: 80, fat: 60, carbohydrates: 250 }),
    ]
    const result = recommendDishes(logs, dishes, goals, '2026-11-06')
    expect(result.status).toBe('shortage')
    if (result.status !== 'shortage') return
    expect(result.nutrient).toBe('protein')
    expect(result.averagePerDay).toBe(70)
    expect(result.recordedDays).toBe(2)
    expect(result.dishes.map((d) => d.name)).toEqual(['サラダチキン', '鶏むね定食', '親子丼'])
  })

  it('直近3日に食べた料理は外し、今日の残りカロリー以下の料理に絞る', () => {
    const logs = [
      meal('2026-11-05', { calories: 2000, protein: 50, fat: 60, carbohydrates: 250 }),
      meal('2026-11-06', { calories: 1650, protein: 0, fat: 0, carbohydrates: 0, dishName: '鶏むね定食' }),
    ]
    const result = recommendDishes(logs, dishes, goals, '2026-11-06')
    if (result.status !== 'shortage') throw new Error('shortage のはず')
    // 残り 550kcal → 親子丼(700)・ラーメン(800)は外れ、鶏むね定食は直近に食べたので外れる
    expect(result.dishes.map((d) => d.name)).toEqual(['サラダチキン', 'ざるそば'])
  })
})

function exercise(id: string, name: string, bodyPart: ExerciseDefinition['bodyPart']): ExerciseDefinition {
  return { id, name, bodyPart, isPreset: true }
}

const exercises = [
  exercise('bench', 'ベンチプレス', '胸'),
  exercise('fly', 'ダンベルフライ', '胸'),
  exercise('squat', 'スクワット', '脚'),
  exercise('lunge', 'ランジ', '脚'),
  exercise('deadlift', 'デッドリフト', '背'),
  exercise('press', 'ショルダープレス', '肩'),
  exercise('curl', 'アームカール', '腕'),
  exercise('crunch', 'クランチ', '腹'),
]

function training(date: string, exerciseIds: string[]): TrainingLog {
  return {
    date: date as TrainingLog['date'],
    completed: true,
    exercises: exerciseIds.map((exerciseId, index) => ({
      id: `${date}-${exerciseId}`,
      exerciseId,
      orderIndex: index,
      sets: [{ setNumber: 1, weight: 40, reps: 10, isWarmup: false }],
    })),
  }
}

describe('recommendTraining', () => {
  it('記録の無い部位を最優先し、同じ条件なら決めた順（胸→背→脚→肩→腕→腹）で選ぶ', () => {
    const logs = [training('2026-11-05', ['bench', 'deadlift', 'squat', 'press', 'curl'])]
    const result = recommendTraining(logs, exercises, '2026-11-06')
    expect(result).toMatchObject({ bodyPart: '腹', daysSince: null })
    expect(result?.exercises.map((e) => e.name)).toEqual(['クランチ'])
  })

  it('いちばん間が空いた部位を選び、やったことのある種目を最近やった順に先に出す', () => {
    const logs = [
      training('2026-10-20', ['squat']),
      training('2026-10-25', ['lunge']),
      training('2026-11-05', ['bench', 'deadlift', 'press', 'curl', 'crunch']),
    ]
    const result = recommendTraining(logs, exercises, '2026-11-06')
    expect(result).toMatchObject({ bodyPart: '脚', daysSince: 12 })
    expect(result?.exercises.map((e) => e.name)).toEqual(['ランジ', 'スクワット'])
  })

  it('未来の日付の記録は数えない', () => {
    const logs = [training('2026-11-10', ['crunch']), training('2026-11-04', ['bench', 'deadlift', 'squat', 'press', 'curl'])]
    expect(recommendTraining(logs, exercises, '2026-11-06')).toMatchObject({ bodyPart: '腹', daysSince: null })
  })

  it('セットの無い種目は数えない', () => {
    const withEmptySets = training('2026-11-05', ['crunch'])
    withEmptySets.exercises[0].sets = []
    const logs = [withEmptySets, training('2026-11-04', ['bench', 'deadlift', 'squat', 'press', 'curl'])]
    expect(recommendTraining(logs, exercises, '2026-11-06')).toMatchObject({ bodyPart: '腹', daysSince: null })
  })
})
