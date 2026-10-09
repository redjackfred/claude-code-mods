import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, Timer } from 'claude-code'

import type { AgentRun } from '../types'

const runs = atom({ plugin: 'agent-progress', key: 'runs' } as const, [])
const now = atom({ plugin: 'agent-progress', key: 'now' } as const, 0)
// running average of finished subagent durations; the bar's denominator
const avgMs = atom({ plugin: 'agent-progress', key: 'avgMs' } as const, 90_000)
const enabled = atom({ plugin: 'agent-progress', key: 'enabled' } as const, true)

const WIDTH = 16
const FRAME_MS = 120
const LINGER_MS = 8_000

// Catppuccin Mocha, same as ~/.claude/statusline.sh
const C = {
  mauve: '#cba6f7', blue: '#89b4fa', teal: '#94e2d5', green: '#a6e3a1', red: '#f38ba8',
  pink: '#f5c2e7', lavender: '#b4befe', rosewater: '#f5e0dc',
  base: '#1e1e2e', surface: '#313244', overlay: '#45475a', text: '#cdd6f4', sub: '#9399b2',
}
const SEP = ''
const CAP = ''
const ROBOT = '\u{f06a9}'
const TIMER = '\u{f051f}'
const WRENCH = ''
const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

// ponytail: subagents report no real progress, so % = elapsed / avg past duration, capped at 95 until done
export const percent = (run: AgentRun, at: number, avg: number) =>
  run.end !== undefined ? 100 : Math.min(95, Math.floor(((at - run.start) / avg) * 100))

// one cell of the bar: filled ▰ / empty ▱, lit by a glint sweeping left to right
export const cells = (pct: number, frame: number, base: string, shine: boolean) => {
  const filled = Math.round((pct / 100) * WIDTH)
  const head = (frame % (WIDTH + 8)) - 4
  return Array.from({ length: WIDTH }, (_, i) => {
    const on = i < filled
    const d = shine ? Math.abs(i - head) : 99
    const color = !on
      ? d === 0 ? C.lavender : d === 1 ? '#7f849c' : '#585b70'
      : d === 0 ? C.rosewater : d === 1 ? C.pink : d === 2 ? C.lavender : base
    return { ch: on ? '▰' : '▱', color }
  })
}

// `claude-sonnet-5-5` → `sonnet 5.5`, `haiku` → `haiku`; anything else as given
export const shortModel = (model: string) => {
  const m = /(haiku|sonnet|opus|fable)(?:-(\d+)-(\d+))?/i.exec(model)
  return m ? (m[2] ? `${m[1]!.toLowerCase()} ${m[2]}.${m[3]}` : m[1]!.toLowerCase()) : model
}

let timer: Timer | undefined

