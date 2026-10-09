import { test, expect } from 'claude-code/testing'
import { cells, percent } from './register'

test('percent caps at 95 while running, 100 when done', () => {
  const run = { id: 'a', type: 'Explore', desc: 'x', start: 0, tools: 0 }
  expect(percent(run, 45_000, 90_000)).toBe(50)
  expect(percent(run, 999_000, 90_000)).toBe(95)
  expect(percent({ ...run, end: 10 }, 20, 90_000)).toBe(100)
})

test('bar fills by percent and the glint moves', () => {
  const a = cells(50, 8, '#94e2d5', true)
  expect(a.filter(c => c.ch === '▰').length).toBe(8)
  expect(a[4]!.color).not.toBe('#94e2d5') // glint head at cell 4 on frame 8
  expect(cells(50, 8, '#94e2d5', false)[4]!.color).toBe('#94e2d5')
})
