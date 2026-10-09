export type AgentRun = {
  id: string
  type: string
  desc: string
  start: number
  end?: number
  tools: number
  lastTool?: string
  failed?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'agent-progress': { runs: AgentRun[]; now: number; avgMs: number; enabled: boolean }
  }
}
