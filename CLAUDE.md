# ワークアウト管理アプリ

## プロジェクト概要

トレーニング・食事・体調を一元管理する個人向けアプリ。
現在は単一ユーザーで運用しているが、将来的に複数ユーザーへの展開を想定している。

想定ユーザー：中〜上級者（数値の追跡が目的）
主軸：トレーニング記録と食事・PFC管理が同等

## 技術スタック

- フロントエンド：React + TypeScript + Vite
- バックエンド：Supabase（PostgreSQL、REST API経由）
- ホスティング：Vercel（GitHub連携で自動デプロイ）
- PWA：vite-plugin-pwa
- リポジトリ：applecatoftheship/workout-app

## 現在のファイル構成（2026年8月16日時点）

画面（pages）・フォーム/グラフ部品（components）・API層（api）・
ユーティリティ（utils）・型定義（types.ts）に分離済み。

```
src/
  api/            client.ts, dailyConditions.ts, dishes.ts, goals.ts,
                  trainingLogs.ts（種目マスタ・実績・DEFAULT_USER_ID）,
                  trainingTemplates.ts, trainingSchedules.ts, foodItems.ts, mealLogs.ts,
                  soccerLogs.ts
  utils/          calendarHelpers.ts, chartHelpers.ts, soccerCalorieHelpers.ts
  hooks/          useTheme.ts（ダーク/ライト切替、UIブラッシュアップPhase 1）
  styles/         tokens.css（デザイントークン本体、UIブラッシュアップPhase 1）
  pages/          Dashboard(.css), MonthlyCalendar(.css), ProgressGraph(.css),
                  Settings(.css)（UIブラッシュアップPhase 2で新規）
  components/
    GoalPanel(.css)
    BottomNav(.tsx/.css), RecordSheet(.tsx/.css), icons.tsx
                  （下部ナビ・記録シート・アイコン集、UIブラッシュアップPhase 2で新規）
    calendar/     TrainingLogForm.tsx, MealLogForm.tsx, ConditionForm.tsx, ScheduleForm.tsx,
                  BulkScheduleImportModal(.css), ExerciseNameInput.tsx,
                  TrainingTemplateSection.tsx, DishFormModal(.tsx/.css),
                  GenreFoodPicker.tsx, SoccerLogForm.tsx, CalendarForms.css
    graphs/       TrainingChart, WeightChart, SleepChart, FatigueChart, ChartCommon.css
  App.tsx / App.css   状態管理・データ取得・ビュー切替のみ
  types.ts        全ドメイン型を集約
```

`mockData.ts`は2026年8月12日に完全削除。Dashboard.tsxの当日予定フォールバックは
training_schedulesからの直接取得に置き換え済み（下記参照）。

`TrainingLogForm.tsx`・`MealLogForm.tsx`は目安の300行を超えているが、
一体の機能を分割すると追跡しづらくなるため1ファイルにまとめている
（判断理由は `.claude/references/architecture-history.md` 参照）。

## 重要な運用ルール

### Supabase

- 新規テーブルを作ったら、必ず先に grant とRLSポリシーを設定してから動作確認する。
  後付けにすると 401 / 42501 エラーの原因調査に時間がかかる。
- スキーマ変更は Supabase の SQL Editor で実行する。Claude Codeから直接
  Supabaseへは接続していないため、SQLは必ず人間が手動で実行する。
- 本番と開発が同一プロジェクトのため、スキーマ変更は即座に本番へ反映される。
  破壊的な変更を行う前は必ず確認を取ること。
- 実行済みSQLは `.claude/references/sql-migrations.md` に日付付きで記録している。
  今後は `migrations/` ディレクトリへの保存に切り替える予定。
- 初期データを `insert ... on conflict (name) do nothing` で投入する場合、
  名前が異なる旧データとは重複を検知できず共存してしまう
  （2026年8月13日、meal_sizesで実際に発生：新4件と旧4件が両方残り、
  ドロップダウンに8件表示される状態になった）。投入前に対象カラムへの
  一意制約が効いているか、旧データの有無を確認すること。

### 開発方針

- 推測で仕様を補完しない。不明点は必ず確認する。
  （本プロジェクト全体で一貫している最重要ルール）
