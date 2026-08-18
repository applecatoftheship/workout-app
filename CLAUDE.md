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

## 現在のファイル構成（2026年8月18日時点）

画面（pages）・フォーム/グラフ部品（components）・API層（api）・
ユーティリティ（utils）・型定義（types.ts）に分離済み。

```
src/
  api/            client.ts, dailyConditions.ts, dishes.ts, goals.ts,
                  trainingLogs.ts（種目マスタ・実績・DEFAULT_USER_ID）,
                  trainingTemplates.ts, trainingSchedules.ts, foodItems.ts, mealLogs.ts,
                  soccerLogs.ts
  utils/          calendarHelpers.ts,
                  chartHelpers.ts（calculateMovingAverage・TREND_DIRECTION・getTrendTone、
                  2026年8月17日追加）, soccerCalorieHelpers.ts,
                  acwrHelpers.ts（ACWR疲労残高計算、2026年8月16〜17日新設）
  hooks/          useTheme.ts（ダーク/ライト切替、UIブラッシュアップPhase 1）
  styles/         tokens.css（デザイントークン本体、UIブラッシュアップPhase 1。
                  --color-ma-weight/-sleep/-fatigue等を2026年8月17日、
                  部位別ボリューム表示用の--color-bp-*8色を2026年8月17日追加）
  pages/          Dashboard(.css)（週移動・日付選択の閲覧専用モードを2026年8月17日追加）,
                  MonthlyCalendar(.css), ProgressGraph(.css)（部位別ボリューム表示・
                  ドリルダウン対応を2026年8月17日追加）, Settings(.css)
                  （UIブラッシュアップPhase 2で新規）
  components/
    GoalPanel(.css)
    BottomNav(.tsx/.css), RecordSheet(.tsx/.css), icons.tsx
                  （下部ナビ・記録シート・アイコン集、UIブラッシュアップPhase 2で新規）
    ACWRGaugeCard(.tsx/.css)（疲労残高ゲージ、2026年8月16〜17日新設）
    calendar/     TrainingLogForm.tsx, MealLogForm.tsx, ConditionForm.tsx, ScheduleForm.tsx,
                  BulkScheduleImportModal(.tsx/.css)（予定に加えトレーニング/食事/体調の
                  一括取り込みと種目名・食材名のフォールバックマッチングに2026年8月17〜18日拡張）,
                  ExerciseNameInput.tsx, DishFormModal(.tsx/.css),
                  GenreFoodPicker.tsx, SoccerLogForm.tsx, CalendarForms.css
    graphs/       TrainingChart（実施回数・達成率等のサマリーカードのみに縮小、
                  2026年8月18日）, TrainingVolumeChart（総ボリューム推移ヒーロー
                  グラフ、2026年8月18日新規）, TrainingBodyPartDonut（部位バランス
                  円グラフ、2026年8月18日新規）, TrainingBodyPartList（部位別詳細
                  リスト・ドリルダウン、TrainingChartから分離、2026年8月18日新規）,
                  WeightChart, SleepChart, FatigueChart, ChartCommon.css
  App.tsx / App.css   状態管理・データ取得・ビュー切替のみ（AI一括取り込み後の
                  グローバル状態再取得用に2026年8月17日、setTrainingLogs等を
                  MonthlyCalendar経由でBulkScheduleImportModalに受け渡し）
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
- グローバルな状態をstate変化のたびに全件同期するような設計（ローカルとリモートの
  diff検出による全件削除・再作成）は、部分的なフェッチ失敗時にデータを全損させる
  リスクがあるため、新規実装では避ける。個別CRUD方式（保存・削除をその都度APIで
  確定させる）を標準とする（2026年8月16日、トレーニング実績データ消失事故を踏まえた
  教訓。詳細は下記「2026年8月16日：トレーニング実績データ消失事故と対応」参照）。
- フェッチ処理のcatch節でloaded系のフラグを安易にtrueにしない。失敗時はfalseのまま
  維持し、エラー通知のみ行う（同上）。

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
Phase 1〜5（2026年8月15〜16日、下記変更点参照）およびGoalPanel.css・
BulkScheduleImportModal.css・DishFormModal.css（2026年8月16日、下記「技術的負債一括解消」
参照）で新トークン名への置き換えが完了済み。色を直接ハードコードせず、必ず変数を経由すること。

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
カロリーリング等の新デザインに置き換え済みで撤去済み。`GoalPanel.css`・
`BulkScheduleImportModal.css`・`DishFormModal.css`に残っていた旧トークン名
（`--color-pitch`・`--color-amber`・`--color-ink`・`--color-surface`・`--color-text`・
`font-mono`・`font-display`等）は、2026年8月16日の技術的負債一括解消で新トークン名に
置き換え済み（下記「2026年8月16日: 技術的負債一括解消」参照）。`src/index.css`側の
旧トークンエイリアスも、他に参照が残るもの以外は削除済み。

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

## 2026年8月16日: 技術的負債一括解消（項目1・2・3・5・6・7・8・9）

下記「既知の技術的負債」に旧#3〜#9として記載していた7項目を一括で解消。
「推測で仕様を補完しない」の原則に従い、判断が分かれた箇所は判断理由を明記する。
実装後、claude-in-chromeで本番環境（workout-app-suke4.vercel.app）の動作確認を実施し、
データ消失なし・主要CRUD（体調・食事・料理登録、目標編集）正常動作・トースト表示・
HashRouterのURL遷移を確認済み（2026年8月16日）。

- **user_id整備**（旧技術的負債3番）：training_log_exercises・training_sets・
  training_template_exercises・daily_conditions・meal_logs・meal_log_food_items・
  dish_food_items・goalsにuser_id列を追加（NOT NULL, default DEFAULT_USER_ID）。
  food_items・meal_sizesはexercisesの`is_preset`と同様の「共有カタログ」方式を採用し、
  `user_id`をnullableにして`NULL=共有`として扱う（is_preset相当の列が元々存在しなかった
  ためこの代替とした・判断理由）。dishesは既存行をDEFAULT_USER_IDで埋めた上でNOT NULL化。
  daily_conditionsのUNIQUE制約は`log_date`単体から`(user_id, log_date)`に変更。
  API層（src/api/dailyConditions.ts・dishes.ts・foodItems.ts・mealLogs.ts・
  trainingLogs.ts・trainingTemplates.ts）にuser_idでのフィルタ・書き込みを追加。
  ただし子テーブル（training_log_exercises等）自体へのAPI側フィルタは未実装のまま
  （下記「既知の技術的負債」参照）。

- **goalsの年月単位履歴化**（旧技術的負債4番）：固定ID1行の上書き運用から、
  `(user_id, year_month)`単位の複数行管理に変更。`src/api/goals.ts`を全面書き換えし、
  `fetchGoalsByMonth`・当月データが無い場合の直近月からのフォールバックコピー処理を追加。
  `Goals`型の定義場所は実装指示書ではtypes.tsを想定していたが、実際は
  `src/api/goals.ts`にあったため、そちらを直接拡張する判断とした（型の重複定義を
  避けるため・判断理由）。過去月の目標値を一覧表示するUIは未実装
  （下記「既知の技術的負債」参照）。

- **未使用の型・関数の削除**（旧技術的負債5番）：`types.ts`に残存していた未使用の
  `TrainingLog.cardio`（`CardioPlan`型）を削除。`src/api/soccerLogs.ts`の未使用関数
  `fetchSoccerLogByDate`も削除。

- **HashRouter導入**（旧技術的負債6番）：`react-router-dom`の`HashRouter`を導入し、
  `useState`によるビュー切替からURLベースのルーティングに移行。Vercelにrewrites設定を
  追加せずに済む`HashRouter`を選択した（`BrowserRouter`への移行は将来検討・判断理由、
  下記「既知の技術的負債」参照）。`App.tsx`を`AppShell`に分割し、`BottomNav`・
  `Dashboard`・`MonthlyCalendar`はそれぞれ`useNavigate`/`useLocation`を内部で使用する
  形に変更。ビュー種別と経路の対応は新設の`src/utils/appViewPaths.ts`に集約。

- **トースト通知の追加**（旧技術的負債7番）：`src/hooks/useToast.tsx`・
  `src/components/Toast.tsx`を新設し、`App.tsx`をはじめ主要な保存・削除処理に
  成功/エラートーストを追加（3秒で自動消滅、複数同時表示にも対応する配列管理）。
  Supabaseへの読み書き失敗時にconsole.errorのみだった状態を解消。

- **ProgressGraphの期間別目標達成率**（旧技術的負債8番）：`src/utils/chartHelpers.ts`に
  `getPeriodGoalMultiplier`を追加し、「3ヶ月」「全期間」選択時も月間目標を期間の日数に
  応じて按分した値と比較するように変更（既存の「週」「月」のロジックは無変更）。

- **旧デザイントークン名の置き換え**（旧技術的負債9番）：`GoalPanel.css`・
  `BulkScheduleImportModal.css`・`DishFormModal.css`の旧トークン名を新トークン名に
  置き換え。`src/index.css`側の旧トークンエイリアスも、他に参照が残るもの以外は削除。

SQL全文は`.claude/references/sql-migrations.md`の「2026年8月16日」節に集約済み
（BEGIN/COMMITで囲んだ冪等な1トランザクション。実行済み・動作確認済み）。

## 2026年8月16日：トレーニング実績データ消失事故と対応

### 発生した事象

UIブラッシュアップPhase 1〜5完了後、カレンダー構造変更・記録モーダル・トレーニング刷新
（Phase A〜F）の実装より前の時点で、トレーニング実績の削除操作後に、削除対象以外の
トレーニング実績も含めて広範囲に消失する事故が発生した（「1件のトレーニング実績を削除したら、
全てのトレーニング実績が消えた」）。動作確認セッション中にも、リロードを繰り返すうちに
トレーニング実績データが段階的に壊れていく現象（ある日の記録が「ベンチプレス×4・記録なし」
という不自然な状態になり、以前確認できていた完了記録の一部が消失）を実際に観測した。

### 根本原因

`src/api/trainingLogs.ts`の`syncTrainingLogs`（体調記録では`src/api/dailyConditions.ts`の
`syncDailyConditions`も同型）が、ローカルstateの日付集合とリモートの日付集合を比較し、
ローカルに存在しない日付のリモート行を無条件削除してから全件再upsertする「diff検出による
全件削除・再作成」方式だった。この関数は`App.tsx`で`trainingLogs`/`dailyConditions`の
state変化のたびに自動発火する設計だったため、以下の経路で全損が起きた：初回フェッチ
（`fetchTrainingLogs`/`fetchDailyConditions`）が何らかの理由（ネットワーク瞬断・Supabase側の
一時的な失敗等）で失敗すると、`App.tsx`のcatch節が`areTrainingLogsLoaded`/
`areDailyConditionsLoaded`を無条件でtrueにしていたため、stateが空配列のまま同期処理が
発火し、リモートの全トレーニング実績／体調記録が「ローカルに無い＝削除された」と誤判定され、
削除された。

### 対応

**第1段階（応急修正、コミット`09dceb0`）**：`App.tsx`の初回フェッチのcatch節でloaded系
フラグをtrueにしないよう修正。フェッチ失敗時はフラグをfalseのまま維持し、エラートーストで
再読み込みを促す方式に変更。これにより「フェッチ失敗→空配列で同期→全損」の経路を
即座に遮断した。

**第2段階（根本修正、コミット`0b4c249`）**：`syncTrainingLogs`・`syncDailyConditions`を
廃止し、`deleteTrainingLogRemote`・`deleteDailyConditionRemote`を新設。食事記録・
サッカー記録・予定と同じ「保存・削除のたびに個別APIを直接呼び出し、成功後にfetchし直した
データでローカルstateを更新する」パターンに統一した。`App.tsx`の「state変化のたびに
全件同期する」useEffectはすべて削除。goalsも`GoalPanel.tsx`の`saveGoalSettings`から
`upsertGoals`を直接呼ぶ方式に変更し、保存成功後にのみローカルstateを更新するようにした
（フェッチ失敗時にデフォルト値で上書きされるリスクを排除）。

**削除確認ダイアログの文言改善**：トレーニング実績・食事記録・体調記録・サッカー記録・
予定の削除確認メッセージを、汎用的な文言（「本当に削除しますか？」）から、日付・種目名・
タイトル等の対象を特定できる文言（例：「2026-08-12のトレーニング実績（ベンチプレス他3種目）
を削除しますか？」）に変更した。料理・食材の削除確認は元々対象名を含んでおり変更不要だった。

本番環境（workout-app-suke4.vercel.app）で、削除操作後のリロードによるデータ保持確認
（新規保存→リロード、1件削除→リロードで他データが残ることの確認）を実施し、根本修正が
正しく機能していることを確認済み。

### 影響範囲

トレーニング実績（training_logs）・体調記録（daily_conditions）の2つが、全件diff同期方式を
採用していたため該当した。食事記録（meal_logs）・サッカー記録（soccer_logs）・予定
（training_schedules）は元々個別CRUD方式（都度upsert/delete）だったため、同種の事故は
起きていなかった。

## 2026年8月16日：ACWR（疲労残高）＋定性チェック機能の追加

9月目標（サッカーのコンディションピーク化）に向け、筋トレ・サッカーの運動負荷と
主観的な体調・局所疲労を統合管理するACWR（急性:慢性負荷比）機能を追加した。
ウェアラブルデバイスなしで、手入力データからコンディション予測・アラートを提供する。

**機能概要**：直近7日間の運動負荷（急性負荷）と直近28日間（データ蓄積量に応じて可変、
最短7日）の運動負荷（慢性負荷）の比率をACWRとして算出し、怪我リスクの目安として
ダッシュボードに表示する。体調記録の「局所疲労の張り」情報と組み合わせて4段階
（🟢最適／🟡注意／🔴警戒／🔵低下）で判定する。

**負荷計算式**（`src/utils/acwrHelpers.ts`）：
- 筋トレ負荷 = `min(100, その日の全セットのΣ(重量×回数) ÷ 100)`
- サッカー負荷 = `min(100, 消費カロリー ÷ 8)`
- デイリー統合負荷 = 筋トレ負荷 + サッカー負荷（同日に両方あれば合算、無記録日は0）
- 急性負荷 = 直近7日間の日次負荷平均、慢性負荷 = 直近28日間（データ不足時はその日数）の
  日次負荷平均、ACWR = 急性負荷 ÷ 慢性負荷
- **DBにはキャッシュせず、`calculateACWR`関数の呼び出しのたびに`training_logs`・
  `training_log_exercises`・`training_sets`・`soccer_logs`から動的に算出する**設計とした
  （`daily_conditions`に`daily_load_score`のような列は追加していない）。目標値・ゴールの
  ような「ユーザーが確定させる値」と異なり、ACWRは常に最新の記録を反映すべき派生値のため、
  キャッシュとの不整合リスクを避ける判断。
- データが7日未満の場合は`calculateACWR`が`null`を返し、UI側は「データ蓄積中（あとN日で
  表示されます）」を表示する。

**定性チェックとの組み合わせによる4段階判定**：`daily_conditions`に
`muscle_soreness_location`（部位：なし/左右ふくらはぎ/ハムストリングス/大腿四頭筋/
股関節・鼠蹊部/その他）・`muscle_soreness_level`（度合い：なし/違和感/強い張り）を追加し、
`ConditionForm.tsx`にチップ選択UIを実装（`SoccerLogForm.tsx`の活動種別チップと同じ
`calendar-detail__category-chip`パターン踏襲）。度合いを選択したまま部位を「なし」で保存
しようとするとバリデーションエラーになる。ACWR数値と局所疲労の組み合わせ判定：
ACWR>1.5→🔴警戒、ACWR<0.8→🔵低下、1.3〜1.5→張りなしなら🟡注意/張りありなら🔴警戒、
0.8〜1.3→「強い張り」なら🟡注意（「右ふくらはぎ：強い張り」のように部位名入りで警告）/
それ以外は🟢最適。保存・削除は根本修正後の個別CRUD方式（`upsertDailyCondition`直接
呼び出し→再fetch→state更新）にそのまま追加しており、全件同期方式は使用していない。

**ラベル可変表示の修正経緯**：初期実装では`ACWRGaugeCard.tsx`の負荷バーラベルが
「急性負荷（7日平均）」「慢性負荷（**28日**平均）」の固定表示だったが、慢性負荷側は
実際にはデータ蓄積日数（7〜28日で可変）を集計期間としているため、データが14日分
しかない状態でも「28日平均」と表示され実態と食い違う問題があった。`ACWRResult`型に
`acuteDays`・`chronicDays`を追加し、`calculateACWR`が実際の集計日数を返すようにした
上で、ラベルを`result.acuteDays`/`result.chronicDays`から動的生成する形に修正した
（急性負荷側は`calculateACWR`が7日未満でnullを返す仕様上、値が返る時点では常に7日
固定になるが、将来の仕様変更に追従できるよう同様に可変対応してある）。

本番環境（workout-app-suke4.vercel.app）で、部位・度合いチップの選択/保存/編集復元、
バリデーション、データ不足表示、ACWR4ステータス（🟢🟡🔴🔵）すべての再現、ラベルの
可変表示、ダーク/ライト両モード表示、既存機能への影響なしを確認済み。

## 2026年8月17日：移動平均（体重・睡眠・疲労度）機能の追加

日々の水分量・便通・食事タイミング等に起因する単日の数値ノイズに惑わされず、
純粋なトレンドを可視化するため、体重・睡眠時間・疲労度の3指標に7日移動平均を
導入した。ダッシュボードの統計カード・グラフ画面（`ProgressGraph.tsx`）の両方に反映。

**`calculateMovingAverage`の汎用設計**（`src/utils/chartHelpers.ts`）：任意のレコード
配列・日付キー・値キーを受け取り、各日について「その日を含む直近7日間のうち実際に
記録がある日数分」で平均を算出する汎用関数として実装（ジェネリック`T`、値0以下・
非数値は除外）。ACWR機能（`acwrHelpers.ts`）と同じく**DBにはキャッシュせず、
呼び出しのたびに動的計算する**方針を踏襲。指示書は`Record<string, any>`制約を
想定していたが、`DailyCondition`型がインデックスシグネチャを持たず型エラーになる
ため、制約なしの素の`T`に変更した（判断理由）。

**トレンド向きの一元管理**：体重・疲労度は「減少が良い」、睡眠時間は「増加が良い」と
指標によって向きの意味が逆になるため、`TREND_DIRECTION`定数
（`Record<TrendMetricKey, 'lower_is_better' | 'higher_is_better'>`）で一箇所管理し、
`getTrendTone(metricKey, diff)`が向きを踏まえてトレンドバッジのトーン
（good/alert/neutral）を返す。新しい指標を追加する場合は`TREND_DIRECTION`に1行
追加するだけで対応できる設計。Dashboard.tsx（Phase 3）で確立していた個別の
weightTrend/sleepTrend/fatigueTrendロジックを、この共通関数を使う形に統合した。

**グラフ描画は既存の手書きSVGパターンを踏襲**：指示書はrecharts使用を想定した
記述だったが、`WeightChart.tsx`等の既存実装が独自の手書きSVG（`pointsFor`・
`areaPathFor`等のヘルパーで座標計算）だったため、一貫性を優先してそのパターンを
拡張する形にした（判断理由）。実測値（薄い破線＋小ドット）と7日移動平均（太い実線＋
グラデーションエリア＋大ドット）の2系列表示にし、ドットタップで
「日付｜実測: X / 7日平均: Y」形式のツールチップを表示する。移動平均は
`ProgressGraph.tsx`側で全期間データから計算してから選択期間で絞り込む方式にした
（期間の先頭付近でも直近7日分のデータを正しく参照するため）。

**指標識別色**：`tokens.css`に`--color-ma-weight`（#00E5FF シアン）・
`--color-ma-sleep`（#8B5CF6 パープル）・`--color-ma-fatigue`（#F59E0B アンバー）・
`--color-actual-line`（#A0AEC0）を追加。既存トークンとの衝突はなし。指標を視覚的に
一意に識別するための色のため、ライト/ダーク共通の固定色として定義している
（他のトークンのようなテーマ別の出し分けはしていない）。

本番環境（workout-app-suke4.vercel.app）で、実測/移動平均の2系列表示、ツールチップ、
少量データでの表示継続、ダッシュボード統計カードの7日平均＋本日実測表示、
前週比トレンドバッジの色分け、ダーク/ライト両モード、体重チャートの理想ライン/
目標ラインのリグレッションを確認済み。

## 2026年8月17日：ホーム画面日付選択・部位別ボリューム表示・AI一括取り込み拡張

**Phase A：ホーム画面の日付選択機能**（`src/pages/Dashboard.tsx`）：週間ストリップに
前週/翌週移動（`weekOffset`）と「今週に戻る」を追加。日付タップでカロリーリング・
今日の運動カード・統計カード（体重/睡眠/疲労度）が選択日（`selectedDateKey`）基準の
閲覧専用モードに切り替わる。目標ストリップと`ACWRGaugeCard`は「常に本日の値を示す
べき」指標のため対象外とし、`todayString`固定のまま維持した（判断理由）。移動平均の
基準日も選択日に連動して切り替わるが、過去日選択時にその日の記録がない場合は
直近値へフォールバックせずカード自体を非表示にする（実測値のない日に移動平均だけ
表示すると誤解を招くため）。既存のインライン展開（`expandedWeekDateKey`）はこの
日付選択モードに統合され撤去した。

**Phase B：部位別ボリューム表示への刷新**（`src/components/graphs/TrainingChart.tsx`・
`src/pages/ProgressGraph.tsx`）：Phase 5で実装した「部位別トレーニング頻度」
（回数のプログレスバー）を、部位別ボリューム（Σ重量×回数）ベースの詳細リストに
置き換えた。部位ごとに色分けバー（`tokens.css`に`--color-bp-chest`等8色を新設）・
今週のボリューム・前週比・自己ベストバッジ（🔥）を表示し、行タップで日別ボリューム
推移の折れ線グラフをアコーディオン展開できる（ドリルダウン）。ACWR・移動平均と
同じくDBキャッシュせず期間選択のたびに動的計算する方針を踏襲。前週比・自己ベストは
「全期間」選択時は比較対象の期間が定義できないため算出しない。

**Phase C：AI一括取り込みの対象拡大**（`src/components/calendar/BulkScheduleImportModal.tsx`）：
従来は予定専用だった一括取り込みを、日付ごとに予定・トレーニング実績・食事記録・
体調記録を柔軟に含められる形式に拡張した。トレーニング実績は`training_logs`の
「1日1件」制約を維持するため、対象日に既存の実績（親レコード）があればそこに
種目を追加して`upsertTrainingLog`、なければ新規作成してから種目を追加する
（個別CRUD方式を踏襲し、全件をローカルで組み立てて一括保存する設計にはしていない。
上記「2026年8月16日：トレーニング実績データ消失事故と対応」で確立した方針の遵守）。
食事記録は`meal_logs`が1日複数件
可能なため重複チェックなしで新規追加、体調記録は`daily_conditions`のunique制約に
合わせ既存があれば上書き・なければ新規作成する。取り込み完了後は`App.tsx`側の
グローバル状態（`trainingLogs`/`mealLogs`/`dailyConditions`）もバケツリレー経由で
まとめて再取得・更新する（`Promise.all`による単発フェッチで、全件diff同期の
再導入ではない）。

**追加修正：種目名・食材名のフォールバックマッチング**：記録画面のドロップダウンが
「ショルダープレス（バーベル）」のように装備種別・カロリー情報を括弧書きで
併記表示するため、ユーザーがその表示をそのままAIに伝えると完全一致せず未一致に
なる問題が動作確認で判明した。`matchByNameWithFallback`関数を新設し、完全一致が
失敗した場合に末尾の括弧書き（全角（）・半角()どちらも対応）を1つ除去して
再マッチを試みるようにした。それでも一致しない場合は従来通りスキップ＋警告表示。
プロンプトテンプレートにも、種目名に器具種別を含めない・食材名にカロリー等の
括弧書きを含めない旨の注意書きを追加した。マスタ名の全件一覧をプロンプトに
埋め込む案は、種目・食材とも件数が多くプロンプトが冗長になるため見送り、
注意書き＋フォールバックマッチングの組み合わせで対応する判断とした
（下記「既知の技術的負債」に改善余地として記録）。

本番環境（workout-app-suke4.vercel.app）で、週移動・日付選択・閲覧専用モード
（目標ストリップ/ACWRGaugeCard対象外の確認含む）、部位別ボリューム表示・
ドリルダウン、AI一括取り込みでの予定/トレーニング/食事/体調の混在取り込み
（特にトレーニング実績の1日1件マージが既存データを破壊しないこと）、
フォールバックマッチング（装備種別・カロリー括弧書き付きの名称、および
完全に存在しない名称でのスキップ動作）、ダーク/ライト両モードを確認済み。

## 2026年8月18日の変更点

**種目単位削除UIの追加**（技術的負債#6の解消、`TrainingLogForm.tsx`）：各種目行に
「この種目を削除」ボタンを追加した。保存済みの種目（`training_log_exercises`の
行を保有）を削除する場合は、`deleteTrainingLogExerciseRemote`で個別に
`training_log_exercises`の該当行のみを削除する（個別CRUD方式。保存操作
「保存する」を待たずに即座にDB反映する）。`training_sets`は
`training_log_exercise_id`にON DELETE CASCADEが設定済みのため、追加の削除処理
なしで配下のセットも自動的に削除される設計をそのまま活用した。削除確認
ダイアログは「『ベンチプレス』（3セット）を削除しますか？」のように種目名・
セット数を具体的に表示する。フォームで「種目を追加」しただけで種目名を
入力していない未保存の空行を削除する場合は、失うデータがないため確認
ダイアログを出さずローカルstateから即時除去するのみとした。全種目を削除
した場合も`training_logs`の親レコードは残す方針とした（種目0件の実績と
未記録の日を区別する必要がないため）。

**weekTrainingCountの修正**（`GoalPanel.tsx`）：週間トレーニング目標の達成数
（「今週のトレーニング」カード）が、`training_logs`レコードの存在有無で
カウントされていたため、種目単位削除により種目0件になった実績も「週1回」に
カウントされてしまう問題があった。`log.exercises.length > 0`の日のみを
カウントする方式に修正した。

本番環境（workout-app-suke4.vercel.app）で、削除確認ダイアログの表示内容
（種目名・セット数）、削除対象以外の種目・他日程への影響がないこと、
リロード後のDB反映、キャンセル時に削除されないこと、未保存の空行削除時に
確認ダイアログが出ないこと、weekTrainingCountが種目0件の日を除外することを
確認済み。

**技術的負債#5 案Bの実装**（`delete-by-id`関数へのuser_idガード追加）：
`deleteTrainingLogExerciseRemote`・`deleteTrainingLogRemote`・
`deleteMealLogRemote`・`deleteDish`（`dish_food_items`・`dishes`両方）の削除
クエリに`.eq('user_id', DEFAULT_USER_ID)`を追加した。調査の結果RLSポリシーは
対象テーブルすべて`for all using (true) with check (true)`（全許可）のままで
あることが判明しており、このuser_idフィルタは「アプリ自身のバグによる誤操作を
防ぐガード」であって「セキュリティ境界」ではない（真の防御にはSupabase Auth
導入によるRLS再設計が必要、別の未着手の課題）。一覧取得系のクエリ（子テーブルの
全件SELECT）の是正は見送り、Auth実装時にまとめて対応する方針とした。詳細は
下記「既知の技術的負債」5番参照。

**進捗グラフ：トレーニング画面の全面刷新v2**：既存の「上部の棒グラフ（軸ラベルが
読めず機能していなかった）＋部位別ボリュームの平坦なリスト」を、Hevy・Strong等の
競合アプリ調査を踏まえた3層構成に置き換えた。

- **セクション1：ヒーローグラフ（総ボリューム推移）**（`TrainingVolumeChart.tsx`、
  新規）：選択期間内の日ごとの総ボリューム（全部位合算）を、`WeightChart.tsx`と
  同じ視覚スタイル（実測=薄い破線、トレンド=太い実線＋グラデーションエリア）で
  表示する。カードヘッダーに期間内合計ボリューム・前期間比のトレンドバッジを表示
  （「全期間」選択時は比較対象の期間が定義できないため非表示、部位別ボリューム
  の前週比と同じ扱い）。
- **セクション2：部位バランス円グラフ**（`TrainingBodyPartDonut.tsx`、新規）：
  recharts の`PieChart`で部位ごとのボリューム構成比をドーナツ表示。既存の
  `--color-bp-*`トークン（2026年8月17日新設）をスライス色にそのまま流用。中央に
  最もボリュームの大きい部位と割合、下に凡例を表示。1部位のみのデータ・0件期間
  でも問題なく描画されることを確認済み。
- **セクション3：部位別詳細リストのカード化**（`TrainingBodyPartList.tsx`、
  `TrainingChart.tsx`から分離・新規）：各部位を角丸カード化
  （`--color-bg-elevated`／`--color-border`／`--radius-md`／`--shadow-card`）し、
  左端に部位の色分けバー。部位名・ボリューム・前週比・自己ベスト🔥バッジ・
  タップでの日別ドリルダウン展開は2026年8月17日実装分から機能面の変更なし。

`TrainingChart.tsx`は、旧・棒グラフと部位別リストを分離した結果、実施回数・
達成率・総セット数・総ボリュームのサマリーカード（達成率メーターのみ）に縮小
した。3セクションとも期間タブ（1週間/1ヶ月/3ヶ月/全期間）を共有し、DBキャッシュ
せず動的計算する既存方針（ACWR・移動平均と同じ）を踏襲。

**`calculateDenseMovingAverage`の新設**（`chartHelpers.ts`）：既存の
`calculateMovingAverage`は値が0以下のレコードを平均から除外する設計（体重・
睡眠・疲労度において「未記録の日」を正しく除外するための意図的な仕様）のため、
休養日を0として平均に含める必要があるトレーニング総ボリュームには使えない
（休養日を除外すると実施日だけの平均になり、ACWRの日次負荷計算と矛盾する）。
このため既存関数は変更せず、休養日を0として含める新しい関数を追加する形にした。

**グラフ軸ラベルが長い期間で読めなくなるバグの発見・修正**：上記刷新の動作確認で、
ヒーローグラフの軸ラベルが「1ヶ月」「3ヶ月」「全期間」で「0...」のように途中で
切れて読めなくなる不具合が見つかった。原因は`.progress-graph__labels`が期間内の
全日数分（密な配列では30〜90件超）のspanを常に描画し、実際にラベルを表示するのは
最大8件のみだったため、flexboxが空spanにも均等に幅を配分し、可視ラベルの表示幅が
極端に狭くなっていたこと。体重・睡眠・疲労度グラフは「記録がある日のみ」の疎な
配列のため件数が少なく、同じ実装のまま今まで問題が表面化していなかった。
`shouldShowLabel`がfalseを返す日はspan自体を描画しない（nullを返す）方式に、
`WeightChart`・`SleepChart`・`FatigueChart`・`TrainingVolumeChart`・部位別
ドリルダウン（`TrainingBodyPartList.tsx`内）の5箇所すべてで統一して修正した。
2箇所（現に不具合が出ていたトレーニング系）だけでなく、まだ表面化していなかった
3箇所（体重・睡眠・疲労度）にも同時に適用済みのため、これらのデータ量が将来
増えても再発しない（根本原因を共有パターンごと解消済みのため、技術的負債としては
追加記録しない）。

本番環境（workout-app-suke4.vercel.app）で、ヒーローグラフの軸ラベル可読性
（全4期間）・円グラフの1部位のみ/0件データでの描画・詳細リストのカードトーン・
期間タブの3セクション連動・複数部位テストデータでの割合とソート順・ダーク/ライト
両モード・ドリルダウンの展開/折りたたみ、および軸ラベル修正後の体重/睡眠/疲労度
グラフでの再確認（データ量の多い期間）を確認済み。

**技術的負債#2（食材マスタの基準量が一律100g）の実態調査**：旧記載は「既存61件が
一律100gで初期化されている」としていたが、実態を調査した結果、既に実質的に
解消済みであることが判明した。「g」単位のまま残っている22件はすべて生鮮食材・
スイーツ・穀類等、100g基準が実態として正しい食材であり、「卵1個」「プロテイン
1食分30g」のような個数系食材は、2026年8月13日の食材マスタ栄養成分是正作業
（上記「2026年8月13日の変更点」参照）で既に「個」「食」等の適切な単位に修正
済みだった。CLAUDE.mdの記載更新が追いついていなかっただけで、実際の問題は
存在しなかったため、下記「既知の技術的負債」から項目として削除した。調査中、
論理削除済み（`is_deleted=true`）のテストデータ5件（「テストPhase2」等）が
DB上に物理的に残存していることを確認したが、論理削除フラグにより一覧表示・
栄養計算のいずれにも影響しないため実害なしと判断した。

**技術的負債#9（種目マスタの削除UI）の解消**：`exercises`テーブルに
`is_deleted`列を追加し、`ExercisePicker.tsx`に`food_items`と同じ論理削除UI
パターン（`GenreFoodPicker.tsx`踏襲、「削除する種目」ドロップダウン＋確認ダイアログ、
削除確認ダイアログは種目名を具体的に表示）を実装した。削除後は
`TrainingLogForm.tsx`の`loadExercises`（`fetchExercises`の再実行）を呼び出し、
リロードなしで選択候補一覧から即座に消える。

**`includeDeleted`オプションの追加経緯**：`fetchExercises`に単純に
`is_deleted=false`フィルタを追加しただけでは、`fetchTrainingLogs`・
`fetchTrainingTemplates`が過去の実績・テンプレートの種目名解決に内部で
同じ`fetchExercises`を使っているため、論理削除された種目を含む過去の記録の
`exercise`が`undefined`になり、種目名が表示されなくなる問題を実装中に発見した
（種目マスタの論理削除は「今後選べなくする」ためのものであり、「過去の記録から
消す」ためのものではないため、これは要件違反）。このため`fetchExercises`に
`{ includeDeleted: boolean }`オプションを追加し、`ExercisePicker`等の選択UIから
の通常呼び出しは従来通り削除済み種目を除外する一方、`fetchTrainingLogs`・
`fetchTrainingTemplates`内部の種目名解決呼び出しのみ`includeDeleted: true`を
指定して削除済み種目も含めて取得するよう使い分けた。

本番環境（workout-app-suke4.vercel.app）で、削除確認ダイアログの種目名表示・
即時反映（リロード不要）・他日程での選択肢からの除外・キャンセル時に削除され
ないことに加え、**実際に記録履歴のある「ベンチプレス」（2026-08-15、4セット・
合計2630kg）を削除し、削除後もカレンダーの実績表示・進捗グラフ（総ボリューム・
部位バランス）の双方で種目名・数値とも正しく表示され続けることを確認**し、
`includeDeleted`の対応が正しく機能していることを確認済み。

**技術的負債#7（種目0件実績の表示不整合）の解消**：`Dashboard.tsx`の
`hasTrainingBlock`判定を、`todayTrainingLogs.length`（training_logsレコードの
存在有無）から`todayLoggedExercises.length`（実際の種目数）に変更した。
種目単位削除により全種目が削除されたtraining_logsレコードは、レコードが
存在していても「完了」バッジ＋空リストとしては表示されなくなり、その日に
予定（training_schedules）があれば「予定」バッジ＋予定タイトル一覧に
フォールバックし、予定もなければ「今日の運動」カードのトレーニングブロック
自体を非表示にする設計にした。サッカーブロックの表示条件（`hasSoccerBlock`）
は完全に独立しており、この変更による影響はない。週間ストリップのアイコン
（`getDayIcons`）は`training_schedules.status`のみを参照しており
`training_logs`/種目数には依存していないため、本修正の対象外（技術的負債
7番、旧8番の対象）と判断し変更していない。

本番環境（workout-app-suke4.vercel.app）で、種目0件・予定なしでのブロック
非表示、予定ありでの「予定」表示フォールバック、サッカーブロックが影響を
受けないこと、種目が残るケースでのリグレッションなし、週間ストリップの
アイコン表示に変化がないこと、ダーク/ライト両モードを確認済み。

**goals過去月一覧表示UI**（`src/api/goals.ts`・`src/components/GoalPanel.tsx`）：
`GoalPanel`に「表示する月」ドロップダウンを追加し、当月以外の過去月の目標値を
閲覧・編集できるようにした。既存の`fetchGoalsByMonth`は「データが無ければ
直近過去月から繰り越してDBに新規作成する」副作用を持つため、これをそのまま
過去月の閲覧に流用すると閲覧しただけで意図しないgoals行が作成されてしまう。
このため副作用のない読み取り専用の`fetchGoalsByMonthReadOnly`を新設し、
既存の`fetchGoalsByMonth`（当月初期化用、App.tsx側の呼び出し）は無変更のまま
維持した。月一覧は新設の`fetchGoalYearMonths`（データが存在する年月のみを
新しい順に取得）で取得する。過去月は編集可能とし、保存時は`isCurrentMonth`で
分岐して当月編集時のみApp.tsx側の`goals` stateを更新する（過去月編集が
当月データに影響しないようにするため）。データがない月は「この月の目標は
設定されていません」を表示する。アコーディオン見出しも固定の「8月の目標」から
`formatYearMonthLabel(selectedYearMonth)`ベースの動的表示に修正した（当初の
実装漏れを動作確認後に追加修正、コミット`b1351ed`）。

（設計上の注記・対応不要）月選択ドロップダウンは「データが存在する月のみ」を
リスト化する設計のため、運用開始前でデータが存在し得ない月を選ぶケースは
理論上発生しない。動作確認セッションでは、この設計上到達しないはずの
「データなし月」の空状態表示ロジック自体を検証するため、ドロップダウンへ
一時的に選択肢をJavaScriptで注入して確認した（本番のUI操作だけでは到達
できない検証手順だった、という記録）。

**予定作成時のテンプレート自動連携**（`src/components/calendar/ScheduleForm.tsx`）：
テンプレートを選択すると、テンプレート名と主な部位（出現回数順、最大2件）から
「テンプレート名（部位1・部位2）」形式でタイトルを自動生成するようにした。
`training_schedules`には部位を保持する列が存在せず、新規列追加はスキーマ変更に
あたり指示書のスコープ外だったため、部位情報は独立フィールドではなくタイトル
文字列に反映する形にした（判断理由）。自動入力後もタイトルは自由に手直しでき、
テンプレート選択を解除しても入力済みのタイトルはクリアされない。

**ディロード自動提案**（`src/utils/acwrHelpers.ts`・`src/components/ACWRGaugeCard.tsx`）：
直近3日間（当日含む）が連続して🔴警戒（danger）状態だった場合に、
`ACWRGaugeCard`へ「⚠️ 3日連続で高負荷状態が続いています。ディロード（負荷を
20〜30%程度落とす）を検討してください」という追加警告ブロックを表示する
`hasConsecutiveDangerDays`を新設した。既存の`calculateACWR`・
`determineACWRStatus`のロジックを日ごとに再利用し、DBキャッシュなしで
動的計算する既存方針を維持している。各日の局所疲労情報は、その日ごとの
`daily_conditions`から個別に参照する（当日の値の使い回しではない）。判定
できない日（データ不足でnullが返る日）が1日でもあれば連続とはみなさず
falseを返す安全側の設計。`ACWRGaugeCard`は日付選択機能（selectedDateKey）の
対象外で、常にtodayString基準のまま維持している。

本番環境（workout-app-suke4.vercel.app）で、過去月切替時の値・見出し表示、
データなし月での空状態表示とDBへの書き込みが発生しないこと、過去月編集が
当月データに影響しないこと、当月表示への復帰、3日連続🔴警戒でのディロード
警告表示と非連続時の非表示、ダーク/ライト両モードを確認済み。テンプレート
自動連携（Phase B）は、本番環境に`training_templates`データが存在しないため
実機能検証が保留となっている（下記「既知の技術的負債」参照）。

## 既知の技術的負債

改修時に遭遇したら、勝手に直さず報告すること。

1. 予定の置き場所がまだ2箇所に分散
   - training_schedules テーブル（MonthlyCalendar.tsx・Dashboard.tsxで接続済み）
   - training_templates（`training_schedules.template_id`で参照可能になったが、
     テンプレート内容を予定に自動反映する機能はまだない。予定作成時に
     テンプレートを選ぶとタイトル等が自動入力されるわけではなく、
     あくまで実績保存時の自動完了判定・AI一括取り込み時のtemplateName
     紐付けに使われるのみ）

2. goalsの過去月一覧表示UIは未実装
   （2026年8月16日、goalsの年月単位履歴化に伴い判明）。DBは`(user_id, year_month)`
   単位で複数月の目標値を保持できるようになったが、UI側は当月分の表示・編集のみに
   対応しており、過去月の目標設定を一覧・閲覧する画面はまだない。

3. BrowserRouterへの未移行（HashRouterを使用中）
   （2026年8月16日、ルーティング導入時の判断）。VercelにSPA用のrewrites設定を
   追加せずに済む`HashRouter`を採用したため、URLに常に`#`が入る。rewrites設定を
   追加すれば`BrowserRouter`への移行は可能だが、現状は未着手。

