import './AiCommentCard.css'

// AIコンディショニングアドバイザー（設定画面拡張Phase 3、2026年8月28日。
// 2026年8月29日、AIコメント生成タイミング見直しに伴いplaceholderText propを追加）：
// DailyReportModal.tsx・ConditionForm.tsxで共有する表示専用カード。
// ai_commentがあれば内容を表示、生成中ならスケルトン、それ以外でplaceholderText
// が指定されていればその文言（＋onRegenerateがあれば再生成ボタン）、
// どちらも無ければ「コメントを生成できませんでした」（＋再生成ボタン）、
// 全てfalsyなら何も描画しない。
//
// 手動生成/再生成ボタン（2026年8月28日新設、2026年8月29日に対象日を任意の日付に
// 拡張、2026年9月3日に体調記録が無い日でも押せるよう拡張）：onRegenerateは
// DailyReportModal.tsxが渡す。isGenerating中は二重送信防止のためボタンを出さない。
// ボタン文言は、既にコメントがあるときは「🔄 コメントを再生成」、まだ無いときは
// 「コメントを生成」に切り替える。
//
// placeholderText（2026年8月29日新設）：「本日分はまだ生成されていない
// （cronは翌日実行のため、これは想定内の状態）」を、過去日の未生成と区別して
// 案内するための文言。DailyReportModal.tsxが「今日」を選択していてまだコメントが
// 無い場合に渡す（src/utils/dailyCommentHelpers.tsのAI_COMMENT_PENDING_TEXT）。
type AiCommentCardProps = {
  comment?: string
  isGenerating: boolean
  onRegenerate?: () => void
  placeholderText?: string
}

function GenerateButton({ onClick, hasComment }: { onClick: () => void; hasComment: boolean }) {
  return (
    <button type="button" className="ai-comment-card__regenerate" onClick={onClick}>
      {hasComment ? '🔄 コメントを再生成' : 'コメントを生成'}
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
          {onRegenerate && !isGenerating ? <GenerateButton onClick={onRegenerate} hasComment /> : null}
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
          {onRegenerate ? <GenerateButton onClick={onRegenerate} hasComment={false} /> : null}
        </div>
      </div>
    )
  }

  if (onRegenerate) {
    return (
      <div className="ai-comment-card">
        <span className="ai-comment-card__icon" aria-hidden="true">✨</span>
        <div className="ai-comment-card__body">
          <p className="ai-comment-card__text">まだAI日次コメントは生成されていません</p>
          <GenerateButton onClick={onRegenerate} hasComment={false} />
        </div>
      </div>
    )
  }

  return null
}
