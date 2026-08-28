-- ============================================================================
-- 設定画面拡張 Phase 1：カレンダー週始まり・アクセントカラー設定（2026年8月28日）
--
-- 【未実行】Claude Codeからは直接Supabaseへ接続できないため、このファイルは
-- Supabase SQL Editorで人間（John）が手動実行すること。
--
-- 既存のprofilesテーブル（20260827020000_profiles_and_avatars_DRAFT.sql）への
-- 列追加のみ。RLS（"user can manage own rows"）・GRANT（authenticatedへの
-- select/insert/update/delete）は既存ポリシーがテーブル単位でそのまま適用されるため、
-- 追加設定は不要（列追加はポリシーの再設定を必要としない）。
--
-- 【デフォルト値についての判断】依頼書ではaccent_colorのデフォルトを'teal'として
-- いたが、既存アプリの現在のプライマリカラーはtokens.cssの--color-accent（オレンジ、
-- #E85D2C）であり'teal'は乖離が大きいため、依頼書の「既存の配色に近い値をデフォルトに
-- してほしい」との指示に従い、デフォルトを'orange'に変更した。
-- ============================================================================
alter table profiles
  add column if not exists first_day_of_week integer default 1,  -- 1: 月曜始まり, 0: 日曜始まり
  add column if not exists accent_color text default 'orange';   -- 'orange' | 'teal' | 'blue' | 'purple'（既存プライマリカラーに合わせデフォルトをorangeに変更）

-- ===== 実行後の確認用（読み取り専用） =====
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name in ('first_day_of_week', 'accent_color')
order by column_name;
