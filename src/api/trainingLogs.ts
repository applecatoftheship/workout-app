import { getCurrentUserId, supabase } from './client'
import type { BodyPart, DateString, EquipmentType, ExerciseDefinition, TrainingLog, TrainingLogExercise, TrainingSet } from '../types'

// --- exercises (種目マスタ) ---

type ExerciseRow = {
  id: string
  name: string
  body_part: string
  equipment_type: string | null
  is_preset: boolean
  user_id: string | null
  created_at: string
}

function rowToExerciseDefinition(row: ExerciseRow): ExerciseDefinition {
  return {
    id: row.id,
    name: row.name,
    bodyPart: row.body_part as BodyPart,
    equipmentType: (row.equipment_type as EquipmentType | null) ?? undefined,
    isPreset: row.is_preset,
    userId: row.user_id ?? undefined,
    createdAt: row.created_at as DateString,
  }
}

// includeDeleted: true は、過去の実績（training_log_exercises）・テンプレートの
// 種目名解決など、論理削除された種目も参照し続ける必要がある場面専用。
// 種目選択UI（ExercisePicker等）からの通常呼び出しはfalse（デフォルト）のまま、
// 削除済み種目を候補から除外する。
export async function fetchExercises(options?: { includeDeleted?: boolean }): Promise<ExerciseDefinition[]> {
  const userId = await getCurrentUserId()
  let query = supabase
    .from('exercises')
    .select('*')
    .or(`is_preset.eq.true,user_id.eq.${userId}`)
    .order('name', { ascending: true })

  if (!options?.includeDeleted) {
    query = query.eq('is_deleted', false)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return (data as ExerciseRow[]).map(rowToExerciseDefinition)
}

// food_itemsの論理削除（2026年8月13日実装）と同じ方式。実績データ
// （training_log_exercises）はexercise_idを保持したまま参照を維持するため、
// 過去の記録は削除後も影響を受けない。
export async function deleteExercise(id: string): Promise<void> {
  const { error } = await supabase.from('exercises').update({ is_deleted: true }).eq('id', id)

  if (error) {
    throw error
  }
}

export async function createExercise(input: {
  name: string
  bodyPart: BodyPart
  equipmentType?: EquipmentType
}): Promise<ExerciseDefinition> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      name: input.name,
      body_part: input.bodyPart,
      equipment_type: input.equipmentType ?? null,
      is_preset: false,
      user_id: userId,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return rowToExerciseDefinition(data as ExerciseRow)
}

// --- training_logs ---

type TrainingLogRow = {
  id: string
  log_date: string
  user_id: string
  completed: boolean
  notes: string | null
  end_time: string | null
  created_at: string
  updated_at: string
}

type TrainingLogExerciseRow = {
  id: string
  training_log_id: string
  exercise_id: string
  order_index: number
}

type TrainingSetRow = {
  id: string
  training_log_exercise_id: string
  set_number: number
  weight: number | null
  reps: number | null
  is_warmup: boolean
  created_at: string
}

function rowToTrainingSet(row: TrainingSetRow): TrainingSet {
  return {
    id: row.id,
    setNumber: row.set_number,
    weight: row.weight ?? undefined,
    reps: row.reps ?? undefined,
    isWarmup: row.is_warmup,
    createdAt: row.created_at as DateString,
  }
}

function rowToTrainingLogExercise(
  row: TrainingLogExerciseRow,
  setRows: TrainingSetRow[],
  exerciseMap: Map<string, ExerciseDefinition>,
): TrainingLogExercise {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    orderIndex: row.order_index,
    exercise: exerciseMap.get(row.exercise_id),
    sets: setRows
      .filter((set) => set.training_log_exercise_id === row.id)
      .map(rowToTrainingSet)
      .sort((a, b) => a.setNumber - b.setNumber),
  }
}

