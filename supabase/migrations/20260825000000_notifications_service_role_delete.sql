-- 未読バッジ機能のブラウザ確認用テストデータ削除のための追加grant（2026年8月25日）
--
-- 【未実行】Supabase SQL Editorで人間（John）が手動実行すること。
--
-- 【背景】20260824010000_send_reminder_service_role_grants.sqlでは
-- notificationsにservice_roleのselect/insertのみを付与した（api/send-reminder.ts
-- が実際に行う操作に絞った最小権限のため）。ブラウザ確認用に作成したテスト通知を
-- 削除しようとしたところ、service_roleでもdeleteが権限不足で失敗した。
-- テストデータのクリーンアップや将来のテスト用途のため、deleteも付与する。

grant delete on notifications to service_role;
