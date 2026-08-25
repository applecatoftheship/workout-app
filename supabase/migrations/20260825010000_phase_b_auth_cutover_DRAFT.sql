-- ============================================================================
-- 【ドラフト・未実行】アカウント/ログイン機能 フェーズB：本番切り替え用SQL
-- 作成日: 2026年8月25日（フェーズA実装時に準備、実行はフェーズBで行う）
--
-- 【重要】このファイルはこのフェーズでは実行しない。Johnさんの合図があってから、
-- 別途指示されるフェーズBで、Supabase SQL Editorにて人間が手動実行すること。
--
-- 【実行前の必須事前作業】
-- 1. Supabase Dashboardで認証アカウント（メール＋パスワード）を作成し、
--    そのUUIDを控える。
-- 2. このファイル内の 'NEW_AUTH_USER_UUID' を、1で控えたUUIDに全て置換する
--    （意図的にプレースホルダーのまま残してあります）。
-- 3. 下記「STEP 0: 事前確認」のSELECT文を実行し、想定通りのデータ状況か
--    確認してから STEP 1 以降を実行すること。
-- 4. 本番と開発が同一Supabaseプロジェクトのため、このSQLは即座に本番へ
--    反映される。BEGIN/COMMITで囲んで実行し、想定外の結果が出た場合は
--    COMMIT前にROLLBACKできるようにすること。
-- ============================================================================


-- ============================================================================
-- STEP 0: 事前確認（読み取り専用、破壊的操作なし）
-- ============================================================================

-- 0-1. training_templatesのuser_id nullable挙動の確認
--   フェーズA実装時のコード調査では、training_templates関連の全API関数
--   （fetchTrainingTemplates・createTrainingTemplate・updateTrainingTemplate・
--   deleteTrainingTemplate）が常にuser_idを明示的に設定/フィルタしており、
--   アプリ経由でNULL行が作られる経路は無いことを確認済み。ただし直接SQLで
--   手動挿入されたNULL行が存在する可能性は、DBへの直接アクセス手段が
--   なかったため否定できていない。以下のSELECTの結果が0件であることを
--   確認してから、STEP 3-3のポリシーは「標準per-userポリシー」を採用する。
--   1件以上あれば「exercisesと同様のOR条件ポリシー」（STEP 3-3に併記）に
--   切り替えること。
select count(*) as null_user_id_templates from training_templates where user_id is null;

-- 0-2. 移行対象行数の確認（各テーブルの現在の総行数・DEFAULT_USER_ID該当行数）
select 'training_logs' as table_name, count(*) as total,
  count(*) filter (where user_id = '00000000-0000-0000-0000-000000000002') as target from training_logs
union all
select 'training_log_exercises', count(*), count(*) filter (where user_id = '00000000-0000-0000-0000-000000000002') from training_log_exercises
union all
select 'training_sets', count(*), count(*) filter (where user_id = '00000000-0000-0000-0000-000000000002') from training_sets
union all
select 'training_templates', count(*), count(*) filter (where user_id = '00000000-0000-0000-0000-000000000002') from training_templates
union all
select 'training_template_exercises', count(*), count(*) filter (where user_id = '00000000-0000-0000-0000-000000000002') from training_template_exercises
union all
select 'training_schedules', count(*), count(*) filter (where user_id = '00000000-0000-0000-0000-000000000002') from training_schedules
union all
select 'daily_conditions', count(*), count(*) filter (where user_id = '00000000-0000-0000-0000-000000000002') from daily_conditions
union all
select 'meal_logs', count(*), count(*) filter (where user_id = '00000000-0000-0000-0000-000000000002') from meal_logs
union all
select 'meal_log_food_items', count(*), count(*) filter (where user_id = '00000000-0000-0000-0000-000000000002') from meal_log_food_items
union all
select 'dishes', count(*), count(*) filter (where user_id = '00000000-0000-0000-0000-000000000002') from dishes
union all
select 'dish_food_items', count(*), count(*) filter (where user_id = '00000000-0000-0000-0000-000000000002') from dish_food_items
union all
select 'goals', count(*), count(*) filter (where user_id = '00000000-0000-0000-0000-000000000002') from goals
union all
select 'soccer_logs', count(*), count(*) filter (where user_id = '00000000-0000-0000-0000-000000000002') from soccer_logs
union all
select 'exercises (共有マスタ)', count(*), count(*) filter (where user_id = '00000000-0000-0000-0000-000000000002') from exercises
union all
select 'food_items (共有マスタ)', count(*), count(*) filter (where user_id = '00000000-0000-0000-0000-000000000002') from food_items;

