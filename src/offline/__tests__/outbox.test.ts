import { beforeEach, describe, expect, it } from 'vitest'
import {
  OUTBOX_STORAGE_KEY,
  countEntriesForUser,
  enqueueOutbox,
  parseOutbox,
  readOutbox,
  removeOutboxEntry,
  updateOutboxEntry,
  outboxTargetKey,
} from '../outbox'
import type { OutboxEntry, OutboxStorage } from '../outbox'

function createMemoryStorage(): OutboxStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
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

function trainingEntry(id: string, createdAt: string): OutboxEntry {
  return {
    kind: 'trainingAdd',
    id,
    userId: 'user-a',
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

describe('outbox', () => {
  let storage: ReturnType<typeof createMemoryStorage>

  beforeEach(() => {
    storage = createMemoryStorage()
  })

  it('追加した記録を古い順に読み出せる', () => {
    expect(enqueueOutbox(mealEntry('2', '2026-10-31T10:00:00.000Z'), storage)).toBe(true)
    expect(enqueueOutbox(trainingEntry('1', '2026-10-31T09:00:00.000Z'), storage)).toBe(true)
    expect(readOutbox(storage).map((entry) => entry.id)).toEqual(['1', '2'])
  })

  it('同じidの二重追加は無視する', () => {
    enqueueOutbox(mealEntry('1', '2026-10-31T10:00:00.000Z'), storage)
    enqueueOutbox(mealEntry('1', '2026-10-31T10:00:00.000Z'), storage)
    expect(readOutbox(storage)).toHaveLength(1)
  })

  it('更新・削除できる', () => {
    const entry = trainingEntry('1', '2026-10-31T09:00:00.000Z')
    enqueueOutbox(entry, storage)
    updateOutboxEntry({ ...entry, exerciseInserted: true } as OutboxEntry, storage)
    const updated = readOutbox(storage)[0]
    expect(updated.kind === 'trainingAdd' && updated.exerciseInserted).toBe(true)
    removeOutboxEntry('1', storage)
    expect(readOutbox(storage)).toEqual([])
  })

  it('保存に失敗したら false を返す', () => {
    const failing: OutboxStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(enqueueOutbox(mealEntry('1', '2026-10-31T10:00:00.000Z'), failing)).toBe(false)
    expect(enqueueOutbox(mealEntry('1', '2026-10-31T10:00:00.000Z'), null)).toBe(false)
  })

  it('壊れたデータは捨て、読める要素は残す', () => {
    expect(parseOutbox('not json')).toEqual([])
    expect(parseOutbox('{"a":1}')).toEqual([])
    const valid = mealEntry('1', '2026-10-31T10:00:00.000Z')
    storage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify([{ kind: 'unknown' }, valid, null]))
    expect(readOutbox(storage)).toEqual([valid])
  })

  it('ユーザーごとの件数を数える', () => {
    const entries = [mealEntry('1', 'a', 'user-a'), mealEntry('2', 'b', 'user-b'), mealEntry('3', 'c', 'user-a')]
    expect(countEntriesForUser(entries, 'user-a')).toBe(2)
    expect(countEntriesForUser(entries, null)).toBe(0)
  })

  it('編集・削除の操作（2026年11月6日）も読み戻せ、必要な項目が欠けたものは捨てる', () => {
    const base = { userId: 'user-a', createdAt: '2026-11-06T00:00:00.000Z', attempts: 0, label: 'x' }
    const raw = JSON.stringify([
      { ...base, id: '1', kind: 'mealDelete', mealLogId: 'meal-1' },
      { ...base, id: '2', kind: 'trainingSetsReplace', date: '2026-11-06', trainingLogExerciseId: 'tle-1', sets: [] },
      { ...base, id: '3', kind: 'trainingExerciseDelete', trainingLogExerciseId: 'tle-2' },
      { ...base, id: '4', kind: 'mealDelete' },
      { ...base, id: '5', kind: 'trainingSetsReplace', trainingLogExerciseId: 'tle-3' },
    ])
    expect(parseOutbox(raw).map((entry) => entry.id)).toEqual(['1', '2', '3'])
  })

  it('outboxTargetKey：同じ記録への操作は同じキーになる', () => {
    const base = { userId: 'user-a', createdAt: 'a', attempts: 0, label: 'x' }
    expect(outboxTargetKey({ ...base, id: '1', kind: 'mealDelete', mealLogId: 'm1' })).toBe(
      outboxTargetKey({ ...base, id: '2', kind: 'mealUpsert', input: { id: 'm1', date: '2026-11-06', mealType: 'lunch', items: [] } }),
    )
    expect(outboxTargetKey({ ...base, id: '3', kind: 'trainingExerciseDelete', trainingLogExerciseId: 't1' })).toBe(
      outboxTargetKey({ ...base, id: '4', kind: 'trainingSetsReplace', date: '2026-11-06', trainingLogExerciseId: 't1', sets: [] }),
    )
  })
})
