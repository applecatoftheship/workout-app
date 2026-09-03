import type { ComponentType } from 'react'
import './RecordSheet.css'
import { ConditionIcon, DumbbellIcon, MealIcon, ScheduleIcon, SoccerIcon } from './icons'

// 'workout' は「＋記録」シートには出さず（新規の有酸素記録はトレーニングの
// 種目選択から入る）、RecordFormModal 経由の「ワークアウト記録を編集」専用。
export type RecordType = 'training' | 'meal' | 'condition' | 'soccer' | 'schedule' | 'workout'

type RecordOption = {
  type: RecordType
  label: string
  icon: ComponentType<{ className?: string }>
}

const RECORD_OPTIONS: RecordOption[] = [
  { type: 'training', label: 'トレーニング', icon: DumbbellIcon },
  { type: 'meal', label: '食事', icon: MealIcon },
  { type: 'condition', label: '体調', icon: ConditionIcon },
  { type: 'soccer', label: 'サッカー', icon: SoccerIcon },
  { type: 'schedule', label: '予定', icon: ScheduleIcon },
]

type RecordSheetProps = {
  isOpen: boolean
  onClose: () => void
  onSelect: (type: RecordType) => void
}

export function RecordSheet({ isOpen, onClose, onSelect }: RecordSheetProps) {
  return (
    <div
      className={`record-sheet-overlay${isOpen ? ' record-sheet-overlay--open' : ''}`}
      onClick={onClose}
      aria-hidden={!isOpen}
    >
      <div
        className={`record-sheet${isOpen ? ' record-sheet--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="記録を追加"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="record-sheet__handle" />
        <h3 className="record-sheet__title">記録する</h3>
        <div className="record-sheet__grid">
          {RECORD_OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <button
                key={option.type}
                type="button"
                className="record-sheet__option"
                onClick={() => onSelect(option.type)}
              >
                <Icon className="record-sheet__option-icon" />
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
