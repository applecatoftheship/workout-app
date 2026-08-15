type IconProps = {
  strokeWidth?: number
  className?: string
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function HomeIcon({ strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  )
}

export function CalendarIcon({ strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={strokeWidth} className={className}>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3M16 3v3" />
    </svg>
  )
}

export function PlusIcon({ strokeWidth = 2.4, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function ChartIcon({ strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  )
}

export function SettingsIcon({ strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={strokeWidth} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.51 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H4a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.51-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10a1.7 1.7 0 0 0 1.04-1.56V4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10a1.7 1.7 0 0 0 1.56 1.04H20a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.1Z" />
    </svg>
  )
}

export function DumbbellIcon({ strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M6.5 6.5v11M17.5 6.5v11" />
      <path d="M3.5 9.5v5M20.5 9.5v5" />
      <path d="M6.5 12h11" />
    </svg>
  )
}

export function MealIcon({ strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M7 3v7a2 2 0 0 0 2 2v9M7 3v7M9 3v7" />
      <path d="M17 3c-1.5 0-2.5 1.5-2.5 4s1 4.5 2.5 4.5V21" />
    </svg>
  )
}

export function ConditionIcon({ strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M12 21s-7.5-4.6-10-9.3C.4 8.1 2 4.5 5.5 4a5 5 0 0 1 6.5 2 5 5 0 0 1 6.5-2c3.5.5 5.1 4.1 3.5 7.7C19.5 16.4 12 21 12 21Z" />
    </svg>
  )
}

export function SoccerIcon({ strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={strokeWidth} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8.2 15.4 10.7 14.1 14.6H9.9L8.6 10.7Z" />
      <path d="M12 3.4V8.2M4.5 8.8l3.5 1M4.5 8.8 5.3 15.1M19.5 8.8l-3.5 1M19.5 8.8l-.8 6.3M9.9 14.6 6.5 18M14.1 14.6 17.5 18" />
    </svg>
  )
}

export function ScheduleIcon({ strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={strokeWidth} className={className}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5" />
      <path d="M9 2h6" />
    </svg>
  )
}

export function WeightIcon({ strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={strokeWidth} className={className}>
      <circle cx="12" cy="13" r="8" />
      <path d="M9.5 13a2.5 2.5 0 0 1 5 0" />
      <path d="M10 6.5h4l.6-2.5H9.4Z" />
    </svg>
  )
}

export function SleepIcon({ strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  )
}

export function FatigueIcon({ strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6Z" />
    </svg>
  )
}

export function HistoryIcon({ strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={strokeWidth} className={className}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4l3 2" />
    </svg>
  )
}
