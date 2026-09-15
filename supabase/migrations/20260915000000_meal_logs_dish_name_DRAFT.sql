-- ============================================================================
-- 食事記録に料理名を表示できるようにする（2026年9月15日）
--
-- 【未実行】Claude Codeからは直接Supabaseへ接続できないため、このファイルは
-- Supabase SQL Editorで人間（John）が手動実行すること。
--
-- 【背景】meal_logsは食材ベース（meal_log_food_items経由）でのみ管理されており、
-- 「どの料理を選んだか」「写真から推定された料理名」を保持するカラムが無かった。
-- 栄養計算のソースオブトゥルースはこれまで通りmeal_log_food_itemsのままとし、
-- 本カラムはあくまで表示用の任意ラベルとして追加する（既存の記録方式は無変更）。
--
-- 【GRANT対応不要の確認】meal_logsへのGRANTは
-- supabase/migrations/20260825020000_grant_authenticated_role_HOTFIX.sql で
-- `grant select, insert, update, delete on meal_logs to authenticated;`と
-- テーブル単位（列を限定しない形）で付与済み。PostgreSQLのGRANTはテーブル単位で
-- 付与した場合、後から追加した列にも自動的に適用されるため、本マイグレーション
-- では新規のGRANT文は不要（新規テーブルではなく既存テーブルへの列追加のみ）。
-- ============================================================================
alter table meal_logs
  add column if not exists dish_name text;

-- ===== 実行後の確認用（読み取り専用） =====
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'meal_logs' and column_name = 'dish_name';

-- 既存のGRANT範囲確認（テーブル単位付与のため新規列にも及んでいるはずの確認用）
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'meal_logs' and grantee = 'authenticated'
order by privilege_type;
