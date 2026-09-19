import { useState } from 'react'
import type { PersonalBestEntry } from '../../utils/oneRepMaxHelpers'

type PersonalBestListProps = {
  // calculatePersonalBestsが既に達成日の新しい順（降順）にソート済みのものを渡す想定。
  personalBests: PersonalBestEntry[]
}

const INITIAL_VISIBLE_COUNT = 8

// 自己ベスト（PR）一覧（指示書「推定1RM・PR・総挙上重量のビジュアル化」2026-09-15）：
// 種目×現在の推定1RM×達成日の一覧。期間タブには連動させず、常に全履歴からの
// 自己ベストを表示する（ProgressGraph.tsx側でcalculatePersonalBests(trainingLogs)を
// 期間フィルタなしで呼んだ結果を渡してもらう想定）。「種目数が多い場合は直近で
// 更新されたものを優先的に見せる」という指示に対し、ソート自体は
// calculatePersonalBests側で達成日の降順に確定済みのため、ここでは表示件数の
// 折りたたみ（初期8件＋「すべて表示」）のみを担当する。
export function PersonalBestList({ personalBests }: PersonalBestListProps) {
  const [showAll, setShowAll] = useState(false)

  if (personalBests.length === 0) {
    return (
      <div className="progress-graph__chart-wrapper">
        <h3 className="chart-card__title">自己ベスト（PR）</h3>
        <p className="progress-graph__empty">まだ自己ベストの記録がありません</p>
      </div>
    )
  }

  const visibleBests = showAll ? personalBests : personalBests.slice(0, INITIAL_VISIBLE_COUNT)

  return (
    <div className="progress-graph__chart-wrapper">
      <h3 className="chart-card__title">自己ベスト（PR）</h3>
      <div className="personal-best-list">
        {visibleBests.map((entry) => (
          <div key={entry.exerciseId} className="personal-best-list__row">
            <span className="personal-best-list__name">{entry.exerciseName}</span>
            <span className="personal-best-list__value metric-value">{entry.best1RM}kg</span>
            <span className="personal-best-list__date">{entry.achievedDate.replace(/-/g, '/')}</span>
          </div>
        ))}
      </div>
      {personalBests.length > INITIAL_VISIBLE_COUNT ? (
        <button type="button" className="personal-best-list__toggle" onClick={() => setShowAll((current) => !current)}>
          {showAll ? '表示を減らす' : `すべて表示（${personalBests.length}件）`}
        </button>
      ) : null}
    </div>
  )
}
