import type { Dispatch, SetStateAction } from 'react'
import { deleteSportLog } from '../../api/sportLogs'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../hooks/useConfirm'
import { OTHER_SPORT_TYPE } from '../../utils/sportCalorieHelpers'
import type { SportLog } from '../../types'

// スポーツ記録機能（Tier 4-2：競技の拡張、2026年9月12日追加修正：1日複数件
// 対応）：MealLogCard.tsxと同じ「leafコンポーネント自身がconfirm+API呼び出しを
// 完結させる」削除パターン（TrainingExerciseCard.tsx・ExercisePicker.tsxも
// 同様）。sport_logsはmeal_logsと異なり日付範囲フェッチのローカルstate
// （MonthlyCalendar.tsxのsportLogs）のため、削除後は全件再取得ではなく
// setSportLogsでローカル配列から該当idを除去するだけでよい
// （旧SportLogForm.removeSportLogと同じ更新方式）。

type SportLogCardProps = {
  sportLog: SportLog
  setSportLogs: Dispatch<SetStateAction<SportLog[]>>
  onEdit: () => void
}

export function SportLogCard({ sportLog, setSportLogs, onEdit }: SportLogCardProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()

  const label = sportLog.sportType === OTHER_SPORT_TYPE ? sportLog.customSportName ?? OTHER_SPORT_TYPE : sportLog.sportType

  const handleDelete = async () => {
    if (!sportLog.id) {
      return
    }

    const confirmed = await confirm(`${sportLog.date}のスポーツ記録（${label}）を削除しますか？`)
    if (!confirmed) {
      return
    }

    try {
      await deleteSportLog(sportLog.id)
      setSportLogs((current) => current.filter((log) => log.id !== sportLog.id))
      showToast('スポーツ記録を削除しました', 'success')
    } catch (error) {
      console.error('Supabaseからのスポーツ記録削除に失敗しました', error)
      showToast('削除に失敗しました。もう一度お試しください', 'error')
    }
  }

  return (
    <div className="calendar-detail__log-item">
      <div className="calendar-detail__log-head">
        <span>
          🏆 {label}
          {` / ${sportLog.durationMinutes}分`}
          {sportLog.rpe !== undefined ? ` / RPE${sportLog.rpe}` : ''}
          {sportLog.caloriesBurned !== undefined ? ` / ${sportLog.caloriesBurned}kcal` : ''}
        </span>
        <div className="calendar-detail__condition-actions">
          <button type="button" className="calendar-detail__edit-button" onClick={onEdit}>
            編集
          </button>
          <button type="button" className="calendar-detail__delete-button" onClick={handleDelete}>
            削除
          </button>
        </div>
      </div>
      {sportLog.resultNote ? <p className="calendar-detail__description">スコア・結果: {sportLog.resultNote}</p> : null}
      {sportLog.notes ? <p className="calendar-detail__description">メモ: {sportLog.notes}</p> : null}
    </div>
  )
}
