import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { check } from './rules'
import type { Rule } from './rules'

// session-only on purpose: the guard comes back on, and forgets allowances, in every new session
const off = atom({ plugin: 'cmd-guard', key: 'off' } as const, false)
const allowed = atom({ plugin: 'cmd-guard', key: 'allowed' } as const, [])

const BLOCK = '拒絕執行（建議）'
const ONCE = '僅允許此次'
const SESSION = '本工作階段信任此類'
const SAFER = '改用安全替代方案'

const OUTCOME: Record<string, string> = {
  [BLOCK]: '指令不會執行，Claude 會停下來詢問你下一步。',
  [ONCE]: '只執行這一次，下次遇到同類指令仍會攔截。',
  [SESSION]: '本工作階段內同類指令全部放行，/guard on 可撤銷。',
  [SAFER]: '指令不會執行，Claude 會改用下方建議的做法並先說明。',
}

export const card = (rule: Rule, command: string, choice: string) => {
  const meter = rule.level === 'CRITICAL' ? '■■■■■' : '■■■■□'
  const cmd = command.length > 200 ? `${command.slice(0, 197)}...` : command
  const line = '─'.repeat(44)
  return [
    `╭─ 🛡  CMD-GUARD · 風險評估 ${line.slice(22)}`,
    `│  風險等級   ${meter}  ${rule.level}`,
    `│  觸發規則   ${rule.name}`,
    `│  可能影響   ${rule.impact}`,
    `├─ 指令 ${line.slice(5)}`,
    ...cmd.split('\n').map(l => `│  $ ${l}`),
    `├─ 安全替代 ${line.slice(9)}`,
    `│  ${rule.safer}`,
    `├─ 選擇後 ${line.slice(7)}`,
    `│  ${OUTCOME[choice]}`,
    `╰${line}`,
  ].join('\n')
}

// ask in the engine's own dialog; anything but an explicit choice blocks
const ask = async ($: Parameters<Parameters<Register>[0]>[2] extends never ? never : any, rule: Rule, command: string) => {
  const question = `偵測到高風險指令「${rule.name}」，要如何處理？`
  const opt = (label: string, description: string) => ({ label, description, preview: card(rule, command, label) })
  try {
    const ran = await $.tool.call({
      tool: 'AskUserQuestion',
      questions: [{
        question,
        header: `🛡 ${rule.level}`,
        multiSelect: false,
        options: [
          opt(BLOCK, '封鎖此指令，由你決定下一步'),
          opt(ONCE, '確認無誤，僅放行這一次'),
          opt(SESSION, `本工作階段不再攔截「${rule.name}」`),
          opt(SAFER, `請 Claude 改用：${rule.safer}`),
        ],
      }],
    })
    if (ran.deny !== undefined || ran.isError || !ran.result || ran.result.afkTimeoutMs) return BLOCK
    const answers = ran.result.answers as Record<string, string>
    return answers[question] ?? ran.result.response ?? BLOCK
  } catch {
    return BLOCK // dismissed, or nobody to ask
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'guard', description: 'Toggle the destructive-command guard for this session (on | off)' })
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
    if (!rule || (await read($, off)) || (await read($, allowed)).includes(rule.name)) return next(e)

    const answer = await ask($, rule, e.command)

    if (answer === ONCE) {
      $.ui.toast(`🛡 已放行一次 · ${rule.name}`)
      return next(e)
    }
    if (answer === SESSION) {
      await update($, allowed, l => [...l, rule.name])
      $.ui.toast(`🛡 本工作階段信任 · ${rule.name}`)
      return next(e)
    }
    $.ui.toast(`🛡 已攔截 · ${rule.name}`)
    if (answer === SAFER) {
      return { deny: `cmd-guard: the user blocked this command (${rule.name}: ${rule.impact}) and wants the safer alternative: ${rule.safer}. Explain the alternative briefly, then use it.` }
    }
    if (answer !== BLOCK) {
      return { deny: `cmd-guard: the user blocked this command (${rule.name}) and said: ${answer}` }
    }
    return { deny: `cmd-guard: the user blocked this command (${rule.name}: ${rule.impact}). Do not retry it; ask the user how to proceed.` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'cmd-guard: its check failed, so the command was blocked.' }))
}