function rowToTrainingLog(row: TrainingLogRow, exercises: TrainingLogExercise[]): TrainingLog {
  return {
    id: row.id,
    date: row.log_date as DateString,
    completed: row.completed,
    notes: row.notes ?? undefined,
    endTime: row.end_time ?? undefined,
    exercises,
    createdAt: row.created_at as DateString,
    updatedAt: row.updated_at as DateString,
  }
}

export async function fetchTrainingLogs(): Promise<TrainingLog[]> {
  const userId = await getCurrentUserId()
  const { data: logRows, error: logError } = await supabase
    .from('training_logs')
    .select('*')
    .eq('user_id', userId)
    .order('log_date', { ascending: true })

  if (logError) {
    throw logError
  }

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from('training_log_exercises')
    .select('*')

  if (exerciseError) {
    throw exerciseError
  }

  const { data: setRows, error: setError } = await supabase
    .from('training_sets')
    .select('*')

  if (setError) {
    throw setError
  }

  // 過去の実績が参照する種目は、論理削除された後も名前解決できる必要があるため
  // includeDeletedで取得する（削除は種目マスタからの除外のみで、過去記録の
  // スナップショット的な表示には影響しない設計、技術的負債#9対応）。
  const exercises = await fetchExercises({ includeDeleted: true })
  const exerciseMap = new Map(exercises.map((exercise) => [exercise.id as string, exercise]))

  return (logRows as TrainingLogRow[]).map((row) => {
    const logExercises = (exerciseRows as TrainingLogExerciseRow[])
      .filter((exercise) => exercise.training_log_id === row.id)
      .map((exercise) => rowToTrainingLogExercise(exercise, setRows as TrainingSetRow[], exerciseMap))
      .sort((a, b) => a.orderIndex - b.orderIndex)

    return rowToTrainingLog(row, logExercises)
  })
}

export async function upsertTrainingLog(log: TrainingLog): Promise<void> {
  const userId = await getCurrentUserId()
  const { data: upsertedLog, error: logError } = await supabase
    .from('training_logs')
    .upsert(
      {
        id: log.id,
        user_id: userId,
        log_date: log.date,
        completed: log.completed,
        notes: log.notes ?? null,
        end_time: log.endTime ?? null,
      },
      { onConflict: 'user_id,log_date' },
    )
    .select()
    .single()

  if (logError) {
    throw logError
  }

  const trainingLogId = (upsertedLog as TrainingLogRow).id

  const { error: deleteExercisesError } = await supabase
    .from('training_log_exercises')
    .delete()
    .eq('training_log_id', trainingLogId)

  if (deleteExercisesError) {
    throw deleteExercisesError
  }

  // training_log_exercises・training_setsのuser_id列にはDB側でDEFAULT_USER_ID
  // 相当のデフォルト値が設定されているため、明示的に指定しなくてもエラーには
  // ならない。ただしフェーズB移行後もそのデフォルト値は自動更新されないため、
  // ここで明示的に指定して依存を断つ（アカウント/ログイン機能フェーズA、
  // 2026年8月25日）。
  for (const [index, exercise] of log.exercises.entries()) {
    const { data: insertedExercise, error: exerciseInsertError } = await supabase
      .from('training_log_exercises')
      .insert({
        training_log_id: trainingLogId,
        user_id: userId,
        exercise_id: exercise.exerciseId,
        order_index: exercise.orderIndex ?? index,
      })
      .select()
      .single()

    if (exerciseInsertError) {
      throw exerciseInsertError
    }

    if (exercise.sets.length > 0) {
      const { error: setsInsertError } = await supabase.from('training_sets').insert(
        exercise.sets.map((set) => ({
          training_log_exercise_id: (insertedExercise as TrainingLogExerciseRow).id,
          user_id: userId,
          set_number: set.setNumber,
          weight: set.weight ?? null,
          reps: set.reps ?? null,
          is_warmup: set.isWarmup,
        })),
      )

      if (setsInsertError) {
        throw setsInsertError
      }
    }
  }
}

// --- 前回記録の自動入力（技術指示書Phase F-2、2026年8月16日） ---

