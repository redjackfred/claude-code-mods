// The open sky above the title, drawn at three times the pixel resolution: each
// terminal cell is a 2×3 grid of sub-pixels shown with a Unicode sextant glyph.
// A cell holds two colors (glyph and background), so each cell keeps its two most
// common sub-pixel colors. Cells with nothing in them use the shade-glyph gradient.
import { skyAt, skyCell } from './pixel'
import type { Run } from './pixel'

type Sub = string | null // null: plain sky

// sextant glyph for a 6-bit pattern (bit 0 top-left … bit 5 bottom-right)
export const sextant = (n: number) =>
  n === 0 ? ' ' : n === 63 ? '█' : n === 21 ? '▌' : n === 42 ? '▐'
  : String.fromCodePoint(0x1fb00 + n - 1 - (n > 21 ? 1 : 0) - (n > 42 ? 1 : 0))

const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0
// a sub-pixel is 3/4 as wide as it is tall: scale x when measuring round things
const AX = 0.75

const disc = (g: Sub[][], cx: number, cy: number, r: number, color: (x: number, y: number) => string | null) => {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r / AX); x <= cx + r / AX; x++)
      if (g[y]?.[x] !== undefined && Math.hypot((x - cx) * AX, y - cy) <= r) {
        const c = color(x, y)
        if (c) g[y]![x] = c
      }
}

// a shooting star now and then: a white head with a tail that dims behind it,
// each one starting somewhere new
const TAIL = ['#ffffff', '#d7d7ff', '#afafd7', '#8787af', '#5f5f87', '#3a3a3a']
const meteor = (g: Sub[][], frame: number) => {
  const h = g.length
  const w = g[0]?.length ?? 0
  const period = 22
  const age = frame % period
  if (age > 6) return
  const n = Math.floor(frame / period)
  const x0 = w * 0.35 + (hash(n, 31) % Math.max(1, Math.floor(w * 0.6)))
  const y0 = 1 + (hash(n, 32) % Math.max(1, Math.floor(h * 0.4)))
  // head moves down-left; the tail trails up-right, fading as the meteor burns out
  for (let k = 0; k < TAIL.length * 2; k++) {
    const x = Math.round(x0 - age * 4 + k * 1.33)
    const y = Math.round(y0 + age * 2 - k * 0.5)
    const shade = TAIL[Math.min(TAIL.length - 1, Math.floor(k / 2) + (age > 4 ? age - 4 : 0))]!
    if (g[y]?.[x] !== undefined) g[y]![x] = shade
  }
}

// a plane crossing slowly, its red and white lights blinking in turn
const plane = (g: Sub[][], frame: number) => {
  const h = g.length
  const w = g[0]?.length ?? 0
  const x = Math.floor(frame * 0.6) % (w + 30) - 15
  const y = Math.round(h * 0.28)
  const red = frame % 4 < 2
  if (g[y]?.[x] !== undefined) g[y]![x] = red ? '#ff5f5f' : '#3a3a3a'
  if (g[y]?.[x + 1] !== undefined) g[y]![x + 1] = '#4e4e4e'
  if (g[y]?.[x + 2] !== undefined) g[y]![x + 2] = red ? '#3a3a3a' : '#ffffff'
}

const stars = (g: Sub[][], frame: number) => {
  const h = g.length
  const w = g[0]?.length ?? 0
  const count = Math.floor((w * h) / 70)
  for (let i = 0; i < count; i++) {
    const x = hash(i, 21) % w
    const y = hash(i * 7 + 3, 22) % h
    const phase = (frame + i * 3) % 7
    if (phase > 4 || g[y]![x] !== null) continue
    g[y]![x] = phase === 0 ? '#ffffff' : phase < 3 ? '#d7d7ff' : '#8787af'
  }
}

const moon = (g: Sub[][]) => {
  const w = g[0]?.length ?? 0
  const cx = w - 10
  const cy = 6
  disc(g, cx, cy, 4.2, (x, y) => (Math.hypot((x - cx - 2.4) * AX, y - cy + 1.2) > 3.6 ? '#ffd7af' : null))
}

