/**
 * Placements: every place the host app is asked to draw something. An app
 * that renders window contents itself (e.g. through <cwm-workspace> slots)
 * renders one element per placement:
 * - a leaf: one per place it is shown (a mirrored leaf has several);
 * - a region: a named area of a container (e.g. a "header" band) that the
 *   container's view lays out and the app fills, with full access to its own
 *   state.
 * Ids are stable while windows move around: a node shown once is keyed by its
 * node id; further copies (mirrors) by their path.
 */
import { pathKey } from './store'
import type { Doc, Leaf, NodeId, Path, ViewType } from './types'
import { slotView } from './ops'

export const MAX_DEPTH = 24

/** A container around a placement, outermost first. */
export interface PlacementContext {
  nodeId: NodeId
  /** The container's own title ('' when it is automatic). */
  title: string
  /** How this container is shown at this place. */
  view: ViewType
  /** The container's app-defined payload. */
  data: unknown
  /** Where the next level down sits in this container (slot order). */
  index: number
}

export interface LeafPlacement {
  type: 'leaf'
  /** Stable id for this occurrence: use it as the slot name / key. */
  id: string
  nodeId: NodeId
  kind: string
  data: unknown
  title: string
  path: Path
  /** The containers this window sits in, outermost first (the last is its parent). */
  ancestors: PlacementContext[]
}

export interface RegionPlacement {
  type: 'region'
  id: string
  /** The container that owns the region. */
  nodeId: NodeId
  region: string
  view: ViewType
  data: unknown
  path: Path
  ancestors: PlacementContext[]
}

export type Placement = LeafPlacement | RegionPlacement

/** Which named regions a view lays out (from the view registry). */
export type RegionsOf = (view: ViewType) => readonly string[] | undefined

const cache = new WeakMap<Doc, Map<RegionsOf | undefined, { list: Placement[]; byPath: Map<string, Placement> }>>()

function compute(doc: Doc, regionsOf?: RegionsOf) {
  const list: Placement[] = []
  const byPath = new Map<string, Placement>()
  const seen = new Set<string>()
  const idFor = (key: string, path: Path) => {
    const id = seen.has(key) ? `${key}@${pathKey(path)}` : key
    seen.add(key)
    return id
  }
  const rootNode = doc.nodes[doc.root]
  const walk = (id: NodeId, path: Path, view: ViewType | undefined, ancestors: PlacementContext[], depth: number) => {
    const n = doc.nodes[id]
    if (!n || depth > MAX_DEPTH) return
    if (n.type === 'container') {
      const v = view ?? n.defaultView
      for (const region of regionsOf?.(v) ?? []) {
        const p: RegionPlacement = {
          type: 'region',
          id: idFor(`${id}/${region}`, path),
          nodeId: id,
          region,
          view: v,
          data: n.data,
          path,
          ancestors,
        }
        list.push(p)
        byPath.set(pathKey(path) + '#' + region, p)
      }
      n.slots.forEach((s, index) =>
        walk(s.nodeId, [...path, s.id], slotView(doc, s), [...ancestors, { nodeId: id, title: n.title, view: v, data: n.data, index }], depth + 1),
      )
      return
    }
    const p: LeafPlacement = {
      type: 'leaf',
      id: idFor(id, path),
      nodeId: id,
      kind: n.content.kind,
      data: n.content.data,
      title: n.title,
      path,
      ancestors,
    }
    list.push(p)
    byPath.set(pathKey(path), p)
  }
  walk(doc.root, [], rootNode?.type === 'container' ? rootNode.defaultView : undefined, [], 0)
  return { list, byPath }
}

function get(doc: Doc, regionsOf?: RegionsOf) {
  let m = cache.get(doc)
  if (!m) cache.set(doc, (m = new Map()))
  let c = m.get(regionsOf)
  if (!c) m.set(regionsOf, (c = compute(doc, regionsOf)))
  return c
}

/** Everything the host app is asked to draw, in tree order. */
export const placements = (doc: Doc, regionsOf?: RegionsOf): Placement[] => get(doc, regionsOf).list

/** The placement id of the leaf shown at `path`. */
export const placementIdAt = (doc: Doc, path: Path, regionsOf?: RegionsOf): string | undefined =>
  get(doc, regionsOf).byPath.get(pathKey(path))?.id

/** The placement id of a container's region at `path`. */
export const regionIdAt = (doc: Doc, path: Path, region: string, regionsOf?: RegionsOf): string | undefined =>
  get(doc, regionsOf).byPath.get(pathKey(path) + '#' + region)?.id

/** The first place a leaf matching `match` is shown, if any. */
export function findLeaf(doc: Doc, match: (leaf: Leaf) => boolean): Path | null {
  for (const p of placements(doc)) {
    if (p.type !== 'leaf') continue
    const n = doc.nodes[p.nodeId]
    if (n?.type === 'leaf' && match(n)) return p.path
  }
  return null
}

/** Every leaf under `nodeId` (each once), e.g. to check whether a subtree may be mirrored. */
export function subtreeLeaves(doc: Doc, nodeId: NodeId): Leaf[] {
  const out: Leaf[] = []
  const seen = new Set<NodeId>()
  const walk = (id: NodeId) => {
    if (seen.has(id)) return
    seen.add(id)
    const n = doc.nodes[id]
    if (!n) return
    if (n.type === 'leaf') out.push(n)
    else for (const s of n.slots) walk(s.nodeId)
  }
  walk(nodeId)
  return out
}
