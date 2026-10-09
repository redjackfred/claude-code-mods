// Lays out the whole pane as one pixel canvas: sky above, grass below the
// tomato, and text rows drawn on the ground's own color so nothing breaks it.
import {
  badgeWidth, digitsWidth, GRASS, grassAt, mergeRuns, MINI_W, paintBadge, paintBar, paintDecor, paintDigits, paintFireflies, paintGrass, paintTally, paintTomato,
  sky, SKIES, skyAt, skyCell, toCells, TOMATO_SIZE,
} from './pixel'
import type { Badge, Grid, Mood, Px, Run } from './pixel'
import { sextantCell, skyRows } from './skyhd'

export type Span = { text: string; color?: string; bg?: string; bold?: boolean }

// a rounded badge: Powerline caps in the badge's color over the row's own background
export const pill = (text: string, bg: string, color: string, bold = true): Span[] => [
  { text: '\ue0b6', color: bg },
  { text: ` ${text} `, color, bg, bold },
  { text: '\ue0b4', color: bg },
]
export type Row = { kind: 'pixels'; runs: Run[] } | { kind: 'text'; spans: Span[]; bg: string }

export type View = {
  mood: Mood
  night: boolean
  title: Badge
  time?: { text: string; color: string; shadow: string }
  bar?: { ratio: number; fill: readonly [string, string] }
  // the daily tally: a pixel-font label over a row of mini tomatoes
  today: { done: number; goal: number; label: string; color: string; empty: string }
  // the pane's last row: a full-width strip in its own color
  footer?: { spans: Span[]; bg: string }
}

export const CONTENT_ROWS = 26
const GROUND_ROWS = 3
const BAR_W = 26

// terminal cells a string takes: CJK and emoji are two wide
export const cells = (s: string) =>
  [...s].reduce((n, ch) => {
    const cp = ch.codePointAt(0)!
    // Nerd Font glyphs live in the private use areas and are one cell wide
    const pua = (cp >= 0xe000 && cp <= 0xf8ff) || cp >= 0xf0000
    return n + (!pua && (cp >= 0x2e80 || (cp >= 0x2600 && cp <= 0x27bf) || cp >= 0x1f000) ? 2 : 1)
  }, 0)

const centered = (spans: Span[], width: number): Span[] => {
  const used = spans.reduce((n, s) => n + cells(s.text), 0)
  const left = Math.max(0, Math.floor((width - used) / 2))
  return [{ text: ' '.repeat(left) }, ...spans, { text: ' '.repeat(Math.max(0, width - used - left)) }]
}

// the colors a drawn cell shows at its top and bottom halves
const halves = (c: Run): [string, string] => {
  const solid = c.bg ?? c.fg ?? '#000000'
  if (c.text === '▀') return [c.fg!, c.bg ?? c.fg!]
  if (c.text === '▄') return [c.bg ?? c.fg!, c.fg!]
  return [solid, solid]
}

// draw at sextant resolution (2×3 sub-pixels per cell) over `n` cell rows from
// `row`: cells the drawing touches become sextant glyphs over what was beneath
const overlay = (cells: Run[][], row: number, n: number, w: number, draw: (sub: Grid) => void) => {
  const sub: Grid = Array.from({ length: n * 3 }, () => Array<Px>(w * 2).fill(null))
  draw(sub)
  for (let r = 0; r < n; r++)
    for (let cx = 0; cx < w; cx++) {
      const mine = [0, 1, 2].flatMap(dy => [0, 1].map(dx => sub[r * 3 + dy]![cx * 2 + dx]!))
      const under = cells[row + r]?.[cx]
      if (!under || mine.every(c => c === null)) continue
      const [topC, bottomC] = halves(under)
      cells[row + r]![cx] = sextantCell(mine.map((c, k) => c ?? (k < 4 ? topC : bottomC)))
    }
}

