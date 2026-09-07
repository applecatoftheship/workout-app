import { useState } from 'react'
import type { ReactElement } from 'react'
import { readStoredAccentColor } from '../utils/accentColor'
import './SplashScreen.css'

type SplashScreenProps = {
  isVisible: boolean
}

// 起動画面テーマ（2026年9月7日、複数テーマ対応）：accent_color プリセットごとに
// スプラッシュのアニメーションバリアントを出し分ける。
// - 'artdeco'   … テーマ1 ART DECO CLASSIC（コーラル×ティール、既存実装）
// - 'aetherflow' … テーマ2 AETHER-FLOW（オーロラ、半透明ガラスリング×曲線モチーフ）
// - それ以外（orange/teal/blue/purple）… 専用スプラッシュを持たないため artdeco に
//   フォールバック。将来テーマ3（BIO-LINK OS）を足す場合はこのマップに1行追加する。
//
// SplashScreen は App（AppShell）が profiles をロードするより前に描画されるため、
// DB の accent_color を待たず localStorage のミラー（readStoredAccentColor）から
// バリアントを決める。保存値が無い初回は 'artdeco'。
type SplashVariant = 'artdeco' | 'aetherflow'

const SPLASH_VARIANT_BY_ACCENT: Partial<Record<string, SplashVariant>> = {
  artdeco: 'artdeco',
  aetherflow: 'aetherflow',
}

// 設定画面拡張 Phase 1（2026年8月28日）：初回起動時のスプラッシュ画面。
// App.tsx（AppShell）側でPromise.all([初回データ取得, SPLASH_MINIMUM_VISIBLE_MSの
// タイマー])が完了した時点でisVisible=falseになり、CSS transitionでフェードアウトする。
// visibility:hidden＋pointer-events:noneで確実に操作不能にするため、
// フェードアウト後もDOMからのunmountはせず常時マウントのままにしている
// （タイマー管理を増やさないための単純化・判断理由）。
//
// アニメーション（各バリアントとも）：リング/弧の描画 → モチーフが現れる →
// タイトル/サブタイトルのフェードイン → データ取得未完了時のゆっくりした明滅ループ
// → 画面ごとフェードアウト、という緩急をCSS keyframes/transitionのみで実装し、
// タイミング制御にJSのstate/タイマーは使わない（要件通り新規ライブラリ不要）。
// prefers-reduced-motion: reduce ではスライド・描画系を省略しフェードインのみにする。
export function SplashScreen({ isVisible }: SplashScreenProps) {
  const [variant] = useState<SplashVariant>(
    () => SPLASH_VARIANT_BY_ACCENT[readStoredAccentColor() ?? ''] ?? 'artdeco',
  )
  const Content = SPLASH_CONTENT_BY_VARIANT[variant]

  return (
    <div
      className={`splash-screen splash-screen--${variant}${isVisible ? '' : ' fade-out'}`}
      aria-hidden={!isVisible}
    >
      <Content />
    </div>
  )
}

// バリアント → 描画関数のマップ。テーマ3（BIO-LINK OS）を足すときは SplashVariant の
// union と ACCENT_COLOR_* に加えて、ここに1行追加する（union を増やせば TS がこの
// Record の漏れを検出するので、追加忘れがコンパイルエラーになる）。
const SPLASH_CONTENT_BY_VARIANT: Record<SplashVariant, () => ReactElement> = {
  artdeco: ArtDecoSplashContent,
  aetherflow: AetherFlowSplashContent,
}

function ArtDecoSplashContent() {
  return (
    <div className="splash-screen__content">
      <div className="splash-screen__visual">
        <svg className="splash-ring" viewBox="0 0 160 160" aria-hidden="true">
          <circle className="splash-ring__track" cx="80" cy="80" r="70" />
          {/* pathLength="1"を指定することで、実際のcircumference（実測px）に
              関わらずstroke-dasharray/stroke-dashoffsetを常に0〜1で扱える
              （実測path長計算が不要、要件通りの推奨方式）。 */}
          <circle className="splash-ring__arc" cx="80" cy="80" r="70" pathLength="1" />
        </svg>
        <svg className="splash-dumbbell" viewBox="0 0 140 60" aria-hidden="true">
          <rect className="splash-dumbbell__plate splash-dumbbell__plate--left" x="0" y="10" width="16" height="40" rx="4" />
          <rect className="splash-dumbbell__plate splash-dumbbell__plate--right" x="124" y="10" width="16" height="40" rx="4" />
          {/* 心拍ライン（ECG風の一山）。プレート間（x=16〜124）を接続する形で配置し、
              こちらもpathLength="1"でstroke-dashoffset方式により描画する。 */}
          <path
            className="splash-dumbbell__pulse"
            pathLength="1"
            d="M16,30 L46,30 L54,14 L62,46 L70,20 L78,30 L124,30"
          />
        </svg>
      </div>
      <h1 className="splash-title">WORKOUT &amp; VITAL</h1>
      <p className="splash-subtitle">FITNESS CONDITION LOG</p>
    </div>
  )
}

