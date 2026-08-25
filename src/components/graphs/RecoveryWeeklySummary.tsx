type RecoveryWeeklySummaryProps = {
  achievedCount: number
  totalCount: number
}

// リカバリー窓機能（スプリント4 Phase 2、2026年8月21日）：今週のリカバリー窓
// 達成率サマリー。TrainingChart.tsx（実施回数・達成率のサマリーカード）と同じ
// chart-card__header + progress-meterの視覚パターンを踏襲する。
export function RecoveryWeeklySummary({ achievedCount, totalCount }: RecoveryWeeklySummaryProps) {
  const rate = totalCount > 0 ? Math.round((achievedCount / totalCount) * 100) : 0

  // UI/UXレビュー修正 項目4（2026年8月25日）：対象0件（totalCount===0）の週に
  // 「0/0回」と表示すると、達成率0%であるかのように誤解を招く。対象が
  // そもそも存在しない場合は数値・達成率バーを表示せず、下の空状態文言のみ
  // 表示する。
  return (
    <div className="progress-graph__chart-wrapper">
      <div className="chart-card__header">
        <h3 className="chart-card__title">今週のリカバリー窓達成率</h3>
        {totalCount > 0 ? (
          <div className="chart-card__value-group">
            <span className="chart-card__value metric-value">
              {achievedCount}
              <span className="chart-card__value-unit">/{totalCount}回</span>
            </span>
          </div>
        ) : null}
      </div>

      {totalCount > 0 ? (
        <div className="progress-meter" aria-label="リカバリー窓達成率">
          <div className="progress-meter__fill" style={{ width: `${rate}%` }} />
        </div>
      ) : (
        <p className="progress-graph__empty">今週はまだ終了時刻付きの運動記録がありません</p>
      )}
    </div>
  )
}
