# iOSスプラッシュ画像（未配置）

アプリ起動演出刷新（ART DECO CLASSICテーマ、2026年8月28日）の仕様に基づき、
`index.html`の`<link rel="apple-touch-startup-image">`が以下の2ファイルを
参照する状態になっています。

- ファイル名: `iphone-1170x2532.png`
  サイズ: 1170×2532px（390×844ptの3倍密度、iPhone 12/13/14の標準サイズ）
- ファイル名: `iphone-1284x2778.png`
  サイズ: 1284×2778px（428×926ptの3倍密度、iPhone 12/13/14 Pro Max・14 Plusのサイズ）
- 形式: PNG（既存アイコン群はSVG統一だが、iOSのapple-touch-startup-imageはPNG必須）

これらのファイル自体（実際のブランドデザインを反映した画像）はClaude Codeでは
生成できないため、Gemini側のデザイン成果物として用意し、このディレクトリに
配置してください。配置後は`vite.config.ts`のincludeAssets（`icons/splash/*.png`）
が自動的にプリキャッシュ対象に含めます。

ファイルが存在しない間は、iOSが該当linkタグを単に無視し標準のスプラッシュ表示に
フォールバックするだけで、エラーにはなりません。

他の解像度（iPhone SE・iPad等）が必要な場合は、同じART DECO CLASSICデザインで
追加生成し、同じ命名パターン（`iphone-<幅>x<高さ>.png`）でこのディレクトリに
配置した上で、`index.html`に対応する`<link>`タグを追加してください。
