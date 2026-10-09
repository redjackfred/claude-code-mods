export type AgentRun = {
  id: string
  type: string
  desc: string
  start: number
  end?: number
  tools: number
  // what the subagent runs on, as agent.spawn answered: an alias or a full id
  model?: string
  lastTool?: string
  failed?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'agent-progress': { runs: AgentRun[]; now: number; avgMs: number; enabled: boolean }
  }
}