const tick = ($: EngineInterface) => {
  if (timer) return
  timer = $.clock.every(FRAME_MS, async () => {
    const t = await $.clock.now()
    const list = await read($, runs)
    if (list.length === 0) {
      timer?.cancel()
      timer = undefined
      return
    }
    await update($, now, () => t)
    if (list.some(r => r.end !== undefined && t - r.end > LINGER_MS)) {
      await update($, runs, l => l.filter(r => r.end === undefined || t - r.end <= LINGER_MS))
    }
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agent-progress',
      description: 'Toggle subagent progress bars (on | off)',
    })
    const saved = await $.store.get('enabled')
    if (typeof saved === 'boolean') await update($, enabled, () => saved)
    if ((await read($, runs)).length > 0) tick($)
    return next(e)
  })

  on('command.run', { command: 'agent-progress' }, async ($, e) => {
    const arg = e.args.trim()
    const value = arg === 'on' ? true : arg === 'off' ? false : !(await read($, enabled))
    await update($, enabled, () => value)
    await $.store.set('enabled', value)
    return { text: `Agent progress bars ${value ? 'on' : 'off'}.` }
  })

  on('agent.spawn', async ($, e, next) => {
    const res = await next(e)
    if ('agentId' in res && res.agentId) {
      const t = await $.clock.now()
      const run: AgentRun = { id: res.agentId, type: e.subagentType, desc: e.description, start: t, tools: 0, model: res.model ? shortModel(res.model) : undefined }
      await update($, now, () => t)
      await update($, runs, l => [...l.filter(r => r.id !== run.id), run])
      tick($)
    }
    return res
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId) {
      const id = e.agentId
      await update($, runs, l =>
        l.map(r => (r.id === id ? { ...r, tools: r.tools + 1, lastTool: e.tool } : r)),
      )
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      const id = e.agentId
      const t = await $.clock.now()
      const run = (await read($, runs)).find(r => r.id === id)
      if (run && run.end === undefined) {
        await update($, avgMs, a => Math.max(5_000, Math.round(a * 0.7 + (t - run.start) * 0.3)))
        await update($, runs, l =>
          l.map(r => (r.id === id ? { ...r, end: t, failed: e.reason !== 'answer' } : r)),
        )
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, runs)
    if (e.props.hasSurvey || list.length === 0 || !(await read($, enabled))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const t = await read($, now)
    const avg = await read($, avgMs)
    const frame = Math.floor(t / FRAME_MS)

    // powerline chain: [bg, fg, content][] → cap, segments joined by , closing 
    const chain = (segs: [string, string, RenderChildren][]) => {
      const out: RenderChildren[] = [<Text color={segs[0]![0]}>{CAP}</Text>]
      segs.forEach(([bg, fg, body], i) => {
        if (i > 0) out.push(<Text color={segs[i - 1]![0]} backgroundColor={bg}>{SEP}</Text>)
        out.push(<Text color={fg} backgroundColor={bg}>{body}</Text>)
      })
      out.push(<Text color={segs[segs.length - 1]![0]}>{SEP}</Text>)
      return out
    }

    const shown = list.slice(-Math.max(1, e.props.maxRows - 1))
    // pad every row's variable-width parts to the widest so separators line up
    const typeW = Math.max(...shown.map(r => r.type.length))
    const modelW = Math.max(...shown.map(r => r.model?.length ?? 0))
    const toolW = Math.max(...shown.map(r => (r.end === undefined && r.lastTool ? r.lastTool.length + 3 : 0)))

    // other mods' bands (pomodoro, ...) stack underneath
    const below = await next(e)

    return (
      <Box flexDirection="column">
        {shown.map(r => {
          const running = r.end === undefined
          const pct = percent(r, t, avg)
          const secs = Math.round(((r.end ?? t) - r.start) / 1000)
          const accent = r.failed ? C.red : running ? C.mauve : C.green
          const icon = r.failed ? '✗' : running ? SPIN[frame % SPIN.length] : '✓'
          const barBase = r.failed ? C.red : running ? C.teal : C.green
          const bar = cells(pct, frame, barBase, running).map(c => <Text color={c.color}>{c.ch}</Text>)
          const tool = (running && r.lastTool ? ` (${r.lastTool})` : '').padEnd(toolW)

          return (
            <Text key={r.id} wrap="truncate-end">
              {chain([
                [accent, C.base, <Text bold> {icon} {ROBOT} {r.type.padEnd(typeW)} </Text>],
                ...(modelW > 0 ? [[C.surface, accent, <Text> {(r.model ?? '').padEnd(modelW)} </Text>] as [string, string, RenderChildren]] : []),
                [C.overlay, C.text, <Text> {bar} <Text color={barBase} bold>{String(pct).padStart(3)}%</Text> </Text>],
                [C.base, C.text, <Text> {TIMER} {String(secs).padStart(3)}s {WRENCH} {String(r.tools).padStart(2)}<Text color={C.sub}>{tool}</Text> </Text>],
              ])}
              <Text color={C.sub}> {r.desc}</Text>
            </Text>
          )
        })}
        {below}
      </Box>
    )
  })
}
