/**
 * A workspace instance: its own store, registries (views, content kinds,
 * commands) and per-instance bookkeeping. Nothing here is module-global, so
 * any number of workspaces can live on one page.
 */
import { createContext, useContext, useSyncExternalStore, type FC, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  createWorkspaceStore,
  type Container,
  type Doc,
  type Edge,
  type Path,
  type RegionsOf,
  type SlotMeta,
  type StoreOptions,
  type WorkspaceState,
  type WorkspaceStore,
} from '@cwm/core'
import type { DropAdapter } from './dnd/dropAdapters'
import type { ContentKind } from './content/registry'
import type { Ctx, Item } from './commands/commands'

// ---------------------------------------------------------------- views

export interface ViewProps {
  container: Container
  path: Path
  depth: number
}

/** A box inside a container, from a declarative (`layout`) view: a child, or one of the view's regions. */
export interface ChildBox {
  /** The child shown here… */
  slotId?: string
  /** …or a named region of the view, which the host app fills. */
  region?: string
  /** Pixels, relative to the container body. */
  x: number
  y: number
  w: number
  h: number
  z?: number
  hidden?: boolean
}

/** What a container type gets to work with, independent of any UI framework. */
export interface ViewHostCtx {
  container: Container
  path: Path
  /**
   * A stable element holding the child's window (its frame, or the slot an
   * app renders into). Put it wherever the view wants; it is never recreated.
   */
  childElement(slotId: string): HTMLElement
  /** Store per-child metadata for this view (kept alongside every other view's). */
  setSlotMeta(slotId: string, value: unknown): void
  /** Store this view's state on the container (shared by all its placements). */
  setViewState(value: unknown): void
  focus(slotId: string): void
  act(fn: (doc: Doc) => void, opts?: { key?: string }): void
}

export interface ViewDef {
  id: string
  label: string
  icon: string
  blurb?: string
  /** Drops are placed where the pointer is (no edge-splitting inside). */
  pointerPlaced?: boolean
  /** Which edges of a child split it when something is dropped on them; default all four. */
  splitEdges?: Edge[]

  /**
   * Named areas the view lays out besides its children (e.g. 'header'). The
   * host app fills them with its own UI, with full access to its own state:
   * they are placements like windows are (slot name = the region placement id).
   */
  regions?: string[]

  /** A React view (the built-ins are written this way). */
  Component?: FC<ViewProps>
  /** Small controls shown in the container's own header. */
  Controls?: FC<{ container: Container; path: Path }>

  /**
   * Tier 1, declarative: where each child goes, in pixels. The library draws
   * the frames (title bars, focus, drag and drop) at those boxes. Pure, so it
   * can be written in any language.
   */
  layout?(container: Container, box: { w: number; h: number }): ChildBox[]

  /**
   * Tier 2, full control: render the container yourself into `host`, placing
   * `ctx.childElement(id)` for each child wherever you like.
   */
  mount?(host: HTMLElement, ctx: ViewHostCtx): { update(ctx: ViewHostCtx): void; destroy(): void }

  /** Metadata for a child added to this container (default: none). */
  placement?(container: Container): SlotMeta[string]
  /** Insertion index for a drop at a screen point (default: nearest child in slot order). */
  dropIndex?(container: Container, x: number, y: number, host: HTMLElement): number
  /** Extra palette commands while this view is focused. */
  commands?(ctx: Ctx): Item[]
}

// ---------------------------------------------------------------- registries

export class Registry<T extends { id: string }> {
  private items = new Map<string, T>()
  private listeners = new Set<() => void>()
  version = 0

  constructor(initial: T[] = []) {
    for (const it of initial) this.items.set(it.id, it)
  }
  register = (item: T) => {
    this.items.set(item.id, item)
    this.emit()
    return () => this.unregister(item.id)
  }
  unregister = (id: string) => {
    if (this.items.delete(id)) this.emit()
  }
  get = (id: string): T | undefined => this.items.get(id)
  has = (id: string) => this.items.has(id)
  list = (): T[] => [...this.items.values()]
  ids = (): string[] => [...this.items.keys()]
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }
  private emit() {
    this.version++
    for (const fn of this.listeners) fn()
  }
}

