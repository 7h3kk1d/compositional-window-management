import type { Edge } from '../model/ops'
import type { ViewType } from '../model/types'

export interface ViewInfo {
  label: string
  icon: string
  blurb: string
  /** Drops are placed where the pointer is (no edge-splitting inside). */
  pointerPlaced?: boolean
  /** Which edges of a child split it (nesting a split); default all four. */
  splitEdges?: Edge[]
}

/** Edges of a child (in a parent shown as `view`) that split it when dropped on. */
export const splitEdgesIn = (view: ViewType | undefined): Edge[] | undefined =>
  !view ? undefined : VIEW_INFO[view].pointerPlaced ? [] : VIEW_INFO[view].splitEdges

export const VIEW_INFO: Record<ViewType, ViewInfo> = {
  tabs: { label: 'Tabs', icon: '▭', blurb: 'One child visible at a time, chosen by named tabs' },
  split: { label: 'Split', icon: '◫', blurb: 'Tiling: children share the space, resizable' },
  canvas: { label: 'Canvas', icon: '✣', blurb: 'Infinite pan/zoom 2D space', pointerPlaced: true },
  floating: { label: 'Floating', icon: '❐', blurb: 'Fixed-size canvas: the classic stacking WM', pointerPlaced: true },
  grid: { label: 'Grid', icon: '▦', blurb: 'Gallery of rows and columns' },
  dock: { label: 'Dock', icon: '◧', blurb: 'Main area with collapsible side panels' },
  document: { label: 'Document', icon: '☰', blurb: 'Linear document with inline blocks' },
  outline: { label: 'Outline', icon: '⋮', blurb: 'The structure as a tree' },
  json: { label: 'JSON', icon: '{}', blurb: 'The raw data, including every view’s stored layout' },
  scroll: {
    label: 'Scrolling',
    icon: '⇶',
    blurb: 'Scrolling tiler (PaperWM, niri): an endless strip of columns',
    // left/right of a column is a new column; top/bottom stacks (a nested split)
    splitEdges: ['top', 'bottom'],
  },
  master: { label: 'Master + stack', icon: '◨', blurb: 'dwm/xmonad: main windows beside a stack; stores only a ratio' },
  spiral: { label: 'Spiral', icon: '◷', blurb: 'Auto-tiling (bspwm): each window halves the rest; stores nothing' },
  table: { label: 'Table', icon: '▤', blurb: 'One row per child, one column per view’s stored layout' },
  kanban: { label: 'Kanban', icon: '▥', blurb: 'Cards in named lanes', pointerPlaced: true },
  timeline: { label: 'Timeline', icon: '⟿', blurb: 'Windows placed on a time axis', pointerPlaced: true },
}
