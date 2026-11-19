import type { Container, Doc, NodeId } from './types'
import { dockMeta } from './viewMeta'

/**
 * Containers may be *titleless* (title === ''). Their display title is
 * derived from what they currently show, recursively:
 *   tabs → the active tab · dock → the main panel · others → first child "+N"
 * Leaves and titled containers just use their own title.
 */
export function displayTitle(doc: Doc, id: NodeId, depth = 0, ignoreOwnTitle = false): string {
  const n = doc.nodes[id]
  if (!n) return '?'
  if ((n.title && !ignoreOwnTitle) || n.type === 'leaf') return n.title || 'Untitled'
  if (depth > 16) return '…'
  const shown = shownChild(n)
  if (!shown) return `Empty ${n.view}`
  const inner = displayTitle(doc, shown.nodeId, depth + 1)
  const others = n.slots.length - 1
  return n.view === 'tabs' || n.view === 'dock' || others === 0 ? inner : `${inner} +${others}`
}

/** The child a titleless container is named after. */
function shownChild(c: Container) {
  if (!c.slots.length) return undefined
  if (c.view === 'tabs') return c.slots.find((s) => s.id === c.viewState.tabs?.active) ?? c.slots[0]
  if (c.view === 'dock') return c.slots.find((s, i) => dockMeta(s, i).side === 'main') ?? c.slots[0]
  return c.slots[0]
}

export const isAutoTitled = (doc: Doc, id: NodeId) => {
  const n = doc.nodes[id]
  return n?.type === 'container' && !n.title
}
