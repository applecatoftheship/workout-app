import './RecoveryWindowCard.css'
import type { RecoveryResult, RecoveryWindowConfig } from '../types/recovery'

type RecoveryWindowCardProps = {
  result: RecoveryResult
  config: RecoveryWindowConfig
  now: Date
}

const SESSION_LABEL: Record<RecoveryResult['sessionType'], string> = {
  workout: '筋トレ',
  soccer: 'サッカー',
  appleWorkout: 'ワークアウト',
}

// リカバリー窓機能（スプリント4 Phase 2、2026年8月21日）：activeの残り時間表示は
// レストタイマー機能（RestTimerModal.tsx）と同じ「終了予定時刻 - 現在時刻」の
// 都度再計算方式を踏襲する（setIntervalの単純デクリメントにしない）。このコンポーネント
// 自体はDate.now()を直接読まず、呼び出し元（Dashboard.tsx）が1秒間隔で更新する
// `now`をpropsで受け取って再計算するだけの純粋な表示コンポーネントにしている。
export function RecoveryWindowCard({ result, config, now }: RecoveryWindowCardProps) {
  const remainingMs = new Date(result.windowEndTime).getTime() - now.getTime()
  const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60_000))

  return (
    <section className={`panel-card recovery-card recovery-card--${result.status}`}>
      <p className="recovery-card__session-label">{SESSION_LABEL[result.sessionType]}のリカバリー窓</p>

      {result.status === 'active' ? (
        <>
          <p className="recovery-card__status">⚡ リカバリー窓 アクティブ（残り{remainingMinutes}分）</p>
          <p className="recovery-card__hint">
            タンパク質{config.targetProteinGrams}g・炭水化物{config.targetCarbGrams}g以上を目安に食事を記録しましょう
          </p>
        </>
      ) : result.status === 'completed_full' ? (
        <p className="recovery-card__status">
          ✅ リカバリー完了（P: {result.consumedProtein}g / C: {result.consumedCarbs}g）
        </p>
      ) : result.status === 'completed_protein_only' ? (
        <p className="recovery-card__status">
          🥛 プロテイン補給のみ（P: {result.consumedProtein}g / C: {result.consumedCarbs}g）
        </p>
      ) : (
        <p className="recovery-card__status">⚠️ リカバリー窓を逃しました</p>
      )}
    </section>
  )
}