4. 子テーブルの一覧取得クエリはuser_idでフィルタしていない（案A・見送り）
   （2026年8月18日、技術的負債棚卸しに伴う調査・対応。旧記載を調査結果に基づき
   書き換え）。`training_log_exercises`・`training_sets`・`training_template_exercises`・
   `meal_log_food_items`・`dish_food_items`にはuser_id列があるが、一覧取得系の
   クエリ（`fetchTrainingLogs`・`fetchTrainingTemplates`・`fetchMealLogs`・
   `fetchDishesWithDetails`・`fetchLatestExerciseRecord`）は`select('*')`等で
   子テーブルを全ユーザー分取得したうえで、親テーブル（training_logs・meal_logs等）の
   user_idスコープと突き合わせてJS側でフィルタしている。最終的な表示結果は正しく
   スコープされるが、複数ユーザー化した際は他ユーザーの生データが一度クライアントに
   送信される（ネットワークレスポンスには含まれる）点に注意が必要。この是正
   （案C：全クエリへのuser_idフィルタ明示追加）は今回は見送り、Supabase Auth導入
   （認証実装）とRLS設計の見直しをセットで行う際にまとめて対応する方が二度手間に
   ならないと判断した。

   なお、削除系の「IDのみで直接delete」パターン（`deleteTrainingLogExerciseRemote`・
   `deleteTrainingLogRemote`・`deleteMealLogRemote`・`deleteDish`）については、
   削除クエリに`.eq('user_id', DEFAULT_USER_ID)`を追加する軽微な修正（案B）を
   2026年8月18日に実施済み。ただし、**RLSポリシーは対象テーブルすべて
   `for all using (true) with check (true)`（全許可）のままであり、
   アプリ側のuser_idフィルタは「アプリ自身のバグによる誤操作を防ぐガード」で
   あって「セキュリティ境界」ではない**点に注意。悪意ある第三者への防御は
   Supabase Auth導入により`auth.uid()`ベースのRLSポリシーへ切り替えない限り
   実現できない（認証実装自体が別の未着手の大きな課題）。

