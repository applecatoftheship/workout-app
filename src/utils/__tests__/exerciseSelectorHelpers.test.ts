import { describe, expect, it } from 'vitest'
import { filterExercises, getRecentExerciseIds, hasExactExerciseMatch, normalizeExerciseQuery } from '../exerciseSelectorHelpers'
import type { ExerciseDefinition, TrainingLog } from '../../types'

const exercises: ExerciseDefinition[] = [
  { id: 'bench', name: 'ベンチプレス', bodyPart: '胸', equipmentType: 'バーベル', isPreset: true },
  { id: 'fly', name: 'ダンベルフライ', bodyPart: '胸', equipmentType: 'ダンベル', isPreset: true },
  { id: 'squat', name: 'スクワット', bodyPart: '脚', equipmentType: 'バーベル', isPreset: true },
  { id: 'curl', name: 'レッグカール', bodyPart: '脚', equipmentType: 'マシン', isPreset: true },
]

function log(date: string, ids: string[]): TrainingLog {
  return {
    id: date,
    date: date as TrainingLog['date'],
    completed: true,
    exercises: ids.map((exerciseId, orderIndex) => ({ exerciseId, orderIndex, sets: [] })),
  } as TrainingLog
}

describe('getRecentExerciseIds', () => {
  it('新しい日付順・重複なしで返す（同じ日は後から追加した順）', () => {
    const logs = [log('2026-10-01', ['squat']), log('2026-10-20', ['bench', 'fly']), log('2026-10-10', ['bench', 'curl'])]
    expect(getRecentExerciseIds(logs)).toEqual(['fly', 'bench', 'curl', 'squat'])
  })

  it('件数の上限を守る', () => {
    const logs = [log('2026-10-20', ['bench', 'fly', 'squat'])]
    expect(getRecentExerciseIds(logs, 2)).toEqual(['squat', 'fly'])
  })
})

describe('normalizeExerciseQuery', () => {
  it('カタカナ・ひらがな、全角英数、空白・中点の違いを吸収する', () => {
    expect(normalizeExerciseQuery(' べんち ')).toBe(normalizeExerciseQuery('ベンチ'))
    expect(normalizeExerciseQuery('ＥＺバー')).toBe(normalizeExerciseQuery('ezバー'))
    expect(normalizeExerciseQuery('ダンベル・フライ')).toBe(normalizeExerciseQuery('ダンベルフライ'))
  })
})

describe('filterExercises', () => {
  it('検索語も部位も無いときは最近使った種目だけ（無ければ全件を名前順）', () => {
    expect(filterExercises(exercises, { query: '', bodyPart: '', recentIds: ['squat', 'bench'] }).map((e) => e.id)).toEqual([
      'squat',
      'bench',
    ])
    expect(filterExercises(exercises, { query: '', bodyPart: '', recentIds: [] })).toHaveLength(4)
  })

  it('部位で絞り込み、最近使った種目を先頭にする', () => {
    expect(filterExercises(exercises, { query: '', bodyPart: '胸', recentIds: ['fly'] }).map((e) => e.id)).toEqual(['fly', 'bench'])
  })

  it('検索語（ひらがな可）で絞り込む', () => {
    expect(filterExercises(exercises, { query: 'かーる', bodyPart: '', recentIds: [] }).map((e) => e.id)).toEqual(['curl'])
    expect(filterExercises(exercises, { query: 'ベンチ', bodyPart: '脚', recentIds: [] })).toEqual([])
  })
})

describe('hasExactExerciseMatch', () => {
  it('正規化後に完全一致する種目があれば true、空文字も true', () => {
    expect(hasExactExerciseMatch(exercises, 'べんちぷれす')).toBe(true)
    expect(hasExactExerciseMatch(exercises, 'ベンチ')).toBe(false)
    expect(hasExactExerciseMatch(exercises, '  ')).toBe(true)
  })
})
