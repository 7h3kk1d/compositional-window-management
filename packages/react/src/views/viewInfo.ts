import type { Edge, ViewType } from '@cwm/core'
import { viewInfo, type Workspace } from '../workspace'

/** Edges of a child (in a parent shown as `view`) that split it when dropped on. */
export const splitEdgesIn = (ws: Workspace, view: ViewType | undefined): Edge[] | undefined => {
  if (!view) return undefined
  const v = viewInfo(ws, view)
  return v.pointerPlaced ? [] : v.splitEdges
}
