import './AiCommentCard.css'

// AIコンディショニングアドバイザー（設定画面拡張Phase 3、2026年8月28日。
// 2026年8月29日、AIコメント生成タイミング見直しに伴いplaceholderText propを追加）：
// DailyReportModal.tsx・ConditionForm.tsxで共有する表示専用カード。
// ai_commentがあれば内容を表示、生成中ならスケルトン、それ以外でplaceholderText
// が指定されていればその文言（＋onRegenerateがあれば再生成ボタン）、
// どちらも無ければ「コメントを生成できませんでした」（＋再生成ボタン）、
// 全てfalsyなら何も描画しない。
//
// 手動再生成ボタン（2026年8月28日新設、2026年8月29日に対象日をisToday限定から
// 任意の日付に拡張）：onRegenerateはDailyReportModal.tsxのみが渡す
// （ConditionForm.tsxは未指定のまま＝ボタン非表示、既存の挙動を維持）。
// isGenerating中は二重送信防止のためボタンを出さない。
//
// placeholderText（2026年8月29日新設）：「本日分はまだ生成されていない
// （cronは翌日実行のため、これは想定内の状態）」を、過去日の生成失敗
// （「コメントを生成できませんでした」）と区別して案内するための文言。
// ConditionForm.tsx・DailyReportModal.tsxの両方が「今日」を選択している場合に
// 渡す（src/utils/dailyCommentHelpers.tsのAI_COMMENT_PENDING_TEXT）。
type AiCommentCardProps = {
  comment?: string
  isGenerating: boolean
  onRegenerate?: () => void
  placeholderText?: string
}

function RegenerateButton({ onRegenerate }: { onRegenerate: () => void }) {
  return (
    <button type="button" className="ai-comment-card__regenerate" onClick={onRegenerate}>
      🔄 コメントを再生成
    </button>
  )
}

export function AiCommentCard({ comment, isGenerating, onRegenerate, placeholderText }: AiCommentCardProps) {
  if (comment) {
    return (
      <div className="ai-comment-card">
        <span className="ai-comment-card__icon" aria-hidden="true">✨</span>
        <div className="ai-comment-card__body">
          <p className="ai-comment-card__text">{comment}</p>
          {onRegenerate && !isGenerating ? <RegenerateButton onRegenerate={onRegenerate} /> : null}
        </div>
      </div>
    )
  }

  if (isGenerating) {
    return (
      <div className="ai-comment-card ai-comment-card--loading">
        <span className="ai-comment-card__icon" aria-hidden="true">✨</span>
        <p className="ai-comment-card__text">
          コンディショニングを分析中
          <span className="ai-comment-card__spinner" aria-hidden="true" />
        </p>
      </div>
    )
  }

  if (placeholderText) {
    return (
      <div className="ai-comment-card">
        <span className="ai-comment-card__icon" aria-hidden="true">✨</span>
        <div className="ai-comment-card__body">
          <p className="ai-comment-card__text">{placeholderText}</p>
          {onRegenerate ? <RegenerateButton onRegenerate={onRegenerate} /> : null}
        </div>
      </div>
    )
  }

  if (onRegenerate) {
    return (
      <div className="ai-comment-card">
        <span className="ai-comment-card__icon" aria-hidden="true">✨</span>
        <div className="ai-comment-card__body">
          <p className="ai-comment-card__text">コメントを生成できませんでした</p>
          <RegenerateButton onRegenerate={onRegenerate} />
        </div>
      </div>
    )
  }

  return null
}
