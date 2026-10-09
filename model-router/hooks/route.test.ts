import { test, expect } from 'claude-code/testing'
import { MIN_CONFIDENCE, pick, route } from './register'

test('Explore → haiku, general-purpose → sonnet, unless a model was named', () => {
  expect(route({ subagentType: 'Explore', fork: false })).toBe('haiku')
  expect(route({ subagentType: 'general-purpose', fork: false })).toBe('sonnet')
  expect(route({ subagentType: 'Explore', model: 'opus', fork: false })).toBe(undefined)
  expect(route({ subagentType: 'general-purpose', model: 'opus', fork: false })).toBe(undefined)
  expect(route({ subagentType: 'Plan', fork: false })).toBe(undefined)
  expect(route({ subagentType: 'Explore', fork: true })).toBe(undefined)
})

test('a Jev pick counts only when it is confident and names a tier', () => {
  expect(pick({ choice: 'haiku', confidence: 0.92 })).toEqual({ model: 'haiku', confidence: 0.92 })
  expect(pick({ choice: 'opus', confidence: MIN_CONFIDENCE })).toEqual({ model: 'opus', confidence: MIN_CONFIDENCE })
  expect(pick({ choice: 'haiku', confidence: 0.6 })).toBe(undefined)
  expect(pick({ choice: 'gpt', confidence: 0.99 })).toBe(undefined)
  expect(pick({ choice: 'haiku' })).toBe(undefined)
  expect(pick(undefined)).toBe(undefined)
})
