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
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session)
        setIsLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (isMounted) {
        setSession(nextSession)
        setIsLoading(false)
      }
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

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, isLoading, signIn, signUp, signOut }}>
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
