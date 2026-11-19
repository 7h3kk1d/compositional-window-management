/**
 * Pure document operations. Each one mutates the Doc it is given, so it
 * works on a plain object (in tests) or an immer draft (in the store).
 */
import { current, isDraft } from 'immer'
import { newId } from './ids'
import { displayTitle } from './titles'
import { resolvedMeta } from './viewMeta'
import {
  SLOT_META_VIEWS,
  type Container,
  type Doc,
  type Leaf,
  type Node,
  type NodeId,
  type Path,
  type Slot,
  type SlotId,
  type SlotMeta,
  type SlotMetaView,
  type ViewState,
  type ViewType,
} from './types'

/**
 * Deep copy that also works on immer drafts (Proxies), which
 * structuredClone rejects. Ops run on drafts inside the store.
 */
function clone<T>(x: T): T {
  return structuredClone(isDraft(x) ? (current as <U>(v: U) => U)(x) : x)
}

// ---------------------------------------------------------------- lookup

export function getNode(doc: Doc, id: NodeId): Node {
  const n = doc.nodes[id]
  if (!n) throw new Error(`no node ${id}`)
  return n
}

export function getContainer(doc: Doc, id: NodeId): Container {
  const n = getNode(doc, id)
  if (n.type !== 'container') throw new Error(`${id} is not a container`)
  return n
}

export function findSlot(c: Container, slotId: SlotId): Slot {
  const s = c.slots.find((x) => x.id === slotId)
  if (!s) throw new Error(`no slot ${slotId} in ${c.id}`)
  return s
}

export interface ResolvedPath {
  /** nodes[0] is the root; nodes[i+1] is the child behind path[i]. */
  nodes: Node[]
  slots: Slot[]
}

/** Resolve a path; stops early (returns a shorter prefix) if it is stale. */
export function resolvePath(doc: Doc, path: Path): ResolvedPath {
  const nodes: Node[] = [getNode(doc, doc.root)]
  const slots: Slot[] = []
  for (const sid of path) {
    const cur = nodes[nodes.length - 1]
    if (cur.type !== 'container') break
    const slot = cur.slots.find((s) => s.id === sid)
    if (!slot || !doc.nodes[slot.nodeId]) break
    slots.push(slot)
    nodes.push(doc.nodes[slot.nodeId])
  }
  return { nodes, slots }
}

export function validPath(doc: Doc, path: Path): Path {
  return resolvePath(doc, path).slots.map((s) => s.id)
}

// ---------------------------------------------------------------- graph

/** Would placing `childId` inside `parentId` create a cycle? */
export function wouldCycle(doc: Doc, parentId: NodeId, childId: NodeId): boolean {
  if (parentId === childId) return true
  const seen = new Set<NodeId>()
  const stack = [childId]
  while (stack.length) {
    const id = stack.pop()!
    if (id === parentId) return true
    if (seen.has(id)) continue
    seen.add(id)
    const n = doc.nodes[id]
    if (n?.type === 'container') for (const s of n.slots) stack.push(s.nodeId)
  }
  return false
}

export function reachable(doc: Doc): Set<NodeId> {
  const seen = new Set<NodeId>()
  const stack = [doc.root]
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const n = doc.nodes[id]
    if (n?.type === 'container') for (const s of n.slots) stack.push(s.nodeId)
  }
  return seen
}

/** Nodes no longer referenced from the root. Kept (not deleted) so they can be restored. */
export function collectOrphans(doc: Doc): NodeId[] {
  const live = reachable(doc)
  // Only report "top-level" orphans: unreachable nodes not referenced by another orphan.
  const orphans = Object.keys(doc.nodes).filter((id) => !live.has(id))
  const referencedByOrphan = new Set<NodeId>()
  for (const id of orphans) {
    const n = doc.nodes[id]
    if (n.type === 'container') for (const s of n.slots) referencedByOrphan.add(s.nodeId)
  }
  return orphans.filter((id) => !referencedByOrphan.has(id))
}

/** Permanently delete everything unreachable. */
export function purgeOrphans(doc: Doc) {
  const live = reachable(doc)
  for (const id of Object.keys(doc.nodes)) if (!live.has(id)) delete doc.nodes[id]
}