5. （監視事項）ACWR・移動平均とも「DBキャッシュせず呼び出しのたびに全件から
   動的計算する」方針を採用している（`acwrHelpers.ts`の`calculateACWR`、
   `chartHelpers.ts`の`calculateMovingAverage`、いずれも2026年8月16〜17日）。
   現在のデータ量では実害はないが、`calculateMovingAverage`は日ごとに直近7日分を
   フィルタで全件スキャンする実装のため、将来的にtraining_logs・daily_conditions等が
   大幅に増えた場合（数年分の運用等）、計算コストが問題になる可能性がある。
   現時点では対応不要だが、体感速度が悪化した場合は集計期間の絞り込みや
   メモ化を検討すること。

6. AI一括取り込みのマスタ名一覧未同梱
   （2026年8月17〜18日、AI一括取り込み拡張・名称マッチング改善時の判断）。
   種目名・食材名のマッチングは、完全一致→末尾括弧書き除去の再マッチという
   フォールバックのみで対応しており、プロンプトに`exercises`/`food_items`の
   実際のマスタ名一覧は埋め込んでいない（件数が多くプロンプトが冗長になるため
   見送った判断）。表記ゆれ（送り仮名違い・別名等）がフォールバックでも拾えない
   場合は引き続きスキップ＋警告表示となる。マスタ件数が今後絞り込める、または
   プロンプト長の制約が緩和されるようであれば、代表例の同梱や候補選択UIの追加を
   検討の余地あり。

