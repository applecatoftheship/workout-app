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

## 現在のファイル構成（2026年8月12日時点、実測値）

ファイル分割済み。画面（pages）・フォーム/グラフ部品（components）・API層（api）・
ユーティリティ（utils）・型定義（types.ts）に分離されている。

```
src/
  api/            client.ts, dailyConditions.ts, goals.ts,
                  trainingLogs.ts（種目マスタ・実績・DEFAULT_USER_ID）,
                  trainingTemplates.ts, foodItems.ts, mealLogs.ts
  utils/          calendarHelpers.ts, chartHelpers.ts
  pages/          Dashboard(.css), MonthlyCalendar(.css), ProgressGraph(.css)
  components/
    GoalPanel(.css)
    calendar/     TrainingLogForm.tsx（609行）, MealLogForm.tsx（582行）,
                  ConditionForm.tsx, ExerciseNameInput.tsx,
                  TrainingTemplateSection.tsx, CalendarForms.css
    graphs/       TrainingChart, WeightChart, SleepChart, FatigueChart,
                  ChartCommon.css
  App.tsx / App.css   状態管理・データ取得・ビュー切替のみ
  types.ts        全ドメイン型を集約
  mockData.ts     monthlyPrograms（表示に使用中）と、未使用の
                  mealLogs/dailyConditions/progressRecords サンプルのみ
```

`MealLogForm.tsx`・`TrainingLogForm.tsx`は目安の300行を超えているが、
フォーム内のロジック（サジェスト種目選択・シンプル/詳細入力切替・
テンプレート・実摂取量入力など）が一体の機能のため、分割すると
追跡しづらくなると判断し1ファイルにまとめている（過去の合意事項）。

## 重要な運用ルール

### Supabase

- 新規テーブルを作ったら、必ず先に grant とRLSポリシーを設定してから動作確認する。
  後付けにすると 401 / 42501 エラーの原因調査に時間がかかる。
- スキーマ変更は Supabase の SQL Editor で実行する。Claude Codeから直接
  Supabaseへは接続していないため、SQLは必ず人間が手動で実行する。
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

`mockAppData` には monthlyPrograms / mealLogs / dailyConditions / progressRecords
の4つが定義されているが、実際にアプリから参照されているのは monthlyPrograms のみ
（「トレーニング予定」表示用、8月1日・3日・5日の3日分だけのハードコードデータ）。

`trainingLogs` フィールドは、新しいトレーニングデータ構造（種目マスタへの
UUID参照が必須）では静的サンプルとして成立しなくなったため、型・データとも
完全に削除済み（2026年8月12日）。

`mealLogs` / `dailyConditions` / `progressRecords` の3つは、Supabase連携以前の
名残であり、現在のアプリ実行時には一切参照されていない
（Dashboard.tsx・MonthlyCalendar.tsx・ProgressGraph.tsxいずれも、これらはSupabase
経由のstateとpropsで扱っており、mockDataからは読んでいない）。

## トレーニングデータ構造（2026年8月12日 再設計済み）

種目マスタ（exercises）・セット単位実績（training_sets）・
テンプレート（training_templates / training_template_exercises）を新設。

- `training_log_exercises` は `exercise_id`（exercises参照）+ `order_index` のみを持ち、
  種目名・目標値の直接保存はしない
- 実績は `training_sets` にセットごと（set_number, weight, reps, is_warmup）で保存
- `training_logs.user_id` は固定プレースホルダー
  `00000000-0000-0000-0000-000000000002`（`DEFAULT_USER_ID`, src/api/trainingLogs.ts）。
  認証実装は後回しのため、実質単一ユーザー運用だが `unique(user_id, log_date)`
  制約が機能する状態にしている
- `TrainingLogForm.tsx` は種目名のサジェスト入力＋新規登録、
  シンプル入力（セット数・回数・重量を1組）と詳細入力（セットごと個別）の
  切り替え、テンプレート適用・保存に対応

## 食事データ構造（2026年8月12日 再設計中）

food_items に基準量（serving_amount / serving_unit）と論理削除フラグ（is_deleted）、
meal_log_food_items に確定スナップショット列（amount / calories / protein / fat /
carbohydrates）を追加する改修。以下のSQLをSupabase SQL Editorで実行する必要がある
（未実行の場合、コードは新しいカラムを前提に動くため実行前は失敗する）。

```sql
ALTER TABLE food_items
  ADD COLUMN IF NOT EXISTS serving_amount NUMERIC NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS serving_unit TEXT NOT NULL DEFAULT 'g',
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE meal_log_food_items
  ADD COLUMN IF NOT EXISTS amount NUMERIC,
  ADD COLUMN IF NOT EXISTS calories NUMERIC,
  ADD COLUMN IF NOT EXISTS protein NUMERIC,
  ADD COLUMN IF NOT EXISTS fat NUMERIC,
  ADD COLUMN IF NOT EXISTS carbohydrates NUMERIC;

UPDATE meal_log_food_items mlfi
SET
  amount = COALESCE(mlfi.custom_multiplier, 1.0) * fi.serving_amount,
  calories = ROUND(COALESCE(mlfi.custom_multiplier, 1.0) * fi.calories, 1),
  protein = ROUND(COALESCE(mlfi.custom_multiplier, 1.0) * fi.protein, 1),
  fat = ROUND(COALESCE(mlfi.custom_multiplier, 1.0) * fi.fat, 1),
  carbohydrates = ROUND(COALESCE(mlfi.custom_multiplier, 1.0) * fi.carbohydrates, 1)
FROM food_items fi
WHERE mlfi.food_item_id = fi.id
  AND mlfi.calories IS NULL;
```

