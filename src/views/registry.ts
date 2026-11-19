import type { FC } from 'react'
import type { ViewType } from '../model/types'
import type { ViewProps } from './NodeView'
import { TabsView } from './TabsView'
import { SplitView } from './SplitView'
import { CanvasView, FloatingView } from './CanvasView'
import { GridView } from './GridView'
import { DockView } from './DockView'
import { DocumentView } from './DocumentView'
import { OutlineView } from './OutlineView'
import { JsonView } from './JsonView'

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
}
