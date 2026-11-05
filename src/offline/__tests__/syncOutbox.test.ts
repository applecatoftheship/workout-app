import { beforeEach, describe, expect, it, vi } from 'vitest'

// オフライン記録対応（2026年10月31日）：送信処理のテスト。Supabase への実通信は
// 行わず、API 関数をすべてモックに差し替えて「順序・再開・二重送信防止・
// 他ユーザーの記録を送らない・通信エラーで中断」の振る舞いだけを確かめる。

const api = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  upsertMealLog: vi.fn(),
  deleteMealLogRemote: vi.fn(),
  deleteTrainingLogExerciseRemote: vi.fn(),
  ensureTrainingLogForDate: vi.fn(),
  countTrainingLogExercises: vi.fn(),
  insertTrainingLogExerciseWithId: vi.fn(),
  replaceTrainingSets: vi.fn(),
  fetchTrainingLogCompleted: vi.fn(),
  completeScheduleForDate: vi.fn(),
}))

vi.mock('../../api/client', () => ({ getCurrentUserId: api.getCurrentUserId }))
vi.mock('../../api/mealLogs', () => ({ upsertMealLog: api.upsertMealLog, deleteMealLogRemote: api.deleteMealLogRemote }))
vi.mock('../../api/trainingLogs', () => ({
  ensureTrainingLogForDate: api.ensureTrainingLogForDate,
  countTrainingLogExercises: api.countTrainingLogExercises,
  insertTrainingLogExerciseWithId: api.insertTrainingLogExerciseWithId,
  replaceTrainingSets: api.replaceTrainingSets,
  deleteTrainingLogExerciseRemote: api.deleteTrainingLogExerciseRemote,
  fetchTrainingLogCompleted: api.fetchTrainingLogCompleted,
}))
vi.mock('../../api/trainingSchedules', () => ({ completeScheduleForDate: api.completeScheduleForDate }))

import { enqueueOutbox, readOutbox } from '../outbox'
import type { OutboxEntry } from '../outbox'
import { flushOutbox, runTrainingAdd } from '../syncOutbox'

function installMemoryLocalStorage() {
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size
    },
    clear: () => data.clear(),
  }
  vi.stubGlobal('localStorage', storage)
}

function trainingEntry(id: string, createdAt: string, userId = 'user-a'): OutboxEntry {
  return {
    kind: 'trainingAdd',
    id,
    userId,
    createdAt,
    attempts: 0,
    label: `training ${id}`,
    date: '2026-10-31',
    exerciseId: 'exercise-1',
    trainingLogExerciseId: `tle-${id}`,
    exerciseInserted: false,
    sets: [{ setNumber: 1, weight: 60, reps: 10, isWarmup: false }],
  }
}

function mealEntry(id: string, createdAt: string, userId = 'user-a'): OutboxEntry {
  return {
    kind: 'mealUpsert',
    id,
    userId,
    createdAt,
    attempts: 0,
    label: `meal ${id}`,
    input: { id: `meal-${id}`, date: '2026-10-31', mealType: 'lunch', items: [] },
  }
}