食事記録の栄養値は、保存時点の食材データで確定させたスナップショットを
`meal_log_food_items` に直接保存する方式に変更（`src/api/mealLogs.ts`）。
以後、食材（food_items）の値を修正しても過去の食事記録の栄養値は変化しない。
食材の削除は `is_deleted` フラグによる論理削除に変更（`src/api/foodItems.ts`の
`deleteFoodItem`。※現時点でこの関数を呼び出すUIボタンは未実装、API層のみ対応済み）。

`custom_multiplier` 列はDBに残存するが、新しいコードからは参照していない
（後日削除を検討）。

## 既知の技術的負債

改修時に遭遇したら、勝手に直さず報告すること。

1. 「トレーニング予定」が静的モックデータ
   mockData.ts のハードコードデータ（3日分のみ）を表示している。
   Supabase の training_schedules テーブルとは未接続。
   当日の実績記録がない場合、このモックデータにフォールバックする。

2. 予定の置き場所が3箇所に分散
   - mockData.ts（静的・表示に使用中、3日分のみ）
   - training_schedules テーブル（空・未接続）
   - training_templates（新設。トレーニング側のテンプレートとして機能するが、
     「予定」表示（カレンダー上のトレーニング予定欄）とはまだ連携していない）

3. 食材マスタ（food_items）既存61件の基準量が一律 100g
   2026年8月12日のSQL改修で `serving_amount` / `serving_unit` 列を追加したが、
   既存61件は開発優先のため一律 `serving_amount=100, serving_unit='g'` で
   初期化している。そのため「卵1個」「プロテイン1食分30g」のような
   個数/単位系の食材も、DB上は一時的に「100g」として記録された状態になっている。
   後日、手動データ修正またはマスターデータ補正パッチで個別に基準量・単位を
   修正する必要がある。新規登録する食材は登録フォームで基準量・単位を
   指定できるため、この問題は蓄積しない。

4. user_id が未整備なテーブルが残っている
   training_logs のみ `user_id`（固定プレースホルダー）+
   `unique(user_id, log_date)` に対応済み。meal_logs・daily_conditions・goals は
   user_id を持たず、マルチユーザー化の際にまとめて対応が必要。

5. goals が固定ID1行の上書き運用
   月ごとの目標履歴が残らない。

6. 未使用の型・データが残存
   ProgressRecord（体脂肪率・ウエスト）と TrainingLog.cardio は完全未使用。
   mockData.ts の progressRecords にサンプルデータが1件あるが、
   どこからも参照されていない。

7. ルーティングが存在しない
   useState による表示切替のみ。URLが変わらないため、
   PWAとして「戻る」操作が機能しない。

8. エラーハンドリングが薄い
   Supabase の読み書き失敗時、console.error のみで画面表示なし。

9. food_items の論理削除UIが未実装
   `deleteFoodItem`（is_deleted論理削除）はAPI層に用意したが、
   呼び出すUI（食材削除ボタン等）がまだ存在しない。

## 現在のデータ件数について

2026年8月11日時点の件数（daily_conditions: 4件 / goals: 1件 / training_logs: 1件 /
food_items: 61件 / meal_logs: 2件 など）は、トレーニング・食事のスキーマ改修（8/12）
により古い情報になっている。特に training_logs・training_log_exercises は
再設計時に全削除して作り直した。最新件数が必要な場合はSupabaseで再確認すること。

## 進行中の計画

データ構造の再設計を進めている。

**トレーニング（完了）**：
- 種目マスタ（exercises）新設、セット単位実績（training_sets）新設 → 完了
- テンプレート機能（training_templates）新設・UI実装 → 完了
- unique(user_id, log_date) への制約変更 → 完了（user_idは固定プレースホルダー）

**食事（実施中）**：
- 食材に基準量カラムを追加、栄養値をスナップショット保存に変更 → コード実装済み。
  **SQLは未実行**。上記「食事データ構造」セクションのSQLをSupabase SQL Editorで
  実行する必要がある
- 食材は論理削除に変更 → API層のみ対応済み、削除UIは未実装
- 既存食材61件の基準量個別修正 → 未着手（技術的負債3番）

**予定（未着手）**：
- 予定機能はメニューテンプレート方式で実装する方針だが、トレーニング予定の
  カレンダー表示（mockData依存）とtraining_templatesの連携はまだ行っていない

作業順序：土台整備 → トレーニング → 食事 → 予定
現在地：食事フェーズ（コード実装済み、SQL実行待ち）
