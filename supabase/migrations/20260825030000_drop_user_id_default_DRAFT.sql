-- ============================================================================
-- 【ドラフト・未実行】固定UUIDデフォルト値の削除
-- 作成日: 2026年8月25日
--
-- 【背景】
-- フェーズBの本番切り替え時（20260825010000_phase_b_auth_cutover_DRAFT.sql
-- STEP 2）に、以下10テーブルのuser_id列のデフォルト値を、旧固定プレース
-- ホルダーUUID（00000000-0000-0000-0000-000000000002）から新しい認証
-- ユーザーUUIDへ更新した。これは当時、一部の子テーブルinsert処理が
-- user_idを明示指定せずDB列側のデフォルト値に暗黙依存していた問題への
-- 保険として設定したもの（フェーズA実装時に発見・修正済み）。
--
-- 現在はアプリ側の全insert処理（フェーズAで修正済み）が必ず
-- getCurrentUserId()で取得した認証済みuser.idを明示的に指定するため、
-- このデフォルト値に実際に依存する経路は存在しない。今回の新規サインアップ
-- 機能追加により複数ユーザーが同時に存在しうる状態になったため、
-- 「特定の1ユーザーのUUIDが暗黙のデフォルト値としてテーブルに残っている」
-- こと自体が実態と合わなくなった（新規ユーザーのinsertでuser_id指定が
-- 万が一漏れた場合、新規ユーザーのデータが誤って元の1ユーザーのUUIDに
-- 紐づいてしまうリスクがある）。そのため、デフォルト値自体を削除し、
-- user_idの指定漏れがあれば（NOT NULL制約により）INSERT時にエラーとして
-- 検出できる状態にする。
--
-- 【影響範囲の確認】
-- - 既存データの値は一切変更されない（drop defaultは今後のINSERT時の
--   暗黙補完を無効化するだけで、既存の行のuser_id値には触れない）。
-- - RLSポリシー（auth.uid() = user_id）は列の実際の値のみを参照するため、
--   デフォルト値の有無に一切影響されない。
-- - 対象10テーブルは全てuser_idがNOT NULL制約付きのため、デフォルト値
--   削除後にuser_idを指定せずINSERTしようとすると、正しく
--   「null value in column "user_id" violates not-null constraint」
--   エラーになる（これが意図した挙動：指定漏れを黙って誤ったユーザーに
--   紐づけるのではなく、エラーとして顕在化させる）。
--
-- 【重要】このファイルはこのフェーズでは実行しない。Johnさんが内容を
-- 確認の上、Supabase SQL Editorで手動実行すること。
-- ============================================================================

alter table training_log_exercises alter column user_id drop default;
alter table training_sets alter column user_id drop default;
alter table training_template_exercises alter column user_id drop default;
alter table daily_conditions alter column user_id drop default;
alter table meal_logs alter column user_id drop default;
alter table meal_log_food_items alter column user_id drop default;
alter table dish_food_items alter column user_id drop default;
alter table goals alter column user_id drop default;
alter table training_logs alter column user_id drop default;
alter table dishes alter column user_id drop default;

-- 実行後の確認用（読み取り専用）：対象10テーブルでcolumn_defaultが
-- 全てNULLになっていればOK。
select table_name, column_name, column_default
from information_schema.columns
where table_schema = 'public'
  and column_name = 'user_id'
  and table_name in (
    'training_log_exercises','training_sets','training_template_exercises',
    'daily_conditions','meal_logs','meal_log_food_items','dish_food_items',
    'goals','training_logs','dishes'
  )
order by table_name;
