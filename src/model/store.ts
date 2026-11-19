import { produce } from 'immer'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { seedDoc } from './seed'
import type { Doc, NodeId, Path } from './types'
import { validPath } from './ops'

const HISTORY = 100

interface State {
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
  replaceDoc: (doc: Doc) => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      doc: seedDoc(),
      focus: [],
      past: [],
      future: [],
      lastKey: null,
      lastAt: 0,
      paletteOpen: false,
      palettePage: null,
      highlight: null,

      act: (fn, opts) => {
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
        const now = Date.now()
        const coalesce = opts?.key && opts.key === lastKey && now - lastAt < 800
        set({
          doc: next,
          past: coalesce ? past : [...past.slice(-HISTORY + 1), doc],
          future: [],
          lastKey: opts?.key ?? null,
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
        const { past, doc, future, focus } = get()
        if (!past.length) return
        const prev = past[past.length - 1]
        set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], lastKey: null, focus: validPath(prev, focus) })
      },
      redo: () => {
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
        set({ doc, past: [...get().past, prev], future: [], focus: [] })
      },
    }),
    {
      name: 'cwm-doc-v1',
      partialize: (s) => ({ doc: s.doc, focus: s.focus }),
    },
  ),
)

export const act = (fn: (doc: Doc) => void, opts?: { key?: string }) => useStore.getState().act(fn, opts)

export const pathKey = (p: Path) => p.join('/')
