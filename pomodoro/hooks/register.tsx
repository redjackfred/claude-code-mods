import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { PomodoroDay, PomodoroTimer } from '../types'
import { CONTENT_ROWS, layout } from './pane'
import type { View } from './pane'
import type { Mood } from './pixel'

const timer = atom({ plugin: 'pomodoro', key: 'timer' } as const, null)
const now = atom({ plugin: 'pomodoro', key: 'now' } as const, 0)
const day = atom({ plugin: 'pomodoro', key: 'day' } as const, { date: '', count: 0 })
const paneShown = atom({ plugin: 'pomodoro', key: 'paneShown' } as const, false)

const PANE = 'pomodoro'
const FRAME_MS = 500
const WIDTH = 20
const C = {
  red: '#f38ba8', green: '#a6e3a1', peach: '#fab387', lavender: '#b4befe',
  base: '#1e1e2e', overlay: '#45475a', text: '#cdd6f4', sub: '#9399b2', dim: '#585b70',
}
const SEP = ''
const CAP = ''

// ponytail: local date via the runtime's timezone; fine for one person on one machine
export const today = (t: number) => new Date(t).toLocaleDateString('sv-SE')
// break is a fifth of the focus (min 5); every 4th is a long one, three times as long
export const breakMin = (focusMin: number, count: number) =>
  Math.max(5, Math.round(focusMin / 5)) * (count > 0 && count % 4 === 0 ? 3 : 1)
export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
export const moodOf = (cur: PomodoroTimer, t: number): Mood =>
  cur.phase === 'break' ? (t - cur.start < 4000 ? 'cheer' : 'sleep') : cur.ms - (t - cur.start) <= 60_000 ? 'hurry' : 'focus'

let ticker: Timer | undefined

const loadDay = async ($: EngineInterface, t: number): Promise<PomodoroDay> => {
  const saved = (await $.store.get('day')) as PomodoroDay | undefined
  return saved && saved.date === today(t) ? saved : { date: today(t), count: 0 }
}

const finish = async ($: EngineInterface, cur: PomodoroTimer, t: number) => {
  if (cur.phase === 'focus') {
    const d = await loadDay($, t)
    const next = { ...d, count: d.count + 1 }
    await $.store.set('day', next)
    await update($, day, () => next)
    const rest = breakMin(cur.focusMin, next.count)
    await update($, timer, () => ({ phase: 'break', start: t, ms: rest * 60_000, focusMin: cur.focusMin }))
    $.ui.toast(`🍅 專注完成！今天第 ${next.count} 個。休息 ${rest} 分鐘 ☕`, { timeoutMs: 8000 })
    void $.audio.play({ asset: 'sounds/focus-done.wav' }).catch(() => {})
  } else {
    await update($, timer, () => null)
    $.ui.toast(`☕ 休息結束，/focus 開始下一輪`, { timeoutMs: 8000 })
    void $.audio.play({ asset: 'sounds/break-done.wav' }).catch(() => {})
  }
}

const tick = ($: EngineInterface) => {
  if (ticker) return
  ticker = $.clock.every(FRAME_MS, async () => {
    const cur = await read($, timer)
    const t = await $.clock.now()
    await update($, now, () => t)
    if (!cur) {
      ticker?.cancel()
      ticker = undefined
      return
    }
    if (t - cur.start >= cur.ms) await finish($, cur, t)
  })
}

