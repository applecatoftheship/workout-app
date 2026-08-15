import { useLocation, useNavigate } from 'react-router-dom'
import './BottomNav.css'
import { CalendarIcon, ChartIcon, HomeIcon, PlusIcon, SettingsIcon } from './icons'
import { APP_VIEW_PATHS } from '../utils/appViewPaths'
import type { AppView } from '../utils/appViewPaths'

type BottomNavProps = {
  onOpenRecordSheet: () => void
}

export function BottomNav({ onOpenRecordSheet }: BottomNavProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const isActive = (view: AppView) => location.pathname === APP_VIEW_PATHS[view]

  return (
    <nav className="bottom-nav" aria-label="メインナビゲーション">
      <button
        type="button"
        className={`bottom-nav__item${isActive('dashboard') ? ' bottom-nav__item--active' : ''}`}
        onClick={() => navigate(APP_VIEW_PATHS.dashboard)}
      >
        <HomeIcon className="bottom-nav__icon" strokeWidth={isActive('dashboard') ? 2.4 : 2} />
        <span>ホーム</span>
      </button>

      <button
        type="button"
        className={`bottom-nav__item${isActive('calendar') ? ' bottom-nav__item--active' : ''}`}
        onClick={() => navigate(APP_VIEW_PATHS.calendar)}
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
        onClick={() => navigate(APP_VIEW_PATHS.progress)}
      >
        <ChartIcon className="bottom-nav__icon" strokeWidth={isActive('progress') ? 2.4 : 2} />
        <span>グラフ</span>
      </button>

      <button
        type="button"
        className={`bottom-nav__item${isActive('settings') ? ' bottom-nav__item--active' : ''}`}
        onClick={() => navigate(APP_VIEW_PATHS.settings)}
      >
        <SettingsIcon className="bottom-nav__icon" strokeWidth={isActive('settings') ? 2.4 : 2} />
        <span>設定</span>
      </button>
    </nav>
  )
}
