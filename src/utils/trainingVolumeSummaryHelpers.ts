// 総挙上重量サマリー（指示書「推定1RM・PR・総挙上重量のビジュアル化」2026-09-15）。
// TrainingVolumeChart.tsx（日次総ボリューム推移のヒーローグラフ）とは別物として、
// Dashboard.tsxの統計カード群に「期間の合計をトン単位でまとめて見せる」新しい
// サマリー表示を追加するための集計・整形ロジック。データ集計元は同じ
// training_logsで、Σ(重量×回数)という計算式自体はProgressGraph.tsx側の
// sumVolumeByBodyPart等と同じ考え方（新規のDBクエリ・スキーマ変更は不要）。
import type { TrainingLog } from '../types.js'

// 渡されたtrainingLogs（呼び出し側で対象期間に絞り込み済みのもの）の
// Σ(重量×回数)を合計する。weight・repsが未入力のセットは0として扱う
// （既存のvolume計算箇所と同じ、`(set.weight ?? 0) * (set.reps ?? 0)`という方針）。
export function calculateTotalVolume(trainingLogs: TrainingLog[]): number {
  return trainingLogs.reduce(
    (sum, log) =>
      sum +
      log.exercises.reduce(
        (exerciseSum, exercise) =>
          exerciseSum + exercise.sets.reduce((setSum, set) => setSum + (set.weight ?? 0) * (set.reps ?? 0), 0),
        0,
      ),
    0,
  )
}

// kg単位の合計を「10.2トン」のような直感的な表記に整形する。
// 1000kg未満はkg表記のまま（例: "480kg"）、1000kg以上はトン表記（小数第1位まで、
// 例: "10.2トン"）に切り替える。0以下は"0kg"。
export function formatTrainingVolume(totalVolumeKg: number): string {
  if (!Number.isFinite(totalVolumeKg) || totalVolumeKg <= 0) {
    return '0kg'
  }
  if (totalVolumeKg >= 1000) {
    return `${(totalVolumeKg / 1000).toFixed(1)}トン`
  }
  return `${Math.round(totalVolumeKg)}kg`
}
