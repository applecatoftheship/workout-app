import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { analyzeMealPhoto } from '../../api/mealPhotoAnalysis'
import { prepareMealPhotoForAnalysis } from '../../utils/imagePrep'
import type { MealPhotoAnalysisResult, MealPhotoHint } from '../../utils/mealPhotoHelpers'
import './MealPhotoAnalyzeSection.css'
import './CalendarForms.css'

// Gemini画像解析による食事入力（指示書2026-09-14）：食事記録ウィザード・
// FoodItemFormModalの両方から使う共通UI。写真を選択（またはカメラ撮影）すると、
// クライアント側でリサイズ・Base64エンコードしてからAIに解析させ、結果を
// onResultで呼び出し元へ渡す。DishFormModalの「✨ AIで材料を提案」ボタンと同じく、
// AIの結果は編集可能な下書きとして扱うだけで、この部品自体は何もDBへ書き込まない。
// 解析に失敗してもエラーメッセージを表示するのみで、通常の手入力フローは一切
// ブロックしない（指示書の設計判断4）。
type MealPhotoAnalyzeSectionProps = {
  /** FoodItemFormModal（栄養成分ラベル読み取り専用の入力起点）から'label'を渡す。
   * 食事記録ウィザードの汎用入力起点では省略し、判定をAIに完全に委ねる。 */
  hint?: MealPhotoHint
  description: string
  buttonLabel?: string
  onResult: (result: MealPhotoAnalysisResult) => void
}

export function MealPhotoAnalyzeSection({
  hint,
  description,
  buttonLabel = '📷 写真から入力',
  onResult,
}: MealPhotoAnalyzeSectionProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // 同じファイルを連続で選び直せるよう、選択直後にリセットしておく。
    event.target.value = ''
    if (!file) {
      return
    }

    setError(null)
    setIsAnalyzing(true)
    try {
      const prepared = await prepareMealPhotoForAnalysis(file)
      const result = await analyzeMealPhoto(prepared.base64, prepared.mimeType, hint)
      onResult(result)
    } catch (analysisError) {
      console.error('写真からの解析に失敗しました', analysisError)
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : '写真の解析に失敗しました。手動で入力してください',
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="meal-photo-analyze">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelected}
        className="meal-photo-analyze__input"
        aria-hidden="true"
        tabIndex={-1}
      />
      <button
        type="button"
        className="meal-photo-analyze__button"
        onClick={() => inputRef.current?.click()}
        disabled={isAnalyzing}
      >
        {isAnalyzing ? 'AIが写真を解析中...' : buttonLabel}
      </button>
      <p className="calendar-detail__description">{description}</p>
      {error ? <p className="calendar-detail__form-error">{error}</p> : null}
    </div>
  )
}
