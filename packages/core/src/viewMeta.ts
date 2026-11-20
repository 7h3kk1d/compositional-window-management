import type { Container, DockSide, Rect, Slot, SlotMeta, SlotMetaView } from './types'

/**
 * Derived defaults: when a slot has no stored metadata for the active view
 * (e.g. it was created while the container was shown as tabs), we *derive*
 * a value for rendering. Derived values are not written back until the user
 * interacts in that view (or runs "Materialize derived layout").
 */

export const DEFAULT_W = 340
export const DEFAULT_H = 240

export function isDerived(slot: Slot, view: SlotMetaView): boolean {
  return slot.meta[view] === undefined
}

/** Canvas: unplaced windows cascade to the right of the placed ones. */
export function canvasRects(c: Container, view: 'canvas' | 'floating'): Rect[] {
  const placed = c.slots.map((s) => s.meta[view]).filter((r): r is Rect => !!r)
  let maxZ = placed.reduce((m, r) => Math.max(m, r.z), 0)
  let originX: number
  let originY: number
  if (view === 'floating' || placed.length === 0) {
    originX = 24
    originY = 24
  } else {
    originX = Math.max(...placed.map((r) => r.x + r.w)) + 48
    originY = Math.min(...placed.map((r) => r.y))
  }
  // Canvas: unplaced windows flow into a wrapped grid. Floating: a cascade.
  const cols = 3
  let k = 0
  return c.slots.map((s) => {
    const stored = s.meta[view]
    if (stored) return stored
    const i = k++
    const flow = view === 'canvas'
    return {
      x: flow ? originX + (i % cols) * (DEFAULT_W + 24) : originX + i * 32,
      y: flow ? originY + Math.floor(i / cols) * (DEFAULT_H + 24) : originY + i * 32,
      w: DEFAULT_W,
      h: DEFAULT_H,
      z: ++maxZ,
    }
  })
}

/** Split: stored sizes are flex weights; unsized slots get the mean weight. */
export function splitSizes(c: Container): number[] {
  const stored = c.slots.map((s) => s.meta.split?.size)
  const known = stored.filter((x): x is number => x !== undefined)
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1
  const raw = stored.map((x) => x ?? fallback)
  const total = raw.reduce((a, b) => a + b, 0) || 1
  return raw.map((x) => (x / total) * 100)
}

export function gridSpan(slot: Slot) {
  return slot.meta.grid ?? { colSpan: 1, rowSpan: 1 }
}

export function gridColumns(c: Container) {
  return c.viewState.grid?.columns ?? Math.max(1, Math.ceil(Math.sqrt(c.slots.length)))
}

const DERIVED_DOCK_SIDES: DockSide[] = ['main', 'left', 'right']
export function dockMeta(slot: Slot, index: number) {
  return (
    slot.meta.dock ?? {
      side: DERIVED_DOCK_SIDES[index] ?? 'bottom',
      collapsed: false,
    }
  )
}

export function documentHeight(slot: Slot) {
  return slot.meta.document?.height ?? 280
}

// ------------------------------------------------------------ scrolling tiler

export const SCROLL_WIDTHS = [1 / 3, 1 / 2, 2 / 3, 1]
export const DEFAULT_SCROLL_WIDTH = 1 / 2

/** The next preset width up or down from `w` (wrapping around). */
export function stepWidth(w: number, dir: 1 | -1) {
  const i = SCROLL_WIDTHS.findIndex((x) => Math.abs(x - w) < 0.01)
  if (i < 0)
    return dir > 0 ? (SCROLL_WIDTHS.find((x) => x > w) ?? 1) : ([...SCROLL_WIDTHS].reverse().find((x) => x < w) ?? SCROLL_WIDTHS[0])
  return SCROLL_WIDTHS[(i + dir + SCROLL_WIDTHS.length) % SCROLL_WIDTHS.length]
}

/** One column per child; unsized columns get the default width. */
export function scrollMeta(c: Container): { width: number }[] {
  return c.slots.map((s) => ({ width: s.meta.scroll?.width ?? DEFAULT_SCROLL_WIDTH }))
}

// ------------------------------------------------------------ master + stack

export const masterState = (c: Container) => c.viewState.master ?? { ratio: 0.6, count: 1 }

// ------------------------------------------------------------ kanban

export const DEFAULT_LANES = ['To do', 'Doing', 'Done']

/** The lane list, plus any lane a child still names (data is never hidden). */
export function kanbanLanes(c: Container): string[] {
  const lanes = [...(c.viewState.kanban?.lanes ?? DEFAULT_LANES)]
  for (const s of c.slots) {
    const l = s.meta.kanban?.lane
    if (l !== undefined && !lanes.includes(l)) lanes.push(l)
  }
  return lanes
}

export function newLaneName(c: Container) {
  const lanes = kanbanLanes(c)
  let n = lanes.length + 1
  while (lanes.includes(`Lane ${n}`)) n++
  return `Lane ${n}`
}

/** Unplaced cards start in the first lane. */
export function kanbanMeta(c: Container): { lane: string }[] {
  const first = kanbanLanes(c)[0] ?? DEFAULT_LANES[0]
  return c.slots.map((s) => s.meta.kanban ?? { lane: first })
}

// ------------------------------------------------------------ timeline

const DAY = 86_400_000
export const dayNum = (iso: string) => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY)
export const dayIso = (n: number) => new Date(n * DAY).toISOString().slice(0, 10)
export const todayNum = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / DAY)
export const DERIVED_SPAN_DAYS = 3
export const DEFAULT_DAY_WIDTH = 80
export const dayWidthOf = (c: Container) => c.viewState.timeline?.dayWidth ?? DEFAULT_DAY_WIDTH

/** Undated windows are laid end to end after the dated ones (or from today). */
export function timelineMeta(c: Container): { start: string; end: string }[] {
  const ends = c.slots.map((s) => s.meta.timeline?.end).filter((x): x is string => !!x)
  let cursor = ends.length ? Math.max(...ends.map(dayNum)) + 1 : todayNum()
  return c.slots.map((s) => {
    if (s.meta.timeline) return s.meta.timeline
    const start = cursor
    cursor += DERIVED_SPAN_DAYS
    return { start: dayIso(start), end: dayIso(start + DERIVED_SPAN_DAYS - 1) }
  })
}

/** The value a view would render for each slot, stored or derived. */
export function resolvedMeta(c: Container, view: SlotMetaView): SlotMeta[SlotMetaView][] {
  switch (view) {
    case 'canvas':
    case 'floating':
      return canvasRects(c, view)
    case 'split':
      return splitSizes(c).map((size) => ({ size }))
    case 'grid':
      return c.slots.map(gridSpan)
    case 'dock':
      return c.slots.map(dockMeta)
    case 'document':
      return c.slots.map((s) => ({ height: documentHeight(s) }))
    case 'scroll':
      return scrollMeta(c)
    case 'kanban':
      return kanbanMeta(c)
    case 'timeline':
      return timelineMeta(c)
  }
}