-- 0-3. 現在のRLS有効状況・既存ポリシー一覧（フェーズA調査時点では静的ファイルから
--   確認できなかったテーブルがあるため、実行前に必ずライブ確認すること）
select tablename, rowsecurity from pg_tables
where schemaname = 'public'
  and tablename in (
    'training_logs','training_log_exercises','training_sets',
    'training_templates','training_template_exercises','training_schedules',
    'daily_conditions','meal_logs','meal_log_food_items',
    'dishes','dish_food_items','goals','soccer_logs',
    'exercises','food_items','meal_sizes'
  );

select tablename, policyname, cmd, qual, with_check from pg_policies
where schemaname = 'public'
  and tablename in (
    'training_logs','training_log_exercises','training_sets',
    'training_templates','training_template_exercises','training_schedules',
    'daily_conditions','meal_logs','meal_log_food_items',
    'dishes','dish_food_items','goals','soccer_logs',
    'exercises','food_items','meal_sizes'
  );


-- ============================================================================
-- STEP 1: バックアップテーブル作成（対象13テーブル全て、ロールバック用）
-- ============================================================================
-- Gemini初期案はtraining_logs・meal_logsの2テーブルのみだったが、13テーブル
-- 全てに拡張した（指示書確定事項）。「create table ... as table ...」で
-- インデックス・制約を持たない純粋なデータコピーを作成する（IDは保持される
-- ため、ロールバック時の再挿入で元の関連が維持できる）。

begin;

drop table if exists backup_training_logs;
create table backup_training_logs as table training_logs;

drop table if exists backup_training_log_exercises;
create table backup_training_log_exercises as table training_log_exercises;

drop table if exists backup_training_sets;
create table backup_training_sets as table training_sets;

drop table if exists backup_training_templates;
create table backup_training_templates as table training_templates;

drop table if exists backup_training_template_exercises;
create table backup_training_template_exercises as table training_template_exercises;

drop table if exists backup_training_schedules;
create table backup_training_schedules as table training_schedules;

drop table if exists backup_daily_conditions;
create table backup_daily_conditions as table daily_conditions;

drop table if exists backup_meal_logs;
create table backup_meal_logs as table meal_logs;

drop table if exists backup_meal_log_food_items;
create table backup_meal_log_food_items as table meal_log_food_items;

drop table if exists backup_dishes;
create table backup_dishes as table dishes;

drop table if exists backup_dish_food_items;
create table backup_dish_food_items as table dish_food_items;

drop table if exists backup_goals;
create table backup_goals as table goals;

drop table if exists backup_soccer_logs;
create table backup_soccer_logs as table soccer_logs;

-- 共有マスタも念のためバックアップする（UPDATE対象行があるため）
drop table if exists backup_exercises;
create table backup_exercises as table exercises;

drop table if exists backup_food_items;
create table backup_food_items as table food_items;

commit;


-- ============================================================================
-- STEP 2: データ移行UPDATE文（13テーブル全て＋共有マスタ2テーブル）
-- ============================================================================
-- 'NEW_AUTH_USER_UUID' は、事前にSupabase Dashboardで作成した認証アカウントの
-- UUIDに置換してから実行すること。

begin;

update training_logs set user_id = 'NEW_AUTH_USER_UUID'
  where user_id = '00000000-0000-0000-0000-000000000002';

update training_log_exercises set user_id = 'NEW_AUTH_USER_UUID'
  where user_id = '00000000-0000-0000-0000-000000000002';

update training_sets set user_id = 'NEW_AUTH_USER_UUID'
  where user_id = '00000000-0000-0000-0000-000000000002';

update training_templates set user_id = 'NEW_AUTH_USER_UUID'
  where user_id = '00000000-0000-0000-0000-000000000002';

update training_template_exercises set user_id = 'NEW_AUTH_USER_UUID'
  where user_id = '00000000-0000-0000-0000-000000000002';

update training_schedules set user_id = 'NEW_AUTH_USER_UUID'
  where user_id = '00000000-0000-0000-0000-000000000002';

update daily_conditions set user_id = 'NEW_AUTH_USER_UUID'
  where user_id = '00000000-0000-0000-0000-000000000002';

update meal_logs set user_id = 'NEW_AUTH_USER_UUID'
  where user_id = '00000000-0000-0000-0000-000000000002';

update meal_log_food_items set user_id = 'NEW_AUTH_USER_UUID'
  where user_id = '00000000-0000-0000-0000-000000000002';

update dishes set user_id = 'NEW_AUTH_USER_UUID'
  where user_id = '00000000-0000-0000-0000-000000000002';

update dish_food_items set user_id = 'NEW_AUTH_USER_UUID'
  where user_id = '00000000-0000-0000-0000-000000000002';

update goals set user_id = 'NEW_AUTH_USER_UUID'
  where user_id = '00000000-0000-0000-0000-000000000002';

update soccer_logs set user_id = 'NEW_AUTH_USER_UUID'
  where user_id = '00000000-0000-0000-0000-000000000002';

