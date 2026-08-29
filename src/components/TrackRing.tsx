import { useEffect, useState, type ReactNode } from 'react'
import './TrackRing.css'

type TrackRingProps = {
  /** 0〜100の割合。範囲外は自動でクランプする。 */
  value: number
  size?: number
  strokeWidth?: number
  /** 弧の色。tokens.cssのCSS変数名（例: '--color-accent'）を渡す。 */
  colorVar?: string
  trackColorVar?: string
  className?: string
  children?: ReactNode
}

// スプラッシュ画面とのUI統一 v6（2026年8月28〜29日、John承認）：
// 「トラックリング＋アクセント色の弧」という1つのリング部品を、ACWRゲージ・
// 週間ストリーク・プロフィールアバター枠に反復適用して統一感を作るための共通部品。
// SplashScreen.tsx/.cssと同じ pathLength="1" 方式（実測circumference計算が不要）を
// 踏襲しているが、スプラッシュ側は常に0→1の全周描画（起動演出用の固定アニメーション）
// なのに対し、この部品は呼び出し側ごとに異なる目標値（value）へ「伸びて止まる」
// 表示時一度きりのアニメーションが必要なため、CSS keyframesではなくCSSトランジション
// （mount直後にstrokeDashoffsetを1→目標値へ切り替える）で実装している。
export function TrackRing({
  value,
  size = 64,
  strokeWidth = 6,
  colorVar = '--color-accent',
  trackColorVar = '--color-ring-track',
  className,
  children,
}: TrackRingProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const radius = (size - strokeWidth) / 2
  const center = size / 2
  const targetOffset = 1 - clamped / 100

  // mount直後はoffset=1（非表示）のまま描画し、次のフレームで目標値に切り替えることで
  // CSSトランジションが「0%→目標値」の一度きりのアニメーションとして発火する
  // （最初から目標値でmountするとトランジションが発火しないため）。
  const [isFilled, setIsFilled] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsFilled(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className={`track-ring${className ? ` ${className}` : ''}`} style={{ width: size, height: size }}>
      <svg className="track-ring__svg" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="track-ring__track"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
          style={{ stroke: `var(${trackColorVar})` }}
        />
        <circle
          className="track-ring__arc"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
          pathLength={1}
          style={{
            stroke: `var(${colorVar})`,
            strokeDashoffset: isFilled ? targetOffset : 1,
          }}
        />
      </svg>
      {children ? <div className="track-ring__content">{children}</div> : null}
    </div>
  )
}
