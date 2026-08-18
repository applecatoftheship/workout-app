import { useMemo, useState } from 'react'
import type { BodyPart, DailyCondition, TrainingLog } from '../types'
import './ProgressGraph.css'
import '../components/graphs/ChartCommon.css'
import { TrainingChart } from '../components/graphs/TrainingChart'
import type { BodyPartVolumeEntry } from '../components/graphs/TrainingChart'
import { TrainingVolumeChart } from '../components/graphs/TrainingVolumeChart'
import { WeightChart } from '../components/graphs/WeightChart'
import { SleepChart } from '../components/graphs/SleepChart'
import { FatigueChart } from '../components/graphs/FatigueChart'
import {
  buildDateList,
  calculateDenseMovingAverage,
  calculateMovingAverage,
  getPeriodGoalMultiplier,
  getPeriodRange,
  toDateKey,
} from '../utils/chartHelpers'
import type { Period } from '../utils/chartHelpers'

// トレーニンググラフ刷新（2026年8月17日）：部位別ボリュームの識別色。
// types.tsのBodyPart型（胸/肩/腕/背/脚/腹/有酸素/その他）に対応する固定色を
// tokens.cssに追加済み（--color-bp-*）。指示書の例（背中/腹筋等）は実際の型の
// 語彙と異なるため、背→背中の色、腹→腹筋の色として読み替えている。
const BODY_PART_COLOR_VAR: Record<BodyPart, string> = {
  胸: 'var(--color-bp-chest)',
  肩: 'var(--color-bp-shoulder)',
  腕: 'var(--color-bp-arm)',
  背: 'var(--color-bp-back)',
  脚: 'var(--color-bp-leg)',
  腹: 'var(--color-bp-core)',
  有酸素: 'var(--color-bp-cardio)',
  その他: 'var(--color-bp-other)',
}

function sumVolumeByBodyPart(logs: TrainingLog[]) {
  const map = new Map<BodyPart, number>()
  logs.forEach((log) => {
    log.exercises.forEach((exercise) => {
      const bodyPart = exercise.exercise?.bodyPart
      if (!bodyPart) return
      const volume = exercise.sets.reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0)
      map.set(bodyPart, (map.get(bodyPart) ?? 0) + volume)
    })
  })
  return map
}

function sumDailyVolumeByBodyPart(logs: TrainingLog[]) {
  const map = new Map<BodyPart, Map<string, number>>()
  logs.forEach((log) => {
    log.exercises.forEach((exercise) => {
      const bodyPart = exercise.exercise?.bodyPart
      if (!bodyPart) return
      const volume = exercise.sets.reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0)
      if (volume === 0) return
      const inner = map.get(bodyPart) ?? new Map<string, number>()
      inner.set(log.date, (inner.get(log.date) ?? 0) + volume)
      map.set(bodyPart, inner)
    })
  })
  return map
}

const chartTabs = [
  { id: 'training' as const, label: 'トレーニング' },
  { id: 'weight' as const, label: '体重' },
  { id: 'sleep' as const, label: '睡眠' },
  { id: 'fatigue' as const, label: '疲労度' },
]

type ChartType = (typeof chartTabs)[number]['id']

const periodTabs: { id: Period; label: string }[] = [
  { id: 'week', label: '1週間' },
  { id: 'month', label: '1ヶ月' },
  { id: 'quarter', label: '3ヶ月' },
  { id: 'all', label: '全期間' },
]

