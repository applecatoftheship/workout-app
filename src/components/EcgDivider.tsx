import './EcgDivider.css'

type EcgDividerProps = {
  className?: string
}

// スプラッシュ画面とのUI統一 v6（2026年8月28〜29日、John承認）：心電図ラインの
// ワンポイント装飾。SplashScreen.tsxの心拍ライン（splash-dumbbell__pulse）と
// 同じpathLength="1"方式で一度だけ描画するが、スプラッシュ側にある750ms以降の
// 明滅ループは持たない（「ワンポイント装飾は控えめに」との指示のため、常時点滅
// させず描画後は静止させる）。主要カード（ダッシュボードのカロリーカード・
// ACWRゲージカード）のみに限定して使用し、他画面には展開しない。
export function EcgDivider({ className }: EcgDividerProps) {
  return (
    <svg
      className={`ecg-divider${className ? ` ${className}` : ''}`}
      viewBox="0 0 200 24"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path className="ecg-divider__path" pathLength="1" d="M0,12 L70,12 L82,2 L94,22 L106,6 L118,12 L200,12" />
    </svg>
  )
}
