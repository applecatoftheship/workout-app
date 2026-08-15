export type AppView = 'dashboard' | 'calendar' | 'progress' | 'settings'

export const APP_VIEW_PATHS: Record<AppView, string> = {
  dashboard: '/',
  calendar: '/calendar',
  progress: '/graph',
  settings: '/settings',
}