// AETHER-FLOW（テーマ2）：Geminiから提供されたSVGソースの構成を再現する。
// 半透明ガラスリング × オーロラ配色の弧 × オーガニックな曲線のダンベル/パルス、
// アンビエントなオーロラの発光背景、"AETHER FLOW" のタイポグラフィ。
// 配色はSVGソースから抽出した固定色（このスプラッシュ専用ブランドカラー。
// ライト/ダークテーマの切り替えには連動しない、既存 artdeco スプラッシュと同方針）。
function AetherFlowSplashContent() {
  return (
    <>
      {/* アンビエントなオーロラの発光背景（画面全体・ゆっくり明滅・ドリフト）。 */}
      <div className="splash-aether__aurora" aria-hidden="true" />

      <div className="splash-screen__content splash-aether">
        <div className="splash-screen__visual splash-aether__visual">
          <svg className="splash-aether__svg" viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <linearGradient id="aetherAuroraGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#C4B5FD" />
                <stop offset="50%" stopColor="#6EE7B7" />
                <stop offset="100%" stopColor="#FCA5A5" />
              </linearGradient>
              <linearGradient id="aetherGlassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.05" />
              </linearGradient>
              <filter id="aetherSoftGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            <g transform="translate(100, 100)">
              {/* 半透明ガラスリング（外周・フェードイン） */}
              <circle
                className="splash-aether__glass-ring"
                cx="0"
                cy="0"
                r="72"
                fill="none"
                stroke="url(#aetherGlassGrad)"
                strokeWidth="2"
              />
              {/* オーロラの弧（すっと描画される。pathLength=1 の dashoffset 方式） */}
              <circle
                className="splash-aether__arc"
                cx="0"
                cy="0"
                r="64"
                fill="none"
                stroke="url(#aetherAuroraGrad)"
                strokeWidth="3"
                strokeLinecap="round"
                pathLength="1"
                filter="url(#aetherSoftGlow)"
                transform="rotate(-30)"
              />
              {/* 内側のごく薄いリング（静止・フェードイン） */}
              <circle
                className="splash-aether__inner-ring"
                cx="0"
                cy="0"
                r="54"
                fill="none"
                stroke="#FFFFFF"
                strokeOpacity="0.1"
                strokeWidth="1"
              />

              {/* オーガニックな曲線のダンベル + パルス */}
              <g className="splash-aether__dumbbell" transform="translate(0, -2)">
                <rect className="splash-aether__plate splash-aether__plate--l1" x="-42" y="-18" width="10" height="36" rx="5" fill="url(#aetherAuroraGrad)" />
                <rect className="splash-aether__plate splash-aether__plate--l2" x="-28" y="-12" width="6" height="24" rx="3" fill="#FFFFFF" fillOpacity="0.9" />
                <path
                  className="splash-aether__pulse"
                  d="M -22 0 L -10 0 C -6 -14, -2 -14, 0 0 C 2 14, 6 14, 10 0 L 22 0"
                  fill="none"
                  stroke="url(#aetherAuroraGrad)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength="1"
                  filter="url(#aetherSoftGlow)"
                />
                <rect className="splash-aether__plate splash-aether__plate--r2" x="22" y="-12" width="6" height="24" rx="3" fill="#FFFFFF" fillOpacity="0.9" />
                <rect className="splash-aether__plate splash-aether__plate--r1" x="32" y="-18" width="10" height="36" rx="5" fill="url(#aetherAuroraGrad)" />
              </g>

              <text className="splash-aether__ring-label" x="0" y="52" textAnchor="middle">
                BALANCE :: 100%
              </text>
            </g>
          </svg>
        </div>

        <p className="splash-aether__eyebrow">AETHER OS // VITAL HARMONY</p>
        <h1 className="splash-aether__title">AETHER FLOW</h1>
        <p className="splash-aether__subtitle">MIND &amp; BODY CONDITIONING</p>
      </div>
    </>
  )
}
