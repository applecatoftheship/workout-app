-- ============================================================================
-- Apple Health連携 Task1：workoutsテーブル新設・daily_conditionsへの
-- service_role GRANT追加（2026年8月27日）
--
-- 【未実行】Claude Codeからは直接Supabaseへ接続できないため、このファイルは
-- Supabase SQL Editorで人間（John）が手動実行すること。実行前に既存有無を
-- 確認してから進めること（このプロジェクトの既存慣習に合わせ、
-- create table if not exists・drop policy if existsで冪等に書いている）。
--
--   select table_name from information_schema.tables where table_name = 'workouts';
-- ============================================================================

-- ===== 1. workouts テーブル新規作成 =====
-- 既存のtraining_logs等と同じくuser_idはFK制約なしのuuid（このプロジェクト全体の
-- 既存慣習、auth.usersへの参照は張っていない）。external_idはApple HealthKitの
-- ワークアウトUUID（HKWorkout.uuid相当）を想定し、同一ワークアウトの再送を
-- upsert（onConflict: 'external_id'）で重複なく吸収できるよう単純unique制約とした
-- （複数ユーザー化した場合、理論上は別ユーザーの端末で偶然同一UUIDが再利用される
-- 可能性はゼロではないが、Apple側のUUIDは実質グローバルに一意なため許容している。
-- 指示書の列定義通り、user_id複合ではなくexternal_id単体のunique制約としている）。
create table if not exists workouts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  external_id        text unique,
  activity_type      text not null,
  start_time         timestamptz not null,
  end_time           timestamptz,
  duration_seconds   integer,
  distance_meters    numeric,
  active_calories    numeric,
  avg_heart_rate     numeric,
  is_primary         boolean not null default true,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ===== 2. grant（training_logs等と同一パターン：authenticated用にフルCRUD、
--          service_roleはこのタスクのAPIが実際に使う操作のみ最小権限で付与） =====
grant select, insert, update, delete on workouts to authenticated;
grant select, insert, update on workouts to service_role;

-- ===== 3. RLS有効化（training_logs等と同一パターン） =====
alter table workouts enable row level security;

drop policy if exists "user can manage own rows" on workouts;
create policy "user can manage own rows" on workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- 4. daily_conditionsへのservice_role GRANT追加（INSERT・UPDATE不足分のみ）
--
-- 【背景】20260824010000_send_reminder_service_role_grants.sqlで付与したのは
-- `grant select on daily_conditions to service_role;`のみ（当時のapi/send-reminder.ts
-- は読み取り専用だったため）。今回のapi/sync-apple-health.tsは睡眠データを
-- daily_conditionsへupsertする必要があるため、不足しているINSERT・UPDATEのみを
-- 追加する（既存のSELECTは対象外・再付与不要）。
-- ============================================================================
grant insert, update on daily_conditions to service_role;

-- ===== 5. 実行後の確認用（読み取り専用） =====
-- workoutsが4種（select/insert/update/delete）、daily_conditionsは既存のselectを
-- 含め3種（select/insert/update）表示されていればOK。
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'service_role'
  and table_name in ('workouts', 'daily_conditions')
order by table_name, privilege_type;
