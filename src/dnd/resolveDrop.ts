/**
 * Turns "pointer is over droppable X at (x, y)" into a concrete drop intent.
 * Used both for the live preview overlay and for the drop itself, so what
 * you see is what you get.
 */
import type { Edge } from '../model/ops'
import type { NodeId, Path, SlotId } from '../model/types'
import { dropAdapters, type DropPlacement } from './dropAdapters'
import { pathKey } from '../model/store'

export interface DragData {
  fromId: NodeId
  slotId: SlotId
  nodeId: NodeId
  path: Path
  title: string
}

export type DropData =
  | { kind: 'container'; containerId: NodeId; path: Path; title: string; noSplit?: boolean }
  /** A band around the workspace edge: splits the whole desktop. */
  | { kind: 'edge'; edge: Edge; path: Path; title: string }
  /** A leaf window: its edges split it, its middle drops into its parent. */
  | { kind: 'leaf'; parentId: NodeId; parentPath: Path; path: Path; title: string; noSplit?: boolean }
  | {
      kind: 'tab'
      /** The tabs container that owns this tab. */
      parentId: NodeId
      parentPath: Path
      /** The node shown by this tab, and whether it can receive children. */
      nodeId: NodeId
      childPath: Path
      isContainer: boolean
      title: string
    }

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export type DropIntent =
  /** Insert into a container using its view's own placement semantics. */
  | { kind: 'into'; containerId: NodeId; path: Path; placement: DropPlacement | null; rect: Rect; label: string }
  /** Replace the target with a split holding target + dragged. */
  | { kind: 'split'; path: Path; edge: Edge; rect: Rect; label: string }

const EDGE_PX = 48

function edgeZone(r: Rect, x: number, y: number): Edge | null {
  const tx = Math.min(EDGE_PX, r.width * 0.22)
  const ty = Math.min(EDGE_PX, r.height * 0.22)
  const d = [
    ['left', x - r.left, tx],
    ['right', r.left + r.width - x, tx],
    ['top', y - r.top, ty],
    ['bottom', r.top + r.height - y, ty],
  ] as const
  const hits = d.filter(([, dist, t]) => dist < t).sort((a, b) => a[1] / a[2] - b[1] / b[2])
  return hits[0]?.[0] ?? null
}

function half(r: Rect, edge: Edge): Rect {
  switch (edge) {
    case 'left':
      return { ...r, width: r.width / 2 }
    case 'right':
      return { ...r, left: r.left + r.width / 2, width: r.width / 2 }
    case 'top':
      return { ...r, height: r.height / 2 }
    case 'bottom':
      return { ...r, top: r.top + r.height / 2, height: r.height / 2 }
  }
}

/** Is the pointer over a tab bar (where top-edge splitting would fight with reordering)? */
function overTabBar(x: number, y: number) {
  return document.elementsFromPoint(x, y).some((el) => el.closest('.tab-bar'))
}

export function resolveDrop(over: DropData, rect: Rect, x: number, y: number): DropIntent {
  if (over.kind === 'edge') {
    // copy into a plain object: DOMRect fields are prototype getters, which `...` would drop
    const r = document.querySelector('.workspace > .frame')?.getBoundingClientRect() ?? rect
    const ws = { left: r.left, top: r.top, width: r.width, height: r.height }
    return { kind: 'split', path: [], edge: over.edge, rect: half(ws, over.edge), label: 'Split beside everything' }
  }
  if (over.kind === 'tab') {
    const fx = (x - rect.left) / rect.width
    if (over.isContainer && fx > 0.25 && fx < 0.75) {
      return {
        kind: 'into',
        containerId: over.nodeId,
        path: over.childPath,
        placement: null, // the target may not be rendered: use its default placement
        rect,
        label: `Into “${over.title}”`,
      }
    }
    // reorder within the tab strip
    const placement = dropAdapters.get(pathKey(over.parentPath))?.(x, y) ?? {}
    const bar = fx <= 0.5 ? rect.left - 1 : rect.left + rect.width - 2
    return {
      kind: 'into',
      containerId: over.parentId,
      path: over.parentPath,
      placement,
      rect: { left: bar, top: rect.top, width: 3, height: rect.height },
      label: 'Reorder',
    }
  }
  const edge = over.noSplit || overTabBar(x, y) ? null : edgeZone(rect, x, y)
  if (over.kind === 'leaf' && !edge) {
    return {
      kind: 'into',
      containerId: over.parentId,
      path: over.parentPath,
      placement: dropAdapters.get(pathKey(over.parentPath))?.(x, y) ?? {},
      rect,
      label: 'Move here',
    }
  }
  if (edge)
    return {
      kind: 'split',
      path: over.path,
      edge,
      rect: half(rect, edge),
      label: `Split beside “${over.title}”`,
    }
  if (over.kind !== 'container') throw new Error('unreachable')
  return {
    kind: 'into',
    containerId: over.containerId,
    path: over.path,
    placement: dropAdapters.get(pathKey(over.path))?.(x, y) ?? {},
    rect,
    label: `Into “${over.title}”`,
  }
}
