import { test, expect } from 'claude-code/testing'
import { layout, cells, pill } from './pane'
import type { View } from './pane'
import { moodOf } from './register'

const view = (night: boolean): View => ({
  mood: night ? 'sleep' : 'focus',
  night,
  title: { label: 'FOCUS', value: '25', bg: '#d70000', fg: '#ffffff', valueBg: '#870000', valueFg: '#ffd7d7' },
  time: { text: '24:59', color: '#fff4e6', shadow: '#1f3d22' },
  bar: { ratio: 0.3, fill: ['#ff5f6d', '#ffc371'] },
  today: { done: 3, goal: 8, label: 'TODAY 3/8', color: '#ffffd7', empty: '#87af5f' },
  footer: { spans: [{ text: '/focus skip · stop · hide' }], bg: '#005f00' },
})

test('layout fills every row and every cell of the pane', () => {
  for (const night of [false, true]) {
    const rows = layout(view(night), 36, 24, 3)
    expect(rows.length).toBe(24)
    for (const row of rows) {
      const width = row.kind === 'pixels'
        ? row.runs.reduce((n, r) => n + [...r.text].length, 0)
        : row.spans.reduce((n, s) => n + cells(s.text), 0)
      expect(width).toBe(36)
      // no cell left unpainted: a blank one must carry the sky's color as its background
      if (row.kind === 'pixels') for (const r of row.runs) if (r.text.startsWith(' ')) expect(r.bg !== undefined).toBe(true)
    }
  }
})

test('emoji and CJK count as two cells', () => {
  expect(cells('今日 🍅×3')).toBe(2 + 2 + 1 + 2 + 1 + 1)
})

test('Nerd Font caps and icons count as one cell, so badges center right', () => {
  expect(cells('\ue0b6 \uf186 BREAK \ue0b4')).toBe(1 + 1 + 1 + 1 + 5 + 1 + 1)
  const badge = pill('今日 🍅 ×3', '#1c1c1c', '#ffd787')
  expect(badge.length).toBe(3)
  expect(badge[1]!.bg).toBe('#1c1c1c')
  expect(badge[0]!.bg).toBe(undefined) // caps take the row's own background
})

test('mood follows phase and time left', () => {
  const focus = { phase: 'focus' as const, start: 0, ms: 300_000, focusMin: 5 }
  expect(moodOf(focus, 0)).toBe('focus')
  expect(moodOf(focus, 250_000)).toBe('hurry')
  const rest = { ...focus, phase: 'break' as const }
  expect(moodOf(rest, 1000)).toBe('cheer')
  expect(moodOf(rest, 10_000)).toBe('sleep')
})