-- 共有マスタ：DEFAULT_USER_IDだった行（＝ユーザーが自分で追加した種目・食材）
-- のみを対象とする。is_preset=trueの行（user_id IS NULL）・食材のuser_id IS NULLの
-- 行（共有食材）には一切触れない。WHERE句がuser_id = 'DEFAULT_USER_ID'に限定
-- されているため、is_preset/NULL行は元々このWHERE条件に一致せず対象外となる。
update exercises set user_id = 'NEW_AUTH_USER_UUID'
  where user_id = '00000000-0000-0000-0000-000000000002';

update food_items set user_id = 'NEW_AUTH_USER_UUID'
  where user_id = '00000000-0000-0000-0000-000000000002';

-- column defaultも新しいuser_idに更新しておく（フェーズA実装時に判明した、
-- 一部の子テーブルinsertがDB列のデフォルト値に暗黙依存していた問題への
-- 保険。フェーズAのアプリコードは全て明示的にuser_idを指定するよう修正済み
-- のため必須ではないが、将来の実装漏れに備えた多層防御として設定する）。
alter table training_log_exercises alter column user_id set default 'NEW_AUTH_USER_UUID';
alter table training_sets alter column user_id set default 'NEW_AUTH_USER_UUID';
alter table training_template_exercises alter column user_id set default 'NEW_AUTH_USER_UUID';
alter table daily_conditions alter column user_id set default 'NEW_AUTH_USER_UUID';
alter table meal_logs alter column user_id set default 'NEW_AUTH_USER_UUID';
alter table meal_log_food_items alter column user_id set default 'NEW_AUTH_USER_UUID';
alter table dish_food_items alter column user_id set default 'NEW_AUTH_USER_UUID';
alter table goals alter column user_id set default 'NEW_AUTH_USER_UUID';
alter table training_logs alter column user_id set default 'NEW_AUTH_USER_UUID';
alter table dishes alter column user_id set default 'NEW_AUTH_USER_UUID';

-- COMMITする前に、必ずSELECTで結果を確認すること。
-- select count(*) from training_logs where user_id = 'NEW_AUTH_USER_UUID';
-- 等で移行後の行数が STEP 0-2 で確認した対象行数と一致するか確認してからCOMMITする。

commit;


-- ============================================================================
-- STEP 3: RLSポリシーの差し替え
-- ============================================================================

begin;

