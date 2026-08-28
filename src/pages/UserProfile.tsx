import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import './UserProfile.css'
import '../components/calendar/CalendarForms.css'
import { ChevronLeftIcon } from '../components/icons'
import { AvatarCropModal } from '../components/AvatarCropModal'
import { fetchProfile, upsertProfile, uploadAvatarFile } from '../api/profiles'
import { fetchRecentWeight, upsertWeightOnly } from '../api/dailyConditions'
import { useToast } from '../hooks/useToast'
import type { AvatarType, DateString, Profile } from '../types'

// プロフィール機能（2026年8月27日）：「あらかじめ用意したアイコンから選択」は
// 新規の画像アセットを用意する手間を避けるため絵文字ベースで実装する
// （実装指示書の確認事項④で承認済みの方針。このアプリ自体が⚽🏋️🍽️等の絵文字を
// 既に多用している慣習にも合わせている）。
const PRESET_AVATARS = ['👤', '🏃', '🏋️', '⚽', '🚴', '🧘', '🥊', '🏊', '🎽', '💪']

type UserProfileProps = {
  profile: Profile | null
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>
  todayString: DateString
}

export function UserProfile({ profile, setProfile, todayString }: UserProfileProps) {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [displayName, setDisplayName] = useState('')
  const [age, setAge] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [bodyFatPercentage, setBodyFatPercentage] = useState('')
  const [weightInput, setWeightInput] = useState('')
  const [avatarType, setAvatarType] = useState<AvatarType | undefined>(undefined)
  const [avatarValue, setAvatarValue] = useState<string | undefined>(undefined)
  const [recentWeight, setRecentWeight] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  // トリミング機能（2026年8月28日）：ファイル選択直後には即アップロードせず、
  // ローカルのobject URLをAvatarCropModalに渡してユーザーの調整を待つ。
  // 「適用」で初めてuploadAvatarFileを呼ぶ（キャンセル時はアップロード自体発生しない）。
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)

  // profileがApp.tsx側で後から取得完了するケース（初回マウント時点ではまだ
  // fetchProfile()が解決していない）に対応するため、propsの変化を見て
  // フォームの初期値を同期する。
  useEffect(() => {
    setDisplayName(profile?.displayName ?? '')
    setAge(profile?.age != null ? String(profile.age) : '')
    setHeightCm(profile?.heightCm != null ? String(profile.heightCm) : '')
    setBodyFatPercentage(profile?.bodyFatPercentage != null ? String(profile.bodyFatPercentage) : '')
    setAvatarType(profile?.avatarType)
    setAvatarValue(profile?.avatarValue)
  }, [profile])

  // 体重：ConditionForm.tsx・SoccerLogForm.tsxと同じfetchRecentWeightの
  // プレースホルダー方式（実測値ではなく、あくまでゴーストテキストとしての提案）。
  // ここに何も入力しなければ体重は更新しない（実装指示書の「上書き入力可能」の
  // 通り、任意入力として扱う）。
  useEffect(() => {
    fetchRecentWeight(todayString)
      .then(setRecentWeight)
      .catch((error) => {
        console.error('Supabaseから直近の体重記録の取得に失敗しました', error)
        setRecentWeight(null)
      })
  }, [todayString])

  const handleSelectPreset = (emoji: string) => {
    setAvatarType('preset')
    setAvatarValue(emoji)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    setCropImageSrc(URL.createObjectURL(file))
  }

  const handleCropCancel = () => {
    if (cropImageSrc) {
      URL.revokeObjectURL(cropImageSrc)
    }
    setCropImageSrc(null)
  }

  const handleCropConfirm = async (blob: Blob) => {
    const sourceToRevoke = cropImageSrc
    setCropImageSrc(null)
    setIsUploadingAvatar(true)
    try {
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
      const publicUrl = await uploadAvatarFile(file)
      setAvatarType('upload')
      setAvatarValue(publicUrl)
    } catch (error) {
      console.error('アバター画像のアップロードに失敗しました', error)
      showToast('画像のアップロードに失敗しました。もう一度お試しください', 'error')
    } finally {
      setIsUploadingAvatar(false)
      if (sourceToRevoke) {
        URL.revokeObjectURL(sourceToRevoke)
      }
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await upsertProfile({
        displayName: displayName.trim() || undefined,
        age: age.trim() ? Number(age) : undefined,
        heightCm: heightCm.trim() ? Number(heightCm) : undefined,
        bodyFatPercentage: bodyFatPercentage.trim() ? Number(bodyFatPercentage) : undefined,
        avatarType,
        avatarValue,
      })

      // 体重（daily_conditions.weight）の保存先は分断しない方針のため、
      // upsertWeightOnly（部分列upsert）を通じて既存の体重記録の仕組みに
      // そのまま書き込む（実装指示書の確認事項①への対応）。入力欄が空の場合は
      // 何も保存しない（プレースホルダーのみでは更新しない）。
      if (weightInput.trim()) {
        await upsertWeightOnly(todayString, Number(weightInput))
      }

      const updated = await fetchProfile()
      setProfile(updated)
      setWeightInput('')
      fetchRecentWeight(todayString)
        .then(setRecentWeight)
        .catch(() => {
          // 保存自体は成功しているため、プレースホルダー再取得の失敗は無視する。
        })
      showToast('プロフィールを保存しました', 'success')
    } catch (error) {
      console.error('プロフィールの保存に失敗しました', error)
      showToast('保存に失敗しました。もう一度お試しください', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="user-profile-page">
      <div className="user-profile-page__header">
        <button type="button" className="btn-icon" onClick={() => navigate('/settings')} aria-label="設定に戻る">
          <ChevronLeftIcon strokeWidth={1.8} />
        </button>
        <h1>ユーザー詳細</h1>
      </div>

      <section className="panel-card user-profile__avatar-section">
        <div className="user-profile__avatar-preview">
          {avatarType === 'upload' && avatarValue ? (
            <img src={avatarValue} alt="" className="user-profile__avatar-image" />
          ) : (
            <span>{avatarValue ?? '👤'}</span>
          )}
        </div>

        <label className="btn-secondary user-profile__upload-button">
          {isUploadingAvatar ? 'アップロード中...' : '写真をアップロード'}
          <input type="file" accept="image/*" onChange={handleFileChange} disabled={isUploadingAvatar} hidden />
        </label>

        <p className="user-profile__preset-label">アイコンから選択</p>
        <div className="user-profile__preset-grid">
          {PRESET_AVATARS.map((emoji) => (
            <button
              type="button"
              key={emoji}
              className={`user-profile__preset-item ${avatarType === 'preset' && avatarValue === emoji ? 'user-profile__preset-item--selected' : ''}`}
              onClick={() => handleSelectPreset(emoji)}
              aria-label={`アイコン ${emoji} を選択`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </section>

      <section className="panel-card">
        <div className="calendar-detail__form">
          <label className="calendar-detail__field">
            <span>表示名</span>
            <input type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例: 田中太郎" />
          </label>

          <label className="calendar-detail__field">
            <span>年齢</span>
            <input type="number" min="0" max="120" value={age} onChange={(event) => setAge(event.target.value)} placeholder="例: 30" />
          </label>

          <label className="calendar-detail__field">
            <span>身長 (cm)</span>
            <input
              type="number"
              min="0"
              max="250"
              step="0.1"
              value={heightCm}
              onChange={(event) => setHeightCm(event.target.value)}
              placeholder="例: 170.0"
            />
          </label>

          <label className="calendar-detail__field">
            <span>体重 (kg)</span>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={weightInput}
              onChange={(event) => setWeightInput(event.target.value)}
              placeholder={recentWeight != null ? String(recentWeight) : '例: 64.8'}
            />
          </label>

          <label className="calendar-detail__field">
            <span>体脂肪率 (%、任意)</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={bodyFatPercentage}
              onChange={(event) => setBodyFatPercentage(event.target.value)}
              placeholder="例: 18.0"
            />
          </label>

          <button type="button" className="calendar-detail__button user-profile__save-button" onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? '保存中...' : '保存する'}
          </button>
        </div>
      </section>

      {cropImageSrc ? (
        <AvatarCropModal imageSrc={cropImageSrc} onCancel={handleCropCancel} onConfirm={(blob) => void handleCropConfirm(blob)} />
      ) : null}
    </div>
  )
}
