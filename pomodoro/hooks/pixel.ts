// A tiny pixel canvas drawn with half blocks: each terminal cell holds two
// pixels, the top one as the text color of ▀ and the bottom one as its background.

export type Px = string | null
export type Grid = Px[][]
export type Run = { text: string; fg?: string; bg?: string }
export type Mood = 'focus' | 'hurry' | 'sleep' | 'cheer'

// every color here is an exact xterm-256 color: Claude Code draws in 256 colors,
// so anything in between would be rounded to a neighbor and shift
const PAL: Record<string, string> = {
  g: '#008700', // stem, dark
  G: '#5fd75f', // leaf
  r: '#af0000', // tomato shade
  R: '#d70000', // tomato
  H: '#ffafaf', // highlight
  W: '#ffffff', // eye white
  K: '#121212', // pupil, mouth
  P: '#ff87af', // blush
  S: '#5fd7ff', // sweat
  Y: '#ffd75f', // sparkle
  Z: '#afafff', // sleepy z
}

// 16×16 tomato; rows 6-7 are the eyes, row 1 the leaves
const TOMATO = [
  '.......gg.......',
  '....gGGggGGg....',
  '...rRRgGGgRRr...',
  '..rRRRRggRRRRr..',
  '.rRHHRRRRRRRRRr.',
  '.rRHRRRRRRRRRRr.',
  'rRRRWWRRRRWWRRRr',
  'rRRRWKRRRRWKRRRr',
  'rRRRRRRRRRRRRRRr',
  'rRPPRRKRRKRRPPRr',
  'rRRRRRRKKRRRRRRr',
  '.rRRRRRRRRRRRRr.',
  '.rrRRRRRRRRRRrr.',
  '..rrRRRRRRRRrr..',
  '...rrrrrrrrrr...',
  '................',
]
const LEAVES_SWAY = '...gGGGggGGGg...'
const EYES_SHUT = ['rRRRRRRRRRRRRRRr', 'rRRRKKRRRRKKRRRr']
const MOUTH_O = ['rRPPRRRKKRRRPPRr', 'rRRRRRRKKRRRRRRr']
const ZED = ['1111', '0001', '0110', '1000', '1111']
const ZED_SMALL = ['111', '011', '110', '111']
export const TOMATO_SIZE = 16

const FONT: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  ':': ['0', '1', '0', '1', '0'],
  '/': ['001', '001', '010', '100', '100'],
  '+': ['000', '010', '111', '010', '000'],
  ' ': ['0', '0', '0', '0', '0'],
  T: ['111', '010', '010', '010', '010'],
  F: ['111', '100', '110', '100', '100'],
  C: ['011', '100', '100', '100', '011'],
  U: ['101', '101', '101', '101', '111'],
  S: ['011', '100', '010', '001', '110'],
  B: ['110', '101', '110', '101', '110'],
  R: ['110', '101', '110', '101', '101'],
  E: ['111', '100', '110', '100', '111'],
  K: ['101', '101', '110', '101', '101'],
  P: ['110', '101', '110', '100', '100'],
  M: ['101', '111', '101', '101', '101'],
  O: ['010', '101', '101', '101', '010'],
  D: ['110', '101', '101', '101', '110'],
  A: ['010', '101', '111', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
}

// sky bands from the top of the pane down to the horizon (xterm-256 colors)
export const SKIES = {
  focus: ['#005faf', '#0087d7', '#0087ff', '#5fafff', '#87d7ff', '#afd7ff', '#d7ffff'],
  night: ['#000000', '#080808', '#121212', '#1c1c1c', '#00005f'],
} as const
// [blade tip, field, field, tuft] (xterm-256 colors)
export const GRASS = {
  focus: ['#87d75f', '#5faf5f', '#5faf5f', '#5f875f'],
  night: ['#00af87', '#005f5f', '#005f5f', '#005f00'],
} as const

export const mix = (a: string, b: string, t: number) =>
  '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t)
    .toString(16).padStart(2, '0')).join('')

// Claude Code draws in xterm's 256 colors here, so a smooth gradient would round
// into hard steps. Plain sky cells are drawn with the font's shade glyphs instead
// (░ ▒ ▓ over the band's color), which blend two palette colors at the font's own
// fine stipple, five steps between each pair of bands; cells with something drawn
// in them fall back to half-block pixels on the nearest band.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
export const bayer = (x: number, y: number) => (BAYER[(y % 4) * 4 + (x % 4)]! + 0.5) / 16

// a pixel nothing has drawn on yet: still plain sky
export const SKY = '~'

