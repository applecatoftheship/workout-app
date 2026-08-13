# SQLマイグレーション履歴

CLAUDE.mdの軽量化のため、実行済みSQLの全文をここに退避している。
CLAUDE.mdからは「詳細はこのファイルを参照」の形でリンクされている。

将来的には `migrations/` ディレクトリに日付付きファイルとして
保存する運用に切り替える予定（CLAUDE.mdの運用ルール参照）。ここに記載の
2件は、その運用に切り替える前に実行済みのものを遡って記録したもの。

## 2026-08-12 (1): トレーニングデータ構造の再設計

種目マスタ（exercises）・セット単位実績（training_sets）・
テンプレート（training_templates / training_template_exercises）を新設。
training_logs に user_id（固定プレースホルダー）を追加し、
unique(user_id, log_date) 制約に変更。

実行済み・動作確認済み。

```sql
-- ===== 1. 種目マスタ =====
create table exercises (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  body_part     text not null check (body_part in
                   ('胸', '肩', '腕', '背', '脚', '腹', '有酸素', 'その他')),
  equipment_type text check (equipment_type in
                   ('バーベル', 'ダンベル', 'マシン', '自重', 'その他')),
  is_preset     boolean not null default false,
  user_id       uuid,
  created_at    timestamptz not null default now()
);
create index idx_exercises_body_part on exercises(body_part);
create index idx_exercises_user_id on exercises(user_id);

-- ===== 2. 既存データの削除（B-d：作り直し方針） =====
delete from training_log_exercises;
delete from training_logs;

-- ===== 3. training_logs の改修 =====
-- 実行時点で user_id 列は既に存在していたため、
-- add column ではなく既存列に not null / default を設定する形で実行した
alter table training_logs
  alter column user_id set default '00000000-0000-0000-0000-000000000002',
  alter column user_id set not null;

alter table training_logs
  drop constraint if exists training_logs_log_date_unique;
alter table training_logs
  drop constraint if exists training_logs_log_date_key;

alter table training_logs
  add constraint training_logs_user_date_key unique (user_id, log_date);

-- ===== 4. training_log_exercises の改修 =====
alter table training_log_exercises
  drop column if exists name,
  drop column if exists sets,
  drop column if exists target_reps,
  drop column if exists target_weight;

alter table training_log_exercises
  add column exercise_id uuid not null references exercises(id),
  add column order_index integer not null default 0;

-- ===== 5. セット単位の実績テーブル =====
create table training_sets (
  id                        uuid primary key default gen_random_uuid(),
  training_log_exercise_id  uuid not null references training_log_exercises(id) on delete cascade,
  set_number                integer not null,
  weight                    numeric,
  reps                      integer,
  is_warmup                 boolean not null default false,
  created_at                timestamptz not null default now()
);
create index idx_training_sets_exercise on training_sets(training_log_exercise_id);

-- ===== 6. テンプレート機能 =====
create table training_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  user_id     uuid,
  created_at  timestamptz not null default now()
);

create table training_template_exercises (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references training_templates(id) on delete cascade,
  exercise_id   uuid not null references exercises(id),
  order_index   integer not null default 0,
  target_sets   integer,
  target_reps   text,
  target_weight numeric,
  rest_seconds  integer,
  created_at    timestamptz not null default now()
);

-- ===== 7. 権限設定 =====
grant select, insert, update, delete on exercises to anon;
grant select, insert, update, delete on training_sets to anon;
grant select, insert, update, delete on training_templates to anon;
grant select, insert, update, delete on training_template_exercises to anon;

alter table exercises enable row level security;
alter table training_sets enable row level security;
alter table training_templates enable row level security;
alter table training_template_exercises enable row level security;

create policy "allow all - exercises" on exercises for all using (true) with check (true);
create policy "allow all - training_sets" on training_sets for all using (true) with check (true);
create policy "allow all - training_templates" on training_templates for all using (true) with check (true);
create policy "allow all - training_template_exercises" on training_template_exercises for all using (true) with check (true);

-- ===== 8. 種目プリセット（50種目） =====
insert into exercises (name, body_part, equipment_type, is_preset) values
('ベンチプレス', '胸', 'バーベル', true),
('インクラインベンチプレス', '胸', 'バーベル', true),
('ダンベルプレス', '胸', 'ダンベル', true),
('インクラインダンベルプレス', '胸', 'ダンベル', true),
('ダンベルフライ', '胸', 'ダンベル', true),
('チェストプレス', '胸', 'マシン', true),
('ペックフライ', '胸', 'マシン', true),
('腕立て伏せ', '胸', '自重', true),
('デッドリフト', '背', 'バーベル', true),
('ベントオーバーロウ', '背', 'バーベル', true),
('ラットプルダウン', '背', 'マシン', true),
('シーテッドロウ', '背', 'マシン', true),
('ダンベルロウ', '背', 'ダンベル', true),
('チンニング（懸垂）', '背', '自重', true),
('Tバーロウ', '背', 'マシン', true),
('プルオーバー', '背', 'ダンベル', true),
('スクワット', '脚', 'バーベル', true),
('レッグプレス', '脚', 'マシン', true),
('ルーマニアンデッドリフト', '脚', 'バーベル', true),
('レッグエクステンション', '脚', 'マシン', true),
('レッグカール', '脚', 'マシン', true),
('ブルガリアンスクワット', '脚', 'ダンベル', true),
('ランジ', '脚', 'ダンベル', true),
('カーフレイズ', '脚', 'マシン', true),
('ヒップスラスト', '脚', 'バーベル', true),
('ゴブレットスクワット', '脚', 'ダンベル', true),
('ショルダープレス', '肩', 'バーベル', true),
('ダンベルショルダープレス', '肩', 'ダンベル', true),
('サイドレイズ', '肩', 'ダンベル', true),
('フロントレイズ', '肩', 'ダンベル', true),
('リアレイズ', '肩', 'ダンベル', true),
('アップライトロウ', '肩', 'バーベル', true),
('シュラッグ', '肩', 'ダンベル', true),
('フェイスプル', '肩', 'マシン', true),
('バーベルカール', '腕', 'バーベル', true),
('ダンベルカール', '腕', 'ダンベル', true),
('ハンマーカール', '腕', 'ダンベル', true),
('トライセプスエクステンション', '腕', 'ダンベル', true),
('トライセプスプレスダウン', '腕', 'マシン', true),
('ナローベンチプレス', '腕', 'バーベル', true),
('ディップス', '腕', '自重', true),
('プリーチャーカール', '腕', 'マシン', true),
('クランチ', '腹', '自重', true),
('レッグレイズ', '腹', '自重', true),
('プランク', '腹', '自重', true),
('アブローラー', '腹', 'その他', true),
('ロシアンツイスト', '腹', 'その他', true),
('ハンギングレッグレイズ', '腹', '自重', true),
('ランニング', '有酸素', 'その他', true),
('サイクリング', '有酸素', 'その他', true);
```

