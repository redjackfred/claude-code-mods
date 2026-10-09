import type { AgentSpawnInput, Register } from 'claude-code'

// subagent type → model; a call that names its own model is left alone
const ROUTES: Record<string, string> = { Explore: 'haiku', 'general-purpose': 'sonnet' }

export const route = (e: Pick<AgentSpawnInput, 'subagentType' | 'model' | 'fork' | 'workflow'>) =>
  e.model || e.fork || e.workflow ? undefined : ROUTES[e.subagentType]

// With `/router jev on` and TYPESAFE_API_KEY set, Jev (a System One model) reads a general-purpose
// task and picks its tier. Its pick wins only when it is confident; a slow,
// failed or unsure answer keeps the rule's model.
const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
const JEV_TIMEOUT_MS = 1500
export const MIN_CONFIDENCE = 0.8
// ponytail: the task is cut to its head, so a long prompt is judged by its start
const MAX_TASK_CHARS = 4000

export const TIERS = {
  haiku: 'Simple, mechanical work: find or list files, read and summarize a little code, run a command and report, small obvious edits.',
  sonnet: 'Ordinary engineering: implement a feature, write tests, review code, fix a bug with a clear cause, research across a few files.',
  opus: 'Hard reasoning: subtle or hard-to-find bugs, large refactors, architecture or design decisions, tricky concurrency, security analysis.',
} as const
type Tier = keyof typeof TIERS
type JevChoice = { choice?: string; confidence?: number }

export const pick = (answer: JevChoice | undefined): { model: Tier; confidence: number } | undefined =>
  answer?.choice && answer.choice in TIERS && (answer.confidence ?? 0) >= MIN_CONFIDENCE
    ? { model: answer.choice as Tier, confidence: answer.confidence! }
    : undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'router', description: 'Let Jev pick general-purpose subagent models (jev on | jev off); sends task text to TypeSafe' })
    return next(e)
  })

  // off by default: turning it on sends every general-purpose task to TypeSafe
  on('command.run', { command: 'router' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg !== 'jev on' && arg !== 'jev off') {
      return { text: `🪙 Jev routing is ${(await $.store.get('jev')) === true ? 'on' : 'off'}. Use /router jev on | jev off.` }
    }
    const enable = arg === 'jev on'
    if (enable && !(await $.env.get('TYPESAFE_API_KEY'))) return { text: '🪙 Set TYPESAFE_API_KEY first, then restart Claude Code.' }
    await $.store.set('jev', enable)
    return { text: enable ? '🪙 Jev routing on: general-purpose tasks are sent to TypeSafe to pick a model.' : '🪙 Jev routing off.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const rule = route(e)
    if (!rule) return next(e)

    const useJev = e.subagentType === 'general-purpose' && (await $.store.get('jev')) === true
    const key = useJev ? await $.env.get('TYPESAFE_API_KEY') : undefined
    const judged = key ? await ask($, key, e) : undefined
    const model = judged?.model ?? rule
    $.ui.toast(`🪙 ${e.subagentType} → ${model}${judged ? ` · jev ${judged.confidence.toFixed(2)}` : ''}`)
    return next({ ...e, model })
  })
}

const ask = async ($: Parameters<Parameters<Register>[0]>[2] extends never ? never : any, key: string, e: AgentSpawnInput) => {
  const request = $.http.fetch(JEV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'jev-latest',
      state: { description: e.description, task: e.prompt.slice(0, MAX_TASK_CHARS) },
      questions: {
        tier: {
          type: 'choice',
          instructions: 'Which model tier does a coding agent need to do `task` well? Pick the cheapest tier that will still do it well.',
          criteria: TIERS,
        },
      },
    }),
  })
    .then((r: { ok: boolean; text: string }) => (r.ok ? pick(JSON.parse(r.text).answers?.tier) : undefined))
    .catch(() => undefined) // network, auth or parse failure: the rule decides
  return Promise.race([request, $.clock.sleep(JEV_TIMEOUT_MS).then(() => undefined)])
}
