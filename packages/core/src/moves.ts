/**
 * Keyboard moves and resizes, in the terms of the view a window sits in.
 * The same key means "move this window right" everywhere, and each view
 * decides what that is: the next position in a split or a strip of tabs,
 * the next lane of a kanban board, a day later on a timeline, 40px over on
 * a canvas, the right-hand dock. All pure ops over a Doc (or immer draft).
 */
import { findSlot, getContainer, liftOut, moveSlot, resolvePath, viewAt } from './ops'
import type { Container, Doc, Path, Rect, ViewType } from './types'
import {
  canvasRects,
  dayIso,
  dayNum,
  DEFAULT_SCROLL_WIDTH,
  documentHeight,
  gridColumns,
  gridSpan,
  kanbanLanes,
  kanbanMeta,
  masterState,
  splitSizes,
  stepWidth,
  timelineMeta,
} from './viewMeta'

export type Dir = 'left' | 'right' | 'up' | 'down'
export const isHorizontal = (d: Dir) => d === 'left' || d === 'right'
export const sign = (d: Dir): -1 | 1 => (d === 'left' || d === 'up' ? -1 : 1)

/** Views where windows tile, so moving past the end moves out of the container (as in i3). */
const TILING: ViewType[] = ['split', 'tabs', 'scroll', 'grid', 'master', 'spiral']

/** Which axis a linear view orders along ('both' for wrapping layouts). */
function linearAxis(c: Container, view: ViewType): 'h' | 'v' | 'both' | null {
  switch (view) {
    case 'split':
      return (c.viewState.split?.direction ?? 'row') === 'row' ? 'h' : 'v'
    case 'tabs':
    case 'scroll':
      return 'h'
    case 'document':
    case 'outline':
    case 'table':
    case 'json':
      return 'v'
    case 'grid':
    case 'spiral':
    case 'master':
      return 'both'
    default:
      return null
  }
}

function parentOf(doc: Doc, path: Path) {
  const parentPath = path.slice(0, -1)
  const parent = resolvePath(doc, parentPath).nodes.at(-1) as Container
  return { parentPath, parent, view: viewAt(doc, parentPath), slotId: path[path.length - 1] }
}

/**
 * Move the window at `path` one step in `dir` within its parent. Returns its
 * (possibly new) path, or null when the parent can't move it that way.
 */
export function moveWithin(doc: Doc, path: Path, dir: Dir): Path | null {
  if (!path.length) return null
  const { parent, view, slotId } = parentOf(doc, path)
  const i = parent.slots.findIndex((s) => s.id === slotId)
  const slot = parent.slots[i]
  const swapTo = (j: number) => {
    if (j < 0 || j >= parent.slots.length) return null
    moveSlot(doc, parent.id, slotId, parent.id, { index: j > i ? j + 1 : j })
    return path
  }
  const axis = linearAxis(parent, view)
  if (axis) {
    if (axis === 'both' || (axis === 'h') === isHorizontal(dir)) return swapTo(i + sign(dir))
    return null
  }
  switch (view) {
    case 'canvas':
    case 'floating': {
      const v = view as 'canvas' | 'floating'
      const r: Rect = slot.meta[v] ?? canvasRects(parent, v)[i]
      const step = 40
      slot.meta[v] = {
        ...r,
        x: r.x + (isHorizontal(dir) ? sign(dir) * step : 0),
        y: r.y + (isHorizontal(dir) ? 0 : sign(dir) * step),
      }
      return path
    }
    case 'dock': {
      // up/down step through top · main · bottom; left/right dock to that side
      const cur = slot.meta.dock?.side ?? 'main'
      const vertical = ['top', 'main', 'bottom'] as const
      const vi = vertical.indexOf(cur as (typeof vertical)[number])
      const side =
        dir === 'left' || dir === 'right'
          ? dir
          : vertical[Math.max(0, Math.min(2, (vi < 0 ? 1 : vi) + (dir === 'up' ? -1 : 1)))]
      slot.meta.dock = { ...slot.meta.dock, side, collapsed: false }
      return path
    }
    case 'kanban': {
      const lanes = kanbanLanes(parent)
      const metas = kanbanMeta(parent)
      const lane = metas[i].lane
      if (isHorizontal(dir)) {
        const next = lanes[lanes.indexOf(lane) + sign(dir)]
        if (next === undefined) return null
        slot.meta.kanban = { lane: next }
        return path
      }
      // up/down: swap with the neighbouring card in the same lane
      const same = parent.slots.map((_, j) => j).filter((j) => metas[j].lane === lane)
      const k = same.indexOf(i) + sign(dir)
      if (k < 0 || k >= same.length) return null
      slot.meta.kanban = { lane } // store the lane it's shown in
      return swapTo(same[k])
    }
    case 'timeline': {
      if (!isHorizontal(dir)) return null
      const m = timelineMeta(parent)[i]
      const d = sign(dir)
      slot.meta.timeline = { start: dayIso(dayNum(m.start) + d), end: dayIso(dayNum(m.end) + d) }
      return path
    }
    default:
      return null
  }
}

