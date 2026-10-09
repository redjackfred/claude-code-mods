import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { check, langOf } from './rules'
import type { Lang, Rule } from './rules'

// session-only on purpose: the guard comes back on, and forgets allowances, in every new session
const off = atom({ plugin: 'cmd-guard', key: 'off' } as const, false)
const allowed = atom({ plugin: 'cmd-guard', key: 'allowed' } as const, [])
// how many of the session's prompts were in each language; the dialog speaks the majority's
const prompts = atom({ plugin: 'cmd-guard', key: 'prompts' } as const, { en: 0, zh: 0, last: 'en' })

type Choice = 'block' | 'once' | 'session' | 'safer'
const CHOICES: Choice[] = ['block', 'once', 'session', 'safer']
const UI = {
  en: {
    labels: { block: 'Block (recommended)', once: 'Allow once', session: 'Trust for this session', safer: 'Use the safer alternative' },
    impact: 'Impact', safer: 'Instead', ask: 'What should happen?',
    allowedOnce: 'Allowed once', trusted: 'Trusted for this session', blocked: 'Blocked',
  },
  zh: {
    labels: { block: '拒絕執行（建議）', once: '僅允許此次', session: '本工作階段信任此類', safer: '改用安全替代方案' },
    impact: '影響', safer: '替代', ask: '要如何處理？',
    allowedOnce: '已放行一次', trusted: '本工作階段信任', blocked: '已攔截',
  },
} as const

export const sessionLang = (p: { en: number; zh: number; last: string }): Lang =>
  p.zh > p.en ? 'zh' : p.en > p.zh ? 'en' : p.last === 'zh' ? 'zh' : 'en'

export const question = (rule: Rule, command: string, lang: Lang) => {
  const t = rule.text[lang]
  const ui = UI[lang]
  const cmd = command.length > 120 ? `${command.slice(0, 117)}...` : command
  return [
    `🛡 ${rule.level} · ${t.name}`,
    `$ ${cmd}`,
    `${ui.impact}: ${t.impact}`,
    `${ui.safer}: ${t.safer}`,
    ui.ask,
  ].join('\n')
}

// ask in the engine's own dialog; anything but an explicit choice blocks.
// Returns the choice, or the text the user typed under "Other".
const ask = async ($: Parameters<Parameters<Register>[0]>[2] extends never ? never : any, rule: Rule, command: string, lang: Lang): Promise<Choice | string> => {
  const labels = UI[lang].labels
  try {
    const answer: string = await $.ui.ask(question(rule, command, lang), { header: '🛡 cmd-guard', options: CHOICES.map(c => labels[c]) })
    return CHOICES.find(c => labels[c] === answer) ?? answer
  } catch {
    return 'block' // dismissed, or nobody to ask
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'guard', description: 'Toggle the destructive-command guard for this session (on | off)' })
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const lang = langOf(e.text)
    await update($, prompts, p => ({ ...p, [lang]: p[lang] + 1, last: lang }))
    return next(e)
  })

  on('command.run', { command: 'guard' }, async ($, e) => {
    const arg = e.args.trim()
    const value = arg === 'off' ? true : arg === 'on' ? false : !(await read($, off))
    await update($, off, () => value)
    if (!value) await update($, allowed, () => [])
    $.ui.status(value ? '󰒙 guard off' : undefined)
    return { text: `🛡 Command guard ${value ? 'OFF for this session' : 'ON · session allowances cleared'}` }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const rule = check(e.command)
    if (!rule || (await read($, off)) || (await read($, allowed)).includes(rule.id)) return next(e)

    const lang = sessionLang(await read($, prompts))
    const ui = UI[lang]
    const name = rule.text[lang].name
    const answer = await ask($, rule, e.command, lang)

    if (answer === 'once') {
      $.ui.toast(`🛡 ${ui.allowedOnce} · ${name}`)
      return next(e)
    }
    if (answer === 'session') {
      await update($, allowed, l => [...l, rule.id])
      $.ui.toast(`🛡 ${ui.trusted} · ${name}`)
      return next(e)
    }
    $.ui.toast(`🛡 ${ui.blocked} · ${name}`)
    // the model reads English either way
    const { name: en, impact, safer } = rule.text.en
    if (answer === 'safer') {
      return { deny: `cmd-guard: the user blocked this command (${en}: ${impact}) and wants the safer alternative: ${safer}. Explain the alternative briefly, then use it.` }
    }
    if (answer !== 'block') {
      return { deny: `cmd-guard: the user blocked this command (${en}) and said: ${answer}` }
    }
    return { deny: `cmd-guard: the user blocked this command (${en}: ${impact}). Do not retry it; ask the user how to proceed.` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'cmd-guard: its check failed, so the command was blocked.' }))
}
