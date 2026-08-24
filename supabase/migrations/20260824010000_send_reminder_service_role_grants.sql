-- プッシュ通知機能 Phase 1b：api/send-reminder.ts用のservice_role権限付与（2026年8月24日）
--
-- 【未実行】Supabase SQL Editorで人間（John）が手動実行すること。
--
-- 【背景】SUPABASE_SERVICE_ROLE_KEYを登録した上でapi/send-reminder.tsを実行したところ、
-- 以下のエラーが発生した（FUNCTION_INVOCATION_FAILEDの直接の原因）。
--
--   code: 42501
--   message: permission denied for table training_logs
--   hint: GRANT SELECT ON public.training_logs TO service_role;
--
-- 調査の結果、.claude/references/sql-migrations.md内で
-- `grant all on X to anon, authenticated, service_role;`のようにservice_roleへの
-- 付与が明示されているのはtraining_schedules・soccer_logs・dishes/dish_food_items/
-- meal_sizesのみで、training_logs・training_log_exercises・training_sets・
-- meal_logs・daily_conditionsにはservice_roleへの明示的なgrant文が見当たらなかった
-- （このプロジェクトのRLSはこれまで全テーブルusing(true)の全許可だったため、
-- クライアント側のanon/authenticated権限だけで問題が表面化していなかったと考えられる。
-- service_role経由で初めて呼び出すapi/send-reminder.tsで今回初めて顕在化した）。
-- 併せて、本日新設したpush_subscriptions・notificationsもanon/authenticatedのみへの
-- 付与でservice_roleを含めていなかったため、同様に対象に含める。
--
-- grant文は既に付与済みの権限に対しても安全（冪等）。api/send-reminder.tsが
-- 実際に行う操作のみに絞って最小権限で付与する（最小権限の原則）。

grant select on training_logs to service_role;
grant select on training_log_exercises to service_role;
grant select on training_sets to service_role;
grant select on soccer_logs to service_role;
grant select on meal_logs to service_role;
grant select on daily_conditions to service_role;
grant select, delete on push_subscriptions to service_role;
grant select, insert on notifications to service_role;
