import type { AccentColorId } from '../types'

// 設定画面拡張 Phase 1（2026年8月28日）：アクセントカラー選択機能。
// Gemini側の仕様書は--color-primary/--color-primary-hoverの上書きを想定していたが、
// このプロジェクトの実際のブランドカラートークンはtokens.cssの--color-accent系
// （--color-accent/--color-accent-soft/--color-accent-text）であり--color-primaryは
// 存在しないため、実トークンを上書きする方式に読み替えた（判断理由）。
//
// 仕様書のデフォルト値'teal'は既存アプリの現在のプライマリカラー（オレンジ、
// tokens.cssの--color-accent: #E85D2C）と大きく異なるため、指示書の「既存の配色に
// 近い値をデフォルトにしてほしい」に従いデフォルトを'orange'に変更した（判断理由）。
//
// スプラッシュ画面とのUI統一 v6（2026年8月28〜29日、John承認）：新規プリセット
// 'artdeco'（コーラル、スプラッシュ画面の心拍ラインと同じ#FF6B6B系）を追加し、
// これを新しいデフォルトに変更した（John「選択機能は残す」の指示により、既存の
// orange/teal/blue/purpleは削除せずそのまま選択肢に残す）。
export const ACCENT_COLOR_IDS: AccentColorId[] = ['artdeco', 'orange', 'teal', 'blue', 'purple']

export const ACCENT_COLOR_LABELS: Record<AccentColorId, string> = {
  artdeco: 'コーラル',
  orange: 'オレンジ',
  teal: 'ティール',
  blue: 'ブルー',
  purple: 'パープル',
}

export const DEFAULT_ACCENT_COLOR: AccentColorId = 'artdeco'

type AccentColorTokens = {
  accent: string
  accentSoft: string
  accentText: string
}

// orange・tealはtokens.cssの既存--color-accent/--color-data系の値をそのまま流用
// （新しい色味を増やさず、既存デザインとの一貫性を保つため）。blueはSettings.tsxの
// 既存ACCENT_PRESETS（無効化されていたスウォッチ）で使われていた#2F6FEDを踏襲。
// purpleはtokens.cssの--color-ma-sleep（#8B5CF6）を踏襲。soft/textは各accentの
// 既存ペア（orange/tealのライト/ダーク差分）と同様の明度関係になるよう新規に定めた。
// artdecoはスプラッシュ画面（SplashScreen.css）の心拍ライン色#FF6B6Bをそのまま
// 踏襲し、soft/textはデザインキャンバスv6で承認された値をそのまま使用。
const ACCENT_COLOR_TOKENS: Record<AccentColorId, { light: AccentColorTokens; dark: AccentColorTokens }> = {
  artdeco: {
    light: { accent: '#E0524A', accentSoft: '#FCE4E1', accentText: '#A13228' },
    dark: { accent: '#FF6B6B', accentSoft: '#3D2323', accentText: '#FFAFAF' },
  },
  orange: {
    light: { accent: '#E85D2C', accentSoft: '#FBE2D3', accentText: '#A8391A' },
    dark: { accent: '#FF7A33', accentSoft: '#3A2417', accentText: '#FFB088' },
  },
  teal: {
    light: { accent: '#1D9C93', accentSoft: '#D8F0EE', accentText: '#0F5E58' },
    dark: { accent: '#35C9C0', accentSoft: '#12302E', accentText: '#8FE0DA' },
  },
  blue: {
    light: { accent: '#2F6FED', accentSoft: '#DCE7FC', accentText: '#1D4CAE' },
    dark: { accent: '#5B8DF6', accentSoft: '#16233F', accentText: '#A9C4FB' },
  },
  purple: {
    light: { accent: '#8B5CF6', accentSoft: '#EAE0FD', accentText: '#5B34B8' },
    dark: { accent: '#A78BFA', accentSoft: '#2A2145', accentText: '#D9CBFC' },
  },
}

// document.documentElement.style（インラインstyle）にセットすることで、
// tokens.cssの:root/[data-theme="dark"]セレクタより詳細度で確実に上書きする。
// useTheme.tsがdata-theme属性をdocument.documentElementに設定するのと同じ層で
// 動作するグローバル副作用のため、呼び出し側はtheme切り替え時にも再適用が必要
// （AppShellでprofile.accentColorとthemeの両方をdepsにしたuseEffectから呼ぶ）。
export function applyAccentColor(accentColorId: AccentColorId | undefined, theme: 'light' | 'dark'): void {
  const id = accentColorId ?? DEFAULT_ACCENT_COLOR
  const tokens = ACCENT_COLOR_TOKENS[id][theme]
  const root = document.documentElement
  root.style.setProperty('--color-accent', tokens.accent)
  root.style.setProperty('--color-accent-soft', tokens.accentSoft)
  root.style.setProperty('--color-accent-text', tokens.accentText)
}