/** Number of slots (edges) pointing at a node from reachable containers. */
export function refCount(doc: Doc, nodeId: NodeId): number {
  if (nodeId === doc.root) return 1
  const live = reachable(doc)
  let n = 0
  for (const id of live) {
    const c = doc.nodes[id]
    if (c.type === 'container') for (const s of c.slots) if (s.nodeId === nodeId) n++
  }
  return n
}

const refCountCache = new WeakMap<Doc, Map<NodeId, number>>()
/** refCount for every reachable node, memoized per (immutable) doc. */
export function refCounts(doc: Doc): Map<NodeId, number> {
  let m = refCountCache.get(doc)
  if (m) return m
  m = new Map([[doc.root, 1]])
  for (const id of reachable(doc)) {
    const c = doc.nodes[id]
    if (c.type === 'container') for (const s of c.slots) m.set(s.nodeId, (m.get(s.nodeId) ?? 0) + 1)
  }
  refCountCache.set(doc, m)
  return m
}

/** All rendered paths at which a node appears (DFS through the DAG). */
export function occurrences(doc: Doc, nodeId: NodeId, limit = 50): Path[] {
  const out: Path[] = []
  const walk = (id: NodeId, path: Path, depth: number) => {
    if (out.length >= limit || depth > 32) return
    if (id === nodeId) out.push(path)
    const n = doc.nodes[id]
    if (n?.type === 'container') for (const s of n.slots) walk(s.nodeId, [...path, s.id], depth + 1)
  }
  walk(doc.root, [], 0)
  return out
}

/** Every container with one representative path, for "Move to / Mirror into". */
export function allContainers(doc: Doc): { container: Container; path: Path; label: string }[] {
  const out: { container: Container; path: Path; label: string }[] = []
  const seen = new Set<NodeId>()
  const walk = (id: NodeId, path: Path, labels: string[]) => {
    const n = doc.nodes[id]
    if (!n || n.type !== 'container' || seen.has(id)) return
    seen.add(id)
    const here = [...labels, displayTitle(doc, id)]
    out.push({ container: n, path, label: here.join(' › ') })
    for (const s of n.slots) walk(s.nodeId, [...path, s.id], here)
  }
  walk(doc.root, [], [])
  return out
}

// ---------------------------------------------------------------- creation

export function makeLeaf(title: string, kind: string, data: unknown): Leaf {
  return { id: newId('n'), type: 'leaf', title, content: { kind, data } }
}

export function makeContainer(title: string, view: ViewType, viewState: ViewState = {}): Container {
  return { id: newId('c'), type: 'container', title, view, slots: [], viewState }
}

function activeMetaView(c: Container): SlotMetaView | null {
  return (SLOT_META_VIEWS as readonly string[]).includes(c.view) ? (c.view as SlotMetaView) : null
}

/**
 * Insert a reference to an existing node. `meta` should only describe the
 * *active* view of the target container: the action happens in that view's
 * semantics, so other views get nothing (they will derive a value later).
 */
export function insertRef(
  doc: Doc,
  containerId: NodeId,
  nodeId: NodeId,
  opts: { index?: number; meta?: SlotMeta } = {},
): SlotId | null {
  const c = getContainer(doc, containerId)
  if (wouldCycle(doc, containerId, nodeId)) return null
  const slot: Slot = { id: newId('s'), nodeId, meta: opts.meta ?? {} }
  const index = opts.index ?? c.slots.length
  c.slots.splice(Math.max(0, Math.min(index, c.slots.length)), 0, slot)
  if (c.view === 'tabs') c.viewState.tabs = { ...c.viewState.tabs, active: slot.id }
  return slot.id
}

export function addChild(
  doc: Doc,
  containerId: NodeId,
  node: Node,
  opts: { index?: number; meta?: SlotMeta } = {},
): SlotId {
  doc.nodes[node.id] = node
  const sid = insertRef(doc, containerId, node.id, opts)
  if (!sid) throw new Error('cycle')
  return sid
}