-- 3-1. 既存ポリシーを全て削除（ポリシー名は`for all using (true) with check (true)`の
--   ような汎用名で統一されていない可能性があるため、名前をハードコードせず
--   pg_policiesから動的に取得して全削除する。他テーブルへの影響はない）。
do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in (
        'training_logs','training_log_exercises','training_sets',
        'training_templates','training_template_exercises','training_schedules',
        'daily_conditions','meal_logs','meal_log_food_items',
        'dishes','dish_food_items','goals','soccer_logs',
        'exercises','food_items','meal_sizes'
      )
  loop
    execute format('drop policy if exists %I on %I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- 3-2. RLSを有効化（フェーズA調査時点で有効化状況が未確認だったテーブルを
--   含め、全対象テーブルに対して冪等に実行する。既に有効な場合は無害）。
alter table training_logs enable row level security;
alter table training_log_exercises enable row level security;
alter table training_sets enable row level security;
alter table training_templates enable row level security;
alter table training_template_exercises enable row level security;
alter table training_schedules enable row level security;
alter table daily_conditions enable row level security;
alter table meal_logs enable row level security;
alter table meal_log_food_items enable row level security;
alter table dishes enable row level security;
alter table dish_food_items enable row level security;
alter table goals enable row level security;
alter table soccer_logs enable row level security;
alter table exercises enable row level security;
alter table food_items enable row level security;
alter table meal_sizes enable row level security;

-- 3-3. per-userテーブル（12テーブル、training_templatesを除く）
create policy "user can manage own rows" on training_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user can manage own rows" on training_log_exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user can manage own rows" on training_sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user can manage own rows" on training_template_exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user can manage own rows" on training_schedules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user can manage own rows" on daily_conditions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user can manage own rows" on meal_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user can manage own rows" on meal_log_food_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user can manage own rows" on dishes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user can manage own rows" on dish_food_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user can manage own rows" on goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user can manage own rows" on soccer_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- training_templates：STEP 0-1の事前確認結果に応じて以下のどちらか一方のみを
-- 実行すること（両方同時に有効化しない）。

-- (a) STEP 0-1の結果が0件だった場合（フェーズA時点のコード調査結果と一致する
--     想定パターン）：標準per-userポリシー
create policy "user can manage own rows" on training_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- (b) STEP 0-1の結果が1件以上あった場合：exercisesと同様のOR条件ポリシーに
--     差し替える（上の(a)をDROP POLICYしてから実行すること）
-- create policy "user can manage own or shared rows" on training_templates
--   for all using (user_id is null or auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3-4. 共有マスタ：exercises（is_preset=true OR 自分のuser_id）
create policy "shared preset or own rows" on exercises
  for all using (is_preset = true or auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3-5. 共有マスタ：food_items（user_id IS NULL OR 自分のuser_id）
create policy "shared null or own rows" on food_items
  for all using (user_id is null or auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3-6. meal_sizes：anonロールを除外し、authenticatedロールのみ許可
create policy "authenticated only" on meal_sizes
  for all to authenticated using (true) with check (true);

commit;

-- 【任意・推奨】anonロールへの既存grantの見直し
-- 上記はRLSポリシーの差し替えのみで、grant自体（`grant select, insert, update,
-- delete on X to anon`）は変更していない。RLSポリシーが auth.uid() を要求する
-- ようになったため、anonロール（未ログイン）からのリクエストはRLSで拒否される
-- ため実害はないが、grant自体をanonから外す（authenticatedのみに絞る）ことで
-- 多層防御になる。今回の指示書スコープには含まれていないため実行しないが、
-- 将来的な対応候補として記録する。
-- 例: revoke all on training_logs from anon; grant select, insert, update, delete on training_logs to authenticated;


-- ============================================================================
-- STEP 4: ロールバック手順（バックアップテーブルからの復元）
-- ============================================================================
-- 移行後に問題が見つかった場合に実行する。外部キー依存関係を考慮し、
-- 子テーブル→親テーブルの順で削除、親テーブル→子テーブルの順で復元する。

begin;

-- 4-1. 削除（子→親の順）
delete from training_sets;
delete from training_log_exercises;
delete from training_logs;
delete from training_template_exercises;
delete from training_templates;
delete from dish_food_items;
delete from dishes;
delete from meal_log_food_items;
delete from meal_logs;
delete from training_schedules;
delete from daily_conditions;
delete from goals;
delete from soccer_logs;
-- 共有マスタは移行時にDEFAULT_USER_ID行のみ更新しているため、同様に復元する
delete from exercises where user_id = 'NEW_AUTH_USER_UUID';
delete from food_items where user_id = 'NEW_AUTH_USER_UUID';

-- 4-2. 復元（親→子の順）
insert into training_logs select * from backup_training_logs;
insert into training_log_exercises select * from backup_training_log_exercises;
insert into training_sets select * from backup_training_sets;
insert into training_templates select * from backup_training_templates;
insert into training_template_exercises select * from backup_training_template_exercises;
insert into dishes select * from backup_dishes;
insert into dish_food_items select * from backup_dish_food_items;
insert into meal_logs select * from backup_meal_logs;
insert into meal_log_food_items select * from backup_meal_log_food_items;
insert into training_schedules select * from backup_training_schedules;
insert into daily_conditions select * from backup_daily_conditions;
insert into goals select * from backup_goals;
insert into soccer_logs select * from backup_soccer_logs;
insert into exercises select * from backup_exercises where user_id = '00000000-0000-0000-0000-000000000002';
insert into food_items select * from backup_food_items where user_id = '00000000-0000-0000-0000-000000000002';

-- 4-3. column defaultをDEFAULT_USER_IDへ戻す
alter table training_log_exercises alter column user_id set default '00000000-0000-0000-0000-000000000002';
alter table training_sets alter column user_id set default '00000000-0000-0000-0000-000000000002';
alter table training_template_exercises alter column user_id set default '00000000-0000-0000-0000-000000000002';
alter table daily_conditions alter column user_id set default '00000000-0000-0000-0000-000000000002';
alter table meal_logs alter column user_id set default '00000000-0000-0000-0000-000000000002';
alter table meal_log_food_items alter column user_id set default '00000000-0000-0000-0000-000000000002';
alter table dish_food_items alter column user_id set default '00000000-0000-0000-0000-000000000002';
alter table goals alter column user_id set default '00000000-0000-0000-0000-000000000002';
alter table training_logs alter column user_id set default '00000000-0000-0000-0000-000000000002';
alter table dishes alter column user_id set default '00000000-0000-0000-0000-000000000002';

-- 4-4. RLSポリシーを元（全許可）に戻す場合は、STEP 3-1と同じ動的DROPを実行した
--   上で、STEP 0-3で事前に控えておいたポリシー定義を使って再作成すること
--   （このドラフトではSTEP 0-3の結果を保存する手段がないため、ロールバック時に
--   RLSポリシーも戻す場合は、STEP 0-3の出力を別途保存しておく必要がある）。

-- COMMITする前に、必ずSELECTで復元後の行数が想定通りか確認すること。

commit;
