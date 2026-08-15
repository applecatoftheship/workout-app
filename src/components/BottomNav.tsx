import './BottomNav.css'
import { CalendarIcon, ChartIcon, HomeIcon, PlusIcon, SettingsIcon } from './icons'

export type AppView = 'dashboard' | 'calendar' | 'progress' | 'settings'

type BottomNavProps = {
  activeView: AppView
  onNavigate: (view: AppView) => void
  onOpenRecordSheet: () => void
}

export function BottomNav({ activeView, onNavigate, onOpenRecordSheet }: BottomNavProps) {
  const isActive = (view: AppView) => activeView === view

  return (
    <nav className="bottom-nav" aria-label="メインナビゲーション">
      <button
        type="button"
        className={`bottom-nav__item${isActive('dashboard') ? ' bottom-nav__item--active' : ''}`}
        onClick={() => onNavigate('dashboard')}
      >
        <HomeIcon className="bottom-nav__icon" strokeWidth={isActive('dashboard') ? 2.4 : 2} />
        <span>ホーム</span>
      </button>

      <button
        type="button"
        className={`bottom-nav__item${isActive('calendar') ? ' bottom-nav__item--active' : ''}`}
        onClick={() => onNavigate('calendar')}
      >
        <CalendarIcon className="bottom-nav__icon" strokeWidth={isActive('calendar') ? 2.4 : 2} />
        <span>カレンダー</span>
      </button>

      <div className="bottom-nav__center">
        <button type="button" className="bottom-nav__record-button" onClick={onOpenRecordSheet} aria-label="記録を追加">
          <PlusIcon className="bottom-nav__record-icon" />
        </button>
      </div>

      <button
        type="button"
        className={`bottom-nav__item${isActive('progress') ? ' bottom-nav__item--active' : ''}`}
        onClick={() => onNavigate('progress')}
      >
        <ChartIcon className="bottom-nav__icon" strokeWidth={isActive('progress') ? 2.4 : 2} />
        <span>グラフ</span>
      </button>

      <button
        type="button"
        className={`bottom-nav__item${isActive('settings') ? ' bottom-nav__item--active' : ''}`}
        onClick={() => onNavigate('settings')}
      >
        <SettingsIcon className="bottom-nav__icon" strokeWidth={isActive('settings') ? 2.4 : 2} />
        <span>設定</span>
      </button>
    </nav>
  )
}