- 破壊的変更・大規模なリファクタリングの前には、内容を説明して承認を得る。
- 既存の動作を壊す可能性がある変更は、影響範囲を明示する。
- ブラウザでの動作確認（claude-in-chrome使用）はコーディング作業と別セッションで行う。
  実装完了後は一度セッションを区切り、動作確認は新規セッションで行うこと。

### デプロイ確認

- コミットしてもpushし忘れると、Vercelには反映されないままになる
  （2026年8月13日、dishes実装時に発生：ローカルでは動作確認できたのに
  本番ではタブ自体が表示されず、原因調査に時間がかかった。実体は
  「コミットが作られていただけでpushされていなかった」だった）。
  push指示を受けたら実行後に `git branch -vv` で `origin/main` との
  同期状況（ahead/behindが無いこと）を確認すること。

## デザイントークン（2026年8月15日 UIブラッシュアップで刷新）

旧コンセプト「ナイター照明の下のピッチ」（ピッチグリーン系）は廃止し、
オレンジ×ティールの配色に完全移行した。トークン本体は `src/styles/tokens.css`
に定義（ライト/ダーク両対応）。`src/index.css`側にも旧トークン名
（`--color-pitch`等）が残っているが、これは新トークンへの**エイリアス**であり、
既存コンポーネントCSSが旧名を参照していても新配色が反映される。Dashboard・
MonthlyCalendar・CalendarForms・graphs（ProgressGraph）・RecordSheet・Settingsは
Phase 1〜5（2026年8月15〜16日、下記変更点参照）で新トークン名への置き換えが完了済み。
GoalPanel.css・BulkScheduleImportModal.css・DishFormModal.cssの3ファイルのみ
旧名参照が残存（下記技術的負債参照）。色を直接ハードコードせず、必ず変数を経由すること。

| 用途 | 色（ライト） | 色（ダーク） |
|---|---|---|
| 背景（base） | #FAFAF8 | #0B0E11 |
| 背景（surface） | #FFFFFF | #14181D |
| テキスト（primary） | #1B1D1F | #F2F1ED |
| テキスト（secondary） | #6B6F76 | #9B9FA6 |
| アクセント | #E85D2C（オレンジ） | #FF7A33 |
| データ（グラフ等） | #1D9C93（ティール） | #35C9C0 |
| 成功 | #2E7D4F | #4CAF6D |
| 注意 | #B9791E | #F2B84B |
| 危険 | #B4443C | #E2685F |

ダークモードは`<html data-theme="dark">`属性で切り替え（`src/hooks/useTheme.ts`）。
初期値はOS設定（`prefers-color-scheme`）に追従し、切り替え後の永続化はしない
（セッション中のみ保持。リロードでOS設定に戻る。`localStorage`不可のため）。

フォントはInterに統一（`@fontsource/inter`でセルフホスティング、PWAオフライン
対応のためGoogle Fonts CDNは不使用）。旧来の見出し用Oswald・数値用JetBrains Mono
は廃止し、数値表示には`.metric-value`ユーティリティクラス（`tabular-nums`）を使う。

ダッシュボードの濃紺ヒーローカードは、Phase 3（2026年8月15日、下記変更点参照）で
カロリーリング等の新デザインに置き換え済みで撤去済み。`--color-ink`系トークン自体は
`src/index.css`に残存しているが、現在は`GoalPanel.css`の主要ボタン（`.button--primary`）
1箇所のみが参照している状態で、これは旧トークン移行の対象漏れ（下記技術的負債参照）。
`BulkScheduleImportModal.css`・`DishFormModal.css`も同様に、Phase 1〜5のリデザイン対象外
だったため旧トークン名（`--color-pitch`・`--color-amber`・`--color-surface`・`font-display`
等）が残存している。

## データ構造（2026年8月12日 再設計済み）

**トレーニング**：種目マスタ（exercises）・セット単位実績（training_sets）・
テンプレート（training_templates / training_template_exercises）。
`training_log_exercises`は`exercise_id`+`order_index`のみを持ち、実績は
`training_sets`にセットごと（set_number, weight, reps, is_warmup）で保存する。
`training_logs.user_id`は固定プレースホルダー
`00000000-0000-0000-0000-000000000002`（`DEFAULT_USER_ID`, src/api/trainingLogs.ts）。
認証実装は後回しのため実質単一ユーザー運用だが、`unique(user_id, log_date)`
制約が機能する状態にしている。

