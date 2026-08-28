-- service_role向けSELECT権限の追加（6テーブル、backup-table audit時に発覚）
--
-- 【未実行】Supabase SQL Editorで人間（John）が手動実行すること。
--
-- 【背景】.claude/references/sql-migrations.mdを確認したところ、
-- training_templates・training_template_exercises・exercisesは過去のgrant文で
-- anonのみが対象になっており、service_role・authenticatedへのgrantが漏れていた。
-- goals・food_items・meal_log_food_itemsに至ってはgrant文自体が記録に見当たらず、
-- 過去のservice_role向け一括grant（training_schedules・soccer_logs・dishes系、
-- 20260812前後）の対象にも含まれていなかったと考えられる。
-- service_role経由の診断・将来のバッチ処理で参照する可能性があるため、
-- 最小権限（select）のみを付与する。ユーザー向け機能への影響はない
-- （anon/authenticated向けgrantは変更しない）。
--
-- 実行前の現状確認（単独Runで実行すること。複数SELECTを1つのRunにまとめると
-- 結果の対応が分かりにくくなるため）：
--
--   select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public'
--     and grantee = 'service_role'
--     and table_name in ('training_templates', 'training_template_exercises', 'meal_log_food_items', 'goals', 'exercises', 'food_items')
--   order by table_name;

grant select on training_templates to service_role;
grant select on training_template_exercises to service_role;
grant select on meal_log_food_items to service_role;
grant select on goals to service_role;
grant select on exercises to service_role;
grant select on food_items to service_role;
