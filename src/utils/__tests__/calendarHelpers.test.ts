import { describe, expect, it } from 'vitest'
import {
  buildActivityByDate,
  combineDateAndTimeToISO,
  extractTimeHHMMFromISO,
  formatConditionSummary,
  formatMonthLabel,
  formatTrainingLogItem,
  getCalendarCellState,
  getCurrentTimeHHMM,
  getMealTypeLabel,
  getScheduleIcon,
  toDateKey,
  toJstDateKeyFromIso,
} from '../calendarHelpers'
import type { DailyCondition, SoccerLog, TrainingLogExercise, TrainingSchedule, Workout } from '../../types'

describe('toDateKey', () => {
  it('year/month/dayをゼロ埋めしたYYYY-MM-DDにする', () => {
    expect(toDateKey(2026, 8, 3)).toBe('2026-08-03')
    expect(toDateKey(2026, 12, 31)).toBe('2026-12-31')
  })
})

describe('toJstDateKeyFromIso', () => {
  it('UTC深夜帯のISO文字列はJSTでは翌日の暦日になる', () => {
    // UTC 2026-08-26T15:30:00Z = JST 2026-08-27T00:30:00+09:00
    expect(toJstDateKeyFromIso('2026-08-26T15:30:00Z')).toBe('2026-08-27')
  })

  it('JSTオフセット付きのISO文字列はそのままの暦日になる', () => {
    expect(toJstDateKeyFromIso('2026-08-27T07:00:00+09:00')).toBe('2026-08-27')
  })

  it('日付が変わらない時間帯はそのままの暦日になる', () => {
    // UTC 2026-08-27T01:00:00Z = JST 2026-08-27T10:00:00+09:00
    expect(toJstDateKeyFromIso('2026-08-27T01:00:00Z')).toBe('2026-08-27')
  })
})

describe('formatMonthLabel', () => {
  it('年と月を含む文字列を返す', () => {
    const label = formatMonthLabel(new Date(2026, 7, 1))
    expect(label).toContain('2026')
    expect(label).toContain('8')
  })
})

describe('getCurrentTimeHHMM', () => {
  it('HH:MM形式の文字列を返す', () => {
    expect(getCurrentTimeHHMM()).toMatch(/^\d{2}:\d{2}$/)
  })
})

describe('combineDateAndTimeToISO / extractTimeHHMMFromISO', () => {
  it('往復変換で元のHH:MMに戻る（タイムゾーンに依存しない）', () => {
    const iso = combineDateAndTimeToISO('2026-08-23', '14:30')
    expect(extractTimeHHMMFromISO(iso)).toBe('14:30')
  })
})

describe('getScheduleIcon', () => {
  it('予定が無ければデフォルトの🏋️', () => {
    expect(getScheduleIcon([])).toBe('🏋️')
  })

  it('cancelled以外の最初の予定の絵文字を使う', () => {
    const schedules = [
      { id: '1', userId: 'u', scheduledDate: '2026-08-23', title: 'A', emoji: '⚽', status: 'cancelled', templateId: null } as TrainingSchedule,
      { id: '2', userId: 'u', scheduledDate: '2026-08-23', title: 'B', emoji: '🏃', status: 'scheduled', templateId: null } as TrainingSchedule,
    ]
    expect(getScheduleIcon(schedules)).toBe('🏃')
  })

  it('cancelledしかなければデフォルトにフォールバック', () => {
    const schedules = [
      { id: '1', userId: 'u', scheduledDate: '2026-08-23', title: 'A', emoji: '⚽', status: 'cancelled', templateId: null } as TrainingSchedule,
    ]
    expect(getScheduleIcon(schedules)).toBe('🏋️')
  })

  // 回帰テスト（2026年8月21日修正）：completeScheduleForDateによりトレーニング実績
  // 保存時にstatusがscheduled→completedへ自動変更されるため、対象をscheduled限定に
  // していた旧実装ではcompleted行が見つからずデフォルト🏋️に常時フォールバックする
  // バグがあった。cancelled以外を対象にする現行実装でcompletedのカスタム絵文字が
  // 維持されることを確認する。
  it('completedの予定でもカスタム絵文字を維持する（2026年8月21日修正の回帰テスト）', () => {
    const schedules = [
      { id: '1', userId: 'u', scheduledDate: '2026-08-23', title: 'A', emoji: '⚽', status: 'completed', templateId: null } as TrainingSchedule,
    ]
    expect(getScheduleIcon(schedules)).toBe('⚽')
  })

  it('scheduled/completed混在時もcancelledのみ除外し最初の非cancelledを使う', () => {
    const schedules = [
      { id: '1', userId: 'u', scheduledDate: '2026-08-23', title: 'A', emoji: '🚫', status: 'cancelled', templateId: null } as TrainingSchedule,
      { id: '2', userId: 'u', scheduledDate: '2026-08-23', title: 'B', emoji: '✅', status: 'completed', templateId: null } as TrainingSchedule,
      { id: '3', userId: 'u', scheduledDate: '2026-08-23', title: 'C', emoji: '🏋️', status: 'scheduled', templateId: null } as TrainingSchedule,
    ]
    expect(getScheduleIcon(schedules)).toBe('✅')
  })
})

