-- AIコメント自動生成cron（api/generate-daily-comments.ts、2026年8月29日新設）が
-- 必要とするservice_role権限の確認・追加。
--
-- 【未実行】Supabase SQL Editorで人間（John）が手動実行すること。Claude Codeからは
-- 直接Supabaseへ接続できないため、下記STEP 0の確認クエリも含めて全て未実行・未検証。
--
-- 【背景】新設cronが参照するテーブルのうち、service_role向けの権限付与状況が
-- 未確認のものが2つある：
--   1. meal_log_food_items（SELECT）：食事記録の栄養値はmeal_logs列ではなく
--      meal_log_food_itemsの確定スナップショット列を合算して求める設計のため、
--      cronのdailySummary生成にこのテーブルへのSELECTが必須。過去の調査
--      （バックログC-14）で「service_role向けgrantの記録が見当たらない」6テーブルの
--      1つとして挙がっており（20260828040000_service_role_select_grants_DRAFT.sql
--      参照）、そちらも【未実行】のまま。
--   2. workouts（SELECT）：20260827000000_apple_health_workouts_DRAFT.sqlで
--      service_role向けにgrant select, insert, update on workoutsを提案済みだが、
--      実行状況が確認できていない（daily_conditionsについては別途Johnさんが
--      ライブクエリで確認済み・付与済みと確認したが、workoutsは未確認のまま）。
--
-- 実行前の現状確認（単独Runで実行すること）：

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'service_role'
  and table_name in ('meal_log_food_items', 'workouts')
order by table_name, privilege_type;

-- 上記の結果、meal_log_food_itemsにSELECTが無ければ以下を実行。
-- （workoutsにSELECTが無ければ、20260827000000_apple_health_workouts_DRAFT.sqlの
-- 該当行を別途実行すること。このファイルでは対象を絞り込むため重複して含めない。）

grant select on meal_log_food_items to service_role;

-- 実行後の確認（0件だった行が追加されているか）
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'service_role'
  and table_name in ('meal_log_food_items', 'workouts')
order by table_name, privilege_type;