**食事**：`food_items`に基準量（serving_amount/serving_unit）と論理削除フラグ
（is_deleted）、`meal_log_food_items`に確定スナップショット列（amount/calories/
protein/fat/carbohydrates）を追加。保存時点の食材データで栄養値を確定させる
方式のため、以後food_itemsを修正しても過去の食事記録は変化しない。
`custom_multiplier`列はDBに残存するが新コードからは未参照（後日削除を検討）。

いずれもSQL実行済み・動作確認済み。SQL全文と設計判断の理由は
`.claude/references/sql-migrations.md` / `.claude/references/architecture-history.md` 参照。

**予定（2026年8月12日 基礎インフラ構築、SQL実行済み・動作確認済み）**：`training_schedules`
（1日複数件可、`scheduled_date`単体のUNIQUE制約なし。`template_id`は
`training_templates`への任意参照）。API層は`src/api/trainingSchedules.ts`、
UIは`MonthlyCalendar.tsx`の「予定」タブ（`ScheduleForm.tsx`）。カレンダー
セルのアイコンは完了✅／未実施警告⚠️（cancelled含む）／予定絵文字（既定🏋️）を
状態から算出（`getScheduleDayIcon`, src/utils/calendarHelpers.ts）。
`TrainingLogForm.tsx`でトレーニング実績を完了として保存すると
`completeScheduleForDate`を呼び、当日の`scheduled`な予定を1件（テンプレート
一致優先、なければ最古）自動で`completed`にする。完了後は
`onScheduleUpdated`コールバック経由でMonthlyCalendar側のスケジュール一覧を
即時再取得し、リロードなしでカレンダーアイコンに反映する。

**予定ステップ2（2026年8月12日 実装済み）**：AIプロンプト生成＆JSON一括取り込み
（`BulkScheduleImportModal.tsx`）。MonthlyCalendarヘッダーの「✨ AI予定一括
取り込み」ボタンから開く。ChatGPT/Gemini等に渡すプロンプトのコピー、JSON
貼り付け＆バリデーション（scheduledDate/title必須チェック）、
`training_templates`とのtemplateName自動紐付け（`.trim()`一致）、
プレビュー、追加登録／上書き登録（対象期間の既存予定を削除してから挿入、
`deleteSchedulesInRange`）の一括登録に対応。SQL全文は
`.claude/references/sql-migrations.md`参照。

## 2026年8月13日の変更点

- **食材マスタの栄養成分是正**：food_items既存データの一部でカロリー・PFC値が
  実態と乖離していた異常値（例：パスタ2275kcal等）を修正。下記の技術的負債
  2番（基準量serving_amountが一律100gの問題）とは別の対応であり、
  基準量・単位の個別修正は引き続き未着手。

- **dishes・meal_sizes UI実装完了**：`dishes`（料理名）・`dish_food_items`
  （料理に含まれる食材・分量）・`meal_sizes`（サイズ倍率マスタ）の3テーブルは
  別セッションで作成済みのものに対し、grant/RLS/カラム追加のSQL整備とUI実装を
  実施（SQL全文は`.claude/references/sql-migrations.md`参照）。API層は
  `src/api/dishes.ts`。UIは`DishFormModal.tsx`（複数食材を組み合わせた料理の
  登録・削除）・`GenreFoodPicker.tsx`（ジャンル→食材の2段階選択、
  `MealLogForm.tsx`と共通化）。`MealLogForm.tsx`の「料理から選択」タブで、
  登録済み料理をサイズ倍率（小盛×0.7/並盛×1.0/大盛×1.5/特盛×2.0）に応じて
  食材ごとの量に展開し、`meal_log_food_items`へ個別食材として保存する
  （料理単位の1レコードとしてではない）。栄養値は保存時点のfood_itemsデータで
  都度計算するのみでDBに冗長保存しない方針は、食事のスナップショット設計と同様。

