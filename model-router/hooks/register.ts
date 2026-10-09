import type { AgentSpawnInput, Register } from 'claude-code'

// subagent type → model; a call that names its own model is left alone
const ROUTES: Record<string, string> = { Explore: 'haiku', 'general-purpose': 'sonnet' }

export const route = (e: Pick<AgentSpawnInput, 'subagentType' | 'model' | 'fork' | 'workflow'>) =>
  e.model || e.fork || e.workflow ? undefined : ROUTES[e.subagentType]

export const register: Register = on => {
  on('agent.spawn', ($, e, next) => {
    const model = route(e)
    if (!model) return next(e)
    $.ui.toast(`🪙 ${e.subagentType} → ${model}`)
    return next({ ...e, model })
  })
}