7. カレンダーの✅アイコンが、種目全削除後も自動的に「未完了」へ戻らない
   （2026年8月18日、種目単位削除UI実装時の動作確認で判明。同日、技術的負債#7・#8
   まとめ実装指示書に基づき調査を実施し、実装を見送ることを判断済み）。
   カレンダーセルの完了アイコンは`training_schedules.status`（`getScheduleDayIcon`,
   src/utils/calendarHelpers.ts）に基づいており、`TrainingLogForm.tsx`での実績保存時に
   `completeScheduleForDate`で一方向にschedule側を`completed`にする連動はあるが、
   その後トレーニング実績側の種目を全削除しても、schedule側のstatusは自動的に
   `scheduled`等へ戻らない。上記1番「予定の置き場所が2箇所に分散」（予定と実績が
   別テーブルに分かれていること自体に起因する整合性の課題）の一部として扱うか、
   独立した項目とするかは判断が分かれるため、ここでは独立項目として記録する
   （予定側の状態管理を実績の変更に追従させる設計変更が必要になるため、対応する
   場合は影響範囲が1番よりも広い可能性がある）。

   **調査結果と実装見送りの判断（2026年8月18日）**：`completeScheduleForDate`の
   呼び出し箇所は`TrainingLogForm.tsx`の`saveTrainingLog`1箇所のみで、逆方向
   （未完了化）の関数は存在しない。根本原因は、`completeScheduleForDate`が
   「どの`training_schedules.id`を完了させたか」を一切記録しない、一方向の
   その場限りのUPDATEとして設計されている点にある。`training_schedules`は
   1日複数件可（上記1番参照、`scheduled_date`単体のUNIQUE制約なし）のため、
   同日に複数の予定が完了済みの状態では、逆方向処理が「今どの予定を`scheduled`に
   戻すべきか」を機械的に判定する手段がなく、無関係の予定を誤って`scheduled`に
   戻してしまうリスクがある。安全に実装するには、最低限「完了操作がどの
   `training_schedules.id`を完了させたか」を追跡する仕組み（列追加、または
   `completeScheduleForDate`自体の設計見直し）が必要であり、これは1〜2関数の
   追加では収まらない規模の変更と判断し、今回は実装を見送った。

8. テンプレート作成手段の欠落
   （2026年8月18日、予定作成時のテンプレート自動連携機能の動作確認時に判明）。
   手動テンプレート作成UI（`TrainingTemplateSection.tsx`）は2026年8月16日の
   Phase Fで廃止されて以降、`training_templates`に新規レコードを作成する手段が
   UI上に一切存在しない（DB直接操作以外に方法がない）。このため、今回実装した
   予定作成時のテンプレート自動連携（`ScheduleForm.tsx`）が、本番環境に
   テンプレートデータが存在せず実機能検証できなかった。今後テンプレート機能
   （予定へのタイトル・部位自動反映等）を活用する場合、作成UIの再検討が必要。

9. goalsに削除機能が存在しない
   （2026年8月18日、goals過去月一覧表示UIの動作確認時に判明）。テスト等で
   作成した不要な月次目標データ（`goals`テーブルの`(user_id, year_month)`行）を
   削除する手段がなく、DB上に蓄積し続ける。動作確認セッションで作成した
   テスト用の月次目標データ（2026年1月分）が削除できずに残存している。

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