describe('syncOutbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installMemoryLocalStorage()
    api.getCurrentUserId.mockResolvedValue('user-a')
    api.ensureTrainingLogForDate.mockResolvedValue('log-1')
    api.countTrainingLogExercises.mockResolvedValue(2)
    api.insertTrainingLogExerciseWithId.mockResolvedValue(undefined)
    api.replaceTrainingSets.mockResolvedValue(undefined)
    api.upsertMealLog.mockResolvedValue(undefined)
    api.deleteMealLogRemote.mockResolvedValue(undefined)
    api.deleteTrainingLogExerciseRemote.mockResolvedValue(undefined)
    api.fetchTrainingLogCompleted.mockResolvedValue(true)
    api.completeScheduleForDate.mockResolvedValue(undefined)
  })

  it('runTrainingAdd：端末採番idで種目行を作り、サーバー上の件数を並び順に使う', async () => {
    const entry = trainingEntry('1', '2026-10-31T09:00:00.000Z')
    const onProgress = vi.fn()
    const done = await runTrainingAdd(entry as Extract<OutboxEntry, { kind: 'trainingAdd' }>, onProgress)
    expect(api.insertTrainingLogExerciseWithId).toHaveBeenCalledWith('tle-1', 'log-1', 'exercise-1', 2)
    expect(api.replaceTrainingSets).toHaveBeenCalledWith('tle-1', entry.kind === 'trainingAdd' ? entry.sets : [])
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ exerciseInserted: true }))
    expect(done.exerciseInserted).toBe(true)
  })

  it('runTrainingAdd：種目行が作成済みならセットの置き換えだけを行う（再開）', async () => {
    const entry = { ...trainingEntry('1', 'a'), exerciseInserted: true } as Extract<OutboxEntry, { kind: 'trainingAdd' }>
    await runTrainingAdd(entry)
    expect(api.ensureTrainingLogForDate).not.toHaveBeenCalled()
    expect(api.insertTrainingLogExerciseWithId).not.toHaveBeenCalled()
    expect(api.replaceTrainingSets).toHaveBeenCalledTimes(1)
  })

  it('古い順に送信し、成功したものは端末から消える', async () => {
    enqueueOutbox(mealEntry('2', '2026-10-31T10:00:00.000Z'))
    enqueueOutbox(trainingEntry('1', '2026-10-31T09:00:00.000Z'))
    const order: string[] = []
    api.replaceTrainingSets.mockImplementation(async () => {
      order.push('training')
    })
    api.upsertMealLog.mockImplementation(async () => {
      order.push('meal')
    })
    const result = await flushOutbox()
    expect(order).toEqual(['training', 'meal'])
    expect(result.synced.map((entry) => entry.id)).toEqual(['1', '2'])
    expect(readOutbox()).toEqual([])
    expect(api.completeScheduleForDate).toHaveBeenCalledWith('2026-10-31')
  })

  it('他のユーザーの記録は送らずに残す', async () => {
    enqueueOutbox(mealEntry('1', 'a', 'user-b'))
    const result = await flushOutbox()
    expect(api.upsertMealLog).not.toHaveBeenCalled()
    expect(result.synced).toEqual([])
    expect(readOutbox()).toHaveLength(1)
  })

  it('通信エラーでは中断し、途中までの進捗を残す', async () => {
    enqueueOutbox(trainingEntry('1', 'a'))
    enqueueOutbox(mealEntry('2', 'b'))
    api.replaceTrainingSets.mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await flushOutbox()
    expect(result.interrupted).toBe(true)
    expect(api.upsertMealLog).not.toHaveBeenCalled()
    const remaining = readOutbox()
    expect(remaining.map((entry) => entry.id)).toEqual(['1', '2'])
    const first = remaining[0]
    expect(first.kind === 'trainingAdd' && first.exerciseInserted).toBe(true)
    expect(first.attempts).toBe(0)
  })

  it('通信エラー以外の失敗は理由を記録して残し、次の記録へ進む', async () => {
    enqueueOutbox(mealEntry('1', 'a'))
    enqueueOutbox(mealEntry('2', 'b'))
    api.upsertMealLog.mockRejectedValueOnce({ message: 'new row violates row-level security policy', code: '42501' })
    const result = await flushOutbox()
    expect(result.failed.map((entry) => entry.id)).toEqual(['1'])
    expect(result.synced.map((entry) => entry.id)).toEqual(['2'])
    const remaining = readOutbox()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].lastError).toContain('row-level security')
    expect(remaining[0].attempts).toBe(1)
  })

  it('編集・削除の操作（2026年11月6日）：種類ごとに対応する API を呼び、古い順に送る', async () => {
    const base = { userId: 'user-a', attempts: 0, label: 'x' }
    enqueueOutbox({ ...base, kind: 'trainingExerciseDelete', id: '3', createdAt: 'c', trainingLogExerciseId: 'tle-9' })
    enqueueOutbox({ ...base, kind: 'mealDelete', id: '1', createdAt: 'a', mealLogId: 'meal-9' })
    enqueueOutbox({
      ...base,
      kind: 'trainingSetsReplace',
      id: '2',
      createdAt: 'b',
      date: '2026-11-06',
      trainingLogExerciseId: 'tle-8',
      sets: [{ setNumber: 1, weight: 50, reps: 8, isWarmup: false }],
    })
    const order: string[] = []
    api.deleteMealLogRemote.mockImplementation(async () => {
      order.push('mealDelete')
    })
    api.replaceTrainingSets.mockImplementation(async () => {
      order.push('setsReplace')
    })
    api.deleteTrainingLogExerciseRemote.mockImplementation(async () => {
      order.push('exerciseDelete')
    })
    const result = await flushOutbox()
    expect(order).toEqual(['mealDelete', 'setsReplace', 'exerciseDelete'])
    expect(api.deleteMealLogRemote).toHaveBeenCalledWith('meal-9')
    expect(api.replaceTrainingSets).toHaveBeenCalledWith('tle-8', [{ setNumber: 1, weight: 50, reps: 8, isWarmup: false }])
    expect(api.deleteTrainingLogExerciseRemote).toHaveBeenCalledWith('tle-9')
    expect(api.completeScheduleForDate).toHaveBeenCalledWith('2026-11-06')
    expect(result.synced).toHaveLength(3)
    expect(readOutbox()).toEqual([])
  })

  it('送信に失敗した操作と同じ記録への後ろの操作は送らずに残し、別の記録の操作は送る', async () => {
    const base = { userId: 'user-a', attempts: 0, label: 'x' }
    enqueueOutbox({ ...base, kind: 'mealUpsert', id: '1', createdAt: 'a', input: { id: 'meal-1', date: '2026-11-06', mealType: 'lunch', items: [] } })
    enqueueOutbox({ ...base, kind: 'mealDelete', id: '2', createdAt: 'b', mealLogId: 'meal-1' })
    enqueueOutbox({ ...base, kind: 'mealDelete', id: '3', createdAt: 'c', mealLogId: 'meal-2' })
    api.upsertMealLog.mockRejectedValue(new Error('server error'))
    const result = await flushOutbox()
    expect(api.deleteMealLogRemote).toHaveBeenCalledTimes(1)
    expect(api.deleteMealLogRemote).toHaveBeenCalledWith('meal-2')
    expect(result.failed.map((entry) => entry.id)).toEqual(['1'])
    expect(readOutbox().map((entry) => entry.id)).toEqual(['1', '2'])
  })
})
