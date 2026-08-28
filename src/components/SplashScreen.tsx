import './SplashScreen.css'

type SplashScreenProps = {
  isVisible: boolean
}

// 設定画面拡張 Phase 1（2026年8月28日）：初回起動時のスプラッシュ画面。
// App.tsx（AppShell）側でPromise.all([初回データ取得, 500msの最低表示時間])が
// 完了した時点でisVisible=falseになり、CSS transitionでフェードアウトする。
// visibility:hidden＋pointer-events:noneで確実に操作不能にするため、
// フェードアウト後もDOMからのunmountはせず常時マウントのままにしている
// （タイマー管理を増やさないための単純化・判断理由）。
export function SplashScreen({ isVisible }: SplashScreenProps) {
  return (
    <div className={`splash-screen${isVisible ? '' : ' fade-out'}`} aria-hidden={!isVisible}>
      <img src="/icons/icon-512.svg" alt="" className="splash-screen__logo" />
    </div>
  )
}
