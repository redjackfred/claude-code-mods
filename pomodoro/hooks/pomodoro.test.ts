import { test, expect } from 'claude-code/testing'
import { breakMin, clock } from './register'

test('break length and long break every 4th', () => {
  expect(breakMin(25, 1)).toBe(5)
  expect(breakMin(50, 1)).toBe(10)
  expect(breakMin(25, 4)).toBe(15)
  expect(breakMin(10, 1)).toBe(5)
})

test('clock formats mm:ss and never goes negative', () => {
  expect(clock(25 * 60_000)).toBe('25:00')
  expect(clock(61_500)).toBe('01:02')
  expect(clock(-5)).toBe('00:00')
})
