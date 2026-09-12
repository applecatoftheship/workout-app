import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { readStoredAccentColor } from '../utils/accentColor'
import './SplashScreen.css'

type SplashScreenProps = {
  // データ取得＋最低表示時間（App.tsx の SPLASH_MINIMUM_VISIBLE_MS）の両方が
  // 完了したか。SplashScreen 自身の表示可否（isVisible、下記）はこれとは別に
  // 内部の isSplashDismissed（タップ or 自動進行）が揃うまで確定しない
  // （2026年9月12日、タップで進める設計に変更。詳細は SplashScreen 本体のコメント参照）。
  isLoadComplete: boolean
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
// タイマー])が完了すると isLoadComplete が true になり、CSS transitionでの
// フェードアウトが可能な状態になる。visibility:hidden＋pointer-events:noneで
// 確実に操作不能にするため、フェードアウト後もDOMからのunmountはせず常時
// マウントのままにしている（タイマー管理を増やさないための単純化・判断理由）。
//
// 【タップで進める設計（2026年9月12日）】isLoadComplete が true になった後も、
// 「タップ」または「6秒後の自動進行（フォールバック保険）」のどちらか早い方で
// isSplashDismissed が true になるまでスプラッシュを表示し続ける
// （isVisible = !(isLoadComplete && isSplashDismissed)）。フェードアウト自体は
// 既存の300msトランジション（.fade-out、SplashScreen.css）をそのまま使う。
// 両テーマ（ART DECO CLASSIC / AETHER-FLOW）に共通のロジックとしてこの
// コンポーネント本体に実装しており、各バリアントのコンテンツ（下記
// ArtDecoSplashContent / AetherFlowSplashContent）側の実装は不要。
// タップは isLoadComplete が false の間（データ取得中）に行っても無効にはせず
// isSplashDismissed を立てるだけにしている。これにより「読み込み中に先に
// タップしておけば、読み込み完了と同時に即座にフェードアウトする」という
// 自然な挙動になる（読み込み完了後に改めてタップし直す必要はない）。
//
// アニメーション（各バリアントとも）：リング/弧の描画 → モチーフが現れる →
// タイトル/サブタイトルのフェードイン → データ取得未完了時のゆっくりした明滅ループ
// → 画面ごとフェードアウト、という緩急をCSS keyframes/transitionのみで実装し、
// タイミング制御にJSのstate/タイマーは使わない（要件通り新規ライブラリ不要）。
// prefers-reduced-motion: reduce ではスライド・描画系を省略しフェードインのみにする。
const SPLASH_AUTO_DISMISS_MS = 6000

export function SplashScreen({ isLoadComplete }: SplashScreenProps) {
  const [variant] = useState<SplashVariant>(
    () => SPLASH_VARIANT_BY_ACCENT[readStoredAccentColor() ?? ''] ?? 'artdeco',
  )
  const [isSplashDismissed, setIsSplashDismissed] = useState(false)

  // 6秒後の自動進行はisLoadComplete=trueになってからカウントを開始する
  // （読み込みに時間がかかっている間にタイマーを消費させないため。読み込みが
  // 6秒を超えるケースでも、完了直後から改めて6秒間はタップの猶予を確保する）。
  useEffect(() => {
    if (!isLoadComplete) {
      return
    }
    const timeoutId = window.setTimeout(() => setIsSplashDismissed(true), SPLASH_AUTO_DISMISS_MS)
    return () => window.clearTimeout(timeoutId)
  }, [isLoadComplete])

  const isVisible = !(isLoadComplete && isSplashDismissed)
  const Content = SPLASH_CONTENT_BY_VARIANT[variant]

  return (
    <div
      className={`splash-screen splash-screen--${variant}${isVisible ? '' : ' fade-out'}`}
      aria-hidden={!isVisible}
      onClick={() => setIsSplashDismissed(true)}
    >
      <Content isReady={isLoadComplete} />
    </div>
  )
}

// 各バリアントのコンテンツ（下記）に渡す共通props。isReady は isLoadComplete と
// 同じ値で、「今タップすると300msで即座に進む」状態になったことを示す
// （2026年9月12日追加）。スマートフォンではマウスカーソルが無くタップ可能である
// ことに気づく手がかりが画面上に無いため、John「推奨」により「TAP TO START」の
// 文言表示をこのタイミングで出す（AETHER-FLOWのSVGソースに元々含まれていた
// 文言をそのまま踏襲。ART DECO CLASSIC側は元々スペックが無かったため、同じ文言・
// 同じ「isReadyでフェードイン」ロジックで、配色のみ各テーマに合わせて追加した）。
// isReady が false（読み込み中）の間にタップしても isSplashDismissed 自体は
// 立つが実際の進行は起きないため、この文言は isReady になってから出す
// （読み込み中に文言だけ見えて何も起きない状態を避けるため）。
type SplashContentProps = {
  isReady: boolean
}

// バリアント → 描画関数のマップ。テーマ3（BIO-LINK OS）を足すときは SplashVariant の
// union と ACCENT_COLOR_* に加えて、ここに1行追加する（union を増やせば TS がこの
// Record の漏れを検出するので、追加忘れがコンパイルエラーになる）。
const SPLASH_CONTENT_BY_VARIANT: Record<SplashVariant, (props: SplashContentProps) => ReactElement> = {
  artdeco: ArtDecoSplashContent,
  aetherflow: AetherFlowSplashContent,
}

function ArtDecoSplashContent({ isReady }: SplashContentProps) {
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
      <p className={`splash-tap-hint${isReady ? ' splash-tap-hint--visible' : ''}`} aria-hidden="true">
        TAP TO START
      </p>
    </div>
  )
}

// AETHER-FLOW（テーマ2）：Geminiから提供されたSVGソースの構成を再現する。
// 半透明ガラスリング × オーロラ配色の弧 × オーガニックな曲線のダンベル/パルス、
// アンビエントなオーロラの発光背景、"AETHER FLOW" のタイポグラフィ。
// 配色はSVGソースから抽出した固定色（このスプラッシュ専用ブランドカラー。
// ライト/ダークテーマの切り替えには連動しない、既存 artdeco スプラッシュと同方針）。
function AetherFlowSplashContent({ isReady }: SplashContentProps) {
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
        {/* SVGソース末尾の発光ドット＋"TAP TO START"をHTML/CSSで再現。
            当時は実装していなかったが、タップで進める設計（2026年9月12日）の
            導入に合わせて追加した。 */}
        <div className={`splash-aether__tap-hint${isReady ? ' splash-aether__tap-hint--visible' : ''}`} aria-hidden="true">
          <span className="splash-aether__tap-dot" />
          <span className="splash-aether__tap-label">TAP TO START</span>
        </div>
      </div>
    </>
  )
}