describe('buildActivityByDate', () => {
  it('cancelled以外の予定がある日はworkoutを含む', () => {
    const schedulesByDate = new Map([
      ['2026-08-23', [{ id: '1', userId: 'u', scheduledDate: '2026-08-23', title: 'A', emoji: '🏋️', status: 'scheduled', templateId: null } as TrainingSchedule]],
    ])
    const result = buildActivityByDate(schedulesByDate, new Map())
    expect(result.get('2026-08-23')?.has('workout')).toBe(true)
  })

  it('cancelledのみの日はworkoutを含まない', () => {
    const schedulesByDate = new Map([
      ['2026-08-23', [{ id: '1', userId: 'u', scheduledDate: '2026-08-23', title: 'A', emoji: '🏋️', status: 'cancelled', templateId: null } as TrainingSchedule]],
    ])
    const result = buildActivityByDate(schedulesByDate, new Map())
    expect(result.has('2026-08-23')).toBe(false)
  })

  it('サッカーログがある日はsoccerを含む', () => {
    const soccerLogsByDate = new Map([['2026-08-23', [{ date: '2026-08-23', activityType: '練習' } as SoccerLog]]])
    const result = buildActivityByDate(new Map(), soccerLogsByDate)
    expect(result.get('2026-08-23')?.has('soccer')).toBe(true)
  })

  it('cancelledと非cancelledが混在する日は非cancelledの存在だけでworkoutを含む', () => {
    const schedulesByDate = new Map([
      [
        '2026-08-23',
        [
          { id: '1', userId: 'u', scheduledDate: '2026-08-23', title: 'A', emoji: '🚫', status: 'cancelled', templateId: null } as TrainingSchedule,
          { id: '2', userId: 'u', scheduledDate: '2026-08-23', title: 'B', emoji: '🏋️', status: 'scheduled', templateId: null } as TrainingSchedule,
        ],
      ],
    ])
    const result = buildActivityByDate(schedulesByDate, new Map())
    expect(result.get('2026-08-23')?.has('workout')).toBe(true)
  })

  it('サッカーログが空配列の日はsoccerを含まない', () => {
    const soccerLogsByDate = new Map([['2026-08-23', [] as SoccerLog[]]])
    const result = buildActivityByDate(new Map(), soccerLogsByDate)
    expect(result.has('2026-08-23')).toBe(false)
  })

  it('Apple Watchワークアウトがある日はappleWorkoutを含む（2026年8月27日追加）', () => {
    const workoutsByDate = new Map([['2026-08-23', [{ activityType: 'running', startTime: '2026-08-23T10:00:00+09:00', isPrimary: true } as Workout]]])
    const result = buildActivityByDate(new Map(), new Map(), workoutsByDate)
    expect(result.get('2026-08-23')?.has('appleWorkout')).toBe(true)
  })

  it('workoutsByDate省略時は既存呼び出しと同じ結果になる（後方互換）', () => {
    const schedulesByDate = new Map([
      ['2026-08-23', [{ id: '1', userId: 'u', scheduledDate: '2026-08-23', title: 'A', emoji: '🏋️', status: 'scheduled', templateId: null } as TrainingSchedule]],
    ])
    const result = buildActivityByDate(schedulesByDate, new Map())
    expect(result.get('2026-08-23')?.has('workout')).toBe(true)
    expect(result.get('2026-08-23')?.has('appleWorkout')).toBe(false)
  })
})

