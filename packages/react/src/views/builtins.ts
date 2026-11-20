/** The views that ship with the library, in palette order (⌥1…⌥9 pick the first nine). */
import type { ViewDef } from '../workspace'
import { TabsView } from './TabsView'
import { SplitControls, SplitView } from './SplitView'
import { CanvasView, FloatingView } from './CanvasView'
import { GridView } from './GridView'
import { DockView } from './DockView'
import { DocumentView } from './DocumentView'
import { OutlineView } from './OutlineView'
import { JsonView } from './JsonView'
import { ScrollControls, ScrollView } from './ScrollView'
import { MasterView } from './MasterView'
import { SpiralView } from './SpiralView'
import { TableView } from './TableView'
import { KanbanView } from './KanbanView'
import { TimelineView } from './TimelineView'

export const BUILTIN_VIEWS: ViewDef[] = [
  { id: 'tabs', Component: TabsView, label: 'Tabs', icon: '▭', blurb: 'One child visible at a time, chosen by named tabs' },
  { id: 'split', Component: SplitView, Controls: SplitControls, label: 'Split', icon: '◫', blurb: 'Tiling: children share the space, resizable' },
  { id: 'canvas', Component: CanvasView, label: 'Canvas', icon: '✣', blurb: 'Infinite pan/zoom 2D space', pointerPlaced: true },
  { id: 'floating', Component: FloatingView, label: 'Floating', icon: '❐', blurb: 'Fixed-size canvas: the classic stacking WM', pointerPlaced: true },
  { id: 'grid', Component: GridView, label: 'Grid', icon: '▦', blurb: 'Gallery of rows and columns' },
  { id: 'dock', Component: DockView, label: 'Dock', icon: '◧', blurb: 'Main area with collapsible side panels' },
  { id: 'document', Component: DocumentView, label: 'Document', icon: '☰', blurb: 'Linear document with inline blocks' },
  { id: 'outline', Component: OutlineView, label: 'Outline', icon: '⋮', blurb: 'The structure as a tree' },
  { id: 'json', Component: JsonView, label: 'JSON', icon: '{}', blurb: 'The raw data, including every view’s stored layout' },
  {
    id: 'scroll', Component: ScrollView, Controls: ScrollControls,
    label: 'Scrolling',
    icon: '⇶',
    blurb: 'Scrolling tiler (PaperWM, niri): an endless strip of columns',
    // left/right of a column is a new column; top/bottom stacks (a nested split)
    splitEdges: ['top', 'bottom'],
  },
  { id: 'master', Component: MasterView, label: 'Master + stack', icon: '◨', blurb: 'dwm/xmonad: main windows beside a stack; stores only a ratio' },
  { id: 'spiral', Component: SpiralView, label: 'Spiral', icon: '◷', blurb: 'Auto-tiling (bspwm): each window halves the rest; stores nothing' },
  { id: 'table', Component: TableView, label: 'Table', icon: '▤', blurb: 'One row per child, one column per view’s stored layout' },
  { id: 'kanban', Component: KanbanView, label: 'Kanban', icon: '▥', blurb: 'Cards in named lanes', pointerPlaced: true },
  { id: 'timeline', Component: TimelineView, label: 'Timeline', icon: '⟿', blurb: 'Windows placed on a time axis', pointerPlaced: true },
]
