# アーキテクチャ変更の経緯

CLAUDE.mdの軽量化のため、判断理由や過去の経緯（結論だけでなく「なぜ」の部分）
をここに退避している。結論（現在の状態）はCLAUDE.md本体に残してあるので、
背景を知りたいときだけこのファイルを参照する。

## ファイル分割（2026年8月11日）

元は `App.tsx`（857行）・`components/MonthlyCalendar.tsx`（1332行）・
`components/ProgressGraph.tsx`（413行）・`supabase.ts`（509行）に
ほぼ全ロジックが集約されていた。画面（pages）・フォーム/グラフ部品
（components）・API層（api）・ユーティリティ（utils）・型定義（types.ts）
に分離した。分割は「機能変更なし・純粋な移動」の方針で実施。

`MealLogForm.tsx`・`TrainingLogForm.tsx`は目安の300行を超えているが、
フォーム内のロジック（サジェスト種目選択・シンプル/詳細入力切替・
テンプレート・実摂取量入力など）が一体の機能のため、さらに分割すると
追跡しづらくなると判断し1ファイルにまとめることで合意した。

## トレーニングデータ構造の再設計（2026年8月12日）

再設計前の課題（解消済み）：
- トレーニング実績が記録できない（`training_log_exercises`が`target_`プレフィックスの
  目標値カラムのみで、実績値を保存するカラムが存在しなかった）
- 数値がtext型のため集計・比較ができない
- 種目マスタが存在せず、種目名は自由入力（表記ゆれで名寄せ不可）
- `unique(log_date)`にuser_idが含まれず、マルチユーザー化で破綻する設計だった

対応：種目マスタ（exercises）、セット単位の実績テーブル（training_sets）、
テンプレート（training_templates / training_template_exercises）を新設。
データ量が少なかったため「移行」ではなく「作り直し」を選択
（実行前: daily_conditions 4件 / goals 1件 / training_logs 1件 /
training_log_exercises 2件 / food_items 61件 / meal_logs 2件など）。

### user_id を固定プレースホルダーにした理由

認証実装は後回しの方針のため、`training_logs.user_id`は当初nullableで
設計していた。しかしPostgreSQLの一意制約は`NULL`同士を「異なる値」として
扱うため、`unique(user_id, log_date)`は`user_id`がNULLの間実質的に機能せず、
同じ日付で複数行の挿入が制約エラーなく通ってしまう問題があった。
そのため、`goals`テーブルの`GOALS_ROW_ID`と同じ考え方で、固定プレースホルダー
UUID（`00000000-0000-0000-0000-000000000002`）を`DEFAULT_USER_ID`として
`src/api/trainingLogs.ts`に定数化し、常に明示的に指定する方式にした。

### フォームUIの設計判断

- 種目名はサジェスト付き入力（`<datalist>`）とし、候補にない名前を
  入力した場合はその場で部位を選んで新規登録できる（`ExerciseNameInput.tsx`）
- 入力はシンプル入力（セット数・回数・重量を1組）を既定とし、
  「詳細入力に切り替える」でセットごとの個別入力に切り替え可能
- 既存実績の編集時は、保存済みの実際のセットデータを正しく表示するため
  常に詳細モードで開く（simple/detailedのどちらで記録したかはDBに
  残らないため、編集時は安全側に倒した）
- テンプレート機能は「現在の入力内容をテンプレートとして保存」方式を採用。
  独立したテンプレート作成画面を別途作るよりも、実装コストを抑えつつ
  「良かったメニューを再利用する」というユースケースを満たせると判断した

## 食事データ構造の再設計（2026年8月12日）

再設計前の課題（解消済み）：
- 栄養値が都度計算方式で、`food_items`を修正すると過去の食事記録の
  栄養値も遡って変わってしまう
- 食材を削除すると`meal_log_food_items`がcascade deleteされ、過去記録が消える

対応：`food_items`に基準量（serving_amount/serving_unit）と論理削除フラグ
（is_deleted）を追加。`meal_log_food_items`に確定スナップショット列
（amount/calories/protein/fat/carbohydrates）を追加し、保存時点の食材データで
栄養値を確定させる方式に変更。既存の食事記録は`custom_multiplier`をもとに
バックフィルした（詳細は`sql-migrations.md`参照）。

既存食材61件は開発優先のため一律`serving_amount=100, serving_unit='g'`で
初期化した（技術的負債としてCLAUDE.md本体に記載）。新規登録フォームには
基準量・単位の入力欄を追加したため、この問題は今後蓄積しない。

`custom_multiplier`列はDBに残存するが、新しいコードからは参照していない
（後日削除を検討）。

## mockData.ts のクリーンアップ（2026年8月12日）

`mockAppData`には元々 monthlyPrograms / trainingLogs / mealLogs /
dailyConditions / progressRecords の5つが定義されていたが、確認の結果
monthlyPrograms以外はどこからも参照されていないことが判明した
（Supabase連携以前の名残）。

`trainingLogs`は、新しいトレーニングデータ構造（種目マスタへのUUID参照が
必須）では静的サンプルとして有効な値を作れなくなったため、型・データとも
`AppDataModel`から完全に削除した。`mealLogs`/`dailyConditions`/
`progressRecords`は今回の再設計と無関係な既存の未使用データのため、
指示の範囲外と判断してそのまま残している（CLAUDE.md本体の技術的負債に記載）。
