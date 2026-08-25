import { useState, type FormEvent } from 'react'
import './Login.css'
import { useAuth } from '../hooks/useAuth'

// Supabase Authのデフォルトパスワード要件（supabase/config.tomlの
// [auth.email] minimum_password_length = 6）に合わせたクライアント側の
// 簡易バリデーション。サーバー側のバリデーションを代替するものではなく、
// 明らかな入力ミスを送信前に防ぐためのもの。
const MINIMUM_PASSWORD_LENGTH = 6

type SignupProps = {
  onSwitchToLogin: () => void
}

export function Signup({ onSwitchToLogin }: SignupProps) {
  const { signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)

  const validate = (): string | null => {
    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      return `パスワードは${MINIMUM_PASSWORD_LENGTH}文字以上で入力してください`
    }
    if (password !== passwordConfirm) {
      return 'パスワードが一致しません'
    }
    return null
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setIsSubmitting(true)
    const { error: signUpError } = await signUp(email, password)
    setIsSubmitting(false)

    if (signUpError) {
      setError(signUpError)
      return
    }

    // needsEmailConfirmationの値に関わらず、サインアップ直後に自動で
    // アプリ画面へ遷移させず「確認メールを送信しました」の案内を表示する
    // （指示書の要件通り）。メール確認が不要な設定に戻った場合でも、
    // AuthProviderのonAuthStateChangeがsessionを検知すれば自動的に
    // AppShellへ切り替わるため、この案内画面が表示されている間に実際の
    // ログイン状態が確立していればApp.tsx側で自然に遷移する。
    setIsCompleted(true)
  }

  if (isCompleted) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-card__title">確認メールを送信しました</h1>
          <p className="login-card__notice">メール内のリンクをクリックしてアカウントを有効化してください。</p>
          <button type="button" className="btn-primary login-card__submit" onClick={onSwitchToLogin}>
            ログイン画面に戻る
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1 className="login-card__title">アカウント作成</h1>
        {error ? <p className="login-card__error">{error}</p> : null}
        <label className="login-card__field">
          <span>メールアドレス</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="login-card__field">
          <span>パスワード</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={MINIMUM_PASSWORD_LENGTH}
            required
          />
        </label>
        <label className="login-card__field">
          <span>パスワード確認（再入力）</span>
          <input
            type="password"
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
            autoComplete="new-password"
            minLength={MINIMUM_PASSWORD_LENGTH}
            required
          />
        </label>
        <button type="submit" className="btn-primary login-card__submit" disabled={isSubmitting}>
          {isSubmitting ? '作成中...' : 'アカウント作成'}
        </button>
        <p className="login-card__link">
          既にアカウントをお持ちの方は
          <button type="button" onClick={onSwitchToLogin}>
            こちら
          </button>
        </p>
      </form>
    </div>
  )
}
