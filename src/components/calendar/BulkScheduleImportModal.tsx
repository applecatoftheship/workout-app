import { useEffect, useState } from 'react'
import { bulkCreateSchedules, deleteSchedulesInRange } from '../../api/trainingSchedules'
import { fetchTrainingTemplates } from '../../api/trainingTemplates'
import { fetchExercises, fetchTrainingLogs, upsertTrainingLog } from '../../api/trainingLogs'
import { fetchFoodItems } from '../../api/foodItems'
import { fetchMealLogs, upsertMealLog } from '../../api/mealLogs'
import { fetchDailyConditions, upsertDailyCondition } from '../../api/dailyConditions'
import { useToast } from '../../hooks/useToast'
import { matchByNameWithFallback, findMostSimilarName } from '../../utils/nameMatching'
import { combineDateAndTimeToISO } from '../../utils/calendarHelpers'
import type {
  DailyCondition,
  DateString,
  ExerciseDefinition,
  FatigueLevel,
  FoodItem,
  MealLog,
  MealType,
  TrainingLog,
  TrainingLogExercise,
  TrainingTemplate,
} from '../../types'
import './BulkScheduleImportModal.css'

// AI一括取り込み拡張（2026年8月17日）：既存の予定専用モーダルを、日付ごとに
// 予定・トレーニング実績・食事記録・体調記録を柔軟に含められる形式に拡張した。
// 種目名・食材名はAI出力の文字列と既存マスタ（exercises / food_items）を
// .trim()完全一致で突き合わせ、一致しなかった項目はプレビューで警告表示のうえ
// 取り込みから除外する（新規マスタの自動作成はしない）。
const PROMPT_TEXT = `以下の内容を JSON 配列形式のみで出力してください。解説テキストやマークダウン装飾は不要です。
日付ごとに、その日にあったデータの種類だけを含めてください（無い項目は省略可）。
種目名・食材名は、記録アプリに登録されている名称にできるだけ近い一般的な名称にしてください
（完全一致しない場合、その項目は取り込まれません）。
種目名は「ベンチプレス」「スクワット」のように、末尾に（バーベル）（ダンベル）等の
器具種別を含めないでください（アプリの記録画面では器具種別を括弧書きで併記表示していますが、
これは種目名の一部ではありません）。食材名も同様に、末尾のカロリー・分量等の
括弧書きは含めないでください（例:「白米」であって「白米 (100g = 168kcal)」ではない）。

[
  {
    "date": "YYYY-MM-DD",
    "schedule": { "title": "予定のタイトル", "emoji": "🏋️ (任意)", "templateName": "既存テンプレート名 (任意)", "notes": "メモ (任意)" },
    "training": {
      "exercises": [
        { "name": "種目名（例: ベンチプレス）", "sets": [{ "weight": 80, "reps": 8 }] }
      ],
      "end_time": "トレーニング終了時刻 HH:MM (任意)"
    },
    "meals": [
      { "type": "朝食 | 昼食 | 夕食 | 間食", "time": "食事をとった時刻 HH:MM (任意)", "items": [{ "name": "食材名（例: 白米）", "amount": 150 }] }
    ],
    "condition": { "weight": 74.5, "sleep_hours": 7, "fatigue_level": 3, "notes": "メモ (任意)" }
  }
]`

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
// リカバリー窓機能（スプリント4 Phase 1）：meal_time/training.end_timeの抽出用。
// 取得できない/不正な場合は単にundefinedのまま許容する（既存の「未一致ならスキップ」方針を踏襲）。
const TIME_PATTERN = /^\d{2}:\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mealTypeFromLabel(label: string): MealType {
  switch (label) {
    case '朝食':
      return 'breakfast'
    case '昼食':
      return 'lunch'
    case '夕食':
      return 'dinner'
    case '間食':
      return 'snack'
    case 'breakfast':
    case 'lunch':
    case 'dinner':
    case 'snack':
      return label
    default:
      return 'other'
  }
}