/** Mirror = a second reference to the same node (edits are shared). */
export function mirror(
  doc: Doc,
  nodeId: NodeId,
  intoContainerId: NodeId,
  opts: { index?: number; meta?: SlotMeta } = {},
): SlotId | null {
  return insertRef(doc, intoContainerId, nodeId, opts)
}

/** Deep copy (independent, not a mirror). Shared descendants are copied once. */
export function deepCopy(doc: Doc, nodeId: NodeId, memo = new Map<NodeId, NodeId>()): NodeId {
  const existing = memo.get(nodeId)
  if (existing) return existing
  const n = getNode(doc, nodeId)
  const copy: Node = clone(n)
  copy.id = newId(n.type === 'leaf' ? 'n' : 'c')
  memo.set(nodeId, copy.id)
  if (copy.type === 'container') {
    const idMap = new Map<SlotId, SlotId>()
    copy.slots = copy.slots.map((s) => {
      const id = newId('s')
      idMap.set(s.id, id)
      return { ...s, id, nodeId: deepCopy(doc, s.nodeId, memo) }
    })
    const act = copy.viewState.tabs?.active
    if (act) copy.viewState.tabs = { active: idMap.get(act) }
  }
  doc.nodes[copy.id] = copy
  return copy.id
}

// ---------------------------------------------------------------- mutation

export function removeSlot(doc: Doc, containerId: NodeId, slotId: SlotId) {
  const c = getContainer(doc, containerId)
  const i = c.slots.findIndex((s) => s.id === slotId)
  if (i < 0) return
  c.slots.splice(i, 1)
  if (c.viewState.tabs?.active === slotId) {
    c.viewState.tabs.active = c.slots[Math.min(i, c.slots.length - 1)]?.id
  }
}

/**
 * Move a slot. Within the same container it is a reorder and keeps all of
 * its metadata. Across containers the old metadata described the *old*
 * parent, so it is dropped and only `meta` (for the target's active view)
 * is written: an inherently lossy action.
 */
export function moveSlot(
  doc: Doc,
  fromId: NodeId,
  slotId: SlotId,
  toId: NodeId,
  opts: { index?: number; meta?: SlotMeta } = {},
): SlotId | null {
  const from = getContainer(doc, fromId)
  const slot = findSlot(from, slotId)
  if (fromId === toId) {
    const i = from.slots.indexOf(slot)
    from.slots.splice(i, 1)
    let index = opts.index ?? from.slots.length
    if (opts.index !== undefined && opts.index > i) index -= 1
    from.slots.splice(Math.max(0, Math.min(index, from.slots.length)), 0, slot)
    if (opts.meta) Object.assign(slot.meta, opts.meta)
    return slot.id
  }
  if (wouldCycle(doc, toId, slot.nodeId)) return null
  removeSlot(doc, fromId, slotId)
  return insertRef(doc, toId, slot.nodeId, opts)
}

/** The lens "put": only the view changes; all per-view metadata is retained. */
export function setView(doc: Doc, containerId: NodeId, view: ViewType) {
  getContainer(doc, containerId).view = view
}

export function setSlotMeta<V extends SlotMetaView>(
  doc: Doc,
  containerId: NodeId,
  slotId: SlotId,
  view: V,
  value: SlotMeta[V],
) {
  findSlot(getContainer(doc, containerId), slotId).meta[view] = value
}

export function setViewState<V extends keyof ViewState>(
  doc: Doc,
  containerId: NodeId,
  view: V,
  value: ViewState[V],
) {
  getContainer(doc, containerId).viewState[view] = value
}

export function rename(doc: Doc, nodeId: NodeId, title: string) {
  getNode(doc, nodeId).title = title
}

export function setLeafData(doc: Doc, nodeId: NodeId, data: unknown) {
  const n = getNode(doc, nodeId)
  if (n.type === 'leaf') n.content.data = data
}

/**
 * Wrap a child in a new container. The outer slot keeps its metadata (so a
 * wrapped canvas window stays where it was); the child moves inside.
 */
