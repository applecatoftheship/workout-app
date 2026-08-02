import type {
  AppDataModel,
  DailyCondition,
  DailyProgram,
  MealLog,
  MonthlyProgram,
  ProgressRecord,
  TrainingLog,
} from './types'

const dailyPrograms: DailyProgram[] = [
  {
    date: '2026-08-01',
    type: 'strength',
    title: '上半身強化',
    description: '胸・背中・肩を中心にまとめて取り組む',
    exercises: [
      {
        name: 'ベンチプレス',
        sets: 3,
        targetReps: '8-10',
        targetWeight: '60kg',
        restSeconds: 90,
        notes: 'フォームを意識する',
      },
      {
        name: 'ラットプルダウン',
        sets: 3,
        targetReps: '10-12',
        targetWeight: '40kg',
        restSeconds: 75,
      },
    ],
    cardio: {
      durationMinutes: 20,
      intensity: 'moderate',
      notes: '軽めのジョグ',
    },
    notes: '疲労が高めなので負荷は控えめに',
  },
  {
    date: '2026-08-03',
    type: 'cardio',
    title: '有酸素中心',
    description: '心肺を高めるための低強度ランニング',
    exercises: [],
    cardio: {
      durationMinutes: 30,
      intensity: 'easy',
      notes: '会話できるペース',
    },
  },
  {
    date: '2026-08-05',
    type: 'mobility',
    title: '可動域改善',
    description: '肩・股関節・背中の柔軟性を高める',
    exercises: [
      {
        name: 'スクワット',
        sets: 3,
        targetReps: '12',
        targetWeight: 'Bodyweight',
        restSeconds: 60,
      },
    ],
    notes: '回復日として軽めに行う',
  },
]

const monthlyPrograms: MonthlyProgram[] = [
  {
    year: 2026,
    month: 8,
    title: '8月: 筋力増量プログラム',
    description: '夏の間に基礎筋力を上げるための月間プラン',
    goals: ['筋力向上', '体脂肪率の維持', '睡眠の改善'],
    dailyPrograms,
  },
  {
    year: 2026,
    month: 9,
    title: '9月: 体脂肪改善プログラム',
    description: '有酸素と筋トレをバランスよく組み合わせる',
    goals: ['体脂肪率の改善', '持久力向上'],
    dailyPrograms: [],
  },
  {
    year: 2026,
    month: 10,
    title: '10月: 体調維持プログラム',
    description: '秋に向けて疲れにくい身体づくりを行う',
    goals: ['回復力向上', '継続しやすい習慣化'],
    dailyPrograms: [],
  },
]

const trainingLogs: TrainingLog[] = [
  {
    date: '2026-08-01',
    exercises: [
      {
        name: 'ベンチプレス',
        sets: 3,
        targetReps: '8-10',
        targetWeight: '60kg',
        restSeconds: 90,
      },
    ],
    cardio: {
      durationMinutes: 20,
      intensity: 'moderate',
    },
    notes: '無事完了',
    completed: true,
  },
]

const mealLogs: MealLog[] = [
  {
    date: '2026-08-01',
    mealType: 'dinner',
    foods: ['鶏むね肉', 'ご飯', '焼き野菜'],
    calories: 680,
    protein: 48,
    fat: 18,
    carbohydrates: 72,
    notes: '高たんぱくを意識',
  },
]

const dailyConditions: DailyCondition[] = [
  {
    date: '2026-08-01',
    weight: 64.8,
    sleepHours: 6.5,
    fatigue: 3,
    notes: '少し疲れ気味',
  },
]

const progressRecords: ProgressRecord[] = [
  {
    date: '2026-08-01',
    weight: 64.8,
    bodyFat: 17.2,
    waist: 78,
    notes: '順調に推移',
  },
]

export const mockAppData: AppDataModel = {
  monthlyPrograms,
  trainingLogs,
  mealLogs,
  dailyConditions,
  progressRecords,
}
