export type GuardOff = boolean
export type GuardAllowed = string[]

declare module 'claude-code' {
  interface PluginState {
    'cmd-guard': { off: GuardOff; allowed: GuardAllowed }
  }
}
