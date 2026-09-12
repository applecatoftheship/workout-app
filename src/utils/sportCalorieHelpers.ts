// スポーツ記録機能（Tier 4-2：競技の拡張、2026年9月12日）：soccerCalorieHelpers.tsと
// 同じ構造で、汎用競技（バスケットボール・テニス・バレーボール・卓球・バドミントン・
// 野球/ソフトボール・その他）のMET値・カロリー推定を扱う。カロリー計算式自体
// （estimateCaloriesBurned）は soccerCalorieHelpers.ts の既存関数をそのまま再利用し、
// このファイルでは新規に定義しない。

// MET値はCompendium of Physical Activities（pacompendium.com/sports、既存コードが
// サッカー・フットサル・ワークアウトのMET値の根拠として使っている一次情報と同一出典）
// で確認済みの値。
export const SPORT_TYPE_PRESETS = [
  'バスケットボール',
  'テニス',
  'バレーボール',
  '卓球',
  'バドミントン',
  '野球・ソフトボール',
] as const

export const OTHER_SPORT_TYPE = 'その他'

// その他（自由入力）時のデフォルトMET。soccerCalorieHelpers.tsのMET_DEFAULTと
// 同じ値（6.0）だが、ファイルを分けて独立管理している（soccer_logsとsport_logsは
// 別テーブル・別ドメインのため、値が同じでも定数としては独立させる判断）。
export const SPORT_MET_DEFAULT = 6.0

export const SPORT_MET_VALUES: Record<string, number> = {
  バスケットボール: 8.0, // Basketball, game (competitive)
  // テニスは本来シングルス/ダブルスでMET値が異なる（8.0 / 6.0）が、今回は区別せず
  // より運動強度の高いシングルスを代表値として1本化する。将来「ダブルスも分けたい」
  // という要望が出た場合は、soccer_logsのサッカー/フットサルと同じ要領で
  // sport_typeの選択肢を分割できる（過剰実装しないため今回は見送り）。
  テニス: 8.0, // Tennis, singles
  バレーボール: 6.0, // Volleyball, competitive, in gymnasium
  卓球: 4.0, // Table tennis, ping pong
  バドミントン: 9.0, // Badminton, competitive, match play
  '野球・ソフトボール': 5.0, // Softball or baseball, general, moderate effort
}

// プリセットのMETを返す。プリセットに無い（＝「その他」）場合はSPORT_MET_DEFAULT。
export function resolvePresetMet(sportType: string): number {
  return SPORT_MET_VALUES[sportType] ?? SPORT_MET_DEFAULT
}

// RPE(1〜10)→MET換算（新規、2026年9月12日）。
//
// 【出典と近似モデルである旨の明記】ACSMの運動強度分類（light: <3 MET、
// moderate: 3-6 MET、vigorous: >6 MET。出典：
// https://ridgeathletic.com/estimating-intensity/ ）の主要な境界点
// （軽度→中等度の境目が概ね3MET付近、中等度→高強度の境目が概ね6〜7MET付近）を
// 基準に、1〜10のRPE（Borgの6-20スケールではなく、運動後に主観的なきつさを
// 申告する一般的な0/1-10スケール）に当てはめて滑らかに補間した推定値である。
// 一次情報から直接引用した「RPE(1-10)→MET」の対応表そのものではなく、上記の
// 公表された境界点から導出した近似モデルである（フットサル同様、一次情報が
// 無い部分は推定である旨を明示する既存の方針を踏襲、soccerCalorieHelpers.ts
// のフットサルMET値コメント参照）。
//
// 制御点：
//   RPE 1  → 2.0 MET（「軽度」帯の下限相当の目安）
//   RPE 3  → 3.0 MET（ACSM「中等度の開始点」に一致させた指定値）
//   RPE 6  → 6.5 MET（ACSM「高強度の開始点」に一致させた指定値）
//   RPE 10 → 12.0 MET（近い最大努力〜最大努力の目安）
// 制御点の間は区間ごとに線形補間する。
const RPE_MET_CONTROL_POINTS: ReadonlyArray<readonly [rpe: number, met: number]> = [
  [1, 2.0],
  [3, 3.0],
  [6, 6.5],
  [10, 12.0],
]

// RPE(1〜10、範囲外はクランプ)から推定METを返す。
export function estimateMetFromRpe(rpe: number): number {
  const clamped = Math.min(10, Math.max(1, rpe))

  for (let i = 0; i < RPE_MET_CONTROL_POINTS.length - 1; i += 1) {
    const [x0, y0] = RPE_MET_CONTROL_POINTS[i]
    const [x1, y1] = RPE_MET_CONTROL_POINTS[i + 1]
    if (clamped >= x0 && clamped <= x1) {
      const ratio = (clamped - x0) / (x1 - x0)
      return y0 + (y1 - y0) * ratio
    }
  }

  // RPE_MET_CONTROL_POINTSが1〜10を覆っている限り到達しないが、型安全のための保険。
  return SPORT_MET_DEFAULT
}

// ハイブリッド方式（John承認済み）：RPEが入力されていればRPE換算のMETを優先し、
// 未入力ならプリセット（またはその他のデフォルト）のMETを使う。
export function resolveSportMet(sportType: string, rpe: number | undefined | null): number {
  if (rpe !== undefined && rpe !== null) {
    return estimateMetFromRpe(rpe)
  }
  return resolvePresetMet(sportType)
}
