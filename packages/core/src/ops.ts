/**
 * Pure document operations. Each one mutates the Doc it is given, so it
 * works on a plain object (in tests) or an immer draft (in the store).
 */
import { current, isDraft } from 'immer'
import { newId } from './ids'
import { displayTitle } from './titles'
import { kanbanLanes, resolvedMeta } from './viewMeta'
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

/** The view of the placement a slot creates (falls back to the node's default). */
export function slotView(doc: Doc, slot: Slot): ViewType {
  const n = doc.nodes[slot.nodeId]
  return slot.view ?? (n?.type === 'container' ? n.defaultView : 'tabs')
}

/**
 * The view shown at a path. Views are per placement: the same container
 * can appear at two paths with two different views.
 */
export function viewAt(doc: Doc, path: Path): ViewType {
  const { nodes, slots } = resolvePath(doc, path)
  const last = slots[slots.length - 1]
  if (last) return slotView(doc, last)
  const root = nodes[0]
  return root.type === 'container' ? root.defaultView : 'tabs'
}

/** Every container with one representative path, for "Move to / Mirror into". */
export function allContainers(doc: Doc): { container: Container; path: Path; view: ViewType; label: string }[] {
  const out: { container: Container; path: Path; view: ViewType; label: string }[] = []
  const seen = new Set<NodeId>()
  const walk = (id: NodeId, path: Path, view: ViewType, labels: string[]) => {
    const n = doc.nodes[id]
    if (!n || n.type !== 'container' || seen.has(id)) return
    seen.add(id)
    const here = [...labels, displayTitle(doc, id, { view })]
    out.push({ container: n, path, view, label: here.join(' › ') })
    for (const s of n.slots) walk(s.nodeId, [...path, s.id], slotView(doc, s), here)
  }
  const root = doc.nodes[doc.root]
  walk(doc.root, [], root?.type === 'container' ? root.defaultView : 'tabs', [])
  return out
}

// ---------------------------------------------------------------- creation

export function makeLeaf(title: string, kind: string, data: unknown): Leaf {
  return { id: newId('n'), type: 'leaf', title, content: { kind, data } }
}

export function makeContainer(title: string, defaultView: ViewType, viewState: ViewState = {}): Container {
  return { id: newId('c'), type: 'container', title, defaultView, slots: [], viewState }
}

const asMetaView = (view: ViewType): SlotMetaView | null =>
  (SLOT_META_VIEWS as readonly string[]).includes(view) ? (view as SlotMetaView) : null

export interface InsertOpts {
  index?: number
  /** Layout for the parent's *active* view only (other views derive later). */
  meta?: SlotMeta
  /** View of the new placement (containers only). Defaults to the node's defaultView. */
  view?: ViewType
  /** The view the parent is shown in where this happens (tabs: select the new child). */
  parentView?: ViewType
}

/**
 * Insert a reference to an existing node. `meta` should only describe the
 * *active* view of the target container: the action happens in that view's
 * semantics, so other views get nothing (they will derive a value later).
 */
export function insertRef(doc: Doc, containerId: NodeId, nodeId: NodeId, opts: InsertOpts = {}): SlotId | null {
  const c = getContainer(doc, containerId)
  if (wouldCycle(doc, containerId, nodeId)) return null
  const node = getNode(doc, nodeId)
  const slot: Slot = { id: newId('s'), nodeId, meta: opts.meta ?? {} }
  if (node.type === 'container') slot.view = opts.view ?? node.defaultView
  const index = opts.index ?? c.slots.length
  c.slots.splice(Math.max(0, Math.min(index, c.slots.length)), 0, slot)
  if ((opts.parentView ?? c.defaultView) === 'tabs') c.viewState.tabs = { ...c.viewState.tabs, active: slot.id }
  return slot.id
}

export function addChild(doc: Doc, containerId: NodeId, node: Node, opts: InsertOpts = {}): SlotId {
  doc.nodes[node.id] = node
  const sid = insertRef(doc, containerId, node.id, opts)
  if (!sid) throw new Error('cycle')
  return sid
}

