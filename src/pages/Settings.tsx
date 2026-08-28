import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Settings.css'
import { GoalPanel } from '../components/GoalPanel'
import { TrainingTemplateManager } from '../components/TrainingTemplateManager'
import type { RecordModalRequest } from '../components/RecordFormModal'
import type { Goals } from '../api/goals'
import type { AccentColorId, DailyCondition, DateString, FirstDayOfWeek, Profile, TrainingLog } from '../types'
import type { Theme } from '../hooks/useTheme'
import { usePushSubscription } from '../hooks/usePushSubscription'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../hooks/useAuth'
import { ChevronRightIcon } from '../components/icons'
import { fetchProfile, upsertProfile } from '../api/profiles'
import { ACCENT_COLOR_IDS, ACCENT_COLOR_LABELS, DEFAULT_ACCENT_COLOR } from '../utils/accentColor'

const ACCENT_SWATCH_COLORS: Record<AccentColorId, string> = {
  orange: '#E85D2C',
  teal: '#1D9C93',
  blue: '#2F6FED',
  purple: '#8B5CF6',
}

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
  profile: Profile | null
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>
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
  profile,
  setProfile,
}: SettingsProps) {
  const navigate = useNavigate()
  // 記録リマインダー（プッシュ通知機能 Phase 1b、2026年8月24日）：ONにした瞬間に
  // ブラウザの通知許可リクエストを呼び出す。拒否・購読失敗時はトグルをOFFに戻す。
  const [isReminderEnabled, setIsReminderEnabled] = useState(false)
  const { subscribe, unsubscribe, checkIsSubscribed } = usePushSubscription()
  const { showToast } = useToast()
  const { user, signOut } = useAuth()
  const [isSavingPreference, setIsSavingPreference] = useState(false)

  // カレンダー週始まり・アクセントカラー設定（設定画面拡張Phase 1、2026年8月28日）：
  // upsertProfileは全体upsert方式のため、この画面が持たない他の列（displayName・
  // age・avatarType等、UserProfile.tsxが書き込む）を現在のprofileから引き継いで
  // 渡さないとnull/デフォルトで上書きしてしまう（UserProfile.tsx側でも同種の
  // 対応を行っている、src/api/profiles.tsのコメント参照）。
  const persistProfilePreference = async (patch: Partial<Pick<Profile, 'firstDayOfWeek' | 'accentColor'>>) => {
    setIsSavingPreference(true)
    try {
      await upsertProfile({
        displayName: profile?.displayName,
        age: profile?.age,
        heightCm: profile?.heightCm,
        bodyFatPercentage: profile?.bodyFatPercentage,
        avatarType: profile?.avatarType,
        avatarValue: profile?.avatarValue,
        firstDayOfWeek: profile?.firstDayOfWeek ?? 1,
        accentColor: profile?.accentColor ?? DEFAULT_ACCENT_COLOR,
        ...patch,
      })
      const updated = await fetchProfile()
      setProfile(updated)
    } catch (error) {
      console.error('設定の保存に失敗しました', error)
      showToast('設定の保存に失敗しました。もう一度お試しください', 'error')
    } finally {
      setIsSavingPreference(false)
    }
  }

  useEffect(() => {
    let isMounted = true
    checkIsSubscribed()
      .then((subscribed) => {
        if (isMounted) {
          setIsReminderEnabled(subscribed)
        }
      })
      .catch((error) => {
        console.error('プッシュ通知の購読状態確認に失敗しました', error)
      })
    return () => {
      isMounted = false
    }
  }, [checkIsSubscribed])

  const handleReminderToggle = async (checked: boolean) => {
    if (!checked) {
      setIsReminderEnabled(false)
      await unsubscribe()
      return
    }

    const success = await subscribe()
    if (success) {
      setIsReminderEnabled(true)
    } else {
      setIsReminderEnabled(false)
      showToast('通知が許可されませんでした。ブラウザの通知設定を確認してください', 'error')
    }
  }

  return (
    <div className="settings-page">
      {/* プロフィール機能（2026年8月27日）：カード全体をタップ可能にし、
          ユーザー詳細画面（/settings/profile）へ遷移する。名前はprofile.displayName
          を優先し、未設定時は従来通りメールのローカルパートにフォールバックする
          （「アカウント」セクション（下部）が既にメールアドレス全体を表示している
          ため、ここでは重複を避ける）。 */}
      <button type="button" className="panel-card settings-profile" onClick={() => navigate('/settings/profile')}>
        <div className="settings-profile__avatar">
          {profile?.avatarType === 'upload' && profile.avatarValue ? (
            <img src={profile.avatarValue} alt="" className="settings-profile__avatar-image" />
          ) : (
            profile?.avatarValue ?? '👤'
          )}
        </div>
        <div className="settings-profile__body">
          <p className="settings-profile__name">{profile?.displayName || user?.email?.split('@')[0] || 'ユーザー'}</p>
          <p className="settings-profile__meta">
            年齢: {profile?.age != null ? `${profile.age}歳` : '未設定'} ／ 身長: {profile?.heightCm != null ? `${profile.heightCm}cm` : '未設定'}
          </p>
        </div>
        <ChevronRightIcon className="settings-profile__chevron" strokeWidth={1.8} />
      </button>

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
            <p className="settings-row__label">週の始まり</p>
            <p className="settings-row__description">
              {(profile?.firstDayOfWeek ?? 1) === 1 ? 'カレンダーは月曜始まりです' : 'カレンダーは日曜始まりです'}
            </p>
          </div>
          <ToggleSwitch
            checked={(profile?.firstDayOfWeek ?? 1) === 1}
            onChange={(checked) => {
              const nextValue: FirstDayOfWeek = checked ? 1 : 0
              void persistProfilePreference({ firstDayOfWeek: nextValue })
            }}
            label="週の始まりを月曜にする"
          />
        </div>
        <div className="settings-row">
          <div>
            <p className="settings-row__label">アクセントカラー</p>
            <p className="settings-row__description">アプリ全体のボタン・強調表示の色を選べます</p>
          </div>
          <div className="settings-accent-swatches" role="radiogroup" aria-label="アクセントカラー">
            {ACCENT_COLOR_IDS.map((colorId) => {
              const isSelected = (profile?.accentColor ?? DEFAULT_ACCENT_COLOR) === colorId
              return (
                <button
                  type="button"
                  key={colorId}
                  role="radio"
                  aria-checked={isSelected}
                  className={`settings-accent-swatch${isSelected ? ' settings-accent-swatch--selected' : ''}`}
                  style={{ background: ACCENT_SWATCH_COLORS[colorId] }}
                  title={ACCENT_COLOR_LABELS[colorId]}
                  aria-label={ACCENT_COLOR_LABELS[colorId]}
                  disabled={isSavingPreference}
                  onClick={() => void persistProfilePreference({ accentColor: colorId })}
                />
              )
            })}
          </div>
        </div>
      </section>

      <section className="panel-card">
        <h3 className="settings-section__title">通知</h3>
        <div className="settings-row">
          <div>
            <p className="settings-row__label">記録リマインダー</p>
            <p className="settings-row__description">
              {isReminderEnabled ? '通知が有効です' : 'ONにすると、負荷や記録に関する通知が届きます'}
            </p>
          </div>
          <ToggleSwitch
            checked={isReminderEnabled}
            onChange={(checked) => {
              void handleReminderToggle(checked)
            }}
            label="記録リマインダー"
          />
        </div>
      </section>

      <section className="panel-card">
        <h3 className="settings-section__title">アカウント</h3>
        <div className="settings-row">
          <div>
            <p className="settings-row__label">アカウント保護有効</p>
            <p className="settings-row__description">ログイン中: {user?.email ?? '不明'}</p>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void signOut()}>
            ログアウト
          </button>
        </div>
      </section>
    </div>
  )
}