const sun = (g: Sub[][], frame: number) => {
  const w = g[0]?.length ?? 0
  const cx = w - 12
  const cy = 8
  for (let k = 0; k < 8; k++) {
    const angle = (k / 8) * Math.PI * 2 + frame * 0.08
    for (let d = 6.2; d <= 8.6; d += 0.5) {
      const x = Math.round(cx + (Math.cos(angle) * d) / AX)
      const y = Math.round(cy + Math.sin(angle) * d)
      if (g[y]?.[x] !== undefined) g[y]![x] = '#ffff87'
    }
  }
  disc(g, cx, cy, 4.8, (x, y) => (Math.hypot((x - cx) * AX, y - cy) > 4 ? '#ffaf00' : '#ffd75f'))
}

// a cloud: overlapping puffs over a flat base, shaded underneath
const cloud = (g: Sub[][], x0: number, y0: number, scale: number, light: string, shade: string) => {
  const puffs = [[0, 0, 3.2], [4.5, -1.8, 4.2], [9.5, -0.4, 3.6], [13, 0.8, 2.6]] as const
  for (const [dx, dy, r] of puffs)
    disc(g, x0 + (dx * scale) / AX, y0 + dy * scale, r * scale, (_, y) => (y > y0 + 2.4 * scale ? null : y > y0 + 0.8 * scale ? shade : light))
}

const clouds = (g: Sub[][], frame: number) => {
  const h = g.length
  const w = g[0]?.length ?? 0
  for (let i = 0; i < 3; i++) {
    const span = w + 40
    const x = ((hash(i, 5) % span) + Math.floor(frame / (2 + i))) % span - 30
    const y = Math.round(h * (0.3 + 0.5 * ((i * 0.37) % 1))) + 2
    cloud(g, x, y, i === 1 ? 0.8 : 1, '#ffffff', '#d7d7d7')
  }
}

const bird = (g: Sub[][], frame: number) => {
  const w = g[0]?.length ?? 0
  const bx = (frame * 2) % (w * 3) - 6
  if (bx > w) return
  const by = Math.round(g.length * 0.4 + Math.sin(frame / 2) * 2)
  const wings = frame % 2 ? [[-2, -1], [-1, 0], [0, 1], [1, 0], [2, -1]] : [[-2, 1], [-1, 0], [0, 0], [1, 0], [2, 1]]
  for (const [dx, dy] of wings) if (g[by + dy!]?.[bx + dx!] !== undefined) g[by + dy!]![bx + dx!] = '#005f87'
}

const dist = (a: string, b: string) =>
  [1, 3, 5].reduce((n, i) => n + (parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) ** 2, 0)

// one cell from its six sub-pixel colors (row-major, top-left first): it can show
// two colors, so the two most common win and the rest go to whichever is nearer
export const sextantCell = (colors: string[]): Run => {
  const count = new Map<string, number>()
  for (const c of colors) count.set(c, (count.get(c) ?? 0) + 1)
  const [bg, fg] = [...count.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])
  const bits = fg === undefined ? 0 : colors.reduce((n, c, k) => (dist(c, fg) < dist(c, bg!) ? n | (1 << k) : n), 0)
  return { text: sextant(bits), fg, bg }
}

// cell rows 0 .. rows-1 of the pane, for a sky whose gradient spans `span` half-block pixels
export const skyRows = (w: number, rows: number, frame: number, night: boolean, stops: readonly string[], span: number): Run[][] => {
  const g: Sub[][] = Array.from({ length: rows * 3 }, () => Array<Sub>(w * 2).fill(null))
  if (night) {
    stars(g, frame)
    plane(g, frame)
    meteor(g, frame)
    moon(g)
  } else {
    sun(g, frame)
    clouds(g, frame)
    bird(g, frame)
  }

  return Array.from({ length: rows }, (_, row) => {
    const runs: Run[] = []
    for (let cx = 0; cx < w; cx++) {
      // the cell's six sub-pixels, plain sky resolved to its band at that height
      const subs = [0, 1, 2].flatMap(dy => [0, 1].map(dx => g[row * 3 + dy]![cx * 2 + dx]!))
      const plain = (dy: number) => skyAt(row * 2 + (dy * 2 + 1) / 3, span, stops)
      let cell: Run
      if (subs.every(s => s === null)) cell = skyCell(row * 2, span, stops)
      else {
        cell = sextantCell(subs.map((s, k) => s ?? plain(Math.floor(k / 2))))
      }
      const last = runs[runs.length - 1]
      if (last && last.fg === cell.fg && last.bg === cell.bg && [...last.text][0] === cell.text) last.text += cell.text
      else runs.push(cell)
    }
    return runs
  })
}
