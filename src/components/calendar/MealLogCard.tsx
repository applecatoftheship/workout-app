import type { Dispatch, SetStateAction } from 'react'
import { deleteMealLogRemote, fetchMealLogs } from '../../api/mealLogs'
import { extractTimeHHMMFromISO } from '../../utils/calendarHelpers'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../hooks/useConfirm'
import { useAuth } from '../../hooks/useAuth'
import { enqueueOutbox, hasPendingOutboxEntryFor } from '../../offline/outbox'
import { updateOfflineCache, withOfflineCache } from '../../offline/offlineCache'
import { applyMealDelete } from '../../offline/offlineEdits'
import { getNavigatorOnline, isNetworkError } from '../../utils/networkErrors'
import type { MealLog } from '../../types'
import { SwipeableRow } from '../common/SwipeableRow'
import './MealLogEntry.css'
import './CalendarForms.css'

// 食事記録画面UI/UX刷新（meal_logエントリカード＋編集モーダル分離、2026年8月29日）：
// 閲覧画面：1 meal_logエントリ＝1カード（食品名一覧＋合計カロリー/PFC＋時刻のみ、
// 入力欄なし）。削除ボタンは、TrainingExerciseCard.tsx・ExercisePicker.tsxが既に
// 採用している「leafコンポーネント自身がconfirm+API呼び出しを完結させる」
// パターンを踏襲する（MealSummary側は表示専用に留める）。
//
// 記録リストのスワイプ操作化（2026年10月31日）：常時表示の「編集」「削除」ボタンを撤去し、
// カードを左スワイプすると「編集」「削除」が現れる方式に変更した（common/SwipeableRow.tsx）。
// 削除は従来どおり useConfirm の確認を経てから実行する。

type MealLogCardProps = {
  mealLog: MealLog
  setMealLogs: Dispatch<SetStateAction<MealLog[]>>
  onEdit: () => void
}

export function MealLogCard({ mealLog, setMealLogs, onEdit }: MealLogCardProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const { user } = useAuth()

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

    // オフラインでの削除（2026年11月6日）：通信できないときは削除の操作を端末に保存し、
    // 一覧からは先に消す。オンラインに戻ると自動で送信する。
    const mealLogId = mealLog.id
    // 同じ記録への未送信の操作があるか（あれば順番待ちに回す。トーストの理由の出し分けにも使う）
    const queuedBehindPending = getNavigatorOnline() && hasPendingOutboxEntryFor(`meal:${mealLogId}`, user?.id)
    const deleteOnDevice = () => {
      const saved =
        !!user &&
        enqueueOutbox({
          kind: 'mealDelete',
          id: crypto.randomUUID(),
          userId: user.id,
          createdAt: new Date().toISOString(),
          attempts: 0,
          label: `${mealLog.date.slice(5).replace('-', '/')} ${foodsSummary} を削除`,
          mealLogId,
        })
      if (!saved) {
        showToast(
          user ? '食事記録を削除できませんでした。ストレージの設定を確認してください' : 'ログイン情報を確認できないため削除できませんでした',
          'error',
        )
        return
      }
      setMealLogs((current) => applyMealDelete(current, mealLogId))
      updateOfflineCache<MealLog[]>('mealLogs', (current) => applyMealDelete(current, mealLogId))
      showToast(queuedBehindPending ? '同じ記録の未送信の操作があるため端末に保存しました。順番に自動で反映します' : '通信できないため端末に保存しました。オンラインに戻ると自動で反映します', 'info')
    }

    if (!getNavigatorOnline() || queuedBehindPending) {
      deleteOnDevice()
      return
    }

    try {
      try {
        await deleteMealLogRemote(mealLogId)
      } catch (error) {
        if (isNetworkError(error)) {
          console.error('通信エラーのため食事記録の削除を端末に保存します', error)
          deleteOnDevice()
          return
        }
        throw error
      }
      // 削除した記録は、取り直しが失敗しても一覧・控えに残らないよう先に除く
      setMealLogs((current) => applyMealDelete(current, mealLogId))
      updateOfflineCache<MealLog[]>('mealLogs', (current) => applyMealDelete(current, mealLogId))
      // 端末の控えも最新にする（後でオフラインで開いたときに、削除・編集済みの記録が古いまま出ないように。2026年11月6日）
      const refreshed = await withOfflineCache('mealLogs', () => fetchMealLogs())
      setMealLogs(refreshed)
      showToast('食事記録を削除しました', 'success')
    } catch (error) {
      console.error('Supabaseからの食事記録削除に失敗しました', error)
      showToast('食事記録の削除に失敗しました。もう一度お試しください', 'error')
    }
  }

  return (
    <SwipeableRow
      actions={[
        { key: 'edit', label: '編集', tone: 'accent', onClick: onEdit },
        { key: 'delete', label: '削除', tone: 'danger', onClick: handleDelete },
      ]}
    >
      <div className="meal-log-card">
        <div className="meal-log-card__head">
          <span className="meal-log-card__time">{mealLog.mealTime ? extractTimeHHMMFromISO(mealLog.mealTime) : ''}</span>
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
    </SwipeableRow>
  )
}
