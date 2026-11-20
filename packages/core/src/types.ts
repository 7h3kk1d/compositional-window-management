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
  'scroll',
  'master',
  'spiral',
  'table',
  'kanban',
  'timeline',
] as const
/** The views that ship with the library. */
export type BuiltinView = (typeof VIEW_TYPES)[number]
/**
 * A view id. Apps register their own container types (see the view
 * registry), so any string is allowed; built-ins keep autocompletion.
 */
export type ViewType = BuiltinView | (string & {})

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
  /**
   * Scrolling tiler: each child is one column, in the shared order. Width is a
   * fraction of the visible area. Several windows in one column are a nested
   * (titleless) vertical split, not a scrolling-specific concept.
   */
  scroll?: { width: number }
  kanban?: { lane: string }
  /** Inclusive ISO dates (YYYY-MM-DD). */
  timeline?: { start: string; end: string }
  /** App-defined views keep their per-child metadata under their own id. */
  [view: string]: unknown
}

/** Views whose children carry slot-level metadata. */
export const SLOT_META_VIEWS = ['canvas', 'floating', 'split', 'grid', 'dock', 'document', 'scroll', 'kanban', 'timeline'] as const
export type SlotMetaView = (typeof SLOT_META_VIEWS)[number]

export interface Slot {
  id: SlotId
  nodeId: NodeId
  meta: SlotMeta
  /**
   * How this *placement* shows the container it points at. Views are per
   * reference, not per node: one container mirrored into two places can be
   * a grid in one and an outline in the other, both live on the same data.
   * Unset for leaves.
   */
  view?: ViewType
}

/** Per-view state of the container itself (shared by all its placements). */
export interface ViewState {
  tabs?: { active?: SlotId }
  split?: { direction: 'row' | 'column' }
  canvas?: { panX: number; panY: number; zoom: number }
  grid?: { columns: number }
  outline?: { collapsed: string[] }
  /** Master + stack: the first `count` children share the main area. */
  master?: { ratio: number; count: number }
  /** Scrolling: keep the focused column centered (niri's center-focused-column). */
  scroll?: { center: boolean }
  /** Display-only sort; never reorders the shared slot order. */
  table?: { sort: 'title' | 'kind' | null; desc?: boolean }
  kanban?: { lanes: string[] }
  timeline?: { dayWidth: number }
  /** App-defined views keep their own state under their own id. */
  [view: string]: unknown
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
  /**
   * The view used where there is no slot to hold one (the root), and the
   * starting view for a new placement. Each placement's actual view is
   * `Slot.view`.
   */
  defaultView: ViewType
  /** Shared ordering used by all linear views (tabs, split, grid, document…). */
  slots: Slot[]
  viewState: ViewState
  /**
   * An app-defined payload: a small value the app gives meaning to (e.g.
   * which two commits a compare container shows). The library never reads it.
   */
  data?: unknown
}

export type Node = Leaf | Container

export interface Doc {
  root: NodeId
  nodes: Record<NodeId, Node>
}

/** A location in the rendered tree: slot ids from the root. [] is the root. */
export type Path = SlotId[]
