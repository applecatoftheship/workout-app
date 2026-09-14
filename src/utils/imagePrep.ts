// Gemini画像解析による食事入力（指示書2026-09-14）：写真解析に使った画像は保存しない
// 設計（指示書の設計判断3）のため、Supabase Storageは経由せずクライアント側で
// リサイズ・JPEG圧縮した上でBase64文字列としてAPIへ直接送信する（api/analyze-meal-photo.ts
// がそのままGeminiのinline_dataとして転送し、DBには一切書き込まない）。
// 画像読み込み・canvas描画はsrc/utils/cropImage.tsのloadImageパターンを踏襲。

const MAX_DIMENSION = 1024
const JPEG_QUALITY = 0.85

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (event) => reject(event)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (event) => reject(event))
    image.src = src
  })
}

export type PreparedMealPhoto = {
  // data:image/jpeg;base64, プレフィックスを除いたBase64文字列。
  base64: string
  mimeType: 'image/jpeg'
}

// Fileを読み込み、長辺がMAX_DIMENSIONを超える場合のみ縮小した上でJPEGへ変換し、
// Gemini APIへそのまま渡せるBase64文字列を返す。HEIC等ブラウザが直接<img>表示
// できない形式は、この関数が投げるエラーをそのまま呼び出し元でキャッチしてユーザーへ
// 案内する（「別の写真でお試しください」等）。
export async function prepareMealPhotoForAnalysis(file: File): Promise<PreparedMealPhoto> {
  const dataUrl = await readFileAsDataUrl(file)
  const image = await loadImage(dataUrl)

  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('canvas 2d context を取得できませんでした')
  }
  context.drawImage(image, 0, 0, width, height)

  const jpegDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const commaIndex = jpegDataUrl.indexOf(',')
  if (commaIndex === -1) {
    throw new Error('画像のエンコードに失敗しました')
  }
  return { base64: jpegDataUrl.slice(commaIndex + 1), mimeType: 'image/jpeg' }
}
