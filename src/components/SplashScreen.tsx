import './SplashScreen.css'

type SplashScreenProps = {
  isVisible: boolean
}

// 設定画面拡張 Phase 1（2026年8月28日）：初回起動時のスプラッシュ画面。
// App.tsx（AppShell）側でPromise.all([初回データ取得, SPLASH_MINIMUM_VISIBLE_MSの
// タイマー])が完了した時点でisVisible=falseになり、CSS transitionでフェードアウトする。
// visibility:hidden＋pointer-events:noneで確実に操作不能にするため、
// フェードアウト後もDOMからのunmountはせず常時マウントのままにしている
// （タイマー管理を増やさないための単純化・判断理由）。
//
// アニメーション刷新（ART DECO CLASSICテーマ、2026年8月28日）：リング描画・
// ダンベルのスライドイン・心拍ライン描画・タイトル/サブタイトルのフェードインを
// すべてCSS keyframes/transitionのみで実装し、タイミング制御にJSのstate/タイマーは
// 一切使わない（要件通り新規ライブラリ不要、SplashScreen.css参照）。データ取得が
// 750ms時点でまだ完了していない場合の心拍ラインの明滅ループも、CSSの
// animation-delay + infiniteで実現しており、isVisibleがfalseになった時点で
// 画面ごとフェードアウトするため、ループを止めるための追加ロジックは不要。
export function SplashScreen({ isVisible }: SplashScreenProps) {
  return (
    <div className={`splash-screen${isVisible ? '' : ' fade-out'}`} aria-hidden={!isVisible}>
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
    </div>
  )
}