export function ProgressGraph({
  trainingLogs,
  dailyConditions,
  targetWeight,
  targetSleepHours,
  monthlyTrainingGoal,
}: {
  trainingLogs: TrainingLog[]
  dailyConditions: DailyCondition[]
  targetWeight: number
  targetSleepHours: number
  weeklyTrainingGoal: number
  monthlyTrainingGoal: number
}) {
  const [selectedChart, setSelectedChart] = useState<ChartType>('training')
  const [period, setPeriod] = useState<Period>('week')

  const today = useMemo(() => new Date(), [])

  const earliestDate = useMemo(() => {
    const dates = [...trainingLogs.map((log) => log.date), ...dailyConditions.map((condition) => condition.date)]
    if (dates.length === 0) return undefined
    return new Date(`${[...dates].sort()[0]}T00:00:00`)
  }, [trainingLogs, dailyConditions])

  const { start, end } = useMemo(() => getPeriodRange(period, today, earliestDate), [period, today, earliestDate])
  const periodStartKey = toDateKey(start)
  const periodEndKey = toDateKey(end)
  const periodDates = useMemo(() => buildDateList(start, end), [start, end])

  const sortedConditions = useMemo(
    () => [...dailyConditions].sort((a, b) => a.date.localeCompare(b.date)),
    [dailyConditions],
  )

  const periodConditions = useMemo(
    () => sortedConditions.filter((condition) => condition.date >= periodStartKey && condition.date <= periodEndKey),
    [sortedConditions, periodStartKey, periodEndKey],
  )

  // 7日移動平均（スプリント2、2026年8月17日）は、選択期間の先頭付近でも正しい直近7日分を
  // 参照できるよう、期間で絞り込む前の全期間データ（sortedConditions）から算出し、
  // 表示のタイミングで期間内の日付だけに絞り込む。
  const weightMA = useMemo(() => calculateMovingAverage(sortedConditions, 'date', 'weight'), [sortedConditions])
  const sleepMA = useMemo(() => calculateMovingAverage(sortedConditions, 'date', 'sleepHours'), [sortedConditions])
  const fatigueMA = useMemo(() => calculateMovingAverage(sortedConditions, 'date', 'fatigue'), [sortedConditions])

  const periodWeightMA = useMemo(
    () => weightMA.filter((point) => point.date >= periodStartKey && point.date <= periodEndKey),
    [weightMA, periodStartKey, periodEndKey],
  )
  const periodSleepMA = useMemo(
    () => sleepMA.filter((point) => point.date >= periodStartKey && point.date <= periodEndKey),
    [sleepMA, periodStartKey, periodEndKey],
  )
  const periodFatigueMA = useMemo(
    () => fatigueMA.filter((point) => point.date >= periodStartKey && point.date <= periodEndKey),
    [fatigueMA, periodStartKey, periodEndKey],
  )

  const trainingByDate = useMemo(() => {
    const map = new Map<string, { sets: number; volume: number; completed: boolean; hasLog: boolean }>()
    trainingLogs.forEach((log) => {
      const sets = log.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
      const volume = log.exercises.reduce(
        (sum, exercise) => sum + exercise.sets.reduce((setSum, set) => setSum + (set.weight ?? 0) * (set.reps ?? 0), 0),
        0,
      )
      const existing = map.get(log.date)
      map.set(log.date, {
        sets: (existing?.sets ?? 0) + sets,
        volume: (existing?.volume ?? 0) + volume,
        completed: (existing?.completed ?? false) || log.completed,
        hasLog: true,
      })
    })
    return map
  }, [trainingLogs])

  const periodTrainingDays = useMemo(
    () =>
      periodDates.map((date) => ({
        date,
        ...(trainingByDate.get(date) ?? { sets: 0, volume: 0, completed: false, hasLog: false }),
      })),
    [periodDates, trainingByDate],
  )

  // 総ボリューム推移（トレーニング画面刷新v2、2026年8月18日）：7日移動平均は
  // 選択期間の先頭付近でも正しい直近7日分を参照できるよう、履歴の最初の記録日から
  // 今日までの欠損のない日次系列（休養日=0）を先に作ってから期間で絞り込む
  // （体重・睡眠・疲労度の移動平均と同じ「全期間計算→期間で絞り込み」の方針）。
  const dailyVolumeSeries = useMemo(() => {
    if (!earliestDate) return []
    return buildDateList(earliestDate, today).map((date) => ({
      date,
      volume: trainingByDate.get(date)?.volume ?? 0,
    }))
  }, [earliestDate, today, trainingByDate])

  const volumeMA = useMemo(() => calculateDenseMovingAverage(dailyVolumeSeries), [dailyVolumeSeries])

  const periodVolumeMA = useMemo(
    () => volumeMA.filter((point) => point.date >= periodStartKey && point.date <= periodEndKey).map((point) => ({ date: point.date, volume: point.movingAvg })),
    [volumeMA, periodStartKey, periodEndKey],
  )

  // 部位別ボリューム（トレーニンググラフ刷新、2026年8月17日）：ACWR・移動平均と同じく
  // DBにはキャッシュせず呼び出しのたびに動的計算する。前週比・自己ベストバッジは
  // 「全期間」選択時は比較対象となる同じ長さの期間が定義できないため算出しない
  // （合計ボリュームのみ表示、判断は指示書委任事項）。
  const bodyPartVolume = useMemo<BodyPartVolumeEntry[]>(() => {
    const periodLogs = trainingLogs.filter((log) => log.date >= periodStartKey && log.date <= periodEndKey)
    const currentVolumeByPart = sumVolumeByBodyPart(periodLogs)
    const dailyByPart = sumDailyVolumeByBodyPart(periodLogs)

    let previousVolumeByPart: Map<BodyPart, number> | null = null
    let bestPriorVolumeByPart: Map<BodyPart, number> | null = null

    if (period !== 'all') {
      const periodLengthDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
      const previousEnd = new Date(start)
      previousEnd.setDate(previousEnd.getDate() - 1)
      const previousStart = new Date(previousEnd)
      previousStart.setDate(previousStart.getDate() - (periodLengthDays - 1))
      const previousLogs = trainingLogs.filter(
        (log) => log.date >= toDateKey(previousStart) && log.date <= toDateKey(previousEnd),
      )
      previousVolumeByPart = sumVolumeByBodyPart(previousLogs)

      // 自己ベスト＝現在の期間より前の、同じ長さの非重複な過去の期間群の中での最大ボリューム
      bestPriorVolumeByPart = new Map<BodyPart, number>()
      let windowEnd = new Date(previousEnd)
      let windowStart = new Date(previousStart)
      let guard = 0
      while (earliestDate && windowEnd >= earliestDate && guard < 520) {
        const windowLogs = trainingLogs.filter(
          (log) => log.date >= toDateKey(windowStart) && log.date <= toDateKey(windowEnd),
        )
        const windowVolume = sumVolumeByBodyPart(windowLogs)
        windowVolume.forEach((volume, bodyPart) => {
          const current = bestPriorVolumeByPart?.get(bodyPart) ?? 0
          if (volume > current) bestPriorVolumeByPart?.set(bodyPart, volume)
        })
        windowEnd = new Date(windowStart)
        windowEnd.setDate(windowEnd.getDate() - 1)
        windowStart = new Date(windowEnd)
        windowStart.setDate(windowStart.getDate() - (periodLengthDays - 1))
        guard += 1
      }
    }

    return Array.from(currentVolumeByPart.entries())
      .filter(([, volume]) => volume > 0)
      .map(([bodyPart, volume]) => {
        const diff = previousVolumeByPart ? volume - (previousVolumeByPart.get(bodyPart) ?? 0) : null
        const bestPrior = bestPriorVolumeByPart?.get(bodyPart) ?? 0
        const isPersonalBest = bestPriorVolumeByPart != null && volume > bestPrior
        const dailyMap = dailyByPart.get(bodyPart) ?? new Map<string, number>()
        const dailyVolumes = periodDates.map((date) => ({ date, volume: dailyMap.get(date) ?? 0 }))
        return {
          bodyPart,
          color: BODY_PART_COLOR_VAR[bodyPart],
          volume,
          diff,
          isPersonalBest,
          dailyVolumes,
        }
      })
      .sort((a, b) => b.volume - a.volume)
  }, [trainingLogs, periodStartKey, periodEndKey, period, start, end, earliestDate, periodDates])

  const periodGoalMultiplier = useMemo(
    () => getPeriodGoalMultiplier(period, today, earliestDate),
    [period, today, earliestDate],
  )
  const trainingGoal = Math.round(monthlyTrainingGoal * periodGoalMultiplier)
  const trainingCount = periodTrainingDays.filter((day) => day.hasLog).length
  const totalSets = periodTrainingDays.reduce((sum, day) => sum + day.sets, 0)
  const totalVolume = periodTrainingDays.reduce((sum, day) => sum + day.volume, 0)
  const achievementRate = trainingGoal > 0 ? Math.min(100, Math.round((trainingCount / trainingGoal) * 100)) : 0

  // 前期間比（ヒーローグラフのトレンドバッジ、2026年8月18日）：部位別ボリュームの
  // 前週比と同じ「同じ長さの直前の期間」との比較方式を踏襲する。「全期間」選択時は
  // 比較対象となる同じ長さの期間が定義できないためnull（バッジ非表示、部位別
  // ボリュームの前週比と同じ判断）。
  const previousPeriodTotalVolume = useMemo(() => {
    if (period === 'all') return null
    const periodLengthDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    const previousEnd = new Date(start)
    previousEnd.setDate(previousEnd.getDate() - 1)
    const previousStart = new Date(previousEnd)
    previousStart.setDate(previousStart.getDate() - (periodLengthDays - 1))
    const previousStartKey = toDateKey(previousStart)
    const previousEndKey = toDateKey(previousEnd)
    const previousLogs = trainingLogs.filter((log) => log.date >= previousStartKey && log.date <= previousEndKey)
    const volumeByPart = sumVolumeByBodyPart(previousLogs)
    return Array.from(volumeByPart.values()).reduce((sum, volume) => sum + volume, 0)
  }, [trainingLogs, period, start, end])

  const volumeDiff = previousPeriodTotalVolume != null ? totalVolume - previousPeriodTotalVolume : null

  return (
    <section className="progress-graph">
      <div className="progress-graph__header">
        <h2>進捗グラフ</h2>
        <p>記録したデータをグラフで確認できます。</p>
      </div>

      <div className="progress-graph__tabs">
        {chartTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`progress-graph__tab ${selectedChart === tab.id ? 'progress-graph__tab--active' : ''}`}
            onClick={() => setSelectedChart(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="progress-graph__period">
        {periodTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`progress-graph__period-button ${period === tab.id ? 'progress-graph__period-button--active' : ''}`}
            onClick={() => setPeriod(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="progress-graph__panel">
        {selectedChart === 'training' ? (
          <>
            <TrainingChart
              periodTrainingDays={periodTrainingDays}
              trainingGoal={trainingGoal}
              trainingCount={trainingCount}
              totalSets={totalSets}
              totalVolume={totalVolume}
              achievementRate={achievementRate}
              bodyPartVolume={bodyPartVolume}
            />
            <TrainingVolumeChart
              periodDailyVolume={periodTrainingDays}
              periodVolumeMA={periodVolumeMA}
              totalVolume={totalVolume}
              volumeDiff={volumeDiff}
            />
          </>
        ) : null}
        {selectedChart === 'weight' ? (
          <WeightChart
            periodConditions={periodConditions}
            periodWeightMA={periodWeightMA}
            targetWeight={targetWeight}
            periodEnd={end}
            periodEndKey={periodEndKey}
          />
        ) : null}
        {selectedChart === 'sleep' ? (
          <SleepChart periodConditions={periodConditions} periodSleepMA={periodSleepMA} targetSleepHours={targetSleepHours} />
        ) : null}
        {selectedChart === 'fatigue' ? (
          <FatigueChart periodConditions={periodConditions} periodFatigueMA={periodFatigueMA} />
        ) : null}
      </div>
    </section>
  )
}
