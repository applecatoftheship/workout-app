# iOSスプラッシュ画像（未配置）

設定画面拡張 Phase 1（2026年8月28日）の仕様に基づき、`index.html`の
`<link rel="apple-touch-startup-image">`が以下のファイルを参照する状態になっています。

- ファイル名: `iphone-1170x2532.png`
- サイズ: 1170×2532px（390×844ptの3倍密度、iPhone 12/13/14の標準サイズ1機種のみ）
- 形式: PNG（既存アイコン群はSVG統一だが、iOSのapple-touch-startup-imageはPNG必須）

このファイル自体（実際のブランドデザインを反映した画像）はClaude Codeでは生成できないため、
Gemini側のデザイン成果物として用意し、このディレクトリに配置してください。
配置後は`vite.config.ts`のincludeAssets（`icons/splash/*.png`）が自動的にプリキャッシュ対象に含めます。

ファイルが存在しない間は、iOSがこのlinkタグを単に無視し標準のスプラッシュ表示に
フォールバックするだけで、エラーにはなりません。
