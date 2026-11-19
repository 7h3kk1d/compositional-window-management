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
  }
}
