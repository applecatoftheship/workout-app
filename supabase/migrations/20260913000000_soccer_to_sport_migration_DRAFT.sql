-- ============================================================================
-- サッカー専用機能（soccer_logs）の汎用スポーツ機能（sport_logs）への統合
-- （2026年9月13日）
--
-- 【背景】Tier 4-2で新設した汎用スポーツ記録機能（sport_logs）に、既存の
-- 「サッカー」専用機能（soccer_logsテーブル・SoccerLogForm.tsx・
-- SoccerSummary等）を統合し、アプリの「サッカー」タブ自体を廃止する
-- （John承認済み）。soccer_logs専用項目（活動種別＝練習/試合、トレーニング
-- メニュー、走行距離、スプリント回数、最高速度）は汎用フォームの
-- 実施時間・RPE（任意）・カロリー・スコア/メモに簡略化されるため、それらの
-- 構造化データはsport_logs移行後は失われる（notesへのテキスト追記で救済する。
-- 詳細は本移行のPART 2参照）。soccer_logsテーブル自体はdrop・truncateせず、
-- そのまま残す（アプリから参照しなくなるだけ）。
--
-- 【本ファイルの構成】このチャットが本番データの実態（列構成・NULL有無・
-- activity_type別件数）を確認してからPART 2（本移行のINSERT文）を確定させる
-- 方針のため、2段階に分けている。
--   PART 1: preflight（読み取り専用）。
--   PART 2: 本移行（INSERT INTO sport_logs SELECT ... FROM soccer_logs）。
--
-- 【2026-09-13：PART 1実行結果を踏まえPART 2を確定】Johnさんが本番で実行した
-- PART 1の結果：全4件（フットサル3件・練習1件）、duration_minutesは全件120で
-- NULL/非整数なし、calories_burnedは全件NULL、notesは全件NULL/空、
-- distance_kmは4件・sprint_count/max_speed_kmh/end_timeは3件に値あり。
-- 「サッカー」activity_typeの実データは0件だったが、sport_type振り分けの
-- CASE文自体は指示書通り3分岐（サッカー/フットサル/それ以外→その他）を維持する
-- （将来的にサッカーのデータが増えても再度分岐を書き直す必要がないため）。
--
-- 【実行方法】Claude CodeはSupabaseへの直接アクセス手段を持たないため、
-- このファイルの内容をJohnさんが本番Supabase SQL Editorで実行すること。
-- ============================================================================


-- ============================================================================
-- PART 1: preflight（読み取り専用。データは一切変更しない）
-- ============================================================================

-- ----- 1-1. soccer_logsの実際のカラム一覧・型・NULL許可 -----
-- CLAUDE.md記載の列構成（id/user_id/log_date/activity_type/duration_minutes/
-- distance_km/sprint_count/max_speed_kmh/calories_burned/notes/created_at/
-- training_menu/end_time）と実態が一致しているか、後続の変更で列が増減して
-- いないかを確認する。
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'soccer_logs'
order by ordinal_position;

-- ----- 1-2. 主要列のNULL有無確認 -----
-- duration_minutes・calories_burnedはsport_logs側でNOT NULL/型がintegerのため、
-- 移行INSERT文でのCOALESCE・キャストの要否をここで判断する。
-- training_menu・distance_km・sprint_count・max_speed_kmh・end_timeは
-- notesへのテキスト追記対象のため、どの程度実データが入っているか確認する。
select
  count(*) as total_rows,
  count(*) filter (where duration_minutes is null) as duration_minutes_null_count,
  count(*) filter (where calories_burned is null) as calories_burned_null_count,
  count(*) filter (where user_id is null) as user_id_null_count,
  count(*) filter (where notes is not null and notes <> '') as notes_present_count,
  count(*) filter (where training_menu is not null) as training_menu_present_count,
  count(*) filter (where distance_km is not null) as distance_km_present_count,
  count(*) filter (where sprint_count is not null) as sprint_count_present_count,
  count(*) filter (where max_speed_kmh is not null) as max_speed_kmh_present_count,
  count(*) filter (where end_time is not null) as end_time_present_count
from soccer_logs;

-- ----- 1-3. activity_type別の件数内訳 -----
-- サッカー/フットサル/練習/その他（自由入力含む）の分布を確認する
-- （sport_type振り分けロジックの妥当性確認、および「練習」×training_menu
-- 組み合わせの実態把握のため）。
select
  activity_type,
  training_menu,
  count(*) as row_count
from soccer_logs
group by activity_type, training_menu
order by activity_type, training_menu nulls first;

-- ----- 1-4. duration_minutesの型・値域確認（整数キャストの安全性確認） -----
-- soccer_logs.duration_minutesはnumeric型のため、sport_logs.duration_minutes
-- （integer）へ移行する際に小数値が含まれていないか確認する。
select
  count(*) filter (where duration_minutes <> trunc(duration_minutes)) as non_integer_duration_count,
  min(duration_minutes) as min_duration,
  max(duration_minutes) as max_duration
from soccer_logs
where duration_minutes is not null;


-- ============================================================================
-- PART 2: 本移行（soccer_logs → sport_logs への1回限りのINSERT）
-- 2026-09-12のpreflight結果（全4件：フットサル3件・練習1件、duration_minutesは
-- 全件120でNULL/非整数なし、calories_burnedは全件NULL、notesは全件NULL/空、
-- distance_kmは4件・sprint_count/max_speed_kmh/end_timeは3件に値あり）を
-- 踏まえて確定。soccer_logsテーブル自体はdrop・truncateしない。
-- ============================================================================

insert into sport_logs (
  id, user_id, log_date, sport_type, custom_sport_name,
  duration_minutes, rpe, calories_burned, result_note, notes,
  created_at, updated_at
)
select
  s.id,
  s.user_id,
  s.log_date,
  case s.activity_type
    when 'サッカー' then 'サッカー'
    when 'フットサル' then 'フットサル'
    else 'その他'
  end as sport_type,
  case
    when s.activity_type = '練習' then coalesce(s.training_menu, 'サッカー練習')
    else null
  end as custom_sport_name,
  coalesce(s.duration_minutes, 0)::integer as duration_minutes,
  null::integer as rpe,
  s.calories_burned,
  null::text as result_note,
  case
    when s.notes is not null and trim(s.notes) <> '' then s.notes || E'\n\n' || m.migrated_line
    else m.migrated_line
  end as notes,
  s.created_at,
  now() as updated_at
from soccer_logs s
cross join lateral (
  select '［移行元データ］' || array_to_string(
    array_remove(
      array[
        '活動種別: ' || s.activity_type,
        case when s.training_menu is not null then 'トレーニングメニュー: ' || s.training_menu end,
        case when s.distance_km is not null then '走行距離: ' || s.distance_km::text || 'km' end,
        case when s.sprint_count is not null then 'スプリント: ' || s.sprint_count::text || '回' end,
        case when s.max_speed_kmh is not null then '最高速度: ' || s.max_speed_kmh::text || 'km/h' end,
        case when s.end_time is not null then '終了時刻: ' || to_char(s.end_time, 'YYYY-MM-DD HH24:MI') end
      ],
      null
    ),
    ' / '
  ) as migrated_line
) m;

-- ----- 実行後の確認用（読み取り専用） -----
-- 件数がsoccer_logsと一致し、sport_type・custom_sport_nameが意図通りか確認する。
select sport_type, custom_sport_name, duration_minutes, calories_burned, notes
from sport_logs
where id in (select id from soccer_logs)
order by log_date;