// トレーニング記録画面UI/UX刷新（種目カード＋編集モーダル分離、2026年8月28日）：
// 従来は先頭セットの値のみ返す設計だったが、「前回の内容をコピー」でセットごとの
// 値を再現する（不均一ならセット別詳細モードへ自動切替）には全セットの値が必要な
// ため、setsに全セットの配列を持つ形へ拡張した。呼び出し元は1箇所のみ
// （TrainingExerciseEditModal.tsx）のため、setsCount/reps/weightのみを見ていた
// 旧形式との後方互換は取らない。
export type LatestExerciseRecord = {
  sets: { setNumber: number; reps: number | null; weight: number | null }[]
  logDate: DateString
}

// excludeDate：呼び出し元（TrainingExerciseEditModal.tsx）が編集中の日付自身を
// 「前回」として自己参照しないよう除外するための引数（2026年8月28日追加）。
// 種目カード＋編集モーダル分離により、編集対象の日が「その種目の最新記録」に
// 一致するケース（同日を編集中）が生じうるようになったための対応。
export async function fetchLatestExerciseRecord(
  exerciseId: string,
  excludeDate?: DateString,
): Promise<LatestExerciseRecord | null> {
  const userId = await getCurrentUserId()
  const { data: exerciseRows, error: exerciseError } = await supabase
    .from('training_log_exercises')
    .select('id, training_log_id')
    .eq('exercise_id', exerciseId)

  if (exerciseError) {
    throw exerciseError
  }

  const rows = exerciseRows as { id: string; training_log_id: string }[]
  if (rows.length === 0) {
    return null
  }

  const trainingLogIds = Array.from(new Set(rows.map((row) => row.training_log_id)))

  let logQuery = supabase
    .from('training_logs')
    .select('id, log_date')
    .eq('user_id', userId)
    .in('id', trainingLogIds)

  if (excludeDate) {
    logQuery = logQuery.neq('log_date', excludeDate)
  }

  const { data: logRows, error: logError } = await logQuery.order('log_date', { ascending: false }).limit(1)

  if (logError) {
    throw logError
  }

  const latestLog = (logRows as { id: string; log_date: string }[])[0]
  if (!latestLog) {
    return null
  }

  const latestExerciseRow = rows.find((row) => row.training_log_id === latestLog.id)
  if (!latestExerciseRow) {
    return null
  }

  const { data: setRows, error: setError } = await supabase
    .from('training_sets')
    .select('set_number, reps, weight')
    .eq('training_log_exercise_id', latestExerciseRow.id)
    .order('set_number', { ascending: true })

  if (setError) {
    throw setError
  }

  const sets = setRows as { set_number: number; reps: number | null; weight: number | null }[]
  if (sets.length === 0) {
    return null
  }

  return {
    sets: sets.map((set) => ({ setNumber: set.set_number, reps: set.reps, weight: set.weight })),
    logDate: latestLog.log_date as DateString,
  }
}

export async function deleteTrainingLogRemote(id: string): Promise<void> {
  const userId = await getCurrentUserId()
  const { error } = await supabase.from('training_logs').delete().eq('id', id).eq('user_id', userId)

  if (error) {
    throw error
  }
}

// training_sets は training_log_exercise_id に on delete cascade が設定されているため、
// このテーブルの行を削除するだけで配下のセットも自動的に削除される。
// user_idでの絞り込みは、RLSが全許可のためセキュリティ境界にはならないが、
// アプリ側の誤操作（他ユーザーのIDを誤って渡すバグ等）を防ぐガードとして付与している
// （技術的負債5番、2026年8月18日の調査を踏まえた対応）。
export async function deleteTrainingLogExerciseRemote(id: string): Promise<void> {
  const userId = await getCurrentUserId()
  const { error } = await supabase.from('training_log_exercises').delete().eq('id', id).eq('user_id', userId)

  if (error) {
    throw error
  }
}