/**
 * The keyboard "move": within the parent if it can, otherwise (in tiling
 * views) out of the parent, beside it in the grandparent.
 */
export function moveWindow(doc: Doc, path: Path, dir: Dir): Path | null {
  const moved = moveWithin(doc, path, dir)
  if (moved) return moved
  if (path.length < 2 || !TILING.includes(viewAt(doc, path.slice(0, -1)))) return null
  return liftOut(doc, path, sign(dir))
}

/**
 * Grow (+1) or shrink (-1) the window at `path` in its parent's terms. If
 * the parent has no notion of size, the nearest ancestor that does is
 * resized instead. Returns the path that was resized, or null.
 */
export function resizeWindow(doc: Doc, path: Path, delta: 1 | -1): Path | null {
  for (let p = path; p.length; p = p.slice(0, -1)) {
    if (resizeIn(doc, p, delta)) return p
  }
  return null
}

function resizeIn(doc: Doc, path: Path, delta: 1 | -1): boolean {
  const { parent, view, slotId } = parentOf(doc, path)
  const i = parent.slots.findIndex((s) => s.id === slotId)
  const slot = findSlot(parent, slotId)
  switch (view) {
    case 'split': {
      if (parent.slots.length < 2) return false
      const sizes = splitSizes(parent)
      parent.slots.forEach((s, j) => (s.meta.split = { size: j === i ? sizes[j] * 1.25 ** delta : sizes[j] }))
      return true
    }
    case 'scroll':
      slot.meta.scroll = { width: stepWidth(slot.meta.scroll?.width ?? DEFAULT_SCROLL_WIDTH, delta) }
      return true
    case 'grid': {
      const span = gridSpan(slot)
      const colSpan = Math.max(1, Math.min(gridColumns(parent), span.colSpan + delta))
      if (colSpan === span.colSpan) return false
      slot.meta.grid = { ...span, colSpan }
      return true
    }
    case 'master': {
      const st = masterState(parent)
      const isMain = i < Math.max(1, st.count)
      const ratio = Math.max(0.15, Math.min(0.85, st.ratio + (isMain ? 0.05 : -0.05) * delta))
      getContainer(doc, parent.id).viewState.master = { ...st, ratio }
      return true
    }
    case 'canvas':
    case 'floating': {
      const v = view as 'canvas' | 'floating'
      const r: Rect = slot.meta[v] ?? canvasRects(parent, v)[i]
      const k = 1.15 ** delta
      slot.meta[v] = { ...r, w: Math.max(120, r.w * k), h: Math.max(80, r.h * k) }
      return true
    }
    case 'document':
      slot.meta.document = { height: Math.max(80, documentHeight(slot) + 60 * delta) }
      return true
    case 'timeline': {
      const m = timelineMeta(parent)[i]
      const end = Math.max(dayNum(m.start), dayNum(m.end) + delta)
      slot.meta.timeline = { start: m.start, end: dayIso(end) }
      return true
    }
    default:
      return false
  }
}