describe('getCalendarCellState', () => {
  it('実績があれば予定の有無に応じてcompleted_planned/completed_unplannedを返す', () => {
    const withSchedule = getCalendarCellState({
      isPast: true,
      hasSchedule: true,
      scheduleIcon: '🏋️',
      hasTrainingLog: true,
      hasSoccerLog: false,
    })
    expect(withSchedule).toEqual([{ type: 'workout', icon: '🏋️', status: 'completed_planned' }])

    const withoutSchedule = getCalendarCellState({
      isPast: true,
      hasSchedule: false,
      scheduleIcon: '🏋️',
      hasTrainingLog: true,
      hasSoccerLog: false,
    })
    expect(withoutSchedule).toEqual([{ type: 'workout', icon: '🏋️', status: 'completed_unplanned' }])
  })

  it('未来日の予定のみならplanned', () => {
    const result = getCalendarCellState({
      isPast: false,
      hasSchedule: true,
      scheduleIcon: '🏋️',
      hasTrainingLog: false,
      hasSoccerLog: false,
    })
    expect(result).toEqual([{ type: 'workout', icon: '🏋️', status: 'planned' }])
  })

  it('未達成の過去予定（missed）は何も表示しない', () => {
    const result = getCalendarCellState({
      isPast: true,
      hasSchedule: true,
      scheduleIcon: '🏋️',
      hasTrainingLog: false,
      hasSoccerLog: false,
    })
    expect(result).toEqual([])
  })

  it('サッカーログがあればworkoutと独立してsoccerアイテムが追加される', () => {
    const result = getCalendarCellState({
      isPast: true,
      hasSchedule: false,
      scheduleIcon: '🏋️',
      hasTrainingLog: false,
      hasSoccerLog: true,
    })
    expect(result).toEqual([{ type: 'soccer', icon: '⚽', status: 'completed_unplanned' }])
  })

  it('Apple Watchワークアウトがあれば常にcompleted_unplannedのappleWorkoutアイテムが追加される（2026年8月27日追加）', () => {
    const result = getCalendarCellState({
      isPast: false,
      hasSchedule: false,
      scheduleIcon: '🏋️',
      hasTrainingLog: false,
      hasSoccerLog: false,
      hasAppleWorkout: true,
    })
    expect(result).toEqual([{ type: 'appleWorkout', icon: '🏃', status: 'completed_unplanned' }])
  })

  it('hasAppleWorkout省略時は既存呼び出しと同じ結果になる（後方互換）', () => {
    const result = getCalendarCellState({
      isPast: true,
      hasSchedule: false,
      scheduleIcon: '🏋️',
      hasTrainingLog: false,
      hasSoccerLog: false,
    })
    expect(result).toEqual([])
  })
})

describe('formatTrainingLogItem', () => {
  it('セットが無ければ「記録なし」', () => {
    const exercise: TrainingLogExercise = { exerciseId: 'ex-1', orderIndex: 0, sets: [] }
    expect(formatTrainingLogItem(exercise)).toBe('不明な種目（記録なし）')
  })

  it('セット内容を weight×reps 形式で列挙する', () => {
    const exercise: TrainingLogExercise = {
      exerciseId: 'ex-1',
      orderIndex: 0,
      exercise: { name: 'ベンチプレス', bodyPart: '胸', isPreset: true },
      sets: [
        { setNumber: 1, weight: 60, reps: 10, isWarmup: false },
        { setNumber: 2, weight: undefined, reps: undefined, isWarmup: false },
      ],
    }
    expect(formatTrainingLogItem(exercise)).toBe('ベンチプレス 2セット (60kg×10回, -×-)')
  })
})

describe('formatConditionSummary', () => {
  const base: DailyCondition = { date: '2026-08-23', weight: 70.4, sleepHours: 7.2, fatigue: 3 }

  it('局所疲労が「なし」の場合は基本情報のみ', () => {
    expect(formatConditionSummary(base)).toBe('70.4kg / 7.2時間 / 疲労度3/5')
  })

  it('局所疲労があれば部位・度合いを付加する', () => {
    const condition: DailyCondition = { ...base, muscleSorenessLevel: 'severe', muscleSorenessLocation: 'calf_r' }
    expect(formatConditionSummary(condition)).toBe('70.4kg / 7.2時間 / 疲労度3/5 / 局所疲労: 右ふくらはぎ（強い張り（要注意））')
  })
})

describe('getMealTypeLabel', () => {
  it('各食事タイプの日本語ラベルを返す', () => {
    expect(getMealTypeLabel('breakfast')).toBe('朝食')
    expect(getMealTypeLabel('lunch')).toBe('昼食')
    expect(getMealTypeLabel('dinner')).toBe('夕食')
    expect(getMealTypeLabel('snack')).toBe('間食')
    expect(getMealTypeLabel('other')).toBe('その他')
  })
})
