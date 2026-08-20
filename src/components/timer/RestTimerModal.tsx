import { useEffect, useRef, useState } from 'react'
import { CloseIcon } from '../icons'
import './RestTimerModal.css'

// 休憩タイマー機能（2026年8月21日新設）。DBには保存せず、モーダルを開いている
// 間のみ完結する機能（実装指示書スコープ外：状態永続化・フローティング表示）。

const QUICK_DURATIONS_SECONDS = [30, 60, 90, 120]
const STEP_SECONDS = 10
const MIN_SECONDS = 10
const MAX_SECONDS = 600

type TimerPhase = 'idle' | 'running' | 'finished'

// setIntervalの単純なデクリメントではなく、終了予定時刻（endAt）と現在時刻の差分から
// 残り時間を毎回再計算する。バックグラウンド化（画面ロック・タブ切替）による
// setIntervalのスロットリングで誤差が出るのを防ぐための設計（実装指示書の指定）。
function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// Web Audio APIで短いビープ音を3回生成・再生する。第三者ライブラリ・音声ファイルは
// 使用しない（軽量な自前実装）。
function playBeep(ctx: AudioContext) {
  const beepStartOffsets = [0, 0.3, 0.6]
  beepStartOffsets.forEach((offset) => {
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    const startTime = ctx.currentTime + offset
    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.2)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start(startTime)
    oscillator.stop(startTime + 0.25)
  })
}

// iOS Safari等、navigator.vibrate非対応環境ではフィーチャー検出でスキップする
// （実装指示書の指定。存在しない環境でエラーにしない）。
function triggerVibration() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([200, 100, 200])
    } catch (error) {
      console.error('バイブレーションの実行に失敗しました', error)
    }
  }
}

type RestTimerModalProps = {
  onClose: () => void
}

export function RestTimerModal({ onClose }: RestTimerModalProps) {
  const [durationSeconds, setDurationSeconds] = useState(60)
  const [phase, setPhase] = useState<TimerPhase>('idle')
  const [endAt, setEndAt] = useState<number | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)

  const audioContextRef = useRef<AudioContext | null>(null)
  // 終了通知（ビープ音・バイブレーション）が二重発火しないためのガード
  // （タブのスロットリング解除直後に複数tickが連続する可能性への対策）。
  const firedRef = useRef(false)

  useEffect(() => {
    if (phase !== 'running' || endAt === null) {
      return
    }
    firedRef.current = false

    const tick = () => {
      const remaining = endAt - Date.now()
      if (remaining <= 0) {
        setRemainingMs(0)
        if (!firedRef.current) {
          firedRef.current = true
          setPhase('finished')
          if (audioContextRef.current) {
            playBeep(audioContextRef.current)
          }
          triggerVibration()
        }
        return
      }
      setRemainingMs(remaining)
    }

    tick()
    const intervalId = window.setInterval(tick, 200)
    return () => window.clearInterval(intervalId)
  }, [phase, endAt])

  useEffect(() => {
    return () => {
      audioContextRef.current?.close().catch(() => {})
    }
  }, [])

  const adjustDuration = (delta: number) => {
    setDurationSeconds((current) => Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, current + delta)))
  }

  const handleStart = () => {
    // Web Audio APIの自動再生制限を避けるため、ユーザー操作（このボタン押下）の
    // コールスタック内でAudioContextを生成・resumeしておく（実装指示書の想定通り、
    // 「休憩開始」ボタン押下がユーザー操作にあたるため）。
    const AudioCtxClass =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AudioCtxClass) {
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioCtxClass()
        } else if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume()
        }
      } catch (error) {
        console.error('AudioContextの初期化に失敗しました', error)
      }
    }

    const now = Date.now()
    setEndAt(now + durationSeconds * 1000)
    setRemainingMs(durationSeconds * 1000)
    setPhase('running')
  }

  const handleReset = () => {
    setPhase('idle')
    setEndAt(null)
    setRemainingMs(0)
  }

  // モーダルを実行中に閉じた場合はタイマーをリセットする
  // （実装指示書のデフォルト指定：「閉じたらリセット」）。
  const handleClose = () => {
    handleReset()
    onClose()
  }

  return (
    <div className="rest-timer-modal__overlay" role="presentation" onClick={handleClose}>
      <div
        className="rest-timer-modal"
        role="dialog"
        aria-modal="true"
        aria-label="休憩タイマー"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rest-timer-modal__header">
          <h3>休憩タイマー</h3>
          <button type="button" className="rest-timer-modal__close" onClick={handleClose} aria-label="閉じる">
            <CloseIcon />
          </button>
        </div>

        <div className="rest-timer-modal__body">
          {phase === 'idle' ? (
            <>
              <div className="rest-timer-modal__duration metric-value">{durationSeconds}秒</div>

              <div className="rest-timer-modal__quick-select">
                {QUICK_DURATIONS_SECONDS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`rest-timer-modal__quick-button ${
                      durationSeconds === value ? 'rest-timer-modal__quick-button--active' : ''
                    }`}
                    onClick={() => setDurationSeconds(value)}
                  >
                    {value}秒
                  </button>
                ))}
              </div>

              <div className="rest-timer-modal__stepper">
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => adjustDuration(-STEP_SECONDS)}
                  aria-label={`${STEP_SECONDS}秒減らす`}
                >
                  −
                </button>
                <span className="rest-timer-modal__stepper-label">±{STEP_SECONDS}秒</span>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => adjustDuration(STEP_SECONDS)}
                  aria-label={`${STEP_SECONDS}秒増やす`}
                >
                  +
                </button>
              </div>

              <button type="button" className="btn-primary rest-timer-modal__start" onClick={handleStart}>
                休憩開始
              </button>
            </>
          ) : (
            <>
              <div
                className={`rest-timer-modal__countdown metric-value ${
                  phase === 'finished' ? 'rest-timer-modal__countdown--finished' : ''
                }`}
              >
                {formatCountdown(remainingMs)}
              </div>
              {phase === 'finished' ? <p className="rest-timer-modal__finished-label">⏰ 時間になりました</p> : null}

              <div className="rest-timer-modal__actions">
                {phase === 'finished' ? (
                  <button type="button" className="btn-primary" onClick={handleStart}>
                    もう一度（{durationSeconds}秒）
                  </button>
                ) : null}
                <button type="button" className="btn-secondary" onClick={handleReset}>
                  {phase === 'finished' ? '設定に戻る' : 'リセット'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