export function wrap(doc: Doc, containerId: NodeId, slotId: SlotId, view: ViewType, title?: string) {
  const slot = findSlot(getContainer(doc, containerId), slotId)
  const inner = getNode(doc, slot.nodeId)
  // titleless by default: it displays the title of what it shows (see titles.ts)
  const box = makeContainer(title ?? '', view)
  doc.nodes[box.id] = box
  const innerSlot: Slot = { id: newId('s'), nodeId: inner.id, meta: {} }
  box.slots.push(innerSlot)
  box.viewState.tabs = { active: innerSlot.id }
  slot.nodeId = box.id
  return box.id
}

/**
 * Replace a container child with its own children. Lossy: the inner
 * container's view state and the outer slot's metadata are dropped.
 */
export function unwrap(doc: Doc, containerId: NodeId, slotId: SlotId): boolean {
  const c = getContainer(doc, containerId)
  const i = c.slots.findIndex((s) => s.id === slotId)
  if (i < 0) return false
  const inner = doc.nodes[c.slots[i].nodeId]
  if (inner?.type !== 'container') return false
  // Inner children are already descendants of c, so lifting them can't create a cycle.
  const lifted = inner.slots.map((s) => ({ ...s, id: newId('s'), meta: clone(s.meta) }))
  c.slots.splice(i, 1, ...lifted)
  if (c.viewState.tabs?.active === slotId) c.viewState.tabs.active = lifted[0]?.id ?? c.slots[0]?.id
  return true
}

export type Edge = 'left' | 'right' | 'top' | 'bottom'

/**
 * Put `nodeId` beside the node at `targetPath` by replacing that position
 * with a new split holding both. The parent slot (and its per-view layout,
 * e.g. a canvas position) is kept and now points at the split. At the root
 * this creates a new root. Returns the new path of the inserted node.
 */
export function splitBeside(doc: Doc, targetPath: Path, nodeId: NodeId, edge: Edge): Path | null {
  const { nodes, slots } = resolvePath(doc, targetPath)
  if (slots.length !== targetPath.length) return null
  const target = nodes[nodes.length - 1]
  if (wouldCycle(doc, target.id, nodeId)) return null
  const split = makeContainer('', 'split', {
    split: { direction: edge === 'left' || edge === 'right' ? 'row' : 'column' },
  })
  const targetSlot: Slot = { id: newId('s'), nodeId: target.id, meta: { split: { size: 1 } } }
  const newSlot: Slot = { id: newId('s'), nodeId, meta: { split: { size: 1 } } }
  split.slots = edge === 'left' || edge === 'top' ? [newSlot, targetSlot] : [targetSlot, newSlot]
  split.viewState.tabs = { active: newSlot.id }
  doc.nodes[split.id] = split
  if (!slots.length) doc.root = split.id
  else slots[slots.length - 1].nodeId = split.id
  return [...targetPath, newSlot.id]
}

/** Write the derived layout for the active view into every slot. */
export function materialize(doc: Doc, containerId: NodeId) {
  const c = getContainer(doc, containerId)
  const view = activeMetaView(c)
  if (!view) return
  const values = resolvedMeta(c, view)
  c.slots.forEach((s, i) => {
    ;(s.meta as Record<string, unknown>)[view] = clone(values[i])
  })
}

/** Forget metadata for every view except the active one (explicit lossiness). */
export function clearOtherViewMeta(doc: Doc, containerId: NodeId) {
  const c = getContainer(doc, containerId)
  for (const s of c.slots) {
    for (const k of Object.keys(s.meta) as (keyof SlotMeta)[]) if (k !== c.view) delete s.meta[k]
  }
  for (const k of Object.keys(c.viewState) as (keyof ViewState)[]) if (k !== c.view) delete c.viewState[k]
}

/** For tabs (and collapsed dock panels) along a path, make it visible. */
export function reveal(doc: Doc, path: Path) {
  const { nodes, slots } = resolvePath(doc, path)
  slots.forEach((slot, i) => {
    const parent = nodes[i]
    if (parent.type !== 'container') return
    // only write on change: assigning an equal object still counts as an
    // edit to immer and would add an empty undo step
    if (parent.view === 'tabs' && parent.viewState.tabs?.active !== slot.id)
      parent.viewState.tabs = { ...parent.viewState.tabs, active: slot.id }
    if (parent.view === 'dock' && slot.meta.dock?.collapsed) slot.meta.dock.collapsed = false
  })
}
