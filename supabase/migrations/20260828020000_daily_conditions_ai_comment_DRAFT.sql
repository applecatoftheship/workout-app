-- ============================================================================
-- 設定画面拡張 Phase 3：AIコンディショニングアドバイザー（Geminiの実装指示書、
-- 2026年8月28日）daily_conditions.ai_comment 追加
--
-- 【未実行】Claude Codeからは直接Supabaseへ接続できないため、このファイルは
-- Supabase SQL Editorで人間（John）が手動実行すること。
--
-- 【GRANT確認】api/generate-daily-comment.ts はservice_roleクライアントで
-- daily_conditionsを読み書きするが、api/sync-apple-health.tsのhandleSleepが
-- 既にservice_roleクライアントでdaily_conditionsへのupsertを行っており
-- （本番で稼働確認済み）、daily_conditionsは元々service_roleへのgrantが
-- 揃っているテーブルであることを確認済み。20260828010000（profiles）の
-- ケースとは異なり、本マイグレーションでの追加grantは不要と判断した
-- （CLAUDE.md「RLS changes need GRANT too」を踏まえた確認）。
-- ============================================================================
alter table daily_conditions
  add column if not exists ai_comment text;

-- ===== 実行後の確認用（読み取り専用） =====
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'daily_conditions' and column_name = 'ai_comment';
