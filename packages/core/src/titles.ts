import type { Container, Doc, NodeId, ViewType } from './types'
import { dockMeta } from './viewMeta'

export interface TitleOpts {
  /** The view of the placement being titled (defaults to the node's defaultView). */
  view?: ViewType
  /** Derive even if the container has a title (to preview the automatic one). */
  ignoreOwnTitle?: boolean
}

/**
 * Containers may be *titleless* (title === ''). Their display title is
 * derived from what they currently show, recursively:
 *   tabs → the active tab · dock → the main panel · others → first child "+N"
 * Since views are per placement, so is the derived title: a mirrored
 * titleless container can read differently as tabs than as a split.
 */
export function displayTitle(doc: Doc, id: NodeId, opts: TitleOpts = {}, depth = 0): string {
  const n = doc.nodes[id]
  if (!n) return '?'
  if ((n.title && !opts.ignoreOwnTitle) || n.type === 'leaf') return n.title || 'Untitled'
  if (depth > 16) return '…'
  const view = opts.view ?? n.defaultView
  const shown = shownChild(n, view)
  if (!shown) return `Empty ${view}`
  const inner = displayTitle(doc, shown.nodeId, { view: shown.view }, depth + 1)
  const others = n.slots.length - 1
  return view === 'tabs' || view === 'dock' || others === 0 ? inner : `${inner} +${others}`
}

/** The child a titleless container is named after. */
function shownChild(c: Container, view: ViewType) {
  if (!c.slots.length) return undefined
  if (view === 'tabs') return c.slots.find((s) => s.id === c.viewState.tabs?.active) ?? c.slots[0]
  if (view === 'dock') return c.slots.find((s, i) => dockMeta(s, i).side === 'main') ?? c.slots[0]
  return c.slots[0]
}

export const isAutoTitled = (doc: Doc, id: NodeId) => {
  const n = doc.nodes[id]
  return n?.type === 'container' && !n.title
}
