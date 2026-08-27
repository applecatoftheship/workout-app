-- ============================================================================
-- Apple Health連携：workouts.activity_typeのNOT NULL制約解除（2026年8月27日）
--
-- 【未実行】Supabase SQL Editorで人間（John）が手動実行すること。
--
-- 【背景】Apple純正Shortcutsの制約上、当面ワークアウト送信はtype固定・
-- distance_meters・start_timeの3項目のみとなり、activity_typeを含む他の
-- フィールドは送信されない設計に変更された。20260827000000_apple_health_
-- workouts_DRAFT.sqlで作成したworkouts.activity_typeはnot null制約付きの
-- ため、このままではactivity_type未指定のINSERTが全て失敗する
-- （api/sync-apple-health.tsが返していた汎用エラー{"error":"sync failed"}の
-- 原因の1つと推定される。実行後、レスポンスに含めた具体的なエラー内容で
-- 実際の原因を最終確認すること）。
-- ============================================================================

alter table workouts alter column activity_type drop not null;

-- 実行後の確認用（読み取り専用）
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'workouts' and column_name = 'activity_type';
