import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'workout-app:theme'

// 既定値はダーク固定（2026年8月28日、デフォルトテーマ変更）。旧実装は
// OS設定（prefers-color-scheme）に追従していたが、今回の変更で既定値を
// ダークに統一したためOS設定の参照は廃止した。localStorageに保存済みの値が
// あればそれを優先する（手動で選んだテーマはリロード後も維持する）。
function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'light' ? 'light' : 'dark'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  return { theme, setTheme }
}
