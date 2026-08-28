import './AiCommentCard.css'

// AIコンディショニングアドバイザー（設定画面拡張Phase 3、2026年8月28日）：
// DailyReportModal.tsx・ConditionForm.tsxで共有する表示専用カード。
// ai_commentがあれば内容を表示、本日で未生成中ならスケルトン、過去日で
// ai_commentが無ければ何も描画しない（呼び出し元でcomment/isGeneratingの
// 両方がfalsyな場合は使わない想定だが、念のためこのコンポーネント自身も
// 何も出さないガードを持たせている）。
//
// 手動再生成ボタン（2026年8月28日、食事データ追加対応）：onRegenerateは
// DailyReportModal.tsxのみが渡す（ConditionForm.tsxは未指定のまま＝ボタン
// 非表示、既存の挙動を維持）。isGenerating中は二重送信防止のためボタンを
// 出さない。コメント未生成かつ生成中でもない場合（初回失敗後等）にも
// 再試行できるよう、onRegenerateがあればその状態でもボタンを表示する。
type AiCommentCardProps = {
  comment?: string
  isGenerating: boolean
  onRegenerate?: () => void
}

function RegenerateButton({ onRegenerate }: { onRegenerate: () => void }) {
  return (
    <button type="button" className="ai-comment-card__regenerate" onClick={onRegenerate}>
      🔄 コメントを再生成
    </button>
  )
}

export function AiCommentCard({ comment, isGenerating, onRegenerate }: AiCommentCardProps) {
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
