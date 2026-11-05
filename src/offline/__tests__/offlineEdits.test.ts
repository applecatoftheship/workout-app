import { describe, expect, it } from 'vitest'
import {
  applyMealDelete,
  applyMealEdit,
  applyTrainingExerciseDelete,
  applyTrainingSetsReplace,
  overlayPendingMealOperations,
  overlayPendingTrainingOperations,
} from '../offlineEdits'
import type { OutboxEntry } from '../outbox'
import type { MealLog, TrainingLog } from '../../types'

const meals: MealLog[] = [
  { id: 'm1', date: '2026-11-06', mealType: 'lunch', foods: ['米'], calories: 300, protein: 5, fat: 1, carbohydrates: 60 },
  { id: 'm2', date: '2026-11-06', mealType: 'dinner', foods: ['鶏'], calories: 200, protein: 30, fat: 5, carbohydrates: 0 },
]

const trainings: TrainingLog[] = [
  {
    id: 't1',
    date: '2026-11-06',
    completed: false,
    exercises: [
      { id: 'e1', exerciseId: 'x1', orderIndex: 0, sets: [{ setNumber: 1, weight: 40, reps: 10, isWarmup: false }] },
      { id: 'e2', exerciseId: 'x2', orderIndex: 1, sets: [] },
    ],
  },
]

describe('offlineEdits', () => {
  it('食事記録の削除：指定した記録だけを除く', () => {
    expect(applyMealDelete(meals, 'm1').map((log) => log.id)).toEqual(['m2'])
  })

  it('食事記録の編集：食材の値から合計を作り直し、他の記録は変えない', () => {
    const result = applyMealEdit(
      meals,
      {
        id: 'm1',
        date: '2026-11-06',
        mealType: 'breakfast',
        dishName: '納豆ご飯',
        items: [
          { foodItemId: 'a', amount: 150, calories: 234.4, protein: 3.8, fat: 0.5, carbohydrates: 55.6 },
          { foodItemId: 'b', amount: 45, calories: 85.5, protein: 7.4, fat: 4.5, carbohydrates: 5.4 },
        ],
      },
      ['ごはん', '納豆'],
    )
    expect(result[0]).toMatchObject({
      id: 'm1',
      mealType: 'breakfast',
      dishName: '納豆ご飯',
      foods: ['ごはん', '納豆'],
      calories: 320,
      protein: 11,
      fat: 5,
      carbohydrates: 61,
    })
    expect(result[1]).toBe(meals[1])
  })

  it('トレーニング種目のセット置き換え：対象の種目だけを差し替える', () => {
    const sets = [{ setNumber: 1, weight: 50, reps: 8, isWarmup: false }]
    const result = applyTrainingSetsReplace(trainings, 'e1', sets)
    expect(result[0].exercises[0].sets).toEqual(sets)
    expect(result[0].exercises[1]).toBe(trainings[0].exercises[1])
  })

  it('トレーニング種目の削除：対象の種目だけを除き、その日の記録は残す', () => {
    const result = applyTrainingExerciseDelete(trainings, 'e1')
    expect(result).toHaveLength(1)
    expect(result[0].exercises.map((exercise) => exercise.id)).toEqual(['e2'])
  })

  it('未送信の操作を取得した一覧に重ねる：ログイン中のユーザーの編集・削除だけ、保存した順に', () => {
    const base = { attempts: 0, label: 'x', createdAt: 'a' }
    const entries: OutboxEntry[] = [
      { ...base, id: '1', userId: 'me', kind: 'mealUpsert', input: { id: 'm1', date: '2026-11-06', mealType: 'lunch', items: [{ foodItemId: 'f1', amount: 100, calories: 100, protein: 10, fat: 1, carbohydrates: 5 }] } },
      { ...base, id: '2', userId: 'me', kind: 'mealUpsert', input: { id: 'new', date: '2026-11-06', mealType: 'lunch', items: [] } },
      { ...base, id: '3', userId: 'other', kind: 'mealDelete', mealLogId: 'm2' },
    ]
    const result = overlayPendingMealOperations(meals, entries, 'me', (id) => (id === 'f1' ? 'たまご' : undefined))
    expect(result.map((log) => log.id)).toEqual(['m1', 'm2'])
    expect(result[0]).toMatchObject({ foods: ['たまご'], calories: 100, protein: 10 })

    const deleted = overlayPendingMealOperations(meals, [{ ...base, id: '4', userId: 'me', kind: 'mealDelete', mealLogId: 'm2' }], 'me', () => undefined)
    expect(deleted.map((log) => log.id)).toEqual(['m1'])

    const training = overlayPendingTrainingOperations(
      trainings,
      [
        { ...base, id: '5', userId: 'me', kind: 'trainingExerciseDelete', trainingLogExerciseId: 'e2' },
        { ...base, id: '6', userId: 'other', kind: 'trainingExerciseDelete', trainingLogExerciseId: 'e1' },
      ],
      'me',
    )
    expect(training[0].exercises.map((exercise) => exercise.id)).toEqual(['e1'])
  })
})
