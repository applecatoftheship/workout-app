-- ============================================================================
-- 全テーブル anon/authenticated/service_role 権限是正（2026年9月13日）
--
-- 【未実行・ドラフト】Claude CodeはSupabaseへ直接接続できないため、このファイルは
-- Supabase SQL Editorで人間（John）が内容を確認の上、手動実行すること。
--
-- 【背景】本番public スキーマ全体に対する監査クエリの結果、ほぼ全テーブルで
-- anon（未ログインでも使える公開鍵）にDELETE/INSERT/UPDATE/TRUNCATEを含む
-- フル権限が付与されていることが判明した。RLSは全テーブル
-- `using(true) with check(true)`のため、grant設定が唯一の実効的な防御線になっている
-- （notifications/push_subscriptionsのみ実効性のあるdevice_idベースRLSを持つ。
-- 詳細は各テーブルの節を参照）。直近是正済みのsport_logs（authenticated最小権限
-- のみ、anon権限ゼロ）が目指すべきパターン。
--
-- 【調査方法】src/・api/配下を全件grepし、テーブルごとに以下を確認した（推測では
-- なくコード上の証拠に基づく）：
--   (a) authenticatedセッション経由（src/api/配下、通常のログイン済みブラウザ
--       クライアント。AuthGate（src/App.tsx）により、ログイン前はLogin/Signup
--       画面のみが描画され、データテーブルへのアクセス自体が発生しない構成を
--       確認済み）で実際に呼ばれているDML操作。
--   (b) service_role鍵で初期化されたサーバーサイドクライアント（api/配下の
--       6ファイル：generate-daily-comment.ts・generate-daily-comments.ts・
--       send-reminder.ts・send-weekly-report.ts・suggest-dish-ingredients.ts・
--       sync-apple-health.ts。api/health.tsはダミー関数でDBアクセス無し、
--       suggest-dish-ingredients.tsはsupabase.auth.getUser(token)による認証検証
--       のみでpublicスキーマのテーブル操作は一切行わない）から実際に呼ばれている
--       操作。
--   (c) anonキーが未ログイン状態で呼ばれている箇所：src/sw.ts
--       （Service Worker）のmarkNotificationReadFromServiceWorkerが唯一の例外
--       として存在する（notifications.is_readの更新、詳細は該当節参照）。
--       これ以外にanonキーが未ログイン状態でpublicテーブルへ到達する経路は
--       見つからなかった。
--
-- 【付与ポリシー】
--   - anon：実際にanonキー経由で呼ばれている操作が無い限り原則ゼロ権限。
--   - authenticated：実際にブラウザクライアントが呼んでいる操作のみ。
--     UPDATE/DELETEに`.eq()`等のWHERE条件を伴う場合、PostgreSQLの標準仕様上
--     SELECT権限も必要になるため、そのようなテーブルにはSELECTを併せて付与する
--     （既存のsport_logs・workoutsの正しい先例と同じ考え方）。一方、
--     `.upsert(row, {onConflict: 'col'})`（WHERE句を伴わない単純なON CONFLICT
--     DO UPDATE）はSELECT無しのINSERT+UPDATEのみで動作することを、本プロジェクト
--     既存の稼働中の実装（service_roleのprofiles/daily_conditions/health_metrics
--     向けupsert専用grant、SELECT無し）で確認済み。
--   - service_role：実際にサーバーサイドコードが呼んでいる操作のみ。無ければ
--     ゼロ権限。Supabaseが新規テーブル作成時に自動付与するREFERENCES/TRIGGER/
--     TRUNCATEは常に除外する。
--
-- 【実行前の残存リスク・要確認事項】
-- 1. この調査はリポジトリ内のコードのみを対象にしている。Supabase Edge
--    Functions・外部スクリプト・BIツール等、リポジトリ外でanon/authenticated/
--    service_roleキーを使ってこれらのテーブルへアクセスする仕組みが別途存在する
--    場合、このREVOKEはそれらを壊す。実行前に「リポジトリ外でこれらのキーを
--    使っている場所がないか」の確認を推奨する。
-- 2. 本ファイルは23テーブル全件を対象とした過去最大規模の権限変更である。
--    実行後は、ログイン・トレーニング記録・食事記録・体調記録・予定・スポーツ
--    記録・ワークアウト・目標・バッジ・プロフィール・プッシュ通知・データ
--    エクスポートの主要フローを一通り動作確認することを強く推奨する
--    （動作確認自体は本プロジェクトの既存ルール通り、別セッション・
--    claude-in-chromeで実施）。
-- 3. push_subscriptionsのanon権限ゼロ化は、2026年8月24日の新設時点（認証未実装、
--    device_idのみで識別する設計）では意図的だったが、2026年8月25日のフェーズB
--    認証移行でSettings.tsx（購読登録・解除の唯一の呼び出し元）がAuthGateの
--    内側に移動したことで、実質的にanon経由での到達経路が無くなったと判断した
--    ものである。他のテーブルの「事故的な過剰付与の是正」とは性質が異なり、
--    「設計変更に追従できていなかった箇所の是正」のため、特に注意して動作確認
--    することを推奨する。
-- 4. notifications.service_role へのDELETE権限（20260825000000_notifications_
--    service_role_delete.sql、2026年8月29日の過剰権限監査で「事故ではなく
--    ブラウザ確認用テストデータ削除のための意図的な運用上の付与」と結論済み）は、
--    本ファイルでは是正対象に含めていない（現状維持）。剥奪するかどうかは
--    引き続きJohnさんの運用上の希望次第で、必要なら別途
--    `revoke delete on notifications from service_role;` を実行すること。
-- 5. 20260828040000_service_role_select_grants_DRAFT.sql（未実行、training_
--    templates・training_template_exercises・meal_log_food_items・goals・
--    exercises・food_itemsの6テーブルへservice_role向けSELECTを一括提案する内容）
--    は、今回の調査でmeal_log_food_items以外の5テーブルにservice_role経由の
--    実使用が無いことを確認したため、本ファイルでは採用しない（このファイルの
--    是正方針が優先される。20260828040000ファイル自体は削除せず、本ファイルが
--    supersedeする形で残す）。
-- ============================================================================


