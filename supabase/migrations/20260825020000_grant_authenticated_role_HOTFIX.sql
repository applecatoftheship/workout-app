-- ============================================================================
-- 【緊急ホットフィックス・未実行】authenticatedロールへのGRANT不足の解消
-- 作成日: 2026年8月25日
--
-- 【背景・根本原因】
-- フェーズB本番切り替え後、ログイン後の全画面で「読み込みに失敗しました」が
-- 発生。claude-in-chromeで実機ブラウザのネットワークログを確認した結果、
-- 以下が判明した：
--
--   - GET /auth/v1/user → 200（セッション確立・getCurrentUserId()は正常）
--   - GET /rest/v1/training_logs?...user_id=eq.<正しいUUID> → 403
--   - GET /rest/v1/goals?...                                → 403
--   - GET /rest/v1/daily_conditions?...                     → 403
--   - GET /rest/v1/meal_logs?...                            → 403
--   - GET /rest/v1/training_schedules?...                   → 200（正常）
--   - GET /rest/v1/soccer_logs?...                          → 200（正常）
--   コンソールにも「種目一覧の取得に失敗」「テンプレート一覧の取得に失敗」
--   （exercises・training_templates）を確認。
--
-- クエリのuser_idは正しく解決されており（フェーズA実装のgetCurrentUserId()・
-- AuthProvider・AuthGateのタイミング制御は全て正常に機能している）、
-- RLSポリシーの内容も問題ない。403（PostgRESTのinsufficient_privilege＝
-- 42501）は、RLSの行フィルタではなく、その手前のテーブル権限（GRANT）で
-- 弾かれた場合に返る。
--
-- .claude/references/sql-migrations.md を確認したところ、このプロジェクトは
-- 元々anonキーのみで運用されていたため、多くのテーブルでauthenticatedロール
-- へのgrantが一度も行われていなかったことが判明した：
--   - exercises・training_sets・training_templates・training_template_exercises：
--     `grant ... to anon;`のみ（2026-08-12の最初期マイグレーション、
--     authenticatedを含んでいない）
--   - training_logs・training_log_exercises・daily_conditions・meal_logs・
--     meal_log_food_items・goals・food_items：
--     このマイグレーション記録より前に作成されたテーブルで、そもそも
--     grant文自体が記録に残っていない（未確認・おそらく同様にauthenticated
--     への付与がない）
--   - training_schedules・dishes・dish_food_items・soccer_logs・meal_sizes：
--     `grant all on X to anon, authenticated, service_role;`で最初から
--     authenticatedを含んでいたため、今回問題なし（実際に200が返っている）
--
-- つまりフェーズBのRLSポリシー差し替え（20260825010000_phase_b_auth_cutover）
-- はRLSポリシーの内容としては正しかったが、その前提となるテーブル権限
-- （GRANT）の不足を見落としていた。フェーズA/Bの調査時点でこの観点の
-- 確認が漏れていたことが根本原因。
--
-- 【対応方針】
-- 全16テーブル（per-user 13 + 共有マスタ3）に対して、authenticatedロールへの
-- grantを冪等に実行する（既にgrant済みのテーブルに対して再度実行しても
-- エラーにはならないため、確実に不足しているテーブルだけを選別せず、
-- 全対象に一括で実行する）。
--
-- 【重要】このファイルはSupabase SQL Editorで人間が手動実行すること。
-- 実行後、John さんの実機ブラウザで再度読み込み確認をお願いします
-- （Claude Codeはこの時点でコード変更を行っていません。修正はDB側の
-- 権限設定のみで完結する見込みです）。
-- ============================================================================

grant select, insert, update, delete on training_logs to authenticated;
grant select, insert, update, delete on training_log_exercises to authenticated;
grant select, insert, update, delete on training_sets to authenticated;
grant select, insert, update, delete on training_templates to authenticated;
grant select, insert, update, delete on training_template_exercises to authenticated;
grant select, insert, update, delete on training_schedules to authenticated;
grant select, insert, update, delete on daily_conditions to authenticated;
grant select, insert, update, delete on meal_logs to authenticated;
grant select, insert, update, delete on meal_log_food_items to authenticated;
grant select, insert, update, delete on dishes to authenticated;
grant select, insert, update, delete on dish_food_items to authenticated;
grant select, insert, update, delete on goals to authenticated;
grant select, insert, update, delete on soccer_logs to authenticated;
grant select, insert, update, delete on exercises to authenticated;
grant select, insert, update, delete on food_items to authenticated;
grant select, insert, update, delete on meal_sizes to authenticated;

-- 実行後の確認用（読み取り専用）：全対象テーブルでauthenticatedへのgrantが
-- 揃っているか確認できる。privilege_typeの行数がテーブルごとに4件
-- （SELECT/INSERT/UPDATE/DELETE）ずつ表示されていればOK。
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'authenticated'
  and table_name in (
    'training_logs','training_log_exercises','training_sets',
    'training_templates','training_template_exercises','training_schedules',
    'daily_conditions','meal_logs','meal_log_food_items',
    'dishes','dish_food_items','goals','soccer_logs',
    'exercises','food_items','meal_sizes'
  )
order by table_name, privilege_type;
