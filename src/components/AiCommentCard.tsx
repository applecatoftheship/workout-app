import './AiCommentCard.css'

// AIコンディショニングアドバイザー（設定画面拡張Phase 3、2026年8月28日）：
// DailyReportModal.tsx・ConditionForm.tsxで共有する表示専用カード。
// ai_commentがあれば内容を表示、本日で未生成中ならスケルトン、過去日で
// ai_commentが無ければ何も描画しない（呼び出し元でcomment/isGeneratingの
// 両方がfalsyな場合は使わない想定だが、念のためこのコンポーネント自身も
// 何も出さないガードを持たせている）。
type AiCommentCardProps = {
  comment?: string
  isGenerating: boolean
}

export function AiCommentCard({ comment, isGenerating }: AiCommentCardProps) {
  if (comment) {
    return (
      <div className="ai-comment-card">
        <span className="ai-comment-card__icon" aria-hidden="true">✨</span>
        <p className="ai-comment-card__text">{comment}</p>
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

  return null
}