## 2026-08-12 (2): 食事データ構造の再設計

food_items に基準量（serving_amount/serving_unit）と論理削除フラグ（is_deleted）、
meal_log_food_items に確定スナップショット列を追加。既存記録は
custom_multiplier をもとにバックフィル。

実行済み・動作確認済み（実摂取量入力・新規食材の基準量指定・栄養値の
再計算・進捗グラフのトレーニングボリューム表示まで確認済み）。

```sql
ALTER TABLE food_items
  ADD COLUMN IF NOT EXISTS serving_amount NUMERIC NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS serving_unit TEXT NOT NULL DEFAULT 'g',
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE meal_log_food_items
  ADD COLUMN IF NOT EXISTS amount NUMERIC,
  ADD COLUMN IF NOT EXISTS calories NUMERIC,
  ADD COLUMN IF NOT EXISTS protein NUMERIC,
  ADD COLUMN IF NOT EXISTS fat NUMERIC,
  ADD COLUMN IF NOT EXISTS carbohydrates NUMERIC;

UPDATE meal_log_food_items mlfi
SET
  amount = COALESCE(mlfi.custom_multiplier, 1.0) * fi.serving_amount,
  calories = ROUND(COALESCE(mlfi.custom_multiplier, 1.0) * fi.calories, 1),
  protein = ROUND(COALESCE(mlfi.custom_multiplier, 1.0) * fi.protein, 1),
  fat = ROUND(COALESCE(mlfi.custom_multiplier, 1.0) * fi.fat, 1),
  carbohydrates = ROUND(COALESCE(mlfi.custom_multiplier, 1.0) * fi.carbohydrates, 1)
FROM food_items fi
WHERE mlfi.food_item_id = fi.id
  AND mlfi.calories IS NULL;
```

