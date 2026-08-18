import { useState } from 'react'
import './Settings.css'
import { GoalPanel } from '../components/GoalPanel'
import { TrainingTemplateManager } from '../components/TrainingTemplateManager'
import type { RecordModalRequest } from '../components/RecordFormModal'
import type { Goals } from '../api/goals'
import type { DailyCondition, DateString, TrainingLog } from '../types'
import type { Theme } from '../hooks/useTheme'

const ACCENT_PRESETS = [
  { name: 'オレンジ（現在）', color: '#E85D2C' },
  { name: 'ティール', color: '#1D9C93' },
  { name: 'ブルー', color: '#2F6FED' },
]

type ToggleSwitchProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}

function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle-switch${checked ? ' toggle-switch--checked' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-switch__thumb" />
    </button>
  )
}

type SettingsProps = {
  goals: Goals
  setGoals: React.Dispatch<React.SetStateAction<Goals>>
  trainingLogs: TrainingLog[]
  dailyConditions: DailyCondition[]
  today: Date
  todayString: DateString
  theme: Theme
  setTheme: React.Dispatch<React.SetStateAction<Theme>>
  openRecordModal: (request: Omit<RecordModalRequest, 'requestId'>) => void
}

export function Settings({
  goals,
  setGoals,
  trainingLogs,
  dailyConditions,
  today,
  todayString,
  theme,
  setTheme,
  openRecordModal,
}: SettingsProps) {
  // 記録リマインダーは見た目のみ（実装指示書4節：通知機能は今回スコープ外）
  const [isReminderEnabled, setIsReminderEnabled] = useState(false)

  return (
    <div className="settings-page">
      <section className="panel-card settings-profile">
        <div className="settings-profile__avatar">👤</div>
        <div>
          <p className="settings-profile__name">ゲストユーザー</p>
          <p className="settings-profile__meta">年齢: 未設定 ／ 身長: 未設定 ／ ポジション: 未設定</p>
        </div>
      </section>

      <GoalPanel goals={goals} setGoals={setGoals} trainingLogs={trainingLogs} dailyConditions={dailyConditions} today={today} />

      <TrainingTemplateManager todayString={todayString} openRecordModal={openRecordModal} />

      <section className="panel-card">
        <h3 className="settings-section__title">表示</h3>
        <div className="settings-row">
          <div>
            <p className="settings-row__label">ダークモード</p>
            <p className="settings-row__description">
              {theme === 'dark' ? '現在ダークモードです' : '現在ライトモードです'}（リロードでOS設定に戻ります）
            </p>
          </div>
          <ToggleSwitch checked={theme === 'dark'} onChange={(checked) => setTheme(checked ? 'dark' : 'light')} label="ダークモード" />
        </div>
        <div className="settings-row">
          <div>
            <p className="settings-row__label">アクセントカラー</p>
            <p className="settings-row__description">選択機能は今後追加予定です</p>
          </div>
          <div className="settings-accent-swatches">
            {ACCENT_PRESETS.map((preset) => (
              <span
                key={preset.name}
                className="settings-accent-swatch"
                style={{ background: preset.color }}
                title={preset.name}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="panel-card">
        <h3 className="settings-section__title">通知</h3>
        <div className="settings-row">
          <div>
            <p className="settings-row__label">記録リマインダー</p>
            <p className="settings-row__description">通知機能は準備中です</p>
          </div>
          <ToggleSwitch checked={isReminderEnabled} onChange={setIsReminderEnabled} label="記録リマインダー" />
        </div>
      </section>

      <section className="panel-card">
        <h3 className="settings-section__title">アカウント</h3>
        <p className="settings-row__description">認証機能は未実装のため、現在は単一ユーザーで運用しています。</p>
        <button type="button" className="button button--secondary" disabled>
          ログイン（準備中）
        </button>
      </section>
    </div>
  )
}