// --- 種目カード＋編集モーダル分離（トレーニング記録画面UI/UX刷新、2026年8月28日） ---
//
// 種目単位の編集モーダルは1種目のtraining_log_exercises/training_setsのみを
// 更新対象とし、同日の他種目には一切触れない（個別CRUD方式の原則、
// 2026年8月16日のトレーニング実績データ消失事故の教訓を踏襲）。upsertTrainingLog
// （日全体を都度全削除・再構築する既存関数）はAI一括取り込み
// （BulkScheduleImportModal.tsx）が引き続き依存しているため無変更のまま残す。

// 対象日のtraining_logs行が無ければ作成し、あればそのidをそのまま返す。
// 既存行のcompleted/notes/end_timeには一切触れない（upsertを使うとON CONFLICT時に
// これらの列を意図せず初期値へ巻き戻してしまうため、select→無ければinsertの
// 順で実装している）。新規作成時のend_timeは、旧TrainingLogForm.tsxが
// 「その日最初の保存時点の時刻」をデフォルトにしていた挙動（リカバリー窓機能が
// 依存）を踏襲し、呼び出し時点の時刻をそのまま設定する。
export async function ensureTrainingLogForDate(date: DateString): Promise<string> {
  const userId = await getCurrentUserId()
  const { data: existingRows, error: selectError } = await supabase
    .from('training_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('log_date', date)
    .limit(1)

  if (selectError) {
    throw selectError
  }

  const existing = (existingRows as { id: string }[])[0]
  if (existing) {
    return existing.id
  }

  const { data: insertedRow, error: insertError } = await supabase
    .from('training_logs')
    .insert({ user_id: userId, log_date: date, completed: true, notes: null, end_time: new Date().toISOString() })
    .select('id')
    .single()

  if (insertError) {
    throw insertError
  }

  return (insertedRow as { id: string }).id
}

// 日次メタ情報（完了/未完了・終了時刻・メモ）専用の保存関数。種目カード一覧の
// 上に常時表示する小さな設定欄（TrainingSummary）から呼ばれ、
// training_log_exercises・training_setsには一切触れない。
export async function upsertTrainingLogMeta(
  date: DateString,
  meta: { completed: boolean; notes?: string; endTime?: string },
): Promise<void> {
  const userId = await getCurrentUserId()
  const { error } = await supabase.from('training_logs').upsert(
    {
      user_id: userId,
      log_date: date,
      completed: meta.completed,
      notes: meta.notes ?? null,
      end_time: meta.endTime ?? null,
    },
    { onConflict: 'user_id,log_date' },
  )

  if (error) {
    throw error
  }
}

// 1種目分のtraining_log_exercises行のみを新規作成する（他種目・training_setsには
// 触れない）。作成したtraining_log_exercisesのidを返す。
export async function insertTrainingLogExercise(
  trainingLogId: string,
  exerciseId: string,
  orderIndex: number,
): Promise<string> {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('training_log_exercises')
    .insert({
      training_log_id: trainingLogId,
      user_id: userId,
      exercise_id: exerciseId,
      order_index: orderIndex,
    })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  return (data as { id: string }).id
}

// 指定したtraining_log_exercise_idのtraining_setsのみを全削除してから再INSERTする。
// 他のtraining_log_exercise_idのセットには一切影響しない（種目単位のスコープを
// 保つための専用関数。日全体を対象とするupsertTrainingLogとは独立に用意する）。
export async function replaceTrainingSets(trainingLogExerciseId: string, sets: TrainingSet[]): Promise<void> {
  const userId = await getCurrentUserId()
  const { error: deleteError } = await supabase
    .from('training_sets')
    .delete()
    .eq('training_log_exercise_id', trainingLogExerciseId)

  if (deleteError) {
    throw deleteError
  }

  if (sets.length === 0) {
    return
  }

  const { error: insertError } = await supabase.from('training_sets').insert(
    sets.map((set) => ({
      training_log_exercise_id: trainingLogExerciseId,
      user_id: userId,
      set_number: set.setNumber,
      weight: set.weight ?? null,
      reps: set.reps ?? null,
      is_warmup: set.isWarmup,
    })),
  )

  if (insertError) {
    throw insertError
  }
}