const bandPos = (y: number, span: number, stops: readonly string[]) => {
  const t = Math.min(1, Math.max(0, span > 1 ? y / (span - 1) : 0)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(t))
  return { i, f: t - i }
}

// one flat color for a pixel or a whole text row: the nearest band
export const skyAt = (y: number, span: number, stops: readonly string[]) => {
  const { i, f } = bandPos(y, span, stops)
  return stops[f >= 0.5 ? i + 1 : i]!
}

const SHADES = [' ', '░', '▒', '▓']
// a plain sky cell for the cell row whose pixels are y and y + 1
export const skyCell = (y: number, span: number, stops: readonly string[]): Run => {
  const { i, f } = bandPos(y + 0.5, span, stops)
  const level = Math.round(f * 4)
  return level === 4 ? { text: ' ', bg: stops[i + 1]! } : level === 0 ? { text: ' ', bg: stops[i]! } : { text: SHADES[level]!, fg: stops[i + 1]!, bg: stops[i]! }
}

// nearest palette color, for colors made by mixing
const CUBE = [0, 95, 135, 175, 215, 255]
export const snap = (color: string) =>
  '#' + [1, 3, 5].map(i => {
    const v = parseInt(color.slice(i, i + 2), 16)
    return CUBE.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)).toString(16).padStart(2, '0')
  }).join('')

// a w×h canvas of plain sky, resolved to colors when it becomes runs
export const sky = (w: number, h: number): Grid => Array.from({ length: h }, () => Array<Px>(w).fill(SKY))

const stamp = (g: Grid, rows: string[], x: number, y: number, color?: string) =>
  rows.forEach((row, dy) =>
    [...row].forEach((ch, dx) => {
      const c = color ? (ch === '1' ? color : null) : ch === '.' ? null : PAL[ch]!
      const line = g[y + dy]
      if (c && line && x + dx >= 0 && x + dx < line.length) line[x + dx] = c
    }),
  )

// the tomato with its top-left at (tx, ty), and its mood's effects around it
export const paintTomato = (g: Grid, mood: Mood, frame: number, tx: number, ty: number) => {
  const art = [...TOMATO]
  if (frame % 2 === 1) art[1] = LEAVES_SWAY
  const blink = mood !== 'sleep' && frame % 12 === 0
  if (mood === 'sleep' || blink) [art[6], art[7]] = EYES_SHUT as [string, string]
  if (mood === 'cheer') [art[9], art[10]] = MOUTH_O as [string, string]
  const bob = mood === 'cheer' && frame % 2 === 0 ? -1 : 0
  stamp(g, art, tx, ty + bob)

  if (mood === 'hurry') stamp(g, ['S', 'S'], tx + 16, ty + 1 + (frame % 3))
  if (mood === 'cheer') {
    const spots = frame % 2 === 0 ? [[-2, -1], [17, 1], [20, 11]] : [[-1, 11], [18, -2], [21, 5]]
    for (const [dx, dy] of spots) stamp(g, ['Y'], tx + dx!, ty + dy!)
  }
  if (mood === 'sleep') {
    const rise = frame % 6
    stamp(g, ZED, tx + 18, ty + 6 - rise, PAL.Z)
    if (rise > 1) stamp(g, ZED_SMALL, tx + 21, ty + 2 - rise, PAL.Z)
  }
}



const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0

// grass from `horizon` down: swaying blades on the edge, a soil gradient, tufts and
// flowers; pixels in `plain` stay flat soil so text and digits sit cleanly on them
export const paintGrass = (g: Grid, horizon: number, frame: number, colors: readonly string[], plain: (x: number, y: number) => boolean) => {
  const [tip, top, , tuft] = colors as [string, string, string, string]
  const h = g.length
  const w = g[0]?.length ?? 0
  for (let y = horizon; y < h; y++) g[y]!.fill(top)
  for (let x = 0; x < w; x++) {
    const tall = hash(x, 1) % 3
    const lean = (hash(x, 2) % 2 === 0) !== (frame % 4 < 2) ? 1 : 0
    for (let k = 1; k <= tall; k++) {
      const bx = x + (k === tall ? lean : 0)
      if (g[horizon - k] && bx < w) g[horizon - k]![bx] = k === tall ? tip : top
    }
    if (g[horizon]) g[horizon]![x] = hash(x, 3) % 3 === 0 ? tip : top
  }
  // short two-pixel blades scattered through the field: a lit tip over a darker base
  const lit = tip
  for (let y = horizon + 3; y < h - 1; y++)
    for (let x = 0; x < w; x++) {
      if (hash(x, y) % 23 !== 0 || plain(x, y) || plain(x, y + 1)) continue
      g[y]![x] = lit
      g[y + 1]![x] = tuft
    }
}

