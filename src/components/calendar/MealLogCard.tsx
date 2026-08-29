import type { Dispatch, SetStateAction } from 'react'
import { deleteMealLogRemote, fetchMealLogs } from '../../api/mealLogs'
import { extractTimeHHMMFromISO } from '../../utils/calendarHelpers'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../hooks/useConfirm'
import type { MealLog } from '../../types'
import './MealLogEntry.css'

// 食事記録画面UI/UX刷新（meal_logエントリカード＋編集モーダル分離、2026年8月29日）：
// 閲覧画面：1 meal_logエントリ＝1カード（食品名一覧＋合計カロリー/PFC＋時刻のみ、
// 入力欄なし）。削除ボタンは、TrainingExerciseCard.tsx・ExercisePicker.tsxが既に
// 採用している「leafコンポーネント自身がconfirm+API呼び出しを完結させる」
// パターンを踏襲する（MealSummary側は表示専用に留める）。

type MealLogCardProps = {
  mealLog: MealLog
  setMealLogs: Dispatch<SetStateAction<MealLog[]>>
  onEdit: () => void
}

export function MealLogCard({ mealLog, setMealLogs, onEdit }: MealLogCardProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()

  const handleDelete = async () => {
    if (!mealLog.id) {
      return
    }

    const foodsSummary = mealLog.foods.length > 0 ? mealLog.foods.join('・') : '記録なし'
    const confirmed = await confirm(`${mealLog.date}の食事記録（${foodsSummary}）を削除しますか？`)
    if (!confirmed) {
      return
    }

    try {
      await deleteMealLogRemote(mealLog.id)
      const refreshed = await fetchMealLogs()
      setMealLogs(refreshed)
      showToast('食事記録を削除しました', 'success')
    } catch (error) {
      console.error('Supabaseからの食事記録削除に失敗しました', error)
      showToast('食事記録の削除に失敗しました。もう一度お試しください', 'error')
    }
  }

  return (
    <div className="meal-log-card">
      <div className="meal-log-card__head">
        <span className="meal-log-card__time">{mealLog.mealTime ? extractTimeHHMMFromISO(mealLog.mealTime) : ''}</span>
        <div className="meal-log-card__actions">
          <button type="button" className="calendar-detail__edit-button" onClick={onEdit}>
            編集
          </button>
          <button type="button" className="calendar-detail__delete-button" onClick={handleDelete}>
            削除
          </button>
        </div>
      </div>
      <p className="meal-log-card__foods">{mealLog.foods.length > 0 ? mealLog.foods.join('・') : '記録なし'}</p>
      <p className="meal-log-card__totals">
        {mealLog.calories}kcal / P{mealLog.protein}g F{mealLog.fat}g C{mealLog.carbohydrates}g
      </p>
      {mealLog.notes ? <p className="calendar-detail__description">メモ: {mealLog.notes}</p> : null}
    </div>
  )
}