/** A provider of palette commands (the root page). */
export interface CommandSource {
  id: string
  items(ctx: Ctx): Item[]
}

/** A palette page (opened by an item's `page`). */
export interface CommandPage {
  id: string
  title: string
  items(ctx: Ctx): Item[]
}

// ---------------------------------------------------------------- workspace

export interface Workspace {
  /** Unique per instance. */
  id: string
  store: WorkspaceStore
  get(): WorkspaceState
  act(fn: (doc: Doc) => void, opts?: { key?: string }): void
  views: Registry<ViewDef>
  kinds: Registry<ContentKind>
  commands: Registry<CommandSource>
  pages: Registry<CommandPage>
  /** How a drop at a screen point maps into each rendered container (by path key). */
  dropAdapters: Map<string, DropAdapter>
  /** Last measured size of each rendered canvas (to place new windows at its center). */
  canvasSizes: Map<string, { w: number; h: number }>
  /** The workspace's root element (`.cwm-root`), once rendered. */
  rootEl: HTMLElement | null
  /** Where to query for this workspace's elements (a document or shadow root). */
  root(): Document | ShadowRoot
  /** Can this node (and everything in it) be shown in two places at once? */
  mirrorable(nodeId: string): boolean
  /** Regions each view lays out (from the view registry). */
  regionsOf: RegionsOf
  /** React apps can fill regions directly; otherwise a region is a <slot> for the host. */
  renderRegion?: (p: { region: string; container: Container; path: Path }) => ReactNode
}

export interface WorkspaceOptions extends StoreOptions {
  renderRegion?: Workspace['renderRegion']
  views?: ViewDef[]
  kinds?: ContentKind[]
  commands?: CommandSource[]
  pages?: CommandPage[]
}

let counter = 0

export function createWorkspace(opts: WorkspaceOptions): Workspace {
  const store = createWorkspaceStore(opts)
  const ws: Workspace = {
    id: 'w' + counter++,
    store,
    get: () => store.getState(),
    act: (fn, o) => store.getState().act(fn, o),
    views: new Registry(opts.views ?? []),
    kinds: new Registry(opts.kinds ?? []),
    commands: new Registry(opts.commands ?? []),
    pages: new Registry(opts.pages ?? []),
    dropAdapters: new Map(),
    canvasSizes: new Map(),
    rootEl: null,
    regionsOf: (view) => ws.views.get(view)?.regions,
    renderRegion: opts.renderRegion,
    root: () => (ws.rootEl?.getRootNode() as Document | ShadowRoot | undefined) ?? document,
    mirrorable: (nodeId) => {
      const doc = store.getState().doc
      const seen = new Set<string>()
      const ok = (id: string): boolean => {
        if (seen.has(id)) return true
        seen.add(id)
        const n = doc.nodes[id]
        if (!n) return true
        if (n.type === 'leaf') return ws.kinds.get(n.content.kind)?.mirrorable !== false
        return n.slots.every((s) => ok(s.nodeId))
      }
      return ok(nodeId)
    },
  }
  // placements are cached per (doc, regionsOf): a fresh function when views change
  ws.views.subscribe(() => (ws.regionsOf = (view) => ws.views.get(view)?.regions))
  return ws
}

const WsContext = createContext<Workspace | null>(null)
export const WorkspaceProvider = WsContext.Provider

export function useWs(): Workspace {
  const ws = useContext(WsContext)
  if (!ws) throw new Error('[cwm] no workspace: render inside <Workspace>')
  return ws
}

/** Select from this workspace's store. */
export function useWsStore<T>(selector: (s: WorkspaceState) => T): T {
  return useStore(useWs().store, selector)
}

/** Re-render when a registry changes (e.g. an app registers a view after mount). */
export function useRegistry<T extends { id: string }>(r: Registry<T>): number {
  return useSyncExternalStore(r.subscribe, () => r.version)
}

/** The view's label and icon, tolerating views that are not registered (yet). */
export function viewInfo(ws: Workspace, id: string): ViewDef {
  return ws.views.get(id) ?? { id, label: id, icon: '?' }
}