-- ============================================================================
-- STEP 0: 実行前の現状確認（読み取り専用。単独Runで実行し、下記の想定と
-- 大きく食い違う場合は、まずその食い違いの原因を調査してからSTEP 1以降に進むこと）
-- ============================================================================

select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;


-- ============================================================================
-- STEP 1: 是正本体（1トランザクション。途中で失敗した場合は全体がロールバック
-- されるため、部分的にだけ是正された危険な中間状態にはならない）
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- トレーニング系（6テーブル）
-- ----------------------------------------------------------------------------

-- training_logs
-- 根拠：src/api/trainingLogs.ts（select/upsert[insert+update]/insert/delete）、
-- service_role：api/generate-daily-comments.ts・api/send-reminder.ts・
-- api/send-weekly-report.ts（いずれもselectのみ）。
revoke all on training_logs from anon, authenticated, service_role;
grant select, insert, update, delete on training_logs to authenticated;
grant select on training_logs to service_role;

-- training_log_exercises
-- 根拠：src/api/trainingLogs.ts（select/insert/delete、updateは無し）、
-- service_role：上記3ファイル（selectのみ）。
revoke all on training_log_exercises from anon, authenticated, service_role;
grant select, insert, delete on training_log_exercises to authenticated;
grant select on training_log_exercises to service_role;

-- training_sets
-- 根拠：src/api/trainingLogs.ts（select/insert/delete、updateは無し。セット内容の
-- 変更は既存セットのdelete→再insertで表現する設計のため）、service_role：
-- 上記3ファイル（selectのみ）。
revoke all on training_sets from anon, authenticated, service_role;
grant select, insert, delete on training_sets to authenticated;
grant select on training_sets to service_role;

-- training_templates
-- 根拠：src/api/trainingTemplates.ts（select/insert/update/delete）。
-- service_roleからの実使用は確認できず（20260828040000_service_role_select_
-- grants_DRAFT.sqlが将来のバッチ処理用にSELECTを提案していたが、現時点で
-- 呼び出し元コードが存在しないため採用しない）。
revoke all on training_templates from anon, authenticated, service_role;
grant select, insert, update, delete on training_templates to authenticated;

-- training_template_exercises
-- 根拠：src/api/trainingTemplates.ts（select/insert/delete、updateは無し。
-- テンプレートの種目構成変更は対象templateId分の全delete→再insertで表現する
-- 設計のため）。service_roleからの実使用は確認できず。
revoke all on training_template_exercises from anon, authenticated, service_role;
grant select, insert, delete on training_template_exercises to authenticated;

