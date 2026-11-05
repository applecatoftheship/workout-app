import type { Goals } from '../api/goals'
import type { BodyPart, DateString, DishWithDetails, ExerciseDefinition, MealLog, TrainingLog } from '../types'

// おすすめ機能（2026年11月6日）：食事・トレーニングの記録から、おすすめの料理と
// トレーニング種目を出す。ルールベースで、DB の変更はしない
// （設計レビュー recommendation-feature-design-review_2026-09-19.md の方針）。
// 料理と食事記録の対応は、料理名（meal_logs.dish_name と dishes.name）の一致で見る。

export type Nutrient = 'protein' | 'fat' | 'carbohydrates'

export const NUTRIENT_LABELS: Record<Nutrient, string> = {
  protein: 'たんぱく質',
  fat: '脂質',
  carbohydrates: '炭水化物',
}

/** 今日より前の何日分の食事を見るか（今日は含めない） */
export const MEAL_LOOKBACK_DAYS = 7
/** 目標に対してこの割合を下回っていたら「不足」とみなす */
export const SHORTAGE_RATIO = 0.9
/** 直近何日に食べた料理をおすすめから外すか（今日を含む） */
export const RECENT_DISH_DAYS = 3
/** おすすめに出す件数 */
export const RECOMMENDATION_COUNT = 3

/** トレーニングのおすすめで見る部位（有酸素・その他は対象外） */
export const TRAINING_BODY_PARTS: BodyPart[] = ['胸', '背', '脚', '肩', '腕', '腹']

function shiftDate(date: DateString, days: number): DateString {
  const [year, month, day] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return shifted.toISOString().slice(0, 10) as DateString
}

function daysBetween(from: DateString, to: DateString): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

export type DishRecommendation =
  | { status: 'noGoals' }
  | { status: 'noMeals' }
  | { status: 'balanced'; recordedDays: number }
  | {
      status: 'shortage'
      nutrient: Nutrient
      /** 記録のある日の1日平均 */
      averagePerDay: number
      goal: number
      recordedDays: number
      dishes: DishWithDetails[]
    }

function goalFor(goals: Goals, nutrient: Nutrient): number {
  if (nutrient === 'protein') return goals.dailyProteinGoal
  if (nutrient === 'fat') return goals.dailyFatGoal
  return goals.dailyCarbohydrateGoal
}

function dishNutrient(dish: DishWithDetails, nutrient: Nutrient): number {
  if (nutrient === 'protein') return dish.totalProtein
  if (nutrient === 'fat') return dish.totalFat
  return dish.totalCarbohydrates
}

/**
 * 今日より前の7日間のうち食事の記録がある日について（今日はまだ食事の途中なので数えない）、1日平均のたんぱく質・脂質・炭水化物を
 * 目標と比べ、いちばん目標に届いていない栄養素を選ぶ（目標の90%以上なら「目標どおり」）。
 * その栄養素を 100kcal あたり多く含む料理を、直近3日に食べた料理を除いて上から出す。
 * 今日の残りカロリー（目標−今日の摂取）が150kcalより多ければ、それ以下の料理に絞る
 * （絞ると1件も残らない場合は絞らない）。
 */
