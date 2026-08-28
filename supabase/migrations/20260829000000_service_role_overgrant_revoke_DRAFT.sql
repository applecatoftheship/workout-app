-- ============================================================================
-- バックログC-14：service_role過剰権限の調査・REVOKE案（2026年8月29日）
--
-- 【未実行・調査専用セッションの成果物】このファイルは調査結果の記録と提案。
-- Supabase SQL Editorで人間（John）が内容を確認し、必要と判断した場合のみ
-- 手動実行すること。Claude Codeからは直接Supabaseへ接続できないため、
-- 下記STEP 0の現状確認クエリも含めて全て未実行・未検証。
-- ============================================================================


-- ============================================================================
-- STEP 0: 現状確認（読み取り専用。REVOKE実行前に必ず単独Runで実行し、
-- 下記「調査結果」の内容と一致するか確認すること）
-- ============================================================================

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'service_role'
order by table_name, privilege_type;


-- ============================================================================
-- 調査結果サマリー
-- ============================================================================
--
-- 【調査方法についての制約】Claude Codeは本番Supabaseへ直接接続できないため、
-- 「現在付与されている権限」はライブクエリではなく、リポジトリ内の履歴
-- （.claude/references/sql-migrations.md・supabase/migrations/*.sql）から
-- 再構成した。実際の本番の権限状態は上記STEP 0を実行して確認すること
-- （後述の通り、下書きのまま未実行のマイグレーションが複数あり、履歴と
-- 本番の実態が一致している保証がない）。
--
-- 【サーバーサイドでservice_roleを使用する箇所】api/配下を全件grep調査。
-- SUPABASE_SERVICE_ROLE_KEYを使用しているのは以下4ファイルのみ（他に
-- service_roleクライアントを生成しているコードはリポジトリ内に存在しない）。
--   - api/send-reminder.ts        （cron、毎日12:00 UTC）
--   - api/send-weekly-report.ts   （cron、毎週日22:00 UTC）
--   - api/generate-daily-comment.ts（フロントエンドから直接呼び出し）
--   - api/sync-apple-health.ts    （フロントエンドから直接呼び出し）
--
-- 上記4ファイルが実際に呼び出しているテーブル・操作種別（.from().select/
-- insert/update/delete/upsertを全件確認）と、履歴から再構成した現在の
-- 付与状況を突き合わせた結果は以下の通り。
--
-- ┌─────────────────────────┬──────────────────────────────┬─────────────────┬──────────────────────┐
-- │ テーブル                  │ 現在の付与（履歴ベース）         │ コード上の必要権限  │ 判定                   │
-- ├─────────────────────────┼──────────────────────────────┼─────────────────┼──────────────────────┤
-- │ training_schedules       │ ALL（2026-08-12一括grant）      │ なし（未使用）      │ 過剰・全権限が不要        │
-- │ dishes                   │ ALL（2026-08-12一括grant）      │ なし（未使用）      │ 過剰・全権限が不要        │
-- │ dish_food_items          │ ALL（2026-08-12一括grant）      │ なし（未使用）      │ 過剰・全権限が不要        │
-- │ meal_sizes               │ ALL（2026-08-12一括grant）      │ なし（未使用）      │ 過剰・全権限が不要        │
-- │ soccer_logs              │ ALL（2026-08-12一括grant、       │ SELECTのみ         │ 過剰・INSERT/UPDATE/    │
-- │                          │ 2026-08-24にSELECTを重ねてgrant）│                   │ DELETE/TRUNCATE/       │
-- │                          │                                │                   │ REFERENCES/TRIGGERが不要│
-- │ training_logs            │ SELECT（2026-08-24）             │ SELECT            │ 一致（問題なし）          │
-- │ training_log_exercises   │ SELECT（2026-08-24）             │ SELECT            │ 一致（問題なし）          │
-- │ training_sets            │ SELECT（2026-08-24）             │ SELECT            │ 一致（問題なし）          │
-- │ meal_logs                │ SELECT（2026-08-24）             │ SELECT            │ 一致（問題なし）          │
-- │ push_subscriptions       │ SELECT, DELETE（2026-08-24）      │ SELECT, DELETE    │ 一致（問題なし）          │
-- │ notifications            │ SELECT, INSERT（2026-08-24）、    │ SELECT, INSERT    │ DELETEはコード上未使用。  │
-- │                          │ DELETE（2026-08-25、手動テスト   │                   │ ただし意図的な運用判断で   │
-- │                          │ データ削除用に追加）              │                   │ 追加されたものなので、    │
-- │                          │                                │                   │ 本ファイルのREVOKE対象   │
-- │                          │                                │                   │ には含めない（末尾の      │
-- │                          │                                │                   │ 「補足」参照）           │
-- └─────────────────────────┴──────────────────────────────┴─────────────────┴──────────────────────┘
--
-- 【daily_conditions・workouts・profilesについて（今回のREVOKE対象外）】
-- generate-daily-comment.ts（daily_conditionsへのSELECT+UPSERT）・
-- sync-apple-health.ts（daily_conditions/workouts/profilesへのSELECT+UPSERT等）
-- が必要とする権限は、2026-08-24時点のgrantでは不足している（daily_conditionsは
-- SELECTのみ、workouts・profilesはテーブル自体が2026-08-24時点で未作成）。
-- 不足分は20260827000000_apple_health_workouts_DRAFT.sql・
-- 20260828010000_apple_health_last_synced_at_DRAFT.sqlに必要なGRANT文が
-- 既に用意されているが、両ファイルとも【未実行】のまま。実行済みかどうか
-- Claude Codeから確認する手段がないため、今回のC-14調査スコープ（過剰権限の
-- 洗い出し）には含めず、「不足の可能性がある」事実のみここに記録する。
-- 【注意】これが本当に未実行のままだとすると、AIコンディショニングコメント
-- 生成・Apple Health同期の2機能は本番で42501エラーになっている可能性がある。
-- C-14とは別問題（過剰ではなく不足）のため、必要であれば別タスクとして
-- 上記2ファイルの実行状況をJohnさんに確認することを推奨する。
--
-- 【training_templates・training_template_exercises・meal_log_food_items・
-- goals・exercises・food_itemsについて（今回のREVOKE対象外）】
-- 20260828040000_service_role_select_grants_DRAFT.sql（未実行）がこの6テーブルへ
-- service_role向けSELECTの追加を提案しているが、今回の調査時点でこの6テーブルを
-- 参照するservice_roleコードはapi/配下に存在しない（「診断・将来のバッチ処理」
-- という将来を見据えた用途のための事前grantであり、既存の判断はそのまま尊重する。
-- このファイルは既存のバックログ整理の一部で、今回のC-14スコープと矛盾しない
-- ため変更を提案しない）。
--
--
-- ============================================================================
-- 提案：REVOKE文（過剰権限の是正）
-- ============================================================================
-- 対象はservice_roleのみ。anon・authenticatedロールへの既存grantは一切
-- 変更しないため、通常のアプリ利用（ブラウザ経由のCRUD）には影響しない。
--
-- 【実行前の残存リスク・要確認事項】
-- 1. この調査はリポジトリ内のコード（api/配下）のみを対象にしている。もし
--    Supabase Edge Functions・外部スクリプト・BIツール等、リポジトリ外で
--    service_roleキーを使って training_schedules / dishes / dish_food_items /
--    meal_sizes / soccer_logs へアクセスしている仕組みが別途存在する場合、
--    このREVOKEはそれらを壊す。実行前にJohnさんに「リポジトリ外で
--    service_roleキーを使っている場所がないか」の確認を推奨する。
-- 2. STEP 0のライブクエリ結果が上記サマリー表と食い違う場合（想定外の権限が
--    見つかった場合）は、このREVOKE文をそのまま実行せず、まず食い違いの
--    原因を調査すること。

begin;

-- training_schedules・dishes・dish_food_items・meal_sizes：
-- service_roleコードからの参照が一切ないため、全権限を剥奪する。
revoke all on training_schedules from service_role;
revoke all on dishes from service_role;
revoke all on dish_food_items from service_role;
revoke all on meal_sizes from service_role;

-- soccer_logs：SELECTのみ必要（send-reminder.ts・send-weekly-report.tsが
-- 集計目的で参照）。一度ALLを剥奪してからSELECTのみ再付与する
-- （個別に「INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGERだけをrevoke」
-- するより、剥奪→必要分のみ再付与の方が意図が明確で確認しやすいため）。
revoke all on soccer_logs from service_role;
grant select on soccer_logs to service_role;

commit;


-- ============================================================================
-- 実行後の確認クエリ（STEP 0と同じ内容を再実行し、意図通りに変わったか確認）
-- ============================================================================
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'service_role'
order by table_name, privilege_type;


-- ============================================================================
-- 補足：notifications DELETEについて（今回のREVOKE対象に含めなかった理由）
-- ============================================================================
-- api/send-reminder.ts・api/send-weekly-report.tsのアプリケーションコードは
-- notificationsに対してSELECT・INSERTのみを行い、DELETEは行わない
-- （既読化はクライアント側のsrc/sw.tsが別ロールで行う）。このため厳密には
-- service_roleのnotifications DELETE権限もコード上は不要であり、C-14の
-- 「過剰権限」の定義には当てはまる。
--
-- ただし20260825000000_notifications_service_role_delete.sqlの記録による限り、
-- これは事故的な過剰付与ではなく「ブラウザ確認用テストデータをSQL Editorから
-- 削除するための意図的な運用上の付与」だった。剥奪すると今後同様のテスト
-- データ削除の際に再度grantが必要になる（利便性とのトレードオフ）。
-- 事故的な過剰付与（training_schedules等）と性質が異なると判断し、本ファイルの
-- REVOKE対象には含めなかった。剥奪するかどうかはJohnさんの運用上の希望次第の
-- ため、必要であれば以下を別途検討：
--   revoke delete on notifications from service_role;