-- training_schedules
-- 根拠：src/api/trainingSchedules.ts（select/insert/update/delete）。
-- service_roleからの実使用は確認できず（2026-08-29の旧監査でも「未使用」と
-- 結論済み、今回の再調査でも一致）。
revoke all on training_schedules from anon, authenticated, service_role;
grant select, insert, update, delete on training_schedules to authenticated;


-- ----------------------------------------------------------------------------
-- 体調（1テーブル）
-- ----------------------------------------------------------------------------

-- daily_conditions
-- 根拠：src/api/dailyConditions.ts（select/upsert[insert+update]/delete）、
-- service_role：api/generate-daily-comment.ts（select+upsert）・
-- api/generate-daily-comments.ts（select+upsert）・api/send-reminder.ts
-- （select）・api/send-weekly-report.ts（select）・api/sync-apple-health.ts
-- （upsert×4、いずれもonConflict指定のみでWHERE句を伴わないためSELECT不要）。
revoke all on daily_conditions from anon, authenticated, service_role;
grant select, insert, update, delete on daily_conditions to authenticated;
grant select, insert, update on daily_conditions to service_role;


-- ----------------------------------------------------------------------------
-- 食事・料理系（4テーブル）
-- ----------------------------------------------------------------------------

-- meal_logs
-- 根拠：src/api/mealLogs.ts（select/upsert[insert+update]/delete）、
-- service_role：api/generate-daily-comments.ts・api/send-reminder.ts（selectのみ）。
revoke all on meal_logs from anon, authenticated, service_role;
grant select, insert, update, delete on meal_logs to authenticated;
grant select on meal_logs to service_role;

-- meal_log_food_items
-- 根拠：src/api/mealLogs.ts（select/insert/delete、updateは無し。食事内容の
-- 変更は既存明細のdelete→再insertで表現する設計のため）、service_role：
-- api/generate-daily-comments.ts（selectのみ、日次サマリー生成用）。
-- 【20260828040000_service_role_select_grants_DRAFT.sqlの提案を唯一採用する
-- テーブル】同ファイルが提案していた6テーブルのうち、このテーブルのみ
-- 実際のservice_role呼び出し元（generate-daily-comments.ts）が存在するため。
revoke all on meal_log_food_items from anon, authenticated, service_role;
grant select, insert, delete on meal_log_food_items to authenticated;
grant select on meal_log_food_items to service_role;

-- dishes
-- 根拠：src/api/dishes.ts（select/insert/update/delete）。service_roleからの
-- 実使用は確認できず。
revoke all on dishes from anon, authenticated, service_role;
grant select, insert, update, delete on dishes to authenticated;

-- dish_food_items
-- 根拠：src/api/dishes.ts（select/insert/delete、updateは無し。料理の材料構成
-- 変更は既存明細のdelete→再insertで表現する設計のため）。service_roleからの
-- 実使用は確認できず。
revoke all on dish_food_items from anon, authenticated, service_role;
grant select, insert, delete on dish_food_items to authenticated;

-- meal_sizes
-- 根拠：src/api/dishes.ts の fetchMealSizes() のみ（select、常時sort_order順で
-- 全件取得）。ユーザーが新規作成・変更・削除する手段（API・UI）はコード上
-- 存在せず、全行が事実上プリセットの共有カタログ（RLSポリシーも
-- "authenticated only" using(true)で所有権の概念を持たない）。service_role
-- からの実使用も確認できず。
revoke all on meal_sizes from anon, authenticated, service_role;
grant select on meal_sizes to authenticated;


-- ----------------------------------------------------------------------------
-- 種目・食材マスタ（2テーブル、is_preset=true/user_id IS NULLがプリセット行）
-- ----------------------------------------------------------------------------

-- exercises
-- 根拠：src/api/trainingLogs.ts（select/insert/update[論理削除is_deleted]、
-- 物理delete相当のハード削除は無し）。service_roleからの実使用は確認できず
-- （20260828040000の提案は不採用、上記背景参照）。
revoke all on exercises from anon, authenticated, service_role;
grant select, insert, update on exercises to authenticated;

