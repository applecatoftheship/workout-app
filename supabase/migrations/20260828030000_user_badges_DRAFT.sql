-- ============================================================================
-- 設定画面拡張 Phase 4：ゲーミフィケーション（Geminiの実装指示書、2026年8月28日）
-- user_badges 新規作成
--
-- 【未実行】Claude Codeからは直接Supabaseへ接続できないため、このファイルは
-- Supabase SQL Editorで人間（John）が手動実行すること。
--
-- 【badge_idについて】マスタテーブル化はせず、src/constants/badges.tsの
-- BADGE_DEFINITIONSをアプリ側の唯一の定義元とする（text列に自由文字列で保存、
-- DB側でCHECK制約は設けない）。新しいバッジ種別の追加時にSQL変更が不要になる
-- 判断（既存のnotifications.typeがCHECK制約の有無を未確認のまま運用している
-- のと同様の軽量な設計）。
--
-- 【profiles(user_id)へのFKについて】Gemini初期案はprofiles(id)という存在しない
-- 列を参照していたため、profiles(user_id)（主キー）に修正済み
-- （20260827020000_profiles_and_avatars_DRAFT.sql参照。当該マイグレーションが
-- 未実行の場合、本マイグレーションもそれより先には実行できない点に注意）。
--
-- 【GRANTについて】Gemini仕様書にはGRANT文が無かったが、CLAUDE.md
-- 「RLS changes need GRANT too」の教訓（RLSだけでは401/42501の原因になる）を
-- 踏まえ、指示書の指示通りSELECT/INSERTのgrantを追加している。UPDATE/DELETEは
-- ユーザーが自分のバッジを書き換える操作がアプリ内に存在しないため付与しない
-- （最小権限）。
-- ============================================================================

create table if not exists user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  badge_id text not null,
  unlocked_at timestamptz not null default now(),
  constraint user_badges_user_id_badge_id_key unique (user_id, badge_id)
);

alter table user_badges enable row level security;

create policy "Users can view their own badges"
  on user_badges for select
  using (auth.uid() = user_id);

create policy "Users can insert their own badges"
  on user_badges for insert
  with check (auth.uid() = user_id);

grant select, insert on user_badges to authenticated;

-- ===== 実行後の確認用（読み取り専用） =====
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'user_badges';
select policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'user_badges';
