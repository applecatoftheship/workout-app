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

## 現在のファイル構成（2026年8月12日時点）

画面（pages）・フォーム/グラフ部品（components）・API層（api）・
ユーティリティ（utils）・型定義（types.ts）に分離済み。

```
src/
  api/            client.ts, dailyConditions.ts, goals.ts,
                  trainingLogs.ts（種目マスタ・実績・DEFAULT_USER_ID）,
                  trainingTemplates.ts, foodItems.ts, mealLogs.ts
  utils/          calendarHelpers.ts, chartHelpers.ts
  pages/          Dashboard(.css), MonthlyCalendar(.css), ProgressGraph(.css)
  components/
    GoalPanel(.css)
    calendar/     TrainingLogForm.tsx, MealLogForm.tsx, ConditionForm.tsx,
                  ExerciseNameInput.tsx, TrainingTemplateSection.tsx, CalendarForms.css
    graphs/       TrainingChart, WeightChart, SleepChart, FatigueChart, ChartCommon.css
  App.tsx / App.css   状態管理・データ取得・ビュー切替のみ
  types.ts        全ドメイン型を集約
  mockData.ts     monthlyPrograms（表示に使用中）以外は未使用（下記参照）
```

`TrainingLogForm.tsx`・`MealLogForm.tsx`は目安の300行を超えているが、
一体の機能を分割すると追跡しづらくなるため1ファイルにまとめている
（判断理由は `.claude/references/architecture-history.md` 参照）。

## 重要な運用ルール

### Supabase

- 新規テーブルを作ったら、必ず先に grant とRLSポリシーを設定してから動作確認する。
  後付けにすると 401 / 42501 エラーの原因調査に時間がかかる。
- スキーマ変更は Supabase の SQL Editor で実行する。Claude Codeから直接
  Supabaseへは接続していないため、SQLは必ず人間が手動で実行する。
- 本番と開発が同一プロジェクトのため、スキーマ変更は即座に本番へ反映される。
  破壊的な変更を行う前は必ず確認を取ること。
- 実行済みSQLは `.claude/references/sql-migrations.md` に日付付きで記録している。
  今後は `migrations/` ディレクトリへの保存に切り替える予定。

### 開発方針

- 推測で仕様を補完しない。不明点は必ず確認する。
  （本プロジェクト全体で一貫している最重要ルール）
- 破壊的変更・大規模なリファクタリングの前には、内容を説明して承認を得る。
- 既存の動作を壊す可能性がある変更は、影響範囲を明示する。

## デザイントークン

コンセプト：「ナイター照明の下のピッチ」。CSS変数として src/index.css に定義。
各コンポーネントのCSSから参照する。色を直接ハードコードせず、必ず変数を経由すること。

| 用途 | 色 |
|---|---|
| 背景 | #F6F5F2（オフホワイト） |
| ヒーローカード | #12181B（インク紺） |
| アクセント（良好） | #1F6F4B（ピッチグリーン） |
| アクセント（注意） | #E8A33D（琥珀） |
| アクセント（警告） | #B4443C（赤茶） |

フォント：見出し=Oswald（コンデンス体）、数値=JetBrains Mono（等幅）、本文=Inter

## データ構造（2026年8月12日 再設計済み）

**トレーニング**：種目マスタ（exercises）・セット単位実績（training_sets）・
テンプレート（training_templates / training_template_exercises）。
`training_log_exercises`は`exercise_id`+`order_index`のみを持ち、実績は
`training_sets`にセットごと（set_number, weight, reps, is_warmup）で保存する。
`training_logs.user_id`は固定プレースホルダー
`00000000-0000-0000-0000-000000000002`（`DEFAULT_USER_ID`, src/api/trainingLogs.ts）。
認証実装は後回しのため実質単一ユーザー運用だが、`unique(user_id, log_date)`
制約が機能する状態にしている。

**食事**：`food_items`に基準量（serving_amount/serving_unit）と論理削除フラグ
（is_deleted）、`meal_log_food_items`に確定スナップショット列（amount/calories/
protein/fat/carbohydrates）を追加。保存時点の食材データで栄養値を確定させる
方式のため、以後food_itemsを修正しても過去の食事記録は変化しない。
`custom_multiplier`列はDBに残存するが新コードからは未参照（後日削除を検討）。

いずれもSQL実行済み・動作確認済み。SQL全文と設計判断の理由は
`.claude/references/sql-migrations.md` / `.claude/references/architecture-history.md` 参照。

## 既知の技術的負債

改修時に遭遇したら、勝手に直さず報告すること。

1. 「トレーニング予定」が静的モックデータ
   mockData.ts のハードコードデータ（3日分のみ）を表示している。
   Supabase の training_schedules テーブルとは未接続。
   当日の実績記録がない場合、このモックデータにフォールバックする。

2. 予定の置き場所が3箇所に分散
   - mockData.ts（静的・表示に使用中、3日分のみ）
   - training_schedules テーブル（空・未接続）
   - training_templates（トレーニング側テンプレートとして機能するが、
     「予定」表示（カレンダー上のトレーニング予定欄）とはまだ連携していない）

3. 食材マスタ（food_items）既存61件の基準量が一律 100g
   開発優先のため、既存61件は一律 `serving_amount=100, serving_unit='g'` で
   初期化している。「卵1個」「プロテイン1食分30g」のような個数/単位系の
   食材も、DB上は一時的に「100g」として記録された状態になっている。
   後日、手動データ修正またはマスターデータ補正パッチで個別に基準量・単位を
   修正する必要がある。新規登録する食材は登録フォームで基準量・単位を
   指定できるため、この問題は蓄積しない。

4. user_id が未整備なテーブルが残っている
   training_logs のみ対応済み。meal_logs・daily_conditions・goals は
   user_id を持たず、マルチユーザー化の際にまとめて対応が必要。

5. goals が固定ID1行の上書き運用
   月ごとの目標履歴が残らない。

6. 未使用の型・データが残存
   ProgressRecord（体脂肪率・ウエスト）と TrainingLog.cardio は完全未使用。
   mockData.ts の mealLogs/dailyConditions/progressRecords にサンプルデータが
   あるが、どこからも参照されていない。

7. ルーティングが存在しない
   useState による表示切替のみ。URLが変わらないため、
   PWAとして「戻る」操作が機能しない。

8. エラーハンドリングが薄い
   Supabase の読み書き失敗時、console.error のみで画面表示なし。

9. food_items の論理削除UIが未実装
   `deleteFoodItem`（is_deleted論理削除）はAPI層に用意したが、
   呼び出すUI（食材削除ボタン等）がまだ存在しない。

## 進行中の計画（現在地）

作業順序：土台整備 → トレーニング → 食事 → 予定

- トレーニング：完了（種目マスタ・training_sets・テンプレート・UI）
- 食事：完了（基準量・論理削除・スナップショット保存・UI、SQL実行・動作確認済み）
  残作業は技術的負債3番（既存食材の基準量個別修正）と9番（削除UI）
- 予定：未着手。メニューテンプレート方式で実装する方針だが、
  トレーニング予定のカレンダー表示（mockData依存）とtraining_templatesの
  連携はまだ行っていない

データ件数は都度Supabaseで確認する（このファイルでは追跡しない）。

## 参照ドキュメント

- `.claude/references/sql-migrations.md` — 実行済みSQLの全文
- `.claude/references/architecture-history.md` — 再設計の背景・判断理由
