-- プッシュ通知機能 Phase 1b（2026年8月24日）
-- push_subscriptions・notificationsテーブルの新設。
--
-- 【未実行】Claude Codeからは直接Supabaseへ接続できないため、このファイルは
-- Supabase SQL Editorで人間（John）が手動実行すること。実行前に以下で
-- 既存有無を確認してから進めること（このプロジェクトの既存慣習に合わせ、
-- create table if not exists・drop policy if existsで冪等に書いている）。
--
--   select table_name from information_schema.tables
--   where table_name in ('push_subscriptions', 'notifications');
--
-- 【本プロジェクト初：実効性のあるRLSポリシー】
-- 既知の技術的負債2番に記録の通り、このプロジェクトの既存テーブルのRLSは
-- 全て `for all using (true) with check (true)`（全許可、実質RLSなし）のまま
-- 運用されてきた。push_subscriptions・notificationsは認証未実装のこのアプリで
-- 唯一「他人の端末のデータを読み書きされては困る」性質のテーブルのため、
-- x-device-idヘッダー（Supabaseクライアントのglobal.headersで送信、
-- src/api/client.ts参照）とnotifications.device_id/push_subscriptions.device_id
-- を突き合わせる、実際に制限するRLSポリシーとして新設する
-- （user_id/auth.uid()は将来の認証実装時のため、OR条件として残してある。
-- 未認証時はauth.uid()がnullのため実質device_id側のみで判定される）。

-- ===== 1. push_subscriptions テーブル新規作成 =====
create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  device_id   text not null,
  endpoint    text unique,
  p256dh      text,
  auth        text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ===== 2. notifications テーブル新規作成 =====
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  device_id   text not null,
  type        text not null,
  title       text not null,
  message     text not null,
  is_read     boolean not null default false,
  created_at  timestamptz default now()
);

-- ===== 3. grant =====
-- push_subscriptionsはクライアントが自分の端末分を購読登録・更新・解除するため
-- select/insert/update/deleteを付与。notificationsはクライアントからは一覧表示と
-- 既読化のみ行い、作成・削除は/api/send-reminder.ts（service_role経由、RLSを
-- バイパスするためgrant/RLSの対象外）が行うため、select/updateのみ付与する。
grant select, insert, update, delete on push_subscriptions to anon, authenticated;
grant select, update on notifications to anon, authenticated;

-- ===== 4. RLS有効化 =====
alter table push_subscriptions enable row level security;
alter table notifications enable row level security;

drop policy if exists "device or user can manage own push subscription" on push_subscriptions;
create policy "device or user can manage own push subscription" on push_subscriptions
  for all
  using (
    device_id = current_setting('request.headers', true)::json ->> 'x-device-id'
    or user_id = auth.uid()
  )
  with check (
    device_id = current_setting('request.headers', true)::json ->> 'x-device-id'
    or user_id = auth.uid()
  );

drop policy if exists "device or user can read/update own notifications" on notifications;
create policy "device or user can read/update own notifications" on notifications
  for select using (
    device_id = current_setting('request.headers', true)::json ->> 'x-device-id'
    or user_id = auth.uid()
  );

drop policy if exists "device or user can mark own notifications read" on notifications;
create policy "device or user can mark own notifications read" on notifications
  for update using (
    device_id = current_setting('request.headers', true)::json ->> 'x-device-id'
    or user_id = auth.uid()
  )
  with check (
    device_id = current_setting('request.headers', true)::json ->> 'x-device-id'
    or user_id = auth.uid()
  );
