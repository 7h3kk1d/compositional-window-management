import type { FC } from 'react'
import type { Container, Path, ViewType } from '../model/types'
import type { ViewProps } from './NodeView'
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

export const VIEW_COMPONENTS: Record<ViewType, FC<ViewProps>> = {
  tabs: TabsView,
  split: SplitView,
  canvas: CanvasView,
  floating: FloatingView,
  grid: GridView,
  dock: DockView,
  document: DocumentView,
  outline: OutlineView,
  json: JsonView,
  scroll: ScrollView,
  master: MasterView,
  spiral: SpiralView,
  table: TableView,
  kanban: KanbanView,
  timeline: TimelineView,
}

/** Small view-specific controls shown in the container's own header. */
export const VIEW_CONTROLS: Partial<Record<ViewType, FC<{ container: Container; path: Path }>>> = {
  split: SplitControls,
  scroll: ScrollControls,
}
