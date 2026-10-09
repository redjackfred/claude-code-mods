export type GuardOff = boolean
export type GuardAllowed = string[]
export type GuardPrompts = { en: number; zh: number; last: string }

declare module 'claude-code' {
  interface PluginState {
    'cmd-guard': { off: GuardOff; allowed: GuardAllowed; prompts: GuardPrompts }
  }
}