export const grassAt = (colors: readonly string[]) => colors[1]!

// a 4px-tall rounded pixel progress bar: outline, a highlight row and a fill row
export const paintBar = (g: Grid, x0: number, y0: number, width: number, ratio: number, fill: readonly [string, string], empty: string, outline: string) => {
  const done = Math.round(Math.min(1, Math.max(0, ratio)) * (width - 2))
  for (let x = 0; x < width; x++) {
    const edge = x === 0 || x === width - 1
    const line0 = g[y0]
    const line3 = g[y0 + 3]
    if (!edge && line0) line0[x0 + x] = outline
    if (!edge && line3) line3[x0 + x] = outline
    for (const dy of [1, 2]) {
      const line = g[y0 + dy]
      if (!line) continue
      if (edge) line[x0 + x] = outline
      else {
        const i = x - 1
        const c = i < done ? mix(fill[0], fill[1], done > 1 ? i / (done - 1) : 0) : empty
        line[x0 + x] = snap(i < done && dy === 1 ? mix(c, '#ffffff', 0.35) : c)
      }
    }
  }
}

// a rounded pixel badge: a label section and an optional darker value section,
// text in the pixel font
export type Badge = { label: string; value?: string; bg: string; fg: string; valueBg: string; valueFg: string }
// sections are padded to even widths so, drawn from an even x at sextant resolution
// (two sub-pixels per cell), every cell holds at most two colors and stays crisp
const even = (n: number) => n + (n % 2)
export const badgeWidth = (b: Badge) => even(digitsWidth(b.label) + 4) + (b.value ? even(digitsWidth(b.value) + 4) : 0)
// 9 rows tall (exactly three cells at sextant resolution, so its edges fall on cell
// edges): the text with two rows of padding above and below, corners rounded
export const BADGE_H = 9
export const paintBadge = (g: Grid, b: Badge, x0: number, y0: number) => {
  const lw = even(digitsWidth(b.label) + 4)
  const total = badgeWidth(b)
  for (let y = 0; y < BADGE_H; y++)
    for (let x = 0; x < total; x++) {
      const corner = (x === 0 || x === total - 1) && (y === 0 || y === BADGE_H - 1)
      if (!corner && g[y0 + y]?.[x0 + x] !== undefined) g[y0 + y]![x0 + x] = b.value && x >= lw ? b.valueBg : b.bg
    }
  paintDigits(g, b.label, b.fg, x0 + 2, y0 + 2)
  if (b.value) paintDigits(g, b.value, b.valueFg, x0 + lw + 2, y0 + 2)
}

// a 3×4 tomato for the daily tally: lit when done, a faint silhouette when not
const MINI = ['.G.', 'RRR', 'RRR', 'rrr']
const MINI_SHAPE = MINI.map(r => r.replace(/[^.]/g, '1'))
export const MINI_W = 3
export const paintTally = (g: Grid, done: number, goal: number, x0: number, y0: number, empty: string) => {
  for (let i = 0; i < goal; i++)
    if (i < done) stamp(g, MINI, x0 + i * (MINI_W + 1), y0)
    else stamp(g, MINI_SHAPE, x0 + i * (MINI_W + 1), y0, empty)
}

export const digitsWidth = (text: string) =>
  [...text].reduce((n, ch) => n + (FONT[ch]?.[0]!.length ?? 0) + 1, -1)

// digits with a 1px drop shadow straight below, like an old handheld's score
export const paintDigits = (g: Grid, text: string, color: string, x0: number, y0: number, shadow?: string) => {
  for (const [dx, c] of shadow ? ([[1, shadow], [0, color]] as const) : ([[0, color]] as const)) {
    let x = x0 + dx
    for (const ch of text) {
      const glyph = FONT[ch]
      if (!glyph) continue
      stamp(g, glyph, x - dx, y0 + dx, c)
      x += glyph[0]!.length + 1
    }
  }
}

