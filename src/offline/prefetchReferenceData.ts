import { fetchExercises } from '../api/trainingLogs'
import { getNavigatorOnline } from '../utils/networkErrors'
import { withOfflineCache } from './offlineCache'

// オフライン記録対応・控えの先読み（2026年10月31日）：
// 記録フォームで使う一覧（種目・食材・料理・食事サイズ）の控えは、従来はオンラインで
// フォームを開いたときにしか作られず、アップデート後に一度もフォームを開かないまま
// オフラインになると選択肢が空になっていた（本番確認で発見）。オンラインでアプリを
// 開いた時点で裏で読み込み、控えを作っておく。
//
// - 画面表示には使わない（控えを作るだけ）。失敗しても何もしない（次回起動時に再試行）
// - 食材・料理の API モジュールは動的 import にして、起動時のメインバンドルを大きくしない
//   （trainingLogs は App.tsx 等で既に静的に読み込まれているため通常の import）
// - 4件は1件ずつ順番に読み込む（起動直後の通信を一度に増やさないため）

export async function prefetchOfflineReferenceData(): Promise<void> {
  if (!getNavigatorOnline()) {
    return
  }

  const [{ fetchFoodItems }, { fetchDishesWithDetails, fetchMealSizes }] = await Promise.all([
    import('../api/foodItems'),
    import('../api/dishes'),
  ])

  const tasks = [
    () => withOfflineCache('exercises', () => fetchExercises()),
    () => withOfflineCache('foodItems', () => fetchFoodItems()),
    () => withOfflineCache('dishesWithDetails', () => fetchDishesWithDetails()),
    () => withOfflineCache('mealSizes', () => fetchMealSizes()),
  ]

  for (const task of tasks) {
    if (!getNavigatorOnline()) {
      return
    }
    try {
      await task()
    } catch (error) {
      console.error('オフライン用の一覧の先読みに失敗しました', error)
    }
  }
}
