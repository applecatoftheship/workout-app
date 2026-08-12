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
