import { test, expect } from 'claude-code/testing'
import { route } from './register'

test('Explore → haiku, general-purpose → sonnet, unless a model was named', () => {
  expect(route({ subagentType: 'Explore', fork: false })).toBe('haiku')
  expect(route({ subagentType: 'general-purpose', fork: false })).toBe('sonnet')
  expect(route({ subagentType: 'Explore', model: 'opus', fork: false })).toBe(undefined)
  expect(route({ subagentType: 'general-purpose', model: 'opus', fork: false })).toBe(undefined)
  expect(route({ subagentType: 'Plan', fork: false })).toBe(undefined)
  expect(route({ subagentType: 'Explore', fork: true })).toBe(undefined)
})
