import { defineConfig } from 'vitest/config'

// vite.config.ts とは独立した設定ファイルとして分離した。src/utils/ の純粋関数
// テストのみが対象で、React/PWAプラグインやjsdom環境は不要なため
// （既存のvite.config.tsに`test`ブロックを足すとdefineConfig（'vite'由来）の
// 型と衝突するため、意図的にファイルを分けている）。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
