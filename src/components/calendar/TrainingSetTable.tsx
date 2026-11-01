import { SwipeableRow } from '../common/SwipeableRow'
import './TrainingSetTable.css'

// 記録画面ブラッシュアップ（2026年11月1日）：セット入力を Hevy・Strong 等と同じ
// 「セット｜前回｜kg｜回」の行形式に統一（従来の「一括入力 ⇔ セット別詳細」の
// 切替を廃止）。前回の値は「前回」列に表示し、入力欄にも薄く表示する（従来の
// ゴースト入力と同じ。値としては入らないので、前回と同じなら「前回をコピー」）。
// セットの削除は行を左スワイプ（スワイプ操作の統一）。

export type TrainingSetRowValue = {
  key: string
  reps: string
  weight: string
  // セットの完了チェック（2026年11月1日）。画面上の表示のみで、DBには保存しない
  // （保存されるセットは従来どおり全行）。
  done: boolean
}

type PreviousSet = { weight: number | null; reps: number | null }

type TrainingSetTableProps = {
  rows: TrainingSetRowValue[]
  previousSets: PreviousSet[] | null
  errors?: Array<{ reps?: string; weight?: string }>
  onChange: (index: number, field: 'reps' | 'weight', value: string) => void
  onToggleDone: (index: number) => void
  onDelete: (index: number) => void
  onAdd: () => void
}

function formatPrevious(set: PreviousSet | undefined): string {
  if (!set) {
    return '—'
  }
  const weight = set.weight != null ? `${set.weight}` : '-'
  const reps = set.reps != null ? `${set.reps}` : '-'
  return `${weight}×${reps}`
}

export function TrainingSetTable({ rows, previousSets, errors, onChange, onToggleDone, onDelete, onAdd }: TrainingSetTableProps) {
  return (
    <div className="training-set-table">
      <div className="training-set-table__header" aria-hidden="true">
        <span>セット</span>
        <span>前回</span>
        <span>kg</span>
        <span>回</span>
        <span>✓</span>
      </div>
      <ul className="training-set-table__rows">
        {rows.map((row, index) => {
          const previous = previousSets?.[index]
          const rowError = errors?.[index]
          return (
            <li key={row.key}>
              <SwipeableRow actions={[{ key: 'delete', label: '削除', tone: 'danger', onClick: () => onDelete(index) }]}>
                <div
                  className={`training-set-table__row${row.done ? ' training-set-table__row--done' : ''}${rowError?.reps || rowError?.weight ? ' training-set-table__row--error' : ''}`}
                >
                  <span className="training-set-table__index">{index + 1}</span>
                  <span className="training-set-table__previous">{formatPrevious(previous)}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.1"
                    className="training-set-table__input"
                    aria-label={`${index + 1}セット目の重量（kg）`}
                    value={row.weight}
                    placeholder={previous?.weight != null ? String(previous.weight) : 'kg'}
                    onChange={(event) => onChange(index, 'weight', event.target.value)}
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    className="training-set-table__input"
                    aria-label={`${index + 1}セット目の回数`}
                    value={row.reps}
                    placeholder={previous?.reps != null ? String(previous.reps) : '回'}
                    onChange={(event) => onChange(index, 'reps', event.target.value)}
                  />
                  <button
                    type="button"
                    className={`training-set-table__check${row.done ? ' training-set-table__check--done' : ''}`}
                    aria-label={`${index + 1}セット目を${row.done ? '未完了に戻す' : '完了にする'}`}
                    aria-pressed={row.done}
                    onClick={() => onToggleDone(index)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </SwipeableRow>
              {rowError?.reps || rowError?.weight ? (
                <p className="calendar-detail__error">{rowError.weight ?? rowError.reps}</p>
              ) : null}
            </li>
          )
        })}
      </ul>
      <button type="button" className="training-set-table__add" onClick={onAdd}>
        ＋ セットを追加
      </button>
    </div>
  )
}
