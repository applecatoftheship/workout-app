import { useEffect, useMemo, useState } from 'react'
import { fetchDishesWithDetails } from '../api/dishes'
import { fetchExercises } from '../api/trainingLogs'
import type { Goals } from '../api/goals'
import { withOfflineCache } from '../offline/offlineCache'
import { NUTRIENT_LABELS, recommendDishes, recommendTraining } from '../utils/recommendationHelpers'
import type { DateString, DishWithDetails, ExerciseDefinition, MealLog, TrainingLog } from '../types'
import './RecommendationCard.css'

// おすすめ機能（2026年11月6日）：ホーム画面に、食事・トレーニングの記録から出した
// おすすめの料理と種目を表示する（計算は utils/recommendationHelpers.ts）。
// 料理・種目の一覧は、記録フォームと同じ端末の控え（withOfflineCache）を使うので、
// オフラインでも最後に読み込めた内容で表示できる。

type RecommendationCardProps = {
  mealLogs: MealLog[]
  trainingLogs: TrainingLog[]
  goals: Goals
  /** 目標を読み込めたか。読み込めていないときは料理のおすすめを出さない（仮の初期値で判定しないため） */
  goalsStatus: 'loading' | 'loaded' | 'missing' | 'failed'
  /** 記録一覧を読み込めたか。読み込めていないときは「記録が無い」と判定しない */
  mealLogsStatus: 'loading' | 'loaded' | 'failed'
  trainingLogsStatus: 'loading' | 'loaded' | 'failed'
  todayString: DateString
}

export function RecommendationCard({
  mealLogs,
  trainingLogs,
  goals,
  goalsStatus,
  mealLogsStatus,
  trainingLogsStatus,
  todayString,
}: RecommendationCardProps) {
  const [dishes, setDishes] = useState<DishWithDetails[] | null>(null)
  const [exercises, setExercises] = useState<ExerciseDefinition[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let isMounted = true
    Promise.all([
      withOfflineCache('dishesWithDetails', () => fetchDishesWithDetails()),
      withOfflineCache('exercises', () => fetchExercises()),
    ])
      .then(([loadedDishes, loadedExercises]) => {
        if (isMounted) {
          setDishes(loadedDishes)
          setExercises(loadedExercises)
        }
      })
      .catch((error) => {
        console.error('おすすめ用の料理・種目の一覧を取得できませんでした', error)
        if (isMounted) {
          setLoadFailed(true)
        }
      })
    return () => {
      isMounted = false
    }
  }, [])

  const dishRecommendation = useMemo(
    () => (dishes ? recommendDishes(mealLogs, dishes, goals, todayString) : null),
    [dishes, mealLogs, goals, todayString],
  )
  const trainingRecommendation = useMemo(
    () => (exercises ? recommendTraining(trainingLogs, exercises, todayString) : null),
    [exercises, trainingLogs, todayString],
  )

  return (
    <section className="panel-card recommendation-card" aria-label="おすすめ">
      <h2 className="panel-card__title">おすすめ</h2>
      {loadFailed ? (
        <p className="recommendation-card__note">料理・種目の一覧を読み込めませんでした。通信できるときに開き直してください。</p>
      ) : !dishRecommendation || !trainingRecommendation ? (
        <p className="recommendation-card__note">読み込み中…</p>
      ) : (
        <div className="recommendation-card__body">
          <div className="recommendation-card__block">
            <h3 className="recommendation-card__heading">食事</h3>
            {mealLogsStatus === 'loading' ? (
              <p className="recommendation-card__note">食事の記録を読み込み中…</p>
            ) : mealLogsStatus === 'failed' ? (
              <p className="recommendation-card__note">食事の記録を読み込めなかったため、料理のおすすめは出せません。通信できるときに開き直してください。</p>
            ) : goalsStatus === 'loading' ? (
              <p className="recommendation-card__note">目標を読み込み中…</p>
            ) : goalsStatus === 'failed' ? (
              <p className="recommendation-card__note">目標を読み込めなかったため、料理のおすすめは出せません。通信できるときに開き直してください。</p>
            ) : goalsStatus === 'missing' || dishRecommendation.status === 'noGoals' ? (
              <p className="recommendation-card__note">たんぱく質・脂質・炭水化物の目標が設定されていません。目標を設定するとおすすめの料理を出します。</p>
            ) : dishRecommendation.status === 'noMeals' ? (
              <p className="recommendation-card__note">昨日までの7日間に食事の記録がありません。記録するとおすすめの料理を出します。</p>
            ) : dishRecommendation.status === 'balanced' ? (
              <p className="recommendation-card__note">
                昨日までの7日間（記録{dishRecommendation.recordedDays}日分）のたんぱく質・脂質・炭水化物は、目標を設定したものがどれも目標の9割以上です。
              </p>
            ) : (
              <>
                <p className="recommendation-card__reason">
                  昨日までの7日間の{NUTRIENT_LABELS[dishRecommendation.nutrient]}が1日平均
                  <strong> {Math.round(dishRecommendation.averagePerDay)}g</strong>（目標 {dishRecommendation.goal}g）で不足ぎみです。多く含む料理：
                </p>
                {dishRecommendation.dishes.length === 0 ? (
                  <p className="recommendation-card__note">条件に合う料理が見つかりませんでした。</p>
                ) : (
                  <ul className="recommendation-card__list">
                    {dishRecommendation.dishes.map((dish) => (
                      <li key={dish.id ?? dish.name} className="recommendation-card__item">
                        <span className="recommendation-card__name">
                          {dish.emoji ? `${dish.emoji} ` : ''}
                          {dish.name}
                        </span>
                        <span className="recommendation-card__meta">
                          {Math.round(dish.totalCalories)}kcal・{NUTRIENT_LABELS[dishRecommendation.nutrient]}
                          {Math.round(
                            dishRecommendation.nutrient === 'protein'
                              ? dish.totalProtein
                              : dishRecommendation.nutrient === 'fat'
                                ? dish.totalFat
                                : dish.totalCarbohydrates,
                          )}
                          g
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <div className="recommendation-card__block">
            <h3 className="recommendation-card__heading">トレーニング</h3>
            {trainingLogsStatus === 'loading' ? (
              <p className="recommendation-card__note">トレーニングの記録を読み込み中…</p>
            ) : trainingLogsStatus === 'failed' ? (
              <p className="recommendation-card__note">トレーニングの記録を読み込めなかったため、種目のおすすめは出せません。通信できるときに開き直してください。</p>
            ) : !trainingRecommendation ? null : (
              <>
                <p className="recommendation-card__reason">
                  {trainingRecommendation.daysSince === null
                    ? `${trainingRecommendation.bodyPart}のトレーニングはまだ記録がありません。`
                    : trainingRecommendation.daysSince === 0
                      ? `どの部位も今日トレーニングしています。次は${trainingRecommendation.bodyPart}がおすすめです。`
                      : `${trainingRecommendation.bodyPart}のトレーニングから${trainingRecommendation.daysSince}日空いています。`}
                </p>
                {trainingRecommendation.exercises.length === 0 ? (
                  <p className="recommendation-card__note">この部位の種目が一覧にありません。</p>
                ) : (
                  <ul className="recommendation-card__list">
                    {trainingRecommendation.exercises.map((exercise) => (
                      <li key={exercise.id ?? exercise.name} className="recommendation-card__item">
                        <span className="recommendation-card__name">{exercise.name}</span>
                        {exercise.equipmentType ? <span className="recommendation-card__meta">{exercise.equipmentType}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