type ParsedSchedule = {
  title: string
  emoji: string
  templateName?: string
  templateId: string | null
  notes?: string
}

// 類似名確認ダイアログ機能（実装指示書v2、2026年8月19日新設）：完全一致・
// 末尾括弧書き除去のフォールバックでも一致しなかった名前について、レーベンシュタイン
// 距離ベースの類似度判定（src/utils/nameMatching.ts）で候補が見つかった場合に
// suggestedMatchへ格納する。ユーザーが「はい」を選ぶとexerciseId/foodItemIdへ
// 昇格し、「いいえ」を選ぶとnullに戻して従来通りスキップ＋警告表示のままとする。
type NameSuggestion = { id: string; name: string } | null

type ParsedExercise = {
  name: string
  exerciseId: string | null
  suggestedMatch: NameSuggestion
  sets: { weight?: number; reps?: number }[]
}

type ParsedMeal = {
  typeLabel: string
  mealType: MealType
  // リカバリー窓機能（スプリント4 Phase 1）：この食事をとった時刻（HH:MM）。
  // AI出力に含まれない/不正な形式の場合はundefined。
  time?: string
  items: { name: string; amount: number; foodItemId: string | null; suggestedMatch: NameSuggestion }[]
}

type ParsedCondition = {
  weight?: number
  sleepHours?: number
  fatigue?: FatigueLevel
  notes?: string
}

type ParsedDayItem = {
  date: DateString
  schedule?: ParsedSchedule
  // endTime：リカバリー窓機能（スプリント4 Phase 1）。そのトレーニングセッションの
  // 終了時刻（HH:MM）。AI出力に含まれない/不正な形式の場合はundefined。
  training?: { exercises: ParsedExercise[]; endTime?: string }
  meals?: ParsedMeal[]
  condition?: ParsedCondition
}

type ImportMode = 'append' | 'overwrite'

type BulkScheduleImportModalProps = {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
  trainingLogs: TrainingLog[]
  setTrainingLogs: React.Dispatch<React.SetStateAction<TrainingLog[]>>
  setMealLogs: React.Dispatch<React.SetStateAction<MealLog[]>>
  dailyConditions: DailyCondition[]
  setDailyConditions: React.Dispatch<React.SetStateAction<DailyCondition[]>>
}