-- food_items
-- 根拠：src/api/foodItems.ts（select/insert/update[論理削除is_deleted]、
-- ハード削除は無し）。service_roleからの実使用は確認できず（同上）。
revoke all on food_items from anon, authenticated, service_role;
grant select, insert, update on food_items to authenticated;


-- ----------------------------------------------------------------------------
-- スポーツ・ワークアウト・健康指標（3テーブル）
-- ----------------------------------------------------------------------------

-- sport_logs（2026-09-12のsport_logs新設マイグレーションで既に是正済み。
-- 変更なし、確認のためrevoke→再grantを明示しておく）
-- 根拠：src/api/sportLogs.ts（select/upsert[insert+update]/delete）、
-- service_role：上記3ファイル（selectのみ）。
revoke all on sport_logs from anon, authenticated, service_role;
grant select, insert, update, delete on sport_logs to authenticated;
grant select on sport_logs to service_role;

-- workouts（2026-08-27のapple_health_workouts_DRAFT.sqlで既に正しい権限が
-- 提案されている。実行済みか未確認のため、本ファイルで確定させる）
-- 根拠：src/api/workouts.ts（select/insert/update/delete）、service_role：
-- api/sync-apple-health.ts（select/insert/update[.eq()によるWHERE句あり、
-- SELECT必須]/upsert、deleteは無し）。
revoke all on workouts from anon, authenticated, service_role;
grant select, insert, update, delete on workouts to authenticated;
grant select, insert, update on workouts to service_role;

-- health_metrics
-- 【重要な是正】20260904000000_health_metrics_DRAFT.sqlはauthenticatedへ
-- select/insert/update/deleteのフルCRUDを付与する内容だったが、今回の調査で
-- src/utils/dataExportHelpers.ts経由のデータエクスポート機能（本日実装、
-- select・user_idスコープのみ）以外にブラウザから直接health_metricsへ
-- アクセスするコードが一切存在しないことを確認した（insert/update/deleteは
-- すべてapi/sync-apple-health.ts側のservice_role経由でのみ発生する）。
-- authenticatedはSELECTのみに縮小する。service_roleも同ファイルはselect込みの
-- フルSELECT+INSERT+UPDATEを付与していたが、sync-apple-health.tsの呼び出しは
-- 全てonConflict指定のupsertでWHERE句を伴わずSELECT不要のため、INSERT+UPDATEに
-- 縮小する（deleteは元から不要・変更なし）。
revoke all on health_metrics from anon, authenticated, service_role;
grant select on health_metrics to authenticated;
grant insert, update on health_metrics to service_role;


-- ----------------------------------------------------------------------------
-- 目標（1テーブル）
-- ----------------------------------------------------------------------------

-- goals
-- 根拠：src/api/goals.ts（select/upsert[insert+update]/delete）。service_role
-- からの実使用は確認できず（20260828040000の提案は不採用、上記背景参照）。
revoke all on goals from anon, authenticated, service_role;
grant select, insert, update, delete on goals to authenticated;


-- ----------------------------------------------------------------------------
-- 旧サッカー機能（1テーブル、廃止済み）
-- ----------------------------------------------------------------------------

-- soccer_logs
-- 【2026-09-13のサッカー機能統合でアプリコードから全除去済み】api/・src/api/
-- 配下を全件grepした結果、src/api/dataExport.ts（データエクスポート機能、
-- 本日実装。select・user_idスコープのみ）以外にsoccer_logsへアクセスする
-- コードが一切存在しないことを確認した（send-reminder.ts・
-- send-weekly-report.tsもソースコード上でsoccer_logsへの参照が完全に無い
-- ことを確認済み）。テーブル自体はdrop・truncateせず残置し（過去の判断を
-- 踏襲）、authenticatedはエクスポート機能のためのSELECTのみに縮小、
-- service_roleは完全にゼロ権限とする。
revoke all on soccer_logs from anon, authenticated, service_role;
grant select on soccer_logs to authenticated;


-- ----------------------------------------------------------------------------
-- ゲーミフィケーション・プロフィール（2テーブル）
-- ----------------------------------------------------------------------------

-- user_badges
-- 根拠：src/api/badges.ts（select/insert、update/deleteは無し。バッジは
-- 一度解放したら取り消さない設計のため）。service_roleからの実使用は確認できず。
revoke all on user_badges from anon, authenticated, service_role;
grant select, insert on user_badges to authenticated;