- **soccer_logs新設によるサッカー活動記録機能**：活動種別（練習/フットサル/
  サッカー/その他自由入力）・活動時間・走行距離・スプリント回数・最高速度・
  消費カロリー・メモを1日1件（`unique(user_id, log_date)`）で記録。消費カロリーは
  手入力値のみDB保存し、未入力時はMET方式（`src/utils/soccerCalorieHelpers.ts`、
  Compendium of Physical Activities準拠。フットサルのみ直接の文献値がなく
  練習とサッカーの中間値として推定）でUI表示のみ推定する（DBへの冗長保存は
  しない、dishesの栄養計算と同じ方針）。体重は`daily_conditions`から指定日以前で
  直近の記録を`fetchRecentWeight`（`src/api/dailyConditions.ts`に追加）で取得。
  API層は`src/api/soccerLogs.ts`、UIは`SoccerLogForm.tsx`
  （`MonthlyCalendar.tsx`の5番目のタブ「サッカー」）。カレンダーセルのアイコンは
  `getDayIcons`（`src/utils/calendarHelpers.ts`）が予定アイコンとサッカー⚽を
  配列で返し、同日に複数種別があれば横並び表示する（既存の`getScheduleDayIcon`は
  そのまま内部で利用しているため他の呼び出し元への影響はない）。

- **サッカー記録の活動時間からの自動入力**：「練習」選択時、ウォーキング/ランニングの
  メニュー選択が可能に（`soccer_logs.training_menu`列を追加）。フットサル/サッカー/
  ウォーキング/ランニングは、活動時間の入力のみで走行距離・スプリント回数・
  最高速度が自動計算され、入力欄は手入力不可（disabled）になる。計算式は
  Compendium of Physical Activitiesのアマチュア想定値に基づく固定レート
  （`AUTO_FILL_RATES`・`TRAINING_MENU_RATES`、`src/utils/soccerCalorieHelpers.ts`）。
  「その他」は従来通り全項目手入力のまま。

- **food_itemsの論理削除UIを追加**：`deleteFoodItem`（is_deleted論理削除）はAPI層に
  用意済みだったが呼び出すUIが未実装だった（下記の技術的負債にあった項目、解消）。
  `GenreFoodPicker.tsx`（`MealLogForm.tsx`・`DishFormModal.tsx`共通の食材選択部品）に
  「削除する食材」ドロップダウン＋削除ボタンを追加し、`window.confirm`確認後に
  論理削除する。共有コンポーネント経由のため、どちらの画面から削除しても
  もう一方の食材選択にも即座に反映される（`onFoodItemDeleted`コールバックで
  親の`loadFoodItems`を再実行）。既存の「食材を追加」ドロップダウン（選択即追加）
  とは別の独立したドロップダウンとして実装し、既存の追加フローの挙動は変更していない。

## 2026年8月15〜16日の変更点（UIブラッシュアップ Phase 1〜5）

デザイン刷新のみを目的とした変更で、データ取得ロジック・保存ロジック・
入力項目構成はPhase 1〜5を通じて変更していない（各Phaseとも実装後に
claude-in-chromeで本番動作確認済み）。

- **Phase 1：デザイントークン基盤**（2026年8月15日）：`src/styles/tokens.css`を
  新設しオレンジ×ティール配色に刷新（詳細は上記「デザイントークン」参照）。
  フォントをInterに統一（`@fontsource/inter`でセルフホスティング、PWAオフライン
  対応のためGoogle Fonts CDN不使用）。ダーク/ライト切替基盤として`src/hooks/useTheme.ts`
  を新設。`<html data-theme="dark">`属性で切り替え、初期値はOS設定
  （`prefers-color-scheme`）に追従し、切り替え後の永続化はしない
  （セッション中のみ保持、`localStorage`は不使用）。

- **Phase 2：下部ナビ・記録シート・設定画面**（2026年8月15日）：`src/components/BottomNav.tsx`
  を新設し、ホーム／カレンダー／＋（記録追加）／グラフ／設定の5スロット構成に刷新。
  従来`App.tsx`にあったビュー切替用のタブ/ボタン（旧view-switcher）は撤去し、
  `activeView`（`AppView`型）を`BottomNav`の`onNavigate`経由で更新する方式に統一。
  中央の「＋」ボタンは`src/components/RecordSheet.tsx`（新設、ボトムシートUI）を開き、
  トレーニング／食事／体調／サッカー／予定の5種類から記録タイプを選択すると、
  `pendingRecordRequest`経由で`MonthlyCalendar.tsx`が該当タブを開いた状態で表示される。
  設定画面`src/pages/Settings.tsx`（新設）にダークモード手動トグルを実装
  （リロードでOS設定に戻る仕様は変更なし）。

