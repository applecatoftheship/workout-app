-- ============================================================================
-- Apple Health連携：自動計測値（安静時心拍数・HRV・歩数・アクティブエネルギー）用
-- health_metrics テーブル新設（2026年9月4日）
--
-- 【実行済み・2026年9月4日、Johnさんが本番Supabaseで実行済み】
-- ファイル名の _DRAFT サフィックスは他の同種ファイルとの命名一貫性のため
-- そのまま残しているが、内容は実行済み（dishes の 20260903000000 と同じ扱い）。
-- Claude Code からは直接 Supabase へ接続していないため、実行そのものは
-- 人間（John）が Supabase SQL Editor で行った。
--
-- 【設計判断（重要）】自動計測値を daily_conditions に混ぜて保存すると、
-- streakHelpers.collectLogDates が「daily_conditions に行があればその日は
-- 記録した日」とみなす仕様のため、毎日自動で行ができて連続記録日数
-- （streak_7 / streak_30 バッジ）が実質永久に途切れなくなってしまう。
-- そのため自動計測値専用の新規テーブルに分離した。体重（weight_kg）だけは
-- 既存の daily_conditions.weight をそのまま使う（ACWR の負荷換算
-- （findRecentWeightOnOrBefore 等）とプロフィール画面が既にこの列を参照して
-- いるため、保存先を分断しない）。
--
-- 実行前チェック（読み取り専用）：既存有無の確認
--   select table_name from information_schema.tables where table_name = 'health_metrics';
-- ============================================================================

-- ===== 1. health_metrics テーブル新規作成 =====
-- workouts 等と同じくFK制約なしのuuid（このプロジェクト全体の既存慣習、
-- auth.usersへの参照は張っていない）。(user_id, log_date) の複合主キーで
-- 1ユーザー1日1行に制約し、upsert（onConflict: 'user_id,log_date'）で
-- 冪等に更新できるようにする。
create table if not exists health_metrics (
  user_id             uuid not null,
  log_date            date not null,
  resting_heart_rate  numeric,
  hrv_ms              numeric,
  steps               integer,
  active_energy_kcal  numeric,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (user_id, log_date)
);

-- ===== 2. grant（workouts と同一パターン） =====
grant select, insert, update, delete on health_metrics to authenticated;
grant select, insert, update on health_metrics to service_role;

-- ===== 3. RLS有効化（workouts と同一パターン） =====
alter table health_metrics enable row level security;

drop policy if exists "user can manage own rows" on health_metrics;
create policy "user can manage own rows" on health_metrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== 4. 実行後の確認用（読み取り専用） =====
-- health_metrics が4種（select/insert/update/delete）、service_role が3種
-- （select/insert/update）表示されていればOK。
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('authenticated', 'service_role')
  and table_name = 'health_metrics'
order by grantee, privilege_type;
