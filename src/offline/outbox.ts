import type { MealLogInput } from '../api/mealLogs'
import type { DateString, TrainingSet } from '../types'

// オフライン記録対応（2026年10月31日）：未送信の記録（アウトボックス）。
//
// - 対象はトレーニング（種目の新規追加）と食事（新規記録）の2種類のみ。
//   既存記録の編集・削除はオフライン非対応（他端末での変更との食い違いを防ぐため）
// - 端末の localStorage に「操作」単位で保存し、オンライン復帰時に古い順に1件ずつ
//   個別APIで送信する（src/offline/syncOutbox.ts）。過去の事故（2026年8月17日、
//   ローカル状態とリモートの差分を取って削除→再作成するsync方式による全損）を
//   繰り返さないよう、ローカル状態の丸ごと同期は行わず、追加操作の再送だけを行う
// - 再送しても二重登録にならないよう、IDはすべて端末側で事前に採番しておく
//   （食事：meal_logs.id、トレーニング：training_log_exercises.id）
// - ログアウト→別アカウントでログインした場合に他人のデータとして送信しないよう、
//   保存時のユーザーIDを持たせ、送信時に一致するものだけを送る

export const OUTBOX_STORAGE_KEY = 'workout-app:outbox:v1'

type OutboxEntryBase = {
  /** アウトボックス内での識別子（送信対象の記録IDとは別） */
  id: string
  userId: string
  /** 保存した日時（ISO 8601）。送信は古い順に行う */
  createdAt: string
  /** 送信に失敗した回数（通信エラー以外の失敗のみ数える） */
  attempts: number
  /** 直近の送信失敗理由（通信エラー以外） */
  lastError?: string
  /** 画面表示用の短い説明（例：「10/31 ベンチプレス 3セット」） */
  label: string
}

export type OutboxTrainingAddEntry = OutboxEntryBase & {
  kind: 'trainingAdd'
  date: DateString
  exerciseId: string
  /** 端末側で採番した training_log_exercises.id（再送時の二重登録防止） */
  trainingLogExerciseId: string
  /** training_log_exercises 行の作成まで完了したか（途中で通信が切れた場合の再開用） */
  exerciseInserted: boolean
  sets: TrainingSet[]
}

export type OutboxMealUpsertEntry = OutboxEntryBase & {
  kind: 'mealUpsert'
  /** input.id は端末側で採番した meal_logs.id（upsert のため再送しても二重登録にならない） */
  input: MealLogInput
}

export type OutboxEntry = OutboxTrainingAddEntry | OutboxMealUpsertEntry

export type OutboxStorage = Pick<Storage, 'getItem' | 'setItem'>

function isOutboxEntry(value: unknown): value is OutboxEntry {
  if (!value || typeof value !== 'object') {
    return false
  }
  const entry = value as Partial<OutboxEntry>
  if (typeof entry.id !== 'string' || typeof entry.userId !== 'string' || typeof entry.createdAt !== 'string') {
    return false
  }
  if (entry.kind === 'trainingAdd') {
    return typeof entry.trainingLogExerciseId === 'string' && typeof entry.exerciseId === 'string' && Array.isArray(entry.sets)
  }
  if (entry.kind === 'mealUpsert') {
    return !!entry.input && typeof entry.input.id === 'string' && Array.isArray(entry.input.items)
  }
  return false
}

/** 保存データを読み取る。壊れた要素は捨てるが、読めた要素は失わない。 */
export function parseOutbox(raw: string | null): OutboxEntry[] {
  if (!raw) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(isOutboxEntry)
  } catch {
    return []
  }
}

/** 送信順（保存日時の古い順）に並べ替えたコピーを返す。 */
export function sortOutbox(entries: OutboxEntry[]): OutboxEntry[] {
  return [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** 指定ユーザーの未送信件数。 */
export function countEntriesForUser(entries: OutboxEntry[], userId: string | null | undefined): number {
  if (!userId) {
    return 0
  }
  return entries.filter((entry) => entry.userId === userId).length
}

function defaultStorage(): OutboxStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

type Listener = (entries: OutboxEntry[]) => void
const listeners = new Set<Listener>()

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function readOutbox(storage: OutboxStorage | null = defaultStorage()): OutboxEntry[] {
  if (!storage) {
    return []
  }
  try {
    return sortOutbox(parseOutbox(storage.getItem(OUTBOX_STORAGE_KEY)))
  } catch {
    return []
  }
}

/** 保存に成功したら true。容量不足・プライベートブラウズ等で失敗したら false。 */
function writeOutbox(entries: OutboxEntry[], storage: OutboxStorage | null): boolean {
  if (!storage) {
    return false
  }
  try {
    storage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    return false
  }
  const sorted = sortOutbox(entries)
  listeners.forEach((listener) => listener(sorted))
  return true
}

/**
 * 1件追加する。保存できなかった場合は false を返す（呼び出し元は「端末に保存
 * できなかった」ことを必ず利用者に伝えること。黙って失うことは許されない）。
 */
export function enqueueOutbox(entry: OutboxEntry, storage: OutboxStorage | null = defaultStorage()): boolean {
  const current = readOutbox(storage)
  if (current.some((existing) => existing.id === entry.id)) {
    return true
  }
  return writeOutbox([...current, entry], storage)
}

export function updateOutboxEntry(entry: OutboxEntry, storage: OutboxStorage | null = defaultStorage()): boolean {
  const current = readOutbox(storage)
  return writeOutbox(
    current.map((existing) => (existing.id === entry.id ? entry : existing)),
    storage,
  )
}

export function removeOutboxEntry(id: string, storage: OutboxStorage | null = defaultStorage()): boolean {
  const current = readOutbox(storage)
  return writeOutbox(
    current.filter((existing) => existing.id !== id),
    storage,
  )
}