- **Phase 3：Dashboardリデザイン**（2026年8月15日）：旧来の濃紺ヒーローカードを撤去し、
  カロリーリング（recharts、`RadialBarChart`）・今日の運動カード（トレーニング/
  サッカーを個別ブロックで表示、双方あれば区切り線）・週間ストリップ（`getDayIcons`の
  ロジックをそのまま流用しアイコン表示、ロジック自体は無変更）・統計カード4枚
  （体重・睡眠・疲労度・直近の記録）・目標ストリップ（今月の達成率）に刷新。
  「直近の記録」はトレーニング/食事/体調のうち最新日付のものを表示する仕様で、
  サッカーログは対象外（Dashboard.tsxの`mostRecentRecord`計算ロジックは無変更）。
  リリース後の動作確認で、デスクトップ幅（≥700px）で固定ボトムナビ（高さ69px）が
  ページ最下部のコンテンツに約41px重なる表示崩れと、GoalPanel内に目標ストリップと
  重複する静的表示（8月トレーニングカード）が見つかり、別コミットで修正済み
  （`src/App.css`のデスクトップ幅`padding-bottom`調整、`GoalPanel.tsx`の重複カード削除）。

- **Phase 4：MonthlyCalendarリデザイン**（2026年8月16日）：日付グリッドを
  選択中セル＝アクセント色塗りつぶし（角丸10px）／非選択＝透明背景／今日（未選択時）＝
  アクセント色の細いリングに刷新。記録アイコンはセル下部に小さく表示（`getDayIcons`の
  ロジックは無変更）。日付詳細エリアの5タブ（トレーニング/予定/体調/食事/サッカー）を
  横スクロール可能なピル型に変更。`MealLogForm.tsx`内の「食材から選択/料理から選択」
  トグルは、同じ`.calendar-detail__tabs`をベースに`--segment`修飾クラスを追加し、
  bgElevated＋影のセグメント型スタイルとして5タブのピル型と視覚的に区別。
  `CalendarForms.css`は全5タブの入力フォームで共有されているため、この1ファイルの
  刷新で他4タブ（トレーニング・予定・体調・サッカー）にも同じトーン
  （角丸カード・チップ・ボタン配色）が自動的に反映されている。

- **Phase 5：ProgressGraphリデザイン**（2026年8月16日、最終フェーズ）：
  期間切り替えを「今週/今月」の2択から「1週間/1ヶ月/3ヶ月/全期間」の4択セグメント型
  タブに拡張（`src/utils/chartHelpers.ts`の`Period`型・`getPeriodRange`に`quarter`/`all`
  を追加。`week`/`month`の既存ロジックは無変更。`all`の開始日は`trainingLogs`/
  `dailyConditions`の最古の記録日から動的算出）。体重・睡眠時間・疲労度の各グラフに
  カードヘッダー（タイトル＋現在値＋トレンドバッジ）を追加。トレンドバッジの
  上昇/下降判定は`Dashboard.tsx`の既存トーン判定ロジックを踏襲し、色は
  `--color-success`/`--color-warning`を使用。**睡眠時間グラフはバーチャートから
  ライン/エリアチャートに変更**（体重・疲労度は元々ライン/エリアチャートのため
  変更なし）。データの算出式（`sleepValues`等）自体は無変更。体重＝アクセント色
  （グラデーション塗り）、睡眠＝データ色（ティール）、疲労度＝警告色（アンバー）で
  色分け。部位別トレーニング頻度を新規追加（`TrainingChart.tsx`）：`ProgressGraph.tsx`
  側で親から渡されている`trainingLogs`props（既存、変更なし）から期間内の部位別
  出現回数を新規に算出し、`bodyPartFrequency`propとして`TrainingChart`に渡す形で実装
  （`TrainingChart`自体の既存集計ロジックは無変更）。データ色のプログレスバーで表示。

## 既知の技術的負債

改修時に遭遇したら、勝手に直さず報告すること。

1. 予定の置き場所がまだ2箇所に分散
   - training_schedules テーブル（MonthlyCalendar.tsx・Dashboard.tsxで接続済み）
   - training_templates（`training_schedules.template_id`で参照可能になったが、
     テンプレート内容を予定に自動反映する機能はまだない。予定作成時に
     テンプレートを選ぶとタイトル等が自動入力されるわけではなく、
     あくまで実績保存時の自動完了判定・AI一括取り込み時のtemplateName
     紐付けに使われるのみ）

