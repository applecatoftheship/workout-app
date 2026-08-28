import './CharacterStatusCard.css'
import type { ACWRResult, FatigueLevel } from '../types'

type CharacterTier = 'peak' | 'good' | 'fatigued' | 'caution'

type CharacterStatus = {
  tier: CharacterTier
  emoji: string
  message: string
}

// 設定画面拡張 Phase 4（ゲーミフィケーション、2026年8月28日）：当日のACWR・睡眠・
// 疲労度から4パターンのキャラクター/ステータスを判定する。優先順位は安全性を
// 優先し「要警戒→疲労蓄積→絶好調→良好」の順で判定する（ACWR警戒・危険状態は
// 他の条件を満たしていても最優先で表示すべきと判断）。
//
// 【4パターンいずれにも一致しない場合の扱い】指示書はACWR「適正」（sweet_spot）を
// 前提とした2パターン（絶好調・良好）しか定義していないため、ACWRが「低下」
// （unload）またはデータ不足（null）で、かつ疲労蓄積の条件にも該当しない場合
// （例：ACWR低下だが疲労度1〜2・睡眠十分）は、指示書の4パターンいずれにも
// 厳密には一致しない。この場合は無理に4パターンのどれかに当てはめず、
// カードごと非表示にする（他のダッシュボードカード群——AiCommentCard・
// stat-card等——が「表示すべきデータが無ければ何も描画しない」方針を踏襲）。
function determineCharacterStatus(
  acwrStatus: ACWRResult['status'] | null,
  fatigue: FatigueLevel | undefined,
  sleepHours: number | undefined,
): CharacterStatus | null {
  if (acwrStatus === 'warning' || acwrStatus === 'danger') {
    return {
      tier: 'caution',
      emoji: '⚠️',
      message: '負荷が高まっています。怪我防止のケアを優先しましょう',
    }
  }

  if ((fatigue != null && fatigue >= 4) || (sleepHours != null && sleepHours < 6)) {
    return {
      tier: 'fatigued',
      emoji: '😴',
      message: '疲労が残っています。しっかり体を休めましょう',
    }
  }

  if (acwrStatus === 'sweet_spot' && fatigue != null && fatigue <= 2 && sleepHours != null && sleepHours >= 7.5) {
    return {
      tier: 'peak',
      emoji: '🌟',
      message: 'エネルギー充填完了！今日も最高のパフォーマンスを',
    }
  }

  if (acwrStatus === 'sweet_spot' && fatigue === 3) {
    return {
      tier: 'good',
      emoji: '😊',
      message: '順調なコンディションです。ペースを維持しましょう',
    }
  }

  return null
}

type CharacterStatusCardProps = {
  acwrStatus: ACWRResult['status'] | null
  fatigue: FatigueLevel | undefined
  sleepHours: number | undefined
}

export function CharacterStatusCard({ acwrStatus, fatigue, sleepHours }: CharacterStatusCardProps) {
  const status = determineCharacterStatus(acwrStatus, fatigue, sleepHours)

  if (!status) {
    return null
  }

  return (
    <section className={`panel-card character-status-card character-status-card--${status.tier}`}>
      <span className="character-status-card__emoji" aria-hidden="true">
        {status.emoji}
      </span>
      <p className="character-status-card__message">{status.message}</p>
    </section>
  )
}
