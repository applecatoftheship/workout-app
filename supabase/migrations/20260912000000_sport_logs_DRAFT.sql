-- ============================================================================
-- Tier 4-2：競技の拡張（汎用スポーツ記録機能） sport_logs テーブル新設
-- （2026年9月12日）
--
-- 【背景】consolidated-roadmap_2026-09-04.md Tier 4-2。Gemini原案（RPE×時間で
-- 全競技のACWRを統一算出）はACWRの連続性が壊れる・入力摩擦が増えるため不採用と
-- 決定済み。代わりに「soccer_logsと同じパターンで競技を増やす。RPEは必須ではなく
-- 任意の補正入力とし、入力があれば優先、無ければ既存の自動換算式を使うハイブリッド」
-- という修正版方針をJohnさん承認済み。単一競技ではなく、複数の一般的な競技を
-- まとめて記録できる汎用機能として実装する（種目ごとに個別テーブルを作るのではなく、
-- 種目を選択式にした1つの汎用テーブル）。soccer_logsと役割は同じ（ユーザーが実施後に
-- 手入力する競技記録）だが、soccer_logs自体は変更しない。
--
-- 【実行方法】Claude CodeはSupabaseへの直接アクセス手段を持たないため、
-- このファイルの内容をJohnさんが本番Supabase SQL Editorで実行すること。
--
-- 【GRANT/RLSパターンについて】soccer_logsの「現在の実際の状態」（作成時点の
-- 2026-08-12の記録ではなく、後続の変更を反映した現状）をそのまま踏襲した：
--   - RLS: フェーズB認証移行（2026-08-25、20260825010000_phase_b_auth_cutover_DRAFT.sql）
--     で soccer_logs に適用された "user can manage own rows"
--     （auth.uid() = user_id）ポリシーと同一パターン。
--   - authenticated への grant: 2026-08-25のHOTFIX
--     （20260825020000_grant_authenticated_role_HOTFIX.sql）で soccer_logs に
--     適用された select, insert, update, delete と同一。
--   - service_role への grant: 2026-08-29の過剰権限是正
--     （20260829000000_service_role_overgrant_revoke_DRAFT.sql）で soccer_logs に
--     適用された「revoke all → grant select」と同一パターン（select のみ。
--     api/generate-daily-comments.ts・api/send-reminder.ts・
--     api/send-weekly-report.tsがACWR/日次サマリー生成のために参照するため）。
--   - anon への grant: 付与しない。soccer_logs作成時点（2026-08-12）は
--     grant all on soccer_logs to anon, authenticated, service_role; と
--     anonにも付与していたが、これは認証実装前の名残であり、フェーズB認証移行の
--     コメントで「推奨：anonロールへの既存grantの見直し」として除外が推奨されている
--     （RLSがauth.uid()を要求するため実害はないが、新規テーブルでは最初から
--     anonへの付与自体を行わない）。health_metrics等、直近の新規テーブルと
--     同じ判断。
--
-- 実行前チェック（読み取り専用）：既存有無の確認
--   select table_name from information_schema.tables where table_name = 'sport_logs';
-- ============================================================================

-- ===== 1. sport_logs テーブル新規作成 =====
-- soccer_logsと同じく1ユーザー1日1行（unique(user_id, log_date)）。
-- SportLogForm.tsxがsoccer_logsと同じ「その日の記録を1件だけ持つ・upsertで
-- 追加/編集する」UIパターン（find-by-date → 追加 or 編集）を踏襲するため。
create table if not exists sport_logs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null,
  log_date            date not null,
  sport_type          text not null,
  custom_sport_name   text,
  duration_minutes    integer not null,
  rpe                 integer,
  calories_burned     numeric,
  result_note         text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(user_id, log_date)
);

-- ===== 2. grant（authenticated：soccer_logsの現状と同一パターン） =====
grant select, insert, update, delete on sport_logs to authenticated;

-- ===== 2b. service_role への必要最小限のgrant =====
-- Supabaseは新規テーブル作成時に service_role へ REFERENCES / TRIGGER / TRUNCATE を
-- 自動付与するため、revoke all → 必要分のみ再grant、で明示的に是正する
-- （2026-09-04、health_metrics新設時の調査で確立した運用ルール。CLAUDE.md
-- 「新規テーブルを作るマイグレーションには、必ずrevoke all→grantの順で書く」）。
-- select のみ付与：sport_logsへの書き込みはすべて authenticated（アプリの
-- クライアント側、ユーザー自身の操作）経由で行われ、service_role（サーバー側
-- cron・API）からは読み取り専用（ACWR計算・日次サマリー生成用）でよいため。
begin;
revoke all on sport_logs from service_role;
grant select on sport_logs to service_role;
commit;

-- ===== 3. RLS有効化（soccer_logsの現状と同一パターン） =====
alter table sport_logs enable row level security;

drop policy if exists "user can manage own rows" on sport_logs;
create policy "user can manage own rows" on sport_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== 4. 実行後の確認用（読み取り専用） =====
-- authenticated が4種（select/insert/update/delete）、service_role が1種
-- （select）表示されていればOK。
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('authenticated', 'service_role', 'anon')
  and table_name = 'sport_logs'
order by grantee, privilege_type;