2. 食材マスタ（food_items）既存61件の基準量が一律 100g
   開発優先のため、既存61件は一律 `serving_amount=100, serving_unit='g'` で
   初期化している。「卵1個」「プロテイン1食分30g」のような個数/単位系の
   食材も、DB上は一時的に「100g」として記録された状態になっている。
   後日、手動データ修正またはマスターデータ補正パッチで個別に基準量・単位を
   修正する必要がある。新規登録する食材は登録フォームで基準量・単位を
   指定できるため、この問題は蓄積しない。

3. user_id が未整備なテーブルが残っている
   training_logs のみ対応済み。meal_logs・daily_conditions・goals は
   user_id を持たず、マルチユーザー化の際にまとめて対応が必要。

4. goals が固定ID1行の上書き運用
   月ごとの目標履歴が残らない。

5. 未使用の型・データが残存
   ProgressRecord（体脂肪率・ウエスト）と TrainingLog.cardio は完全未使用。
   mockData.ts本体・DailyProgram/MonthlyProgram等の旧型定義は削除済み
   （2026年8月12日）。ProgressRecordはtypes.tsからも削除済み。
   TrainingLog.cardio（CardioPlan型）のみ未使用のまま残存。

6. ルーティングが存在しない
   useState による表示切替のみ。URLが変わらないため、
   PWAとして「戻る」操作が機能しない。

7. エラーハンドリングが薄い
   Supabase の読み書き失敗時、console.error のみで画面表示なし。

8. ProgressGraphの期間「3ヶ月」「全期間」でも月間目標と比較され続ける
   （2026年8月16日、Phase 5で期間選択肢を追加した際に判明）。
   `ProgressGraph.tsx`の`trainingGoal`は`period === 'week' ? weeklyTrainingGoal
   : monthlyTrainingGoal`という既存の三項演算子のままのため、`quarter`/`all`を
   選んでも`week`以外は一律`monthlyTrainingGoal`と比較される。3ヶ月・全期間分の
   実施回数を1ヶ月分の目標と比較するため、達成率が実態より高く出やすい
   （既存ロジックを変更しない方針でPhase 5を実施したため、意図的に未対応のまま
   残した。四半期/全期間用の目標値をgoalsに追加するか、期間の日数に応じて
   月間目標を按分するかは要検討）。

9. GoalPanel.css・BulkScheduleImportModal.css・DishFormModal.cssに
   旧デザイントークン名（`--color-pitch`・`--color-amber`・`--color-ink`・
   `--color-surface`・`--color-text`・`font-mono`・`font-display`等）が残存
   （2026年8月16日、Phase 1〜5完了時点で判明。上記「デザイントークン」参照）。
   エイリアス経由のため配色自体はすでに新パレットが反映されているが、
   将来的にエイリアスを削除する際はこの3ファイルの置き換えが先行して必要になる。

## 進行中の計画（現在地）

作業順序：土台整備 → トレーニング → 食事 → 予定

- トレーニング：完了（種目マスタ・training_sets・テンプレート・UI）
- 食事：完了（基準量・論理削除・スナップショット保存・UI、SQL実行・動作確認済み）。
  料理（dishes・meal_sizes、サイズ倍率つきPFC計算）のUIも2026年8月13日に
  実装・動作確認済み。食材の論理削除UIも2026年8月13日に実装・動作確認済み。
  残作業は技術的負債2番（既存食材の基準量個別修正）のみ
- 予定：ステップ1（基礎インフラ：training_schedules接続・絵文字表示・
  実績完了自動連動）・ステップ2（AI予定一括取り込み）とも実装・SQL実行・
  動作確認済み。Dashboard.tsxの当日予定表示もtraining_schedules直接取得に
  移行済み。残作業はtraining_templatesとの内容連携（技術的負債1番）
- サッカー：2026年8月13日にsoccer_logs新設・UI実装・SQL実行・動作確認済み
  （活動種別・活動時間・走行距離・スプリント回数・最高速度の記録、
  MET方式による消費カロリー推定）。特に残作業なし

データ件数は都度Supabaseで確認する（このファイルでは追跡しない）。

## 参照ドキュメント

- `.claude/references/sql-migrations.md` — 実行済みSQLの全文
- `.claude/references/architecture-history.md` — 再設計の背景・判断理由