## 2026-08-12 (3): 予定機能の基礎インフラ（training_schedules新設）

**未実行（Supabase SQL Editorでの実行待ち）**。1日複数件の予定登録を許可する
ため `scheduled_date` 単体へのUNIQUE制約は付けていない。

```sql
create table training_schedules (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default '00000000-0000-0000-0000-000000000002',
  scheduled_date  date not null,
  template_id     uuid references training_templates(id) on delete set null,
  title           text not null,
  emoji           text default '🏋️',
  status          text not null default 'scheduled'
                    check (status in ('scheduled', 'completed', 'cancelled')),
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_training_schedules_user_date on training_schedules(user_id, scheduled_date);

alter table training_schedules enable row level security;

create policy "Allow public access for dev" on training_schedules
  for all using (true) with check (true);

grant all on training_schedules to anon, authenticated, service_role;
```

## 2026-08-13: dishes・meal_sizes UI実装（既存テーブルへのgrant/RLS/制約整備）

**未実行（Supabase SQL Editorでの実行待ち）**。`dishes`・`dish_food_items`・`meal_sizes`の
3テーブル自体は別セッションで作成済みとの申告のため`CREATE TABLE`は含まない。ここでは
実装指示書の「0. 実装前の確認事項」に基づき、grant/RLS/制約の整備と`dish_food_items`への
カラム追加・`meal_sizes`の初期データ投入のみを行う。

このプロジェクトからは直接Supabaseへ接続できず現状の制約・ポリシーを確認できないため、
以下はすべて「既にあれば安全にスキップ、なければ追加」の冪等な書き方にしている
（`deleteDish`実装側も、FK制約のCASCADE有無に依存しない2段階手動削除を採用したため、
このSQLでのFK追加が仮に失敗してもアプリの動作には影響しない）。

```sql
-- ===== 1. dish_food_items へ量・単位カラムを追加 =====
alter table dish_food_items add column if not exists amount numeric not null default 100;
alter table dish_food_items add column if not exists unit text not null default 'g';

-- ===== 2. meal_sizes.name の一意制約（初期データのon conflictに必要） =====
do $$
begin
  begin
    alter table meal_sizes add constraint meal_sizes_name_key unique (name);
  exception
    when duplicate_object then
      raise notice 'meal_sizes_name_key は既に存在するためスキップしました';
    when unique_violation then
      raise notice 'meal_sizes.name に重複データがあるため一意制約を追加できませんでした。手動でのデータ整理が必要です';
  end;
end $$;

-- ===== 3. dish_food_items.dish_id の外部キー制約（ON DELETE CASCADE） =====
-- deleteDish実装は本制約の有無に依存しない2段階手動削除のため、
-- 万一この制約追加が失敗（別名の制約が既に存在する等）してもnoticeを出して先に進む
do $$
begin
  begin
    alter table dish_food_items
      add constraint dish_food_items_dish_id_fkey
      foreign key (dish_id) references dishes(id) on delete cascade;
  exception
    when duplicate_object then
      raise notice 'dish_food_items_dish_id_fkey は既に存在するためスキップしました';
    when others then
      raise notice '外部キー制約を追加できませんでした（%）。deleteDish側の2段階削除で担保されるため実害はありません', sqlerrm;
  end;
end $$;

-- ===== 4. grant・RLS（training_schedulesと同一パターンに統一） =====
grant all on dishes, dish_food_items, meal_sizes to anon, authenticated, service_role;

alter table dishes enable row level security;
alter table dish_food_items enable row level security;
alter table meal_sizes enable row level security;

drop policy if exists "Allow public access for dev" on dishes;
create policy "Allow public access for dev" on dishes
  for all using (true) with check (true);

drop policy if exists "Allow public access for dev" on dish_food_items;
create policy "Allow public access for dev" on dish_food_items
  for all using (true) with check (true);

drop policy if exists "Allow public access for dev" on meal_sizes;
create policy "Allow public access for dev" on meal_sizes
  for all using (true) with check (true);

-- ===== 5. meal_sizes 初期データ投入 =====
insert into public.meal_sizes (name, multiplier, sort_order) values
  ('小盛', 0.7, 1),
  ('並盛', 1.0, 2),
  ('大盛', 1.5, 3),
  ('特盛', 2.0, 4)
on conflict (name) do nothing;
```