export function recommendDishes(
  mealLogs: MealLog[],
  dishes: DishWithDetails[],
  goals: Goals,
  today: DateString,
): DishRecommendation {
  const nutrients: Nutrient[] = ['protein', 'fat', 'carbohydrates']
  const targets = nutrients.filter((nutrient) => goalFor(goals, nutrient) > 0)
  if (targets.length === 0) {
    return { status: 'noGoals' }
  }

  const from = shiftDate(today, -MEAL_LOOKBACK_DAYS)
  const recentMeals = mealLogs.filter((log) => log.date >= from && log.date < today)
  const recordedDays = new Set(recentMeals.map((log) => log.date)).size
  if (recordedDays === 0) {
    return { status: 'noMeals' }
  }

  const shortages = targets
    .map((nutrient) => {
      const total = recentMeals.reduce((sum, log) => sum + log[nutrient], 0)
      const averagePerDay = total / recordedDays
      return { nutrient, averagePerDay, goal: goalFor(goals, nutrient), ratio: averagePerDay / goalFor(goals, nutrient) }
    })
    .sort((a, b) => a.ratio - b.ratio)

  const worst = shortages[0]
  if (!worst || worst.ratio >= SHORTAGE_RATIO) {
    return { status: 'balanced', recordedDays }
  }

  const recentDishFrom = shiftDate(today, -(RECENT_DISH_DAYS - 1))
  const recentlyEaten = new Set(
    mealLogs
      .filter((log) => log.date >= recentDishFrom && log.date <= today && log.dishName)
      .map((log) => (log.dishName as string).trim()),
  )

  const candidates = dishes
    .filter((dish) => dish.totalCalories > 0 && !recentlyEaten.has(dish.name.trim()))
    .map((dish) => ({ dish, density: dishNutrient(dish, worst.nutrient) / dish.totalCalories }))
    .filter((candidate) => candidate.density > 0)

  const todayCalories = mealLogs.filter((log) => log.date === today).reduce((sum, log) => sum + log.calories, 0)
  const remaining = goals.dailyCalorieGoal - todayCalories
  const withinRemaining = remaining > 150 ? candidates.filter(({ dish }) => dish.totalCalories <= remaining) : []
  const pool = withinRemaining.length > 0 ? withinRemaining : candidates

  const picked = [...pool]
    .sort((a, b) => b.density - a.density || a.dish.name.localeCompare(b.dish.name, 'ja'))
    .slice(0, RECOMMENDATION_COUNT)
    .map(({ dish }) => dish)

  return {
    status: 'shortage',
    nutrient: worst.nutrient,
    averagePerDay: worst.averagePerDay,
    goal: worst.goal,
    recordedDays,
    dishes: picked,
  }
}

export type TrainingRecommendation = {
  bodyPart: BodyPart
  /** 最後に記録した日から今日までの日数。記録が無ければ null */
  daysSince: number | null
  exercises: ExerciseDefinition[]
}

/**
 * 部位ごとに最後にトレーニングした日（今日以前でセットが1つ以上ある種目）を調べ、
 * いちばん間が空いている部位（記録の無い部位を最優先）を選ぶ。種目は、その部位で
 * 過去にやったことがあるものを最近やった順に、足りなければ種目一覧から名前順に補う。
 */
export function recommendTraining(
  trainingLogs: TrainingLog[],
  exercises: ExerciseDefinition[],
  today: DateString,
): TrainingRecommendation | null {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  const lastDateByPart = new Map<BodyPart, DateString>()
  const lastDateByExercise = new Map<string, DateString>()

  for (const log of trainingLogs) {
    if (log.date > today) continue
    for (const item of log.exercises) {
      if (item.sets.length === 0) continue
      const definition = item.exercise ?? exerciseById.get(item.exerciseId)
      if (!definition) continue
      const previousPart = lastDateByPart.get(definition.bodyPart)
      if (!previousPart || log.date > previousPart) lastDateByPart.set(definition.bodyPart, log.date)
      const previousExercise = lastDateByExercise.get(item.exerciseId)
      if (!previousExercise || log.date > previousExercise) lastDateByExercise.set(item.exerciseId, log.date)
    }
  }

  const ranked = TRAINING_BODY_PARTS.map((bodyPart, order) => {
    const last = lastDateByPart.get(bodyPart)
    return { bodyPart, order, daysSince: last ? daysBetween(last, today) : null }
  }).sort((a, b) => {
    const aValue = a.daysSince ?? Number.POSITIVE_INFINITY
    const bValue = b.daysSince ?? Number.POSITIVE_INFINITY
    return bValue - aValue || a.order - b.order
  })

  const target = ranked[0]
  if (!target) {
    return null
  }

  const partExercises = exercises.filter((exercise) => exercise.bodyPart === target.bodyPart && exercise.id)
  const done = partExercises
    .filter((exercise) => lastDateByExercise.has(exercise.id as string))
    .sort((a, b) => (lastDateByExercise.get(b.id as string) as string).localeCompare(lastDateByExercise.get(a.id as string) as string))
  const notDone = partExercises
    .filter((exercise) => !lastDateByExercise.has(exercise.id as string))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  return {
    bodyPart: target.bodyPart,
    daysSince: target.daysSince,
    exercises: [...done, ...notDone].slice(0, RECOMMENDATION_COUNT),
  }
}
