-- ============================================================================
-- プロフィール機能：profilesテーブル新設・Storageバケットavatars新設（2026年8月27日）
--
-- 【未実行】Claude Codeからは直接Supabaseへ接続できないため、このファイルは
-- Supabase SQL Editorで人間（John）が手動実行すること。実行前に既存有無を
-- 確認してから進めること（このプロジェクトの既存慣習に合わせ、
-- create table if not exists・drop policy if existsで冪等に書いている）。
--
--   select table_name from information_schema.tables where table_name = 'profiles';
--   select id from storage.buckets where id = 'avatars';
-- ============================================================================

-- ===== 1. profiles テーブル新規作成（1ユーザー1行、user_idが主キー） =====
-- 体重はdaily_conditions.weightに一本化する方針のため、ここには含めない
-- （src/api/dailyConditions.tsのupsertWeightOnly参照）。既存のworkoutsテーブルと
-- 同じくuser_idはFK制約なしのuuid（このプロジェクト全体の既存慣習、auth.usersへの
-- 参照は張っていない）。
create table if not exists profiles (
  user_id              uuid primary key,
  display_name         text,
  age                  integer,
  height_cm            numeric,
  body_fat_percentage  numeric,
  avatar_type          text, -- 'preset' | 'upload'
  avatar_value         text, -- presetの場合は絵文字、uploadの場合はStorageの公開URL
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ===== 2. grant（workoutsテーブルと同一パターン） =====
-- サーバー側（api/配下）からprofilesを参照する機能は現状無いため、service_role
-- への付与はしていない（必要になった時点で別途追加する）。
grant select, insert, update, delete on profiles to authenticated;

-- ===== 3. RLS有効化（workoutsテーブルと同一パターン） =====
alter table profiles enable row level security;

drop policy if exists "user can manage own rows" on profiles;
create policy "user can manage own rows" on profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- 4. Storageバケット avatars 新設（公開バケット、書き込みは本人のuser_id
--    フォルダのみ許可）
--
-- 【未確認・要実機確認】storage.objectsへのRLSポリシーはSupabaseの標準的な
-- パターン（(storage.foldername(name))[1] = auth.uid()::text で本人フォルダのみに
-- 制限）を踏襲しているが、Claude CodeはこのプロジェクトでStorageを実際に
-- 操作したことが無いため、ポリシー文法・実際の書き込み可否は未検証。実行後、
-- 実機（claude-in-chrome、別セッション）でのアップロード動作確認を推奨する。
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars user can upload own folder" on storage.objects;
create policy "avatars user can upload own folder" on storage.objects
  for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars user can update own folder" on storage.objects;
create policy "avatars user can update own folder" on storage.objects
  for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars user can delete own folder" on storage.objects;
create policy "avatars user can delete own folder" on storage.objects
  for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===== 5. 実行後の確認用（読み取り専用） =====
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'authenticated' and table_name = 'profiles'
order by privilege_type;

select policyname, cmd from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname like 'avatars%';
