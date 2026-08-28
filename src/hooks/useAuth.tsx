import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../api/client'

// アカウント/ログイン機能 フェーズA（2026年8月25日）：セッション管理は
// supabase-jsのGoTrueクライアントに委ねる（デフォルトでlocalStorageへの
// persistSession・autoRefreshTokenが有効なため、オフライン時もローカルの
// セッションでログイン状態を維持し、オンライン復帰時に自動でトークン
// リフレッシュを試みる挙動を素のまま利用できる）。リフレッシュトークン自体が
// 失効している場合（長期間オフライン等）、supabase-jsはSIGNED_OUTイベントを
// 発火してセッションをクリアする。このProviderはonAuthStateChangeを購読して
// stateに反映するだけなので、その場合は自動的にsession=nullとなり、
// AuthGate（App.tsx）がログイン画面へ切り替える。エラートーストは出さず、
// 「穏やかにログイン画面へ誘導する」という要件を追加コードなしで満たす。
type AuthContextValue = {
  session: Session | null
  user: User | null
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  // 新規サインアップ機能追加（2026年8月25日）：メール確認必須設定
  // （[auth.email] enable_confirmations = true）の場合、signUp成功直後は
  // data.sessionがnullで返る（確認メールのリンクを踏むまでログイン状態には
  // ならない）。呼び出し元（Signup.tsx）がneedsEmailConfirmationを見て、
  // 自動ログイン画面遷移ではなく「確認メールを送信しました」の案内を
  // 表示する。
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>
  signOut: () => Promise<void>
  // 設定画面拡張 Phase 2（2026年8月28日）：メールアドレス・パスワード変更。
  // supabase.auth.updateUser()はメールアドレス変更時、確認メール必須設定
  // （enable_confirmations = true、[[project_account_login_closed]]参照）の下では
  // 即座には反映されず、旧・新両アドレスに送られる確認リンクを踏むまでは
  // メールアドレスが変わらない（Supabase Authの標準挙動）。呼び出し元
  // （Settings.tsx）がその旨を案内文で表示する。
  updateEmail: (newEmail: string) => Promise<{ error: string | null }>
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    // コールドスタート時の認証状態初期化（不具合対応、2026年8月27日）：
    // supabase-js（GoTrueClient.__loadSession、node_modules/@supabase/auth-js
    // のソースで確認済み）は、アクセストークンが実際に期限切れの状態で
    // リフレッシュを試みた際、一時的なネットワークエラー（PWAがバックグラウンド
    // から復帰した直後で接続がまだ確立していない、等）が起きると、リフレッシュ
    // トークン自体が無効というわけではないにもかかわらず、error付きで
    // session: nullを返す設計になっている。これを無条件に「未ログイン」として
    // 扱うと、コールドスタートのたびに（特にモバイル・PWAで）実際にはログイン
    // 済みなのにログイン画面に戻される症状の主因になりうるため、error付きで
    // nullが返ってきた場合に限り1回だけ短い間隔を空けて再試行し、それでも
    // 失敗した場合のみ実際に未ログイン扱いとする。
    const loadSession = (isRetry = false) => {
      supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (!isMounted) return
          if (error && !data.session && !isRetry) {
            window.setTimeout(() => loadSession(true), 1500)
            return
          }
          setSession(data.session)
          setIsLoading(false)
        })
        .catch((error) => {
          // getSession()自体が例外を投げた場合（未捕捉のPromise拒否）にisLoadingが
          // 永久にtrueのまま固まってしまうのを防ぐガード。
          if (!isMounted) return
          console.error('セッション復元に失敗しました', error)
          setIsLoading(false)
        })
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return
      // INITIAL_SESSIONは上のloadSession（リトライ込み）が既に権威的に処理する
      // ため、ここでは無視する（二重処理・上書きレースを防ぐ。onAuthStateChange
      // 側のINITIAL_SESSION発行も同じくGoTrueClientの内部エラー時にnullで発火
      // しうるため、ここで拾ってしまうとloadSession側の再試行結果を上書きし得る）。
      if (event === 'INITIAL_SESSION') return
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }

  const signUp = async (
    email: string,
    password: string,
  ): Promise<{ error: string | null; needsEmailConfirmation: boolean }> => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      return { error: error.message, needsEmailConfirmation: false }
    }
    return { error: null, needsEmailConfirmation: data.session === null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const updateEmail = async (newEmail: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    return { error: error ? error.message : null }
  }

  const updatePassword = async (newPassword: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    return { error: error ? error.message : null }
  }

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, isLoading, signIn, signUp, signOut, updateEmail, updatePassword }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuthはAuthProviderの内側で使用してください')
  }
  return context
}
