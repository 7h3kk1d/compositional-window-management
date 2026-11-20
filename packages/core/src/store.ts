import { produce } from 'immer'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { Doc, NodeId, Path } from './types'
import { validPath } from './ops'

const HISTORY = 100

export interface WorkspaceState {
  doc: Doc
  focus: Path
  past: Doc[]
  future: Doc[]
  lastKey: string | null
  lastAt: number
  paletteOpen: boolean
  palettePage: string | null
  /** Node whose occurrences are flashed (mirrors). */
  highlight: NodeId | null

  /**
   * Apply a document mutation. Calls sharing `key` within 800ms are folded
   * into one undo step (e.g. dragging a window).
   */
  act: (fn: (doc: Doc) => void, opts?: { key?: string }) => void
  setFocus: (path: Path) => void
  undo: () => void
  redo: () => void
  openPalette: (page?: string | null) => void
  closePalette: () => void
  setHighlight: (id: NodeId | null) => void
  /** Swap in a whole new document (undoable). */
  replaceDoc: (doc: Doc) => void
  /**
   * Set the document without recording history: for a host app undoing a
   * layout change it recorded itself (`history: 'host'`).
   */
  restore: (doc: Doc) => void
}

/** One layout transaction, reported to a host app that keeps the undo history. */
export interface LayoutCommit {
  before: Doc
  after: Doc
  /** Same key within 800ms: the host may fold these into one undo step (a drag, a resize). */
  key?: string
}

export type WorkspaceStore = StoreApi<WorkspaceState>

export interface StoreOptions {
  /** The document to start from when nothing was persisted. */
  doc: Doc | (() => Doc)
  /**
   * Where the layout is kept between sessions: a localStorage key, a custom
   * storage (anything with get/set/removeItem), or false to keep nothing.
   */
  persist?: string | { key: string; storage: StateStorage } | false
  /**
   * Who keeps undo history for the layout:
   * - 'own' (default): the workspace keeps its own undo stack.
   * - 'host': the app does. Each change is reported to `onCommit` and nothing
   *   is recorded here; undo/redo requests go to `onUndo`/`onRedo`, and the app
   *   puts an old layout back with `restore(doc)`. One stack, true order.
   */
  history?: 'own' | 'host'
  onCommit?: (c: LayoutCommit) => void
  onUndo?: () => void
  onRedo?: () => void
}

/** One store per workspace: several workspaces on a page never share state. */
export function createWorkspaceStore(opts: StoreOptions): WorkspaceStore {
  const initial = typeof opts.doc === 'function' ? opts.doc : () => opts.doc as Doc
  const init = (set: (s: Partial<WorkspaceState>) => void, get: () => WorkspaceState): WorkspaceState => ({
    doc: initial(),
    focus: [],
    past: [],
    future: [],
    lastKey: null,
    lastAt: 0,
    paletteOpen: false,
    palettePage: null,
    highlight: null,

    act: (fn, o) => {
      const { doc, past, lastKey, lastAt, focus } = get()
      let next: Doc
      try {
        // Discard fn's return value: ops like wrap() return ids, and immer
        // would otherwise treat a returned value as a replacement document.
        next = produce(doc, (d) => {
          fn(d)
        })
      } catch (e) {
        console.warn('[cwm] action failed', e)
        return
      }
      if (next === doc) return
      if (opts.history === 'host') {
        set({ doc: next, focus: validPath(next, focus) })
        opts.onCommit?.({ before: doc, after: next, key: o?.key })
        return
      }
      const now = Date.now()
      const coalesce = o?.key && o.key === lastKey && now - lastAt < 800
      set({
        doc: next,
        past: coalesce ? past : [...past.slice(-HISTORY + 1), doc],
        future: [],
        lastKey: o?.key ?? null,
        lastAt: now,
        focus: validPath(next, focus),
      })
    },
    setFocus: (path) => {
      const cur = get().focus
      if (cur.length === path.length && cur.every((x, i) => x === path[i])) return
      set({ focus: path })
    },
    undo: () => {
      if (opts.history === 'host') return opts.onUndo?.()
      const { past, doc, future, focus } = get()
      if (!past.length) return
      const prev = past[past.length - 1]
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], lastKey: null, focus: validPath(prev, focus) })
    },
    redo: () => {
      if (opts.history === 'host') return opts.onRedo?.()
      const { past, doc, future, focus } = get()
      if (!future.length) return
      const next = future[0]
      set({ doc: next, past: [...past, doc], future: future.slice(1), lastKey: null, focus: validPath(next, focus) })
    },
    openPalette: (page = null) => set({ paletteOpen: true, palettePage: page }),
    closePalette: () => set({ paletteOpen: false, palettePage: null }),
    setHighlight: (id) => set({ highlight: id }),
    replaceDoc: (doc) => {
      const prev = get().doc
      if (opts.history === 'host') {
        set({ doc, focus: [] })
        opts.onCommit?.({ before: prev, after: doc })
        return
      }
      set({ doc, past: [...get().past, prev], future: [], focus: [] })
    },
    restore: (doc) => set({ doc, focus: validPath(doc, get().focus) }),
  })

  const p = opts.persist ?? false
  if (p === false) return createStore<WorkspaceState>()((set, get) => init(set, get))
  const key = typeof p === 'string' ? p : p.key
  const storage = typeof p === 'string' ? undefined : p.storage
  return createStore<WorkspaceState>()(
    persist((set, get) => init(set, get), {
      name: key,
      version: 2,
      ...(storage ? { storage: createJSONStorage(() => storage) } : {}),
      partialize: (s) => ({ doc: s.doc, focus: s.focus }),
      migrate: (persisted, version) => {
        const state = persisted as { doc: Doc; focus: Path }
        if (version < 2) migrateViewsToSlots(state.doc)
        return state as unknown as WorkspaceState
      },
      // a stored document that no longer resolves falls back to the initial one
      merge: (persisted, current) => {
        const s = persisted as Partial<WorkspaceState> | undefined
        if (!s?.doc?.nodes?.[s.doc.root]) return current
        return { ...current, doc: s.doc, focus: validPath(s.doc, s.focus ?? []) }
      },
    }),
  )
}

/**
 * v1 → v2: views moved from containers onto slots (per placement). The old
 * `container.view` becomes `defaultView`, and every existing placement of a
 * container gets that view.
 */
function migrateViewsToSlots(doc: Doc) {
  const nodes = doc.nodes as unknown as Record<string, Record<string, unknown>>
  for (const n of Object.values(nodes)) {
    if (n.type === 'container' && 'view' in n) {
      n.defaultView = n.view
      delete n.view
    }
  }
  for (const n of Object.values(doc.nodes)) {
    if (n.type !== 'container') continue
    for (const s of n.slots) {
      const child = doc.nodes[s.nodeId]
      if (child?.type === 'container' && !s.view) s.view = child.defaultView
    }
  }
}

export const pathKey = (p: Path) => p.join('/')
export const parsePath = (k: string): Path => (k ? k.split('/') : [])