const showPane = async ($: EngineInterface) => {
  const { isPlaced } = await $.ui.open({ id: PANE, title: '🍅 Pomodoro', columns: 36 })
  await update($, paneShown, () => isPlaced)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'focus', description: 'Pomodoro: /focus [minutes] · skip · stop · show · hide' })
    const d = await loadDay($, await $.clock.now())
    await update($, day, () => d)
    if (await read($, timer)) tick($)
    return next(e)
  })

  on('command.run', { command: 'focus' }, async ($, e) => {
    const arg = e.args.trim()
    const t = await $.clock.now()
    const cur = await read($, timer)

    if (arg === 'stop') {
      await update($, timer, () => null)
      await $.ui.close({ id: PANE })
      return { text: cur ? '🍅 番茄鐘已停止（這輪不計入）。' : '🍅 目前沒有番茄鐘在跑。' }
    }
    if (arg === 'skip') {
      if (!cur) return { text: '🍅 目前沒有番茄鐘在跑。' }
      await finish($, cur, t)
      return { text: cur.phase === 'focus' ? '🍅 已跳到休息。' : '☕ 已結束休息。' }
    }
    if (arg === 'show') {
      await showPane($)
      return { text: '🍅 面板已開啟。' }
    }
    if (arg === 'hide') {
      await $.ui.close({ id: PANE })
      return { text: '🍅 面板已收起，倒數改顯示在輸入框上方。' }
    }

    const min = arg === '' ? 25 : Number(arg)
    if (!Number.isFinite(min) || min < 1 || min > 180) {
      return { text: '用法：/focus [1-180 分鐘，預設 25] · skip · stop · show · hide' }
    }
    await update($, timer, () => ({ phase: 'focus', start: t, ms: min * 60_000, focusMin: min }))
    await update($, now, () => t)
    const d = await loadDay($, t)
    await update($, day, () => d)
    tick($)
    await showPane($)
    return { text: `🍅 開始專注 ${min} 分鐘，休息 ${breakMin(min, 1)} 分鐘。` }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    await update($, paneShown, () => false)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const cur = await read($, timer)
    const t = Math.max(await read($, now), cur?.start ?? 0)
    const d = await read($, day)
    const frame = Math.floor(t / FRAME_MS)
    const rows = Math.max(CONTENT_ROWS, Math.min(e.props.scroll.bodyRows, 60))

    // xterm-256 colors for the digits and bar on the grass
    const ink = {
      focus: { time: '#ffffd7', shadow: '#005f00', hurry: '#ffaf5f', bar: ['#ff5f5f', '#ffaf5f'] as const },
      night: { time: '#d7ffff', shadow: '#000000', hurry: '#ffaf5f', bar: ['#5fd7d7', '#af87d7'] as const },
    }
    // badges and strips, per mode, tuned to the sky (title) and grass (today) behind them
    const badge = {
      focus: { title: ['#d70000', '#ffffff', '#870000', '#ffd7d7'], dot: '#87af5f', count: '#d7ffaf', footer: '#005f00', icon: '#ffffd7', word: '#afd787', sep: '#5f875f' },
      night: { title: ['#afafff', '#121212', '#5f5faf', '#ffffff'], dot: '#008787', count: '#87afaf', footer: '#121212', icon: '#87d7ff', word: '#87afaf', sep: '#585858' },
    } as const
    type Badge = (typeof badge)['focus' | 'night']
    // today's tally against a daily goal, in pixels: label above, mini tomatoes below
    const GOAL = 8
    const todayRow = (b: Badge) => ({
      done: Math.min(d.count, GOAL),
      goal: GOAL,
      label: d.count > GOAL ? `TODAY +${d.count - GOAL}` : `TODAY ${d.count}/${GOAL}`,
      color: b.count,
      empty: b.dot,
    })
    // the bottom strip: each command with its icon, quiet separators between
    const footer = (b: Badge, cmds: [string, string][]) => ({
      bg: b.footer,
      spans: [
        { text: '/focus  ', color: b.sep },
        ...cmds.flatMap(([icon, word], i) => [
          { text: `${icon} `, color: b.icon },
          { text: word, color: b.word },
          ...(i < cmds.length - 1 ? [{ text: '  ·  ', color: b.sep }] : []),
        ]),
      ],
    })
    let view: View
    if (!cur) {
      const b = badge.night
      view = {
        mood: 'sleep',
        night: true,
        title: { label: 'POMODORO', bg: b.title[0], fg: b.title[1], valueBg: b.title[2], valueFg: b.title[3] },
        today: todayRow(b),
        footer: footer(b, [['\uf04b', '25 min'], ['\uf013', 'any length']]),
      }
    } else {
      const focus = cur.phase === 'focus'
      const k = focus ? ink.focus : ink.night
      const b = focus ? badge.focus : badge.night
      const mood = moodOf(cur, t)
      view = {
        mood,
        night: !focus,
        title: {
          label: focus ? 'FOCUS' : 'BREAK',
          value: String(Math.round(cur.ms / 60_000)),
          bg: b.title[0], fg: b.title[1], valueBg: b.title[2], valueFg: b.title[3],
        },
        time: { text: clock(cur.ms - (t - cur.start)), color: mood === 'hurry' && frame % 2 === 0 ? k.hurry : k.time, shadow: k.shadow },
        bar: { ratio: (t - cur.start) / cur.ms, fill: k.bar },
        today: todayRow(b),
        footer: footer(b, [['\uf051', 'skip'], ['\uf04d', 'stop'], ['\uf070', 'hide']]),
      }
    }

    return (
      <Box flexDirection="column">
        {layout(view, e.props.bodyColumns, rows, frame).map(row =>
          row.kind === 'pixels' ? (
            <Text>{row.runs.map(r => <Text color={r.fg} backgroundColor={r.bg}>{r.text}</Text>)}</Text>
          ) : (
            <Text backgroundColor={row.bg}>
              {row.spans.map(sp => <Text color={sp.color} backgroundColor={sp.bg ?? row.bg} bold={sp.bold}>{sp.text}</Text>)}
            </Text>
          ),
        )}
      </Box>
    )
  })

  // one-line fallback above the prompt while the pane is not on screen
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const cur = await read($, timer)
    if (e.props.hasSurvey || !cur || (await read($, paneShown))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const t = Math.max(await read($, now), cur.start)
    const d = await read($, day)
    const left = cur.ms - (t - cur.start)
    const done = Math.round(((t - cur.start) / cur.ms) * WIDTH)
    const focus = cur.phase === 'focus'
    const accent = focus ? C.red : C.green
    const below = await next(e)

    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text color={accent}>{CAP}</Text>
          <Text color={C.base} backgroundColor={accent} bold>{focus ? ' 🍅 FOCUS ' : ' ☕ BREAK '}</Text>
          <Text color={accent} backgroundColor={C.overlay}>{SEP}</Text>
          <Text backgroundColor={C.overlay}>
            {' '}
            {Array.from({ length: WIDTH }, (_, i) => (
              <Text color={i < done ? accent : C.dim}>{i < done ? '▰' : '▱'}</Text>
            ))}
            <Text color={C.text} bold> {clock(left)} </Text>
          </Text>
          <Text color={C.overlay} backgroundColor={C.base}>{SEP}</Text>
          <Text color={C.peach} backgroundColor={C.base}> 今日 🍅×{d.count} </Text>
          <Text color={C.base}>{SEP}</Text>
          <Text color={C.sub}> /focus show 開啟面板</Text>
        </Text>
        {below}
      </Box>
    )
  })
}
