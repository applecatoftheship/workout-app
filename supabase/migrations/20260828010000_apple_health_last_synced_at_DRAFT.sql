-- ============================================================================
-- 設定画面拡張 Phase 2：Apple Health連携ステータス表示用の
-- profiles.apple_health_last_synced_at 追加（2026年8月28日）
--
-- 【未実行】Claude Codeからは直接Supabaseへ接続できないため、このファイルは
-- Supabase SQL Editorで人間（John）が手動実行すること。
--
-- 元の指示書（Gemini起案）は以下のALTER TABLE文のみだったが、
-- api/sync-apple-health.tsはservice_roleクライアントでprofilesを更新する
-- 必要があり、20260827020000_profiles_and_avatars_DRAFT.sqlの時点では
-- 「サーバー側からprofilesを参照する機能は現状無い」ためservice_roleへの
-- grantが一切付与されていないことを確認した。このままでは42501
-- permission deniedになる（過去のtraining_logs等と同じ既知の失敗パターン、
-- CLAUDE.md「RLS changes need GRANT too」参照）ため、insert/updateの
-- grantを追加した。upsert（onConflict: user_id）で呼び出すため、行がまだ
-- 存在しないユーザー（プロフィール未保存のままApple Health連携だけ先に
-- 設定したケース）でも記録できるようinsertも付与している。
-- ============================================================================
alter table profiles
  add column if not exists apple_health_last_synced_at timestamptz;

grant insert, update on profiles to service_role;

-- ===== 実行後の確認用（読み取り専用） =====
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'apple_health_last_synced_at';

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'service_role' and table_name = 'profiles'
order by privilege_type;
