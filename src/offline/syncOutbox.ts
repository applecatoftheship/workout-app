import { getCurrentUserId } from '../api/client'
import { upsertMealLog } from '../api/mealLogs'
import {
  countTrainingLogExercises,
  ensureTrainingLogForDate,
  fetchTrainingLogCompleted,
  insertTrainingLogExerciseWithId,
  replaceTrainingSets,
} from '../api/trainingLogs'
import { completeScheduleForDate } from '../api/trainingSchedules'
import { getNavigatorOnline, isNetworkError } from '../utils/networkErrors'
import { readOutbox, removeOutboxEntry, updateOutboxEntry } from './outbox'
import type { OutboxEntry, OutboxMealUpsertEntry, OutboxTrainingAddEntry } from './outbox'

// オフライン記録対応（2026年10月31日）：アウトボックスの送信処理。
// 通常の保存（オンライン時）もこの runTrainingAdd / runMealUpsert を通すことで、
// 「保存の途中で通信が切れた」場合も同じ記録をそのまま端末保存→再送できる。

/**
 * トレーニング種目1件の新規追加を実行する。
 * 途中まで進んだ場合は onProgress で進捗（exerciseInserted）を返すので、呼び出し元は
 * それを端末保存しておけば、再送時に続きから再開できる。
 */
export async function runTrainingAdd(
  entry: OutboxTrainingAddEntry,
  onProgress?: (next: OutboxTrainingAddEntry) => void,
): Promise<OutboxTrainingAddEntry> {
  let current = entry
  if (!current.exerciseInserted) {
    const trainingLogId = await ensureTrainingLogForDate(current.date)
    const orderIndex = await countTrainingLogExercises(trainingLogId)
    await insertTrainingLogExerciseWithId(current.trainingLogExerciseId, trainingLogId, current.exerciseId, orderIndex)
    current = { ...current, exerciseInserted: true }
    onProgress?.(current)
  }
  // 種目単位でセットを置き換える（他の種目・他の日のセットには触れない）ため、
  // 再送で何度実行しても結果は同じになる。
  await replaceTrainingSets(current.trainingLogExerciseId, current.sets)
  return current
}

/** 食事記録1件の新規保存を実行する（端末採番idへのupsertのため再送しても二重登録にならない）。 */
export async function runMealUpsert(entry: OutboxMealUpsertEntry): Promise<void> {
  await upsertMealLog(entry.input)
}

export type FlushResult = {
  synced: OutboxEntry[]
  failed: OutboxEntry[]
  /** 通信エラーで中断した（残りは次回に持ち越し） */
  interrupted: boolean
}

let flushInFlight: Promise<FlushResult> | null = null

/**
 * 未送信の記録を古い順に1件ずつ送信する。同時に複数回呼ばれても実行は1本だけ。
 * - 通信エラー：その時点で中断し、残りは端末に残す（次のオンライン復帰で再開）
 * - それ以外のエラー：その記録に失敗理由を付けて端末に残し、次の記録へ進む
 * - ログイン中のユーザー以外の記録は送らない（端末に残す）
 */
export function flushOutbox(): Promise<FlushResult> {
  if (!flushInFlight) {
    flushInFlight = doFlush().finally(() => {
      flushInFlight = null
    })
  }
  return flushInFlight
}

async function doFlush(): Promise<FlushResult> {
  const result: FlushResult = { synced: [], failed: [], interrupted: false }
  if (!getNavigatorOnline() || readOutbox().length === 0) {
    return result
  }

  let currentUserId: string
  try {
    currentUserId = await getCurrentUserId()
  } catch (error) {
    result.interrupted = isNetworkError(error)
    return result
  }

  for (const entry of readOutbox()) {
    if (entry.userId !== currentUserId) {
      continue
    }
    try {
      if (entry.kind === 'trainingAdd') {
        const done = await runTrainingAdd(entry, (next) => {
          updateOutboxEntry(next)
        })
        await completeScheduleIfDayCompleted(done.date)
      } else {
        await runMealUpsert(entry)
      }
      removeOutboxEntry(entry.id)
      result.synced.push(entry)
    } catch (error) {
      if (isNetworkError(error)) {
        result.interrupted = true
        break
      }
      console.error('未送信の記録の送信に失敗しました', error)
      // 進捗（exerciseInserted）が更新されている可能性があるため最新を読み直す
      const latest = readOutbox().find((candidate) => candidate.id === entry.id) ?? entry
      const failedEntry: OutboxEntry = {
        ...latest,
        attempts: latest.attempts + 1,
        lastError: error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error),
      }
      updateOutboxEntry(failedEntry)
      result.failed.push(failedEntry)
    }
  }

  return result
}

// 通常の保存（TrainingExerciseEditModal）と同じく、その日のトレーニングが「完了」なら
// 予定を完了に連動させる。失敗しても記録自体の送信は成功しているので、ログのみ残す。
async function completeScheduleIfDayCompleted(date: OutboxTrainingAddEntry['date']): Promise<void> {
  try {
    const completed = await fetchTrainingLogCompleted(date)
    if (completed) {
      await completeScheduleForDate(date)
    }
  } catch (error) {
    console.error('未送信だったトレーニング記録の予定完了連動に失敗しました', error)
  }
}