/** Mirror = a second reference to the same node (edits are shared). */
export function mirror(doc: Doc, nodeId: NodeId, intoContainerId: NodeId, opts: InsertOpts = {}): SlotId | null {
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
export function moveSlot(doc: Doc, fromId: NodeId, slotId: SlotId, toId: NodeId, opts: InsertOpts = {}): SlotId | null {
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
  // the placement's view travels with it; its layout meta does not
  return insertRef(doc, toId, slot.nodeId, { ...opts, view: opts.view ?? slot.view })
}

/**
 * The lens "put": change how the container at `path` is viewed. Only that
 * placement changes (other mirrors keep their views), and all per-view
 * metadata is retained, so switching back round-trips.
 */
export function setViewAt(doc: Doc, path: Path, view: ViewType) {
  const { nodes, slots } = resolvePath(doc, path)
  const node = nodes[nodes.length - 1]
  if (node.type !== 'container') return
  const slot = slots[slots.length - 1]
  if (slot) slot.view = view
  else node.defaultView = view
}

/** Set a container's default view (used by the root and by new placements). */
export function setDefaultView(doc: Doc, containerId: NodeId, view: ViewType) {
  getContainer(doc, containerId).defaultView = view
}

export function setSlotMeta<V extends SlotMetaView | (string & {})>(
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
  // the inner placement keeps the view it had; the outer one now shows the box
  const innerSlot: Slot = { id: newId('s'), nodeId: inner.id, meta: {}, view: slot.view }
  if (inner.type !== 'container') delete innerSlot.view
  box.slots.push(innerSlot)
  box.viewState.tabs = { active: innerSlot.id }
  slot.nodeId = box.id
  slot.view = view
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
export function splitBeside(
  doc: Doc,
  targetPath: Path,
  nodeId: NodeId,
  edge: Edge,
  /** View for the inserted node's new placement (if it is a container). */
  view?: ViewType,
): Path | null {
  const { nodes, slots } = resolvePath(doc, targetPath)
  if (slots.length !== targetPath.length) return null
  const target = nodes[nodes.length - 1]
  if (wouldCycle(doc, target.id, nodeId)) return null
  const axis = edge === 'left' || edge === 'right' ? 'row' : 'column'
  // Already inside a split along the same axis: become a sibling there
  // instead of nesting another split (keeps trees flat, like i3).
  const parentPath = targetPath.slice(0, -1)
  const parent = nodes[nodes.length - 2]
  if (
    parent?.type === 'container' &&
    viewAt(doc, parentPath) === 'split' &&
    (parent.viewState.split?.direction ?? 'row') === axis
  ) {
    if (wouldCycle(doc, parent.id, nodeId)) return null
    const tSlot = slots[slots.length - 1]
    const size = tSlot.meta.split?.size
    if (size !== undefined) tSlot.meta.split = { size: size / 2 }
    const index = parent.slots.indexOf(tSlot) + (edge === 'right' || edge === 'bottom' ? 1 : 0)
    const sid = insertRef(doc, parent.id, nodeId, {
      index,
      view,
      meta: size !== undefined ? { split: { size: size / 2 } } : {},
      parentView: 'split',
    })
    return sid ? [...parentPath, sid] : null
  }
  const split = makeContainer('', 'split', {
    split: { direction: axis },
  })
  // the target keeps the view it had at this position
  const targetSlot: Slot = { id: newId('s'), nodeId: target.id, meta: { split: { size: 1 } } }
  if (target.type === 'container') targetSlot.view = viewAt(doc, targetPath)
  const inserted = getNode(doc, nodeId)
  const newSlot: Slot = { id: newId('s'), nodeId, meta: { split: { size: 1 } } }
  if (inserted.type === 'container') newSlot.view = view ?? inserted.defaultView
  split.slots = edge === 'left' || edge === 'top' ? [newSlot, targetSlot] : [targetSlot, newSlot]
  split.viewState.tabs = { active: newSlot.id }
  doc.nodes[split.id] = split
  if (!slots.length) doc.root = split.id
  else {
    slots[slots.length - 1].nodeId = split.id
    slots[slots.length - 1].view = 'split'
  }
  return [...targetPath, newSlot.id]
}

/** Write the derived layout for `view` (the one being shown) into every slot. */
export function materialize(doc: Doc, containerId: NodeId, shown?: ViewType) {
  const c = getContainer(doc, containerId)
  const view = asMetaView(shown ?? c.defaultView)
  if (!view) return
  const values = resolvedMeta(c, view)
  c.slots.forEach((s, i) => {
    ;(s.meta as Record<string, unknown>)[view] = clone(values[i])
  })
}

/** Forget metadata for every view except `shown` (explicit lossiness). */
export function clearOtherViewMeta(doc: Doc, containerId: NodeId, shown?: ViewType) {
  const c = getContainer(doc, containerId)
  const keep = shown ?? c.defaultView
  for (const s of c.slots) {
    for (const k of Object.keys(s.meta) as (keyof SlotMeta)[]) if (k !== keep) delete s.meta[k]
  }
  for (const k of Object.keys(c.viewState) as (keyof ViewState)[]) if (k !== keep) delete c.viewState[k]
}

/** For tabs (and collapsed dock panels) along a path, make it visible. */
export function reveal(doc: Doc, path: Path) {
  const { nodes, slots } = resolvePath(doc, path)
  slots.forEach((slot, i) => {
    const parent = nodes[i]
    if (parent.type !== 'container') return
    // the view this parent is shown in at this point of the path
    const parentView = i === 0 ? parent.defaultView : slotView(doc, slots[i - 1])
    // only write on change: assigning an equal object still counts as an
    // edit to immer and would add an empty undo step
    if (parentView === 'tabs' && parent.viewState.tabs?.active !== slot.id)
      parent.viewState.tabs = { ...parent.viewState.tabs, active: slot.id }
    if (parentView === 'dock' && slot.meta.dock?.collapsed) slot.meta.dock.collapsed = false
  })
}

/** Change a kanban's lane list; a rename also relabels every card that stored the old name. */
export function setKanbanLanes(doc: Doc, containerId: NodeId, fn: (lanes: string[]) => string[], rename?: [string, string]) {
  const c = getContainer(doc, containerId)
  c.viewState.kanban = { lanes: fn(kanbanLanes(c)) }
  if (rename) for (const s of c.slots) if (s.meta.kanban?.lane === rename[0]) s.meta.kanban = { lane: rename[1] }
}

/**
 * Stack a child together with its neighbour (dir -1: the one before, +1:
 * the one after) by nesting them in a titleless split, or by joining the
 * neighbour if it already is such a split along `direction`. This is how a
 * scrolling container gets several windows in one column. Returns the new
 * path of the moved child.
 */
export function stackWith(
  doc: Doc,
  parentPath: Path,
  slotId: SlotId,
  dir: -1 | 1,
  direction: 'row' | 'column' = 'column',
): Path | null {
  const parent = resolvePath(doc, parentPath).nodes.at(-1)
  if (parent?.type !== 'container') return null
  const i = parent.slots.findIndex((s) => s.id === slotId)
  const nb = parent.slots[i + dir]
  if (i < 0 || !nb) return null
  const nbNode = getNode(doc, nb.nodeId)
  let colId: NodeId
  if (
    nbNode.type === 'container' &&
    !nbNode.title &&
    slotView(doc, nb) === 'split' &&
    (nbNode.viewState.split?.direction ?? 'row') === direction
  ) {
    colId = nbNode.id
  } else {
    // a fresh wrapper can't create a cycle: the moved child is a sibling
    colId = wrap(doc, parent.id, nb.id, 'split')
    getContainer(doc, colId).viewState.split = { direction }
  }
  const col = getContainer(doc, colId)
  const moved = moveSlot(doc, parent.id, slotId, colId, { index: dir < 0 ? col.slots.length : 0, parentView: 'split' })
  return moved ? [...parentPath, nb.id, moved] : null
}

/**
 * Move the child at `path` out of its parent into the grandparent, right
 * before (dir -1) or after (dir +1) the parent. It takes a copy of the
 * parent's layout there. A titleless parent left with one child dissolves
 * into that child; one left empty is removed.
 */
export function liftOut(doc: Doc, path: Path, dir: -1 | 1): Path | null {
  if (path.length < 2) return null
  const { nodes, slots } = resolvePath(doc, path)
  if (slots.length !== path.length) return null
  const gPath = path.slice(0, -2)
  const g = nodes[nodes.length - 3] as Container
  const p = nodes[nodes.length - 2] as Container
  const pSlot = slots[slots.length - 2]
  const slot = slots[slots.length - 1]
  if (wouldCycle(doc, g.id, slot.nodeId)) return null
  const meta = clone(pSlot.meta)
  for (const k of ['canvas', 'floating'] as const) {
    const r = meta[k]
    if (r) meta[k] = { ...r, x: r.x + 32, y: r.y + 32, z: r.z + 1 }
  }
  const index = g.slots.indexOf(pSlot) + (dir > 0 ? 1 : 0)
  const view = slot.view
  p.slots.splice(p.slots.indexOf(slot), 1)
  const sid = insertRef(doc, g.id, slot.nodeId, { index, meta, view, parentView: viewAt(doc, gPath) })
  if (!sid) return null
  if (!p.title && refCount(doc, p.id) === 1) {
    if (p.slots.length === 0) {
      g.slots.splice(g.slots.indexOf(pSlot), 1)
      delete doc.nodes[p.id]
    } else if (p.slots.length === 1) {
      const only = p.slots[0]
      pSlot.nodeId = only.nodeId
      if (only.view) pSlot.view = only.view
      else delete pSlot.view
      delete doc.nodes[p.id]
    }
  }
  return [...gPath, sid]
}
