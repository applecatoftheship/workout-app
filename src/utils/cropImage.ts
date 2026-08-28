// react-easy-cropが返すcroppedAreaPixels（元画像上のピクセル座標矩形）を
// canvasで実際に切り出し、アップロード用のJPEG Blobに変換する。
// アイコン表示は正方形前提（circle書き出しはCSS側のborder-radiusで行っており、
// ここでは正方形のまま書き出す。表示側と二重にトリミングしない）。
export type CroppedAreaPixels = {
  x: number
  y: number
  width: number
  height: number
}

const OUTPUT_SIZE = 512
const OUTPUT_QUALITY = 0.9

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (event) => reject(event))
    image.crossOrigin = 'anonymous'
    image.src = src
  })
}

export async function getCroppedImageBlob(imageSrc: string, croppedAreaPixels: CroppedAreaPixels): Promise<Blob> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('canvas 2d context を取得できませんでした')
  }

  context.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('画像の書き出しに失敗しました'))
        }
      },
      'image/jpeg',
      OUTPUT_QUALITY,
    )
  })
}
