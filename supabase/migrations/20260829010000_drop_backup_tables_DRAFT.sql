-- ============================================================================
-- バックログD-16：backup_*テーブル15件の削除（2026年8月29日）
--
-- 【未実行】Johnさんの承認により15件全ての削除方針が決定した（2026年8月29日）。
-- Supabase SQL Editorで人間（John）が手動実行すること。Claude Codeからは
-- 直接Supabaseへ接続できないため、下記STEP 0の確認クエリも含めて全て
-- 未実行・未検証。
--
-- 【背景】この15件は2026年8月25日、アカウント/ログイン機能フェーズB
-- （DEFAULT_USER_IDプレースホルダーから実auth.uid()への切り替え）の直前に、
-- ロールバック用の安全策として一括作成されたスナップショット
-- （`20260825010000_phase_b_auth_cutover_DRAFT.sql` STEP 1、
-- `create table backup_X as table X`方式）。フェーズBの認証切り替えは
-- 同日に完了・クローズ済みで、ロールバックが必要になった記録はない。
--
-- 【本番不可逆操作についての注意】DROP TABLEは元に戻せない。このファイルの
-- 実行前に、前回報告した以下2クエリを必ず実行し、想定通り15件のみが対象で
-- あること・削除して問題ない内容であることを再確認してから進めること。
--
--   -- 1. backup_%に一致する全テーブルの洗い出し（15件以外がないか確認）
--   select table_name
--   from information_schema.tables
--   where table_schema = 'public'
--     and table_name like 'backup_%'
--   order by table_name;
--
--   -- 2. 各テーブルの行数確認
--   select 'backup_training_logs' as table_name, count(*) from backup_training_logs
--   union all select 'backup_training_log_exercises', count(*) from backup_training_log_exercises
--   union all select 'backup_training_sets', count(*) from backup_training_sets
--   union all select 'backup_training_templates', count(*) from backup_training_templates
--   union all select 'backup_training_template_exercises', count(*) from backup_training_template_exercises
--   union all select 'backup_training_schedules', count(*) from backup_training_schedules
--   union all select 'backup_daily_conditions', count(*) from backup_daily_conditions
--   union all select 'backup_meal_logs', count(*) from backup_meal_logs
--   union all select 'backup_meal_log_food_items', count(*) from backup_meal_log_food_items
--   union all select 'backup_dishes', count(*) from backup_dishes
--   union all select 'backup_dish_food_items', count(*) from backup_dish_food_items
--   union all select 'backup_goals', count(*) from backup_goals
--   union all select 'backup_soccer_logs', count(*) from backup_soccer_logs
--   union all select 'backup_exercises', count(*) from backup_exercises
--   union all select 'backup_food_items', count(*) from backup_food_items
--   order by table_name;
--
-- 上記クエリの結果が想定と異なる場合（15件以外のbackup_*テーブルが存在する等）、
-- このDROP文をそのまま実行せず、まず食い違いの原因を確認すること
-- （このファイルは承認済みの15件のみを対象としており、それ以外のbackup_*
-- テーブルは含まれていない）。
-- ============================================================================

begin;

drop table if exists backup_training_logs;
drop table if exists backup_training_log_exercises;
drop table if exists backup_training_sets;
drop table if exists backup_training_templates;
drop table if exists backup_training_template_exercises;
drop table if exists backup_training_schedules;
drop table if exists backup_daily_conditions;
drop table if exists backup_meal_logs;
drop table if exists backup_meal_log_food_items;
drop table if exists backup_dishes;
drop table if exists backup_dish_food_items;
drop table if exists backup_goals;
drop table if exists backup_soccer_logs;
drop table if exists backup_exercises;
drop table if exists backup_food_items;

commit;


-- ============================================================================
-- 実行後の確認クエリ（0件になっていることを確認）
-- ============================================================================
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name like 'backup_%'
order by table_name;