// sprites: one char per pixel, '.' clear; colors from the sprite's own key
type Sprite = { rows: string[]; key: Record<string, string> }
const DECOR: Sprite[] = [
  { rows: ['.p.', 'ppp', '.g.', 'gg.'], key: { p: '#ffafd7', g: '#008700' } }, // tulip
  { rows: ['.w.', 'wyw', '.w.', '.g.'], key: { w: '#ffffff', y: '#ffd75f', g: '#008700' } }, // daisy
  { rows: ['.MM.', 'MwMM', '.ss.'], key: { M: '#d70000', w: '#ffffff', s: '#ffffd7' } }, // mushroom
  { rows: ['.oo', 'ooo'], key: { o: '#878787' } }, // rock
  { rows: ['.y.', 'yoy', '.g.', '.g.'], key: { y: '#ffd75f', o: '#ff875f', g: '#008700' } }, // marigold
]
const NIGHT_KEY: Record<string, string> = { M: '#5fd7ff', w: '#d7ffff', g: '#005f5f', s: '#afafd7', o: '#5f5f87' } // mushrooms glow at night
// moonlight: everything else shifts toward periwinkle and dims a little
const moonlit = (c: string, ch: string) => NIGHT_KEY[ch] ?? snap(mix(mix(c, '#8fa0ff', 0.4), '#0b0b1a', 0.2))

const fits = (g: Grid, sp: Sprite, x: number, y: number, free: (x: number, y: number) => boolean) =>
  sp.rows.every((row, dy) => [...row].every((_, dx) => g[y + dy]?.[x + dx] !== undefined && free(x + dx, y + dy)))

const draw = (g: Grid, sp: Sprite, x: number, y: number, tint?: (c: string, ch: string) => string) =>
  sp.rows.forEach((row, dy) =>
    [...row].forEach((ch, dx) => {
      const line = g[y + dy]
      const c = sp.key[ch]
      if (c && line && x + dx >= 0 && x + dx < line.length) line[x + dx] = tint ? tint(c, ch) : c
    }),
  )



// a sparse scatter of flowers, mushrooms and rocks across the field
export const paintDecor = (g: Grid, horizon: number, night: boolean, free: (x: number, y: number) => boolean) => {
  const h = g.length
  const w = g[0]?.length ?? 0
  const tint = night ? moonlit : undefined

  // each decoration tries a few heights until one fits
  const room = Math.max(1, h - horizon - 7)
  for (let x = 2, i = 0; x < w - 3; i++) {
    const sp = DECOR[hash(x, i) % DECOR.length]!
    for (let k = 0; k < 6; k++) {
      const y = horizon + 3 + (hash(i + k * 13, x) % room)
      if (fits(g, sp, x, y, free)) {
        draw(g, sp, x, y, tint)
        break
      }
    }
    x += 7 + (hash(i, 7) % 5)
  }
}

// night only: a few fireflies that drift and blink just above the grass
export const paintFireflies = (g: Grid, frame: number, horizon: number, free: (x: number, y: number) => boolean) => {
  const w = g[0]?.length ?? 0
  for (let i = 0; i < 4; i++) {
    if ((frame + i * 2) % 5 > 2) continue
    const x = (hash(i, 9) % w + Math.round(Math.sin((frame + i * 5) / 3) * 2) + w) % w
    const y = horizon - 6 + (hash(i, 11) % 4) + (frame % 4 < 2 ? 0 : 1)
    if (g[y] && free(x, y)) g[y]![x] = (frame + i) % 3 ? '#d7ff87' : '#ffffaf'
  }
}

// one Run per cell, row by row: half blocks for drawn pixels; a cell of plain sky
// becomes `skyCell(y)`, a plain sky pixel next to a drawn one `skyPx(y)`
export const toCells = (g: Grid, skyPx: (y: number) => string = () => '#000000', skyCell?: (y: number) => Run): Run[][] => {
  const out: Run[][] = []
  for (let y = 0; y < g.length; y += 2)
    out.push(
      g[y]!.map((rawT, x) => {
        const rawB = g[y + 1]?.[x] ?? null
        const t = rawT === SKY ? skyPx(y) : rawT
        const b = rawB === SKY ? skyPx(y + 1) : rawB
        return rawT === SKY && rawB === SKY && skyCell ? { ...skyCell(y) }
          : t && b ? { text: '▀', fg: t, bg: b }
          : t ? { text: '▀', fg: t }
          : b ? { text: '▄', fg: b }
          : { text: ' ' }
      }),
    )
  return out
}

// adjacent cells of the same look merged into one run
export const mergeRuns = (cells: Run[]): Run[] =>
  cells.reduce<Run[]>((runs, cell) => {
    const last = runs[runs.length - 1]
    if (last && last.fg === cell.fg && last.bg === cell.bg && [...last.text][0] === cell.text) last.text += cell.text
    else runs.push({ ...cell })
    return runs
  }, [])

export const toRuns = (g: Grid, skyPx?: (y: number) => string, skyCell?: (y: number) => Run): Run[][] =>
  toCells(g, skyPx, skyCell).map(mergeRuns)
