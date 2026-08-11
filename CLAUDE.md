# ワークアウト管理アプリ

## プロジェクト概要

トレーニング・食事・体調を一元管理する個人向けアプリ。
現在は単一ユーザーで運用しているが、将来的に複数ユーザーへの展開を想定している。

想定ユーザー：中〜上級者（数値の追跡が目的）
主軸：トレーニング記録と食事・PFC管理が同等

## 技術スタック

- フロントエンド：React + TypeScript + Vite
- バックエンド：Supabase（PostgreSQL、REST API経由）
- ホスティング：Vercel（GitHub連携で自動デプロイ）
- PWA：vite-plugin-pwa
- リポジトリ：applecatoftheship/workout-app

## 現在のファイル構成（2026年8月11日時点、実測値）

src/main.tsx - 13行
src/App.tsx - 857行
src/App.css - 588行
src/index.css - 62行（デザイントークン定義）
src/types.ts - 88行
src/mockData.ts - 158行
src/supabase.ts - 509行
src/vite-env.d.ts - 11行
src/components/MonthlyCalendar.tsx - 1332行
src/components/MonthlyCalendar.css - 393行
src/components/ProgressGraph.tsx - 413行
src/components/ProgressGraph.css - 310行
src/assets/hero.png - 用途不明、要確認
src/assets/vite.svg, react.svg - Viteスキャフォールドの初期ファイル

MonthlyCalendar.tsx と App.tsx が突出して大きい。ファイル分割の主対象。

## 重要な運用ルール

### Supabase

- 新規テーブルを作ったら、必ず先に grant とRLSポリシーを設定してから動作確認する。
  後付けにすると 401 / 42501 エラーの原因調査に時間がかかる。
- スキーマ変更は Supabase の SQL Editor で実行する。
- 本番と開発が同一プロジェクトのため、スキーマ変更は即座に本番へ反映される。
  破壊的な変更を行う前は必ず確認を取ること。
- マイグレーション履歴は残っていない。今後は変更内容をSQLファイルとして
  migrations/ に日付付きで保存する運用に切り替える。

### 開発方針

- 推測で仕様を補完しない。不明点は必ず確認する。
  （本プロジェクト全体で一貫している最重要ルール）
- 破壊的変更・大規模なリファクタリングの前には、内容を説明して承認を得る。
- 既存の動作を壊す可能性がある変更は、影響範囲を明示する。

## デザイントークン

コンセプト：「ナイター照明の下のピッチ」

CSS変数として src/index.css に定義。各コンポーネントのCSSから参照する。
色を直接ハードコードせず、必ず変数を経由すること。

| 用途 | 色 |
|---|---|
| 背景 | #F6F5F2（オフホワイト） |
| ヒーローカード | #12181B（インク紺） |
| アクセント（良好） | #1F6F4B（ピッチグリーン） |
| アクセント（注意） | #E8A33D（琥珀） |
| アクセント（警告） | #B4443C（赤茶） |

フォント：
- 見出し：Oswald（コンデンス体）
- 数値：JetBrains Mono（等幅）
- 本文：Inter

## mockData.ts の実態（要注意）

mockData.ts には monthlyPrograms / trainingLogs / mealLogs / dailyConditions /
progressRecords の5つが定義されているが、実際にアプリから参照されているのは
monthlyPrograms のみ（「トレーニング予定」表示用、8月1日・3日・5日の3日分だけ
のハードコードデータ）。

trainingLogs / mealLogs / dailyConditions / progressRecords の4つは、
Supabase連携以前の名残であり、現在のアプリ実行時には一切参照されていない
（App.tsx・MonthlyCalendar.tsx・ProgressGraph.tsxいずれも、これらはSupabase
経由のstateとpropsで扱っており、mockDataからは読んでいない）。

## 既知の技術的負債

改修時に遭遇したら、勝手に直さず報告すること。

1. 「トレーニング予定」が静的モックデータ
   mockData.ts のハードコードデータ（3日分のみ）を表示している。
   Supabase の training_schedules テーブルとは未接続。
   当日の実績記録がない場合、このモックデータにフォールバックする。

2. 予定の置き場所が3箇所に分散
   - mockData.ts（静的・表示に使用中、3日分のみ）
   - training_schedules テーブル（空・未接続）
   - training_log_exercises.target_reps / target_weight（実績テーブル内の目標値）

3. トレーニング実績が記録できていない
   training_log_exercises のカラムは target_ プレフィックス（目標値）のみ。
   実際に挙げた重量・回数を保存するカラムが存在しない。

4. 数値が text 型
   target_reps / target_weight が text のため、集計・比較ができない。

5. 種目マスタが存在しない
   種目名は自由入力テキスト。表記ゆれで名寄せできない。部位タグもない。

6. 食材の基準量が未定義
   food_items に「1個」「100g」といった基準量のカラムがない。
   custom_multiplier が何に対する倍率か、システム上定義されていない。

7. 栄養値が都度計算＋cascade delete
   food_items を修正すると過去の食事記録の栄養値も変わる。
   食材を削除すると過去記録が消える。

8. unique(log_date) に user_id が含まれない
   マルチユーザー化した時点で破綻する。

9. goals が固定ID1行の上書き運用
   月ごとの目標履歴が残らない。

10. 未使用の型・データが残存
    ProgressRecord（体脂肪率・ウエスト）と TrainingLog.cardio は完全未使用。
    mockData.ts の progressRecords にサンプルデータが1件あるが、
    どこからも参照されていない。

11. ルーティングが存在しない
    useState による表示切替のみ。URLが変わらないため、
    PWAとして「戻る」操作が機能しない。

12. エラーハンドリングが薄い
    Supabase の読み書き失敗時、console.error のみで画面表示なし。

13. src/assets/hero.png の用途が不明
    ファイルの存在は確認されているが、どこから参照されているか未確認。

## 現在のデータ件数（2026年8月11日時点）

daily_conditions: 4件 / goals: 1件 / training_logs: 1件 /
training_log_exercises: 2件 / food_items: 61件 / meal_logs: 2件 /
meal_log_food_items: 3件 / dishes: 0件 / dish_food_items: 0件 /
meal_sizes: 4件 / training_schedules: 0件

いずれも少数のため、データ構造の再設計時は「移行」よりも
「作り直し」が現実的な選択肢。

## 進行中の計画

データ構造の再設計を予定している。決定済みの方針：

- 種目マスタ（exercises）の新設。部位タグ・器具タイプを持つ
- セット単位の実績テーブル（training_sets）の新設
- 実績値を数値型で保存
- 食材に基準量カラムを追加し、栄養値をスナップショット保存に変更
- 食材は論理削除に変更
- unique(user_id, log_date) への制約変更（認証実装は後回し）
- 予定機能はメニューテンプレート方式で実装

作業順序：土台整備 → トレーニング → 食事 → 予定

現在地：土台整備フェーズ（バックアップ完了、Claude Code導入完了、
CLAUDE.md作成中、ファイル分割はこれから）