export const layout = (view: View, width: number, rows: number, frame: number): Row[] => {
  const w = Math.max(width, 28)
  const h = rows * 2
  const skyColors = view.night ? SKIES.night : SKIES.focus
  const grass = view.night ? GRASS.night : GRASS.focus

  // cell rows
  // content sits low, a little ground under it; every spare row goes to the sky
  // `top` anchors the tomato; the pixel badge sits in the three rows above it
  const top = Math.max(3, rows - CONTENT_ROWS - GROUND_ROWS + 3)
  const titleRow = top - 3
  const footerRow = view.footer ? rows - 1 : -1
  // pixel rows
  const tx = Math.floor((w - TOMATO_SIZE) / 2)
  const ty = (top + 2) * 2
  const horizon = ty + TOMATO_SIZE - 1
  const g = sky(w, h)
  const digitsY = horizon + 3
  const barY = (top + 15) * 2
  const barX = Math.floor((w - BAR_W) / 2)
  const dw = view.time ? digitsWidth(view.time.text) : 0
  const dx = Math.floor((w - dw) / 2)
  // the badge (3 rows) and the TODAY label (2 rows) are drawn at sextant
  // resolution on top of the canvas, so their pixel font is a size smaller
  const labelRow = top + 17
  const tallyY = (top + 19) * 2
  const tallyW = view.today.goal * (MINI_W + 1) - 1
  const tallyX = Math.floor((w - tallyW) / 2)

  const overlayRows = [titleRow, titleRow + 1, titleRow + 2, labelRow, labelRow + 1]
  const textPx = (y: number) => Math.floor(y / 2) === footerRow || overlayRows.includes(Math.floor(y / 2))
  const busy = (x: number, y: number) =>
    textPx(y) ||
    (x >= tx - 3 && x <= tx + TOMATO_SIZE + 9 && y >= ty - 4 && y <= horizon) ||
    (view.time !== undefined && x >= dx - 2 && x <= dx + dw + 1 && y >= digitsY - 2 && y <= digitsY + 7) ||
    (view.bar !== undefined && x >= barX - 2 && x <= barX + BAR_W + 1 && y >= barY - 2 && y <= barY + 5) ||
    (x >= tallyX - 2 && x <= tallyX + tallyW + 1 && y >= tallyY - 2 && y <= tallyY + 4)

  paintGrass(g, horizon, frame, grass, busy)
  paintDecor(g, horizon, view.night, (x, y) => !busy(x, y))
  if (view.night) paintFireflies(g, frame, horizon, (x, y) => !busy(x, y))
  paintTomato(g, view.mood, frame, tx, ty)
  if (view.time) paintDigits(g, view.time.text, view.time.color, dx, digitsY, view.time.shadow)
  if (view.bar) paintBar(g, barX, barY, BAR_W, view.bar.ratio, view.bar.fill, '#005f00', '#000000')
  paintTally(g, view.today.done, view.today.goal, tallyX, tallyY, view.today.empty)

  const bgOf = (row: number) => {
    const y = row * 2
    return y >= horizon ? grassAt(grass) : skyAt(y, horizon, skyColors)
  }
  const skyPx = (y: number) => skyAt(y, horizon, skyColors)
  // the open sky above the title is drawn at sextant resolution
  const hd = skyRows(w, titleRow, frame, view.night, skyColors, horizon)
  const cells = toCells(g, skyPx, y => skyCell(y, horizon, skyColors))
  overlay(cells, titleRow, 3, w, sub => {
    const bw = badgeWidth(view.title)
    paintBadge(sub, view.title, Math.floor((w * 2 - bw) / 4) * 2, 0)
  })
  overlay(cells, labelRow, 2, w, sub => {
    const lw = digitsWidth(view.today.label)
    paintDigits(sub, view.today.label, view.today.color, Math.floor((w * 2 - lw) / 4) * 2, 0)
  })
  return cells.map(mergeRuns).map((runs, row): Row => {
    if (row < titleRow) return { kind: 'pixels', runs: hd[row]! }
    if (row === footerRow && view.footer) return { kind: 'text', spans: centered(view.footer.spans, w), bg: view.footer.bg }
    return { kind: 'pixels', runs }
  })
}
