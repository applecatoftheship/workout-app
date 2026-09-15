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

    // 料理名の表示機能（2026年9月15日追加）：削除確認ダイアログの対象特定文言は
    // 料理名があればそちらを優先する（CLAUDE.mdの「削除確認ダイアログの文言改善」
    // 方針＝対象を特定できる文言、を料理名がある場合はより簡潔に満たせるため）。
    const foodsSummary = mealLog.dishName || (mealLog.foods.length > 0 ? mealLog.foods.join('・') : '記録なし')
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
      {/* 料理名の表示機能（2026年9月15日追加）：料理名があれば主表示、食材の内訳
          （既存の・区切り表示）はその下に副次表示する。料理名が無い場合は
          従来通り食材の内訳のみを主表示のまま維持する（リグレッションなし）。 */}
      {mealLog.dishName ? (
        <>
          <p className="meal-log-card__dish-name">{mealLog.dishName}</p>
          <p className="meal-log-card__foods meal-log-card__foods--secondary">
            {mealLog.foods.length > 0 ? mealLog.foods.join('・') : '記録なし'}
          </p>
        </>
      ) : (
        <p className="meal-log-card__foods">{mealLog.foods.length > 0 ? mealLog.foods.join('・') : '記録なし'}</p>
      )}
      <p className="meal-log-card__totals">
        {mealLog.calories}kcal / P{mealLog.protein}g F{mealLog.fat}g C{mealLog.carbohydrates}g
      </p>
      {mealLog.notes ? <p className="calendar-detail__description">メモ: {mealLog.notes}</p> : null}
    </div>
  )
}
