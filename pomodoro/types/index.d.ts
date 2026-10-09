export type PomodoroTimer = {
  phase: 'focus' | 'break'
  start: number
  ms: number
  focusMin: number
}
export type PomodoroDay = { date: string; count: number }

declare module 'claude-code' {
  interface PluginState {
    pomodoro: { timer: PomodoroTimer | null; now: number; day: PomodoroDay; paneShown: boolean }
  }
}
