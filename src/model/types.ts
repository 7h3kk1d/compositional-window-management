/**
 * The document is a DAG of nodes. Containers hold *slots*; a slot is an edge
 * (a reference to a node) and carries the per-view metadata for that child in
 * that parent. Because metadata lives on the edge, the same node can be
 * mirrored into several parents with different positions/sizes in each.
 *
 * Every view's metadata is kept side by side ("the lens complement"), so
 * switching a container from canvas -> tabs -> canvas round-trips exactly.
 * Edits made while a view is active only write that view's key, so slots
 * created in tabs have no canvas position until one is derived/materialized.
 */

export type NodeId = string
export type SlotId = string

export const VIEW_TYPES = [
  'tabs',
  'split',
  'canvas',
  'floating',
  'grid',
  'dock',
  'document',
  'outline',
  'json',
] as const
export type ViewType = (typeof VIEW_TYPES)[number]

export interface Rect {
  x: number
  y: number
  w: number
  h: number
  z: number
}

export type DockSide = 'main' | 'left' | 'right' | 'bottom'

/** Per-view metadata about one child *in one parent*. */
export interface SlotMeta {
  canvas?: Rect
  floating?: Rect
  split?: { size: number }
  tabs?: { label?: string }
  grid?: { colSpan: number; rowSpan: number }
  dock?: { side: DockSide; collapsed: boolean }
  document?: { height: number }
}

/** Views whose children carry slot-level metadata. */
export const SLOT_META_VIEWS = ['canvas', 'floating', 'split', 'grid', 'dock', 'document'] as const
export type SlotMetaView = (typeof SLOT_META_VIEWS)[number]

export interface Slot {
  id: SlotId
  nodeId: NodeId
  meta: SlotMeta
}

/** Per-view state of the container itself. */
export interface ViewState {
  tabs?: { active?: SlotId }
  split?: { direction: 'row' | 'column' }
  canvas?: { panX: number; panY: number; zoom: number }
  grid?: { columns: number }
  outline?: { collapsed: string[] }
}

export interface Leaf {
  id: NodeId
  type: 'leaf'
  title: string
  content: { kind: string; data: unknown }
}

export interface Container {
  id: NodeId
  type: 'container'
  title: string
  view: ViewType
  /** Shared ordering used by all linear views (tabs, split, grid, document…). */
  slots: Slot[]
  viewState: ViewState
}

export type Node = Leaf | Container

export interface Doc {
  root: NodeId
  nodes: Record<NodeId, Node>
}

/** A location in the rendered tree: slot ids from the root. [] is the root. */
export type Path = SlotId[]