export function BulkScheduleImportModal({
  isOpen,
  onClose,
  onImported,
  trainingLogs,
  setTrainingLogs,
  setMealLogs,
  dailyConditions,
  setDailyConditions,
}: BulkScheduleImportModalProps) {
  const { showToast } = useToast()
  const [jsonText, setJsonText] = useState('')
  const [parsedItems, setParsedItems] = useState<ParsedDayItem[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<TrainingTemplate[]>([])
  const [exercisesMaster, setExercisesMaster] = useState<ExerciseDefinition[]>([])
  const [foodItemsMaster, setFoodItemsMaster] = useState<FoodItem[]>([])
  const [importMode, setImportMode] = useState<ImportMode>('append')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  useEffect(() => {
    if (!isOpen) {
      setJsonText('')
      setParsedItems(null)
      setParseError(null)
      setSubmitError(null)
      setImportMode('append')
      setCopyStatus('idle')
      return
    }

    Promise.all([fetchTrainingTemplates(), fetchExercises(), fetchFoodItems()])
      .then(([templateData, exerciseData, foodItemData]) => {
        setTemplates(templateData)
        setExercisesMaster(exerciseData)
        setFoodItemsMaster(foodItemData)
      })
      .catch((error) => {
        console.error('Supabaseから一括取り込み用マスタデータの取得に失敗しました', error)
      })
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_TEXT)
      setCopyStatus('copied')
      setTimeout(() => setCopyStatus('idle'), 2000)
    } catch (error) {
      console.error('クリップボードへのコピーに失敗しました', error)
      setCopyStatus('error')
    }
  }

  const handleParse = () => {
    setParseError(null)
    setParsedItems(null)

    let data: unknown
    try {
      data = JSON.parse(jsonText)
    } catch {
      setParseError('JSONの解析に失敗しました。正しいJSON配列形式か確認してください')
      return
    }

    if (!Array.isArray(data)) {
      setParseError('JSON配列形式で入力してください（先頭・末尾は [ ] である必要があります）')
      return
    }

    if (data.length === 0) {
      setParseError('データが1件も含まれていません')
      return
    }

    const items: ParsedDayItem[] = []

    for (let index = 0; index < data.length; index += 1) {
      const raw = data[index]

      if (!isRecord(raw)) {
        setParseError(`${index + 1}件目: オブジェクト形式ではありません`)
        return
      }

      const date = raw.date
      if (typeof date !== 'string' || !DATE_PATTERN.test(date)) {
        setParseError(`${index + 1}件目: dateはYYYY-MM-DD形式の文字列で指定してください`)
        return
      }

      const item: ParsedDayItem = { date: date as DateString }

      if (raw.schedule !== undefined) {
        if (!isRecord(raw.schedule) || typeof raw.schedule.title !== 'string' || raw.schedule.title.trim() === '') {
          setParseError(`${index + 1}件目: schedule.titleは必須です`)
          return
        }
        const emoji = typeof raw.schedule.emoji === 'string' && raw.schedule.emoji.trim() !== '' ? raw.schedule.emoji.trim() : '🏋️'
        const templateName =
          typeof raw.schedule.templateName === 'string' && raw.schedule.templateName.trim() !== ''
            ? raw.schedule.templateName.trim()
            : undefined
        const notes =
          typeof raw.schedule.notes === 'string' && raw.schedule.notes.trim() !== '' ? raw.schedule.notes.trim() : undefined
        const matchedTemplate = templateName ? templates.find((template) => template.name.trim() === templateName) : undefined

        item.schedule = {
          title: raw.schedule.title.trim(),
          emoji,
          templateName,
          templateId: matchedTemplate?.id ?? null,
          notes,
        }
      }

      if (raw.training !== undefined) {
        if (!isRecord(raw.training) || !Array.isArray(raw.training.exercises)) {
          setParseError(`${index + 1}件目: training.exercisesは配列で指定してください`)
          return
        }

        const exercises: ParsedExercise[] = []
        for (const rawExercise of raw.training.exercises) {
          if (!isRecord(rawExercise) || typeof rawExercise.name !== 'string' || rawExercise.name.trim() === '') {
            setParseError(`${index + 1}件目: training.exercises[].nameは必須です`)
            return
          }
          const rawSets = Array.isArray(rawExercise.sets) ? rawExercise.sets : []
          const sets = rawSets.map((rawSet) => ({
            weight: isRecord(rawSet) && typeof rawSet.weight === 'number' ? rawSet.weight : undefined,
            reps: isRecord(rawSet) && typeof rawSet.reps === 'number' ? rawSet.reps : undefined,
          }))
          const exerciseName = rawExercise.name.trim()
          const matchedExercise = matchByNameWithFallback(exercisesMaster, exerciseName)
          const suggestedExercise = !matchedExercise ? findMostSimilarName(exercisesMaster, exerciseName) : null
          exercises.push({
            name: exerciseName,
            exerciseId: matchedExercise?.id ?? null,
            suggestedMatch:
              suggestedExercise && suggestedExercise.item.id
                ? { id: suggestedExercise.item.id, name: suggestedExercise.item.name }
                : null,
            sets,
          })
        }
        const endTime =
          typeof raw.training.end_time === 'string' && TIME_PATTERN.test(raw.training.end_time) ? raw.training.end_time : undefined
        item.training = { exercises, endTime }
      }

      if (raw.meals !== undefined) {
        if (!Array.isArray(raw.meals)) {
          setParseError(`${index + 1}件目: mealsは配列で指定してください`)
          return
        }

        const meals: ParsedMeal[] = []
        for (const rawMeal of raw.meals) {
          if (!isRecord(rawMeal) || typeof rawMeal.type !== 'string' || !Array.isArray(rawMeal.items)) {
            setParseError(`${index + 1}件目: meals[].type / meals[].itemsは必須です`)
            return
          }

          const mealItems: ParsedMeal['items'] = []
          for (const rawItem of rawMeal.items) {
            if (!isRecord(rawItem) || typeof rawItem.name !== 'string' || rawItem.name.trim() === '' || typeof rawItem.amount !== 'number') {
              setParseError(`${index + 1}件目: meals[].items[].name / amountは必須です`)
              return
            }
            const itemName = rawItem.name.trim()
            const matchedFoodItem = matchByNameWithFallback(foodItemsMaster, itemName)
            const suggestedFoodItem = !matchedFoodItem ? findMostSimilarName(foodItemsMaster, itemName) : null
            mealItems.push({
              name: itemName,
              amount: rawItem.amount,
              foodItemId: matchedFoodItem?.id ?? null,
              suggestedMatch:
                suggestedFoodItem && suggestedFoodItem.item.id
                  ? { id: suggestedFoodItem.item.id, name: suggestedFoodItem.item.name }
                  : null,
            })
          }

          const mealTime = typeof rawMeal.time === 'string' && TIME_PATTERN.test(rawMeal.time) ? rawMeal.time : undefined
          meals.push({ typeLabel: rawMeal.type, mealType: mealTypeFromLabel(rawMeal.type), time: mealTime, items: mealItems })
        }
        item.meals = meals
      }

      if (raw.condition !== undefined) {
        if (!isRecord(raw.condition)) {
          setParseError(`${index + 1}件目: conditionはオブジェクトで指定してください`)
          return
        }
        const weight = typeof raw.condition.weight === 'number' ? raw.condition.weight : undefined
        const sleepHours = typeof raw.condition.sleep_hours === 'number' ? raw.condition.sleep_hours : undefined
        const fatigueRaw = raw.condition.fatigue_level
        const fatigue =
          typeof fatigueRaw === 'number' && fatigueRaw >= 1 && fatigueRaw <= 5
            ? (Math.round(fatigueRaw) as FatigueLevel)
            : undefined
        const notes =
          typeof raw.condition.notes === 'string' && raw.condition.notes.trim() !== '' ? raw.condition.notes.trim() : undefined

        if (weight === undefined && sleepHours === undefined && fatigue === undefined) {
          setParseError(`${index + 1}件目: conditionにはweight/sleep_hours/fatigue_levelのいずれかが必要です`)
          return
        }
        item.condition = { weight, sleepHours, fatigue, notes }
      }

      if (!item.schedule && !item.training && !item.meals && !item.condition) {
        continue
      }

      items.push(item)
    }

    if (items.length === 0) {
      setParseError('有効なデータが1件もありません')
      return
    }

    setParsedItems(items)
  }

  // 類似名確認ダイアログ機能（実装指示書v2、2026年8月19日新設）：「はい（同じ種目/
  // 食材として取り込む）」でsuggestedMatchのIDをexerciseId/foodItemIdへ昇格させる。
  // 「いいえ（別として扱う）」はsuggestedMatchをnullに戻し、従来通りスキップ＋
  // 警告表示のままにする。
  const handleAcceptExerciseSuggestion = (dayIndex: number, exerciseIndex: number) => {
    setParsedItems((current) =>
      current
        ? current.map((day, di) => {
            if (di !== dayIndex || !day.training) return day
            return {
              ...day,
              training: {
                ...day.training,
                exercises: day.training.exercises.map((exercise, ei) => {
                  if (ei !== exerciseIndex || !exercise.suggestedMatch) return exercise
                  return { ...exercise, exerciseId: exercise.suggestedMatch.id, suggestedMatch: null }
                }),
              },
            }
          })
        : current,
    )
  }

  const handleDeclineExerciseSuggestion = (dayIndex: number, exerciseIndex: number) => {
    setParsedItems((current) =>
      current
        ? current.map((day, di) => {
            if (di !== dayIndex || !day.training) return day
            return {
              ...day,
              training: {
                ...day.training,
                exercises: day.training.exercises.map((exercise, ei) =>
                  ei === exerciseIndex ? { ...exercise, suggestedMatch: null } : exercise,
                ),
              },
            }
          })
        : current,
    )
  }

  const handleAcceptFoodSuggestion = (dayIndex: number, mealIndex: number, itemIndex: number) => {
    setParsedItems((current) =>
      current
        ? current.map((day, di) => {
            if (di !== dayIndex || !day.meals) return day
            return {
              ...day,
              meals: day.meals.map((meal, mi) => {
                if (mi !== mealIndex) return meal
                return {
                  ...meal,
                  items: meal.items.map((item, ii) => {
                    if (ii !== itemIndex || !item.suggestedMatch) return item
                    return { ...item, foodItemId: item.suggestedMatch.id, suggestedMatch: null }
                  }),
                }
              }),
            }
          })
        : current,
    )
  }

  const handleDeclineFoodSuggestion = (dayIndex: number, mealIndex: number, itemIndex: number) => {
    setParsedItems((current) =>
      current
        ? current.map((day, di) => {
            if (di !== dayIndex || !day.meals) return day
            return {
              ...day,
              meals: day.meals.map((meal, mi) => {
                if (mi !== mealIndex) return meal
                return {
                  ...meal,
                  items: meal.items.map((item, ii) => (ii === itemIndex ? { ...item, suggestedMatch: null } : item)),
                }
              }),
            }
          })
        : current,
    )
  }

  const scheduleItems = parsedItems?.filter((item): item is ParsedDayItem & { schedule: ParsedSchedule } => Boolean(item.schedule)) ?? []

  const handleImport = async () => {
    if (!parsedItems || parsedItems.length === 0) {
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // 予定：既存の一括取り込みと同じ動作（追加登録／期間内上書き登録）
      if (scheduleItems.length > 0) {
        if (importMode === 'overwrite') {
          const sortedDates = [...scheduleItems].map((item) => item.date).sort()
          await deleteSchedulesInRange(sortedDates[0], sortedDates[sortedDates.length - 1])
        }
        await bulkCreateSchedules(
          scheduleItems.map((item) => ({
            scheduledDate: item.date,
            title: item.schedule.title,
            emoji: item.schedule.emoji,
            templateId: item.schedule.templateId,
            status: 'scheduled' as const,
            notes: item.schedule.notes ?? null,
          })),
        )
      }

      // トレーニング実績：training_logsの「1日1件」制約を維持するため、対象日に
      // 既存の実績（親レコード）があればそこに種目を追加してupsertTrainingLog、
      // なければ新規作成してから種目を追加する（個別CRUD方式。全件をローカルで
      // 組み立てて一括保存する設計にはしない）。
      for (const item of parsedItems) {
        if (!item.training) continue
        const matchedExercises = item.training.exercises.filter(
          (exercise): exercise is ParsedExercise & { exerciseId: string } => exercise.exerciseId !== null,
        )
        if (matchedExercises.length === 0) continue

        const existingLog = trainingLogs.find((log) => log.date === item.date)
        const baseExercises = existingLog ? existingLog.exercises : []
        const newExercises: TrainingLogExercise[] = matchedExercises.map((exercise, index) => ({
          exerciseId: exercise.exerciseId,
          orderIndex: baseExercises.length + index,
          sets: exercise.sets.map((set, setIndex) => ({
            setNumber: setIndex + 1,
            weight: set.weight,
            reps: set.reps,
            isWarmup: false,
          })),
        }))

        // リカバリー窓機能（スプリント4 Phase 1）：AI出力にend_timeが含まれていれば
        // 上書きし、含まれていなければ（未指定/不正形式）既存の値をそのまま維持する
        // （マージ時にNULLで上書きして既存の入力値を消してしまわないため）。
        const importedEndTime = item.training.endTime ? combineDateAndTimeToISO(item.date, item.training.endTime) : undefined

        const mergedLog: TrainingLog = existingLog
          ? { ...existingLog, exercises: [...baseExercises, ...newExercises], completed: true, endTime: importedEndTime ?? existingLog.endTime }
          : { id: crypto.randomUUID(), date: item.date, exercises: newExercises, completed: true, endTime: importedEndTime }

        await upsertTrainingLog(mergedLog)
      }

      // 食事記録：meal_logsは1日複数件可能なため、重複チェックなしで新規の記録として追加する。
      for (const item of parsedItems) {
        if (!item.meals) continue
        for (const meal of item.meals) {
          const matchedItems = meal.items.filter(
            (mealItem): mealItem is typeof mealItem & { foodItemId: string } => mealItem.foodItemId !== null,
          )
          if (matchedItems.length === 0) continue

          const inputItems = matchedItems.map((mealItem) => {
            const foodItem = foodItemsMaster.find((food) => food.id === mealItem.foodItemId) as FoodItem
            const ratio = foodItem.servingAmount > 0 ? mealItem.amount / foodItem.servingAmount : 0
            return {
              foodItemId: mealItem.foodItemId,
              amount: mealItem.amount,
              calories: Math.round(foodItem.calories * ratio * 10) / 10,
              protein: Math.round(foodItem.protein * ratio * 10) / 10,
              fat: Math.round(foodItem.fat * ratio * 10) / 10,
              carbohydrates: Math.round(foodItem.carbohydrates * ratio * 10) / 10,
            }
          })

          await upsertMealLog({
            id: crypto.randomUUID(),
            date: item.date,
            mealType: meal.mealType,
            mealTime: meal.time ? combineDateAndTimeToISO(item.date, meal.time) : undefined,
            items: inputItems,
          })
        }
      }

      // 体調記録：daily_conditionsは1日1件（unique制約）のため、既存があれば上書き（upsert）、
      // なければ新規作成する。
      for (const item of parsedItems) {
        if (!item.condition) continue
        const existingCondition = dailyConditions.find((condition) => condition.date === item.date)
        const merged: DailyCondition = {
          id: existingCondition?.id,
          date: item.date,
          weight: item.condition.weight ?? existingCondition?.weight ?? 0,
          sleepHours: item.condition.sleepHours ?? existingCondition?.sleepHours ?? 0,
          fatigue: item.condition.fatigue ?? existingCondition?.fatigue ?? 3,
          notes: item.condition.notes ?? existingCondition?.notes,
          muscleSorenessLocation: existingCondition?.muscleSorenessLocation ?? 'none',
          muscleSorenessLevel: existingCondition?.muscleSorenessLevel ?? 'none',
        }
        await upsertDailyCondition(merged)
      }

      // 個別CRUD方式（保存のたびにAPIを直接呼び出す方式）を維持しつつ、
      // 一括取り込みという性質上、全項目の登録完了後にまとめて1回だけ再取得して
      // ローカルstateを更新する（全件diff同期方式の再導入ではなく、個別upsert後の
      // 読み直しであることに注意）。
      const [freshTrainingLogs, freshMealLogs, freshDailyConditions] = await Promise.all([
        fetchTrainingLogs(),
        fetchMealLogs(),
        fetchDailyConditions(),
      ])
      setTrainingLogs(freshTrainingLogs)
      setMealLogs(freshMealLogs)
      setDailyConditions(freshDailyConditions)

      onImported()
      onClose()
      showToast(`${parsedItems.length}日分のデータを取り込みました`, 'success')
    } catch (error) {
      console.error('Supabaseへの一括取り込みに失敗しました', error)
      setSubmitError('登録に失敗しました。もう一度お試しください')
      showToast('一括取り込みに失敗しました', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bulk-import-modal__overlay" role="presentation" onClick={onClose}>
      <div
        className="bulk-import-modal"
        role="dialog"
        aria-modal="true"
        aria-label="AI一括取り込み"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bulk-import-modal__header">
          <h3>✨ AI一括取り込み</h3>
          <button type="button" className="bulk-import-modal__close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        <div className="bulk-import-modal__body">
          <section className="bulk-import-modal__section">
            <p className="bulk-import-modal__description">
              下のプロンプトをコピーしてChatGPTやGeminiなどのAIに渡し、出力されたJSONをそのまま次の欄に貼り付けてください。
              予定・トレーニング実績・食事記録・体調記録を日付ごとにまとめて取り込めます。
            </p>
            <pre className="bulk-import-modal__prompt">{PROMPT_TEXT}</pre>
            <button type="button" className="calendar-detail__secondary-button" onClick={handleCopyPrompt}>
              {copyStatus === 'copied' ? 'コピーしました ✓' : copyStatus === 'error' ? 'コピーに失敗しました' : 'プロンプトをコピー'}
            </button>
          </section>

          <section className="bulk-import-modal__section">
            <label className="calendar-detail__field calendar-detail__field--full">
              <span>AIの出力結果（JSON）を貼り付け</span>
              <textarea
                className="bulk-import-modal__textarea"
                rows={6}
                value={jsonText}
                onChange={(event) => {
                  setJsonText(event.target.value)
                  setParsedItems(null)
                  setParseError(null)
                }}
                placeholder='[{"date": "2026-08-20", "schedule": {"title": "上半身トレーニング"}}]'
              />
            </label>
            {parseError ? <p className="calendar-detail__form-error">{parseError}</p> : null}
          </section>

          {parsedItems ? (
            <section className="bulk-import-modal__section">
              <h4>プレビュー（{parsedItems.length}日分）</h4>
              <div className="bulk-import-modal__days">
                {parsedItems.map((item, dayIndex) => {
                  const hasExistingTrainingLog = trainingLogs.some((log) => log.date === item.date)
                  const hasExistingCondition = dailyConditions.some((condition) => condition.date === item.date)

                  return (
                    <div key={item.date} className="bulk-import-modal__day">
                      <p className="bulk-import-modal__day-date">{item.date}</p>

                      {item.schedule ? (
                        <p className="bulk-import-modal__day-row">
                          📅 予定: {item.schedule.emoji} {item.schedule.title}
                          {item.schedule.templateName ? (
                            item.schedule.templateId ? (
                              <span className="bulk-import-modal__template-match"> （{item.schedule.templateName}）</span>
                            ) : (
                              <span className="bulk-import-modal__template-nomatch"> （{item.schedule.templateName}・未一致）</span>
                            )
                          ) : null}
                        </p>
                      ) : null}

                      {item.training ? (
                        <div className="bulk-import-modal__day-row">
                          🏋️ トレーニング実績
                          <span className="bulk-import-modal__day-note">
                            {hasExistingTrainingLog ? '（既存の実績に種目を追加）' : '（新規実績として作成）'}
                          </span>
                          <ul className="bulk-import-modal__day-list">
                            {item.training.exercises.map((exercise, index) => (
                              <li key={`${exercise.name}-${index}`}>
                                {exercise.exerciseId ? (
                                  exercise.name
                                ) : exercise.suggestedMatch ? (
                                  <span className="bulk-import-modal__suggestion">
                                    「{exercise.name}」は「{exercise.suggestedMatch.name}」と同じ種目ですか？
                                    <span className="bulk-import-modal__suggestion-actions">
                                      <button
                                        type="button"
                                        className="calendar-detail__secondary-button"
                                        onClick={() => handleAcceptExerciseSuggestion(dayIndex, index)}
                                      >
                                        はい
                                      </button>
                                      <button
                                        type="button"
                                        className="calendar-detail__secondary-button"
                                        onClick={() => handleDeclineExerciseSuggestion(dayIndex, index)}
                                      >
                                        いいえ
                                      </button>
                                    </span>
                                  </span>
                                ) : (
                                  <span className="bulk-import-modal__template-nomatch">{exercise.name}（未一致・スキップ）</span>
                                )}
                                {exercise.sets.length > 0 ? ` ${exercise.sets.length}セット` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {item.meals && item.meals.length > 0 ? (
                        <div className="bulk-import-modal__day-row">
                          🍚 食事（新規記録として追加）
                          <ul className="bulk-import-modal__day-list">
                            {item.meals.map((meal, mealIndex) => (
                              <li key={`${meal.typeLabel}-${mealIndex}`}>
                                {meal.typeLabel}:{' '}
                                {meal.items.map((foodItem, foodIndex) => (
                                  <span key={`${foodItem.name}-${foodIndex}`}>
                                    {foodIndex > 0 ? '・' : ''}
                                    {foodItem.foodItemId ? (
                                      foodItem.name
                                    ) : foodItem.suggestedMatch ? (
                                      <span className="bulk-import-modal__suggestion">
                                        「{foodItem.name}」は「{foodItem.suggestedMatch.name}」と同じ食材ですか？
                                        <span className="bulk-import-modal__suggestion-actions">
                                          <button
                                            type="button"
                                            className="calendar-detail__secondary-button"
                                            onClick={() => handleAcceptFoodSuggestion(dayIndex, mealIndex, foodIndex)}
                                          >
                                            はい
                                          </button>
                                          <button
                                            type="button"
                                            className="calendar-detail__secondary-button"
                                            onClick={() => handleDeclineFoodSuggestion(dayIndex, mealIndex, foodIndex)}
                                          >
                                            いいえ
                                          </button>
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="bulk-import-modal__template-nomatch">{foodItem.name}（未一致）</span>
                                    )}
                                  </span>
                                ))}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {item.condition ? (
                        <p className="bulk-import-modal__day-row">
                          📋 体調:
                          {item.condition.weight != null ? ` 体重${item.condition.weight}kg` : ''}
                          {item.condition.sleepHours != null ? ` 睡眠${item.condition.sleepHours}h` : ''}
                          {item.condition.fatigue != null ? ` 疲労度${item.condition.fatigue}/5` : ''}
                          <span className="bulk-import-modal__day-note">{hasExistingCondition ? '（既存の記録を上書き）' : '（新規作成）'}</span>
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              {scheduleItems.length > 0 ? (
                <div className="calendar-detail__field">
                  <span>予定の取り込みモード</span>
                  <label className="bulk-import-modal__radio">
                    <input
                      type="radio"
                      name="bulk-import-mode"
                      checked={importMode === 'append'}
                      onChange={() => setImportMode('append')}
                    />
                    既存予定に残して追加（追加登録）
                  </label>
                  <label className="bulk-import-modal__radio">
                    <input
                      type="radio"
                      name="bulk-import-mode"
                      checked={importMode === 'overwrite'}
                      onChange={() => setImportMode('overwrite')}
                    />
                    期間内の既存予定を削除して置き換え（上書き登録）
                  </label>
                </div>
              ) : null}

              {submitError ? <p className="calendar-detail__form-error">{submitError}</p> : null}
            </section>
          ) : null}
        </div>

        <div className="bulk-import-modal__footer">
          {parsedItems ? (
            <div className="calendar-detail__actions">
              <button type="button" className="calendar-detail__button" onClick={handleImport} disabled={isSubmitting}>
                {isSubmitting ? '登録中...' : `${parsedItems.length}日分を登録する`}
              </button>
              <button type="button" className="calendar-detail__secondary-button" onClick={onClose} disabled={isSubmitting}>
                キャンセル
              </button>
            </div>
          ) : (
            <button type="button" className="calendar-detail__button" onClick={handleParse} disabled={!jsonText.trim()}>
              解析してプレビュー
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
