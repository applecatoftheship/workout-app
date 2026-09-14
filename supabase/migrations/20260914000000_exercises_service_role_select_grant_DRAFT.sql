-- ============================================================================
-- exercisesテーブルへのservice_role SELECT権限追加（2026年9月14日）
--
-- 【未実行・ドラフト】Claude CodeはSupabaseへ直接接続できないため、このファイルは
-- Supabase SQL Editorで人間（John）が内容を確認の上、手動実行すること。
--
-- 【背景】Phase 1-4：AIコメント内で種目名が常に「不明な種目」になる表示バグ修正の
-- 一環。api/generate-daily-comments.ts（cron、前日分のAI日次コメント自動生成）の
-- fetchTrainingLogsForAcwrが、training_log_exercises.exercise_idを取得しておらず、
-- 返却するexercises[]のexerciseIdが常に空文字列固定になっていたため、AIプロンプト内で
-- formatTrainingLogItem（src/utils/calendarHelpers.ts）が種目名を解決できず
-- 常に「不明な種目」と表示していた。この修正でexercise_idを取得しexercisesテーブル
-- から名前を解決するようになったため、service_roleにexercisesへのSELECT権限が
-- 新たに必要になった。
--
-- 【前回の権限監査（2026-09-13、20260913010000_anon_authenticated_service_role_
-- grants_audit_DRAFT.sql、本番実行・動作確認済み）との関係】前回の監査時点では
-- api/配下のいずれのservice_roleコードもexercisesテーブルを参照していなかったため
-- （20260828040000_service_role_select_grants_DRAFT.sqlの6テーブル一括提案のうち
-- exercisesも「実使用なし」としてservice_roleゼロ権限を確定させた）、今回の修正で
-- 新たに生じた依存である。前回のマイグレーションファイル自体は実行時点の事実を
-- 正しく記録しているため書き換えず、本ファイルを追加分として新設する。
--
-- 【スコープについての判断】api/send-reminder.ts・api/send-weekly-report.tsにも
-- 同型のexerciseId空文字列固定パターンが存在するが、両ファイルのtraining_logs
-- データはACWR・ストリーク計算にのみ使われ、種目名を一切参照しない
-- （weight×reps・dateのみで計算する）ため、今回はapi/generate-daily-comments.ts
-- のみを修正対象とした。両ファイルは変更していないため、service_role権限の
-- 追加が必要なのはexercisesのみ（training_log_exercises・training_setsは
-- 前回の監査で既にservice_role SELECTを付与済みのため変更不要）。
--
-- 実行前チェック（読み取り専用）：現状確認
--   select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public' and grantee = 'service_role' and table_name = 'exercises';
-- ============================================================================

grant select on exercises to service_role;

-- ===== 実行後の確認用（読み取り専用） =====
-- service_role が select の1行のみ表示されていればOK。
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'service_role'
  and table_name = 'exercises'
order by privilege_type;