-- profiles
-- 【是正】20260827020000_profiles_and_avatars_DRAFT.sqlはauthenticatedへ
-- select/insert/update/deleteのフルCRUDを付与する内容だったが、
-- src/api/profiles.tsにはdeleteProfile相当の関数が存在せず、削除操作は
-- コード上どこからも呼ばれていない。authenticatedはselect/insert/update
-- （upsert）のみに縮小する。service_role：api/sync-apple-health.ts
-- （upsert、onConflict指定でWHERE句を伴わずSELECT不要）のみ、insert/updateを
-- 付与する。
revoke all on profiles from anon, authenticated, service_role;
grant select, insert, update on profiles to authenticated;
grant insert, update on profiles to service_role;


-- ----------------------------------------------------------------------------
-- 通知・プッシュ購読（2テーブル、実効性のあるdevice_idベースRLSを持つ唯一の例外）
-- ----------------------------------------------------------------------------

-- notifications
-- 【非対称な権限の是正、および唯一のanon実使用箇所】
-- 現状：anonがSELECT/UPDATE/TRUNCATE（INSERT/DELETE無し）、service_roleが
-- INSERT/SELECT（UPDATE無し）という非対称な権限になっている（依頼内の記載通り）。
-- 実使用箇所を確認した結果：
--   - authenticated：src/api/notifications.ts（select/update。一覧表示と
--     既読化のみ、insert/deleteはクライアントから行わない設計）。
--   - anon：src/sw.ts の markNotificationReadFromServiceWorker が、ログイン
--     セッションを持たないService Workerのグローバルスコープから、anonキー＋
--     x-device-idヘッダーのみで notifications.is_read を更新する
--     （20260824000000_push_notifications.sqlのdevice_idベースRLSポリシーが
--     この経路を前提に設計されている）。.update({...}).eq('id', notificationId)
--     というWHERE句を伴う呼び出しのため、PostgreSQLの標準仕様上SELECT権限も
--     併せて必要（UPDATE単独では動作しない）。このためanonにはSELECT+UPDATEを
--     付与する（UPDATE単独ではなくSELECT+UPDATEが実際の最小権限であることに
--     注意——依頼にあった「非対称の是正」は、単純にUPDATEだけ残せばよいわけ
--     ではない）。
--   - service_role：api/send-reminder.ts・api/send-weekly-report.ts
--     （select+insert。既存通知の重複チェックselect、新規通知のinsert）。
--     DELETEは20260825000000_notifications_service_role_delete.sqlで
--     意図的に付与された運用上の権限（2026-08-29監査で「事故ではなく意図的」
--     と結論済み）のため、本ファイルでは現状維持（是正対象に含めない、上記
--     背景の4番参照）。
revoke all on notifications from anon, authenticated, service_role;
grant select, update on notifications to anon;
grant select, update on notifications to authenticated;
grant select, insert, delete on notifications to service_role;

-- push_subscriptions
-- 【anonをゼロ権限に変更（設計変更に追従できていなかった箇所の是正、上記
-- 背景の3番参照）】
-- 現状：2026-08-24の新設時点（認証未実装）でanon, authenticatedの両方へ
-- select/insert/update/deleteを付与していたが、2026-08-25のフェーズB認証
-- 移行で唯一の呼び出し元（src/api/pushSubscriptions.ts、Settings.tsx経由）が
-- AuthGateの内側に完全に移動したため、現在はanon経由でこのテーブルに到達する
-- コード経路が存在しない（src/sw.tsもpush_subscriptionsには一切アクセスしない、
-- notificationsのみ）。authenticatedはupsert（insert+update）とdelete
-- （.eq('endpoint', endpoint)というWHERE句を伴うためSELECTも必要）を付与する。
-- service_role：api/send-reminder.ts・api/send-weekly-report.ts（select、
-- 送信対象の全購読を取得／プッシュ失敗時の該当購読delete）。
revoke all on push_subscriptions from anon, authenticated, service_role;
grant select, insert, update, delete on push_subscriptions to authenticated;
grant select, delete on push_subscriptions to service_role;

commit;


-- ============================================================================
-- STEP 2: 実行後の確認クエリ（STEP 0と同じ内容を再実行し、意図通りに変わったか
-- 確認する）
-- ============================================================================

select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;
