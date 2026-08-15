import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// 永続化なし（セッション中のみ保持、案A）。リロードすると再びOS設定に戻る。
// 理由：localStorageが使用不可のため、Supabaseへの永続化（案B）は
// 次フェーズ以降で必要になれば検討する。
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return { theme, setTheme }
}