## 2026-08-13: soccer_logs テーブル新設（サッカー・競技記録機能）

**未実行（Supabase SQL Editorでの実行待ち）**。実装指示書「サッカー・競技記録機能 実装指示書（v1）」
の1節に基づく。このプロジェクトからは直接Supabaseへ接続できずテーブルの存在を確認できないため、
`create table if not exists`・`drop policy if exists`による冪等な書き方にしている
（`dishes`実装時と同一パターン）。実行前に以下のSQLで既存有無・列構成を確認してから進めること。

```sql
select column_name, data_type from information_schema.columns where table_name = 'soccer_logs';
```

`calories_burned`はMET方式による推定値をDBに保存せず、手入力値のみを保存する設計
（`dishes`の栄養計算値をDBに保存しない方針と同様）。推定値の算出ロジックは
`src/utils/soccerCalorieHelpers.ts`参照。

```sql
-- ===== 1. soccer_logs テーブル新規作成 =====
create table if not exists soccer_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid,
  log_date          date not null,
  activity_type     text not null,
  duration_minutes  numeric,
  distance_km       numeric,
  sprint_count      integer,
  max_speed_kmh     numeric,
  calories_burned   numeric,
  notes             text,
  created_at        timestamptz default now(),
  unique(user_id, log_date)
);

-- ===== 2. grant・RLS（training_schedules・dishesと同一パターンに統一） =====
grant all on soccer_logs to anon, authenticated, service_role;

alter table soccer_logs enable row level security;

drop policy if exists "Allow public access for dev" on soccer_logs;
create policy "Allow public access for dev" on soccer_logs
  for all using (true) with check (true);
```

### 実装メモ

- `src/api/soccerLogs.ts`が`createOrUpdateSoccerLog`で`upsert(..., { onConflict: 'user_id,log_date' })`
  を使うため、`unique(user_id, log_date)`制約が必須（上記CREATE TABLEに含まれている）。
- 体重取得は新規ファイルを作らず`src/api/dailyConditions.ts`に`fetchRecentWeight(beforeDate)`を追加した
  （指示書0-3で「既存ファイルへの追加」を許容する記載があったため、テーブル所有ファイルに合わせた）。
- カレンダーの日付セルアイコンは、`getScheduleDayIcon`を`getDayIcons`でラップし、
  トレーニング予定アイコンとサッカー⚽アイコンを配列で返す形に変更（`src/utils/calendarHelpers.ts`）。
  既存の`getScheduleDayIcon`自体はそのまま残しているため、他の呼び出し元への影響はない。

## 2026年8月13日: soccer_logsにtraining_menu列を追加（活動時間からの自動入力機能）

**未実行（Supabase SQL Editorでの実行待ち）**。実装指示書「サッカー・競技記録機能 拡張：
活動時間からの自動入力 実装指示（追補v2）」の4節に基づく。「練習」選択時のみ
「ウォーキング」「ランニング」のメニューを保存するための列を追加する。

```sql
alter table soccer_logs add column if not exists training_menu text;
```

grant/RLSは既存の`soccer_logs`に対して設定済みのため、列追加のみで問題ない
（列単位のRLSではないため追加のRLS設定は不要）。

### 実装メモ

- `activity_type`が「練習」の場合のみ`training_menu`に値（'ウォーキング'/'ランニング'）が入る。
  それ以外の`activity_type`では常に`null`。
- 消費カロリー推定のMET値は、`src/utils/soccerCalorieHelpers.ts`の`MET_VALUES`（旧: 活動種別ごとの
  固定値）を廃止し、`AUTO_FILL_RATES`（サッカー/フットサル）・`TRAINING_MENU_RATES`
  （ウォーキング/ランニング）内の`met`に統合。`estimateCaloriesBurned`は
  `activityType`ではなく`met`（数値）を直接受け取るシグネチャに変更し、呼び出し元
  （`SoccerLogForm.tsx`）で`resolveMet(activityType, trainingMenu)`により解決したMET値を渡す。
- 走行距離・スプリント回数・最高速度は、サッカー/フットサル選択時、または練習でメニュー選択後は
  活動時間から自動計算され、入力欄は`disabled`（手入力不可）になる。「その他」選択時、または
  練習でメニュー未選択の場合は従来通り手入力可能（`resolveAutoFillRates`が`null`を返す）。
