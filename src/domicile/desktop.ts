/**
 * Native Wayland windows as leaves, when the app runs as a Domicile shell
 * (Domicile's compositor is a Chromium fork: each client window is an `<app>`
 * element, sized and placed by its layout box).
 *
 * The document stays the source of truth for layout; this module keeps two
 * invariants between it and the compositor's window list:
 *  - every open toplevel has at least one reachable `app` leaf (new windows
 *    open beside the focused window, as ⌥N does);
 *  - no reachable `app` leaf names a closed window.
 * Both are restored after every document change too, so undo, "load layout"
 * or closing a pane can't strand a live window off-screen.
 */
import type { ClientWindow } from '@domicile-desktop/sdk/desktop/windows'
import type { Domicile } from '@domicile-desktop/sdk/shell'
import { WindowRequestKind, WindowState } from '@domicile-desktop/sdk/window-state'
import { produce } from 'immer'
import { create } from 'zustand'
import { addTarget, buildCtx } from '../commands/commands'
import { addChild, makeLeaf, occurrences, reachable, removeSlot, resolvePath, reveal } from '../model/ops'
import { useStore } from '../model/store'
import type { Doc, Leaf, NodeId } from '../model/types'

export const APP_KIND = 'app'

/**
 * Domicile numbers app ids per session (`app-1`, …), so a pane saved from an
 * earlier session would otherwise claim an unrelated new window: the client's
 * pid is part of the identity.
 */
export interface AppData {
  appId: string
  pid: number | null
}

interface DesktopState {
  domicile: Domicile | null
  /** Every listed window, popups included; null until the first list arrives. */
  windows: readonly ClientWindow[] | null
  /**
   * Domicile has delivered its window list. Until then `windows` may be empty
   * although apps are open (as after a shell reload), so no pane is removed.
   */
  listed: boolean
  focused: string | undefined
  /** The window shown over the whole screen, as its client asked or Super+F did. */
  fullscreen: string | undefined
  /** A one-line message over the desktop, such as a logout confirmation. */
  notice: string | undefined
}

export const useDesktop = create<DesktopState>(() => ({
  domicile: null,
  windows: null,
  listed: false,
  focused: undefined,
  fullscreen: undefined,
  notice: undefined,
}))

const appDataOf = (n: Doc['nodes'][NodeId] | undefined): AppData | undefined =>
  n?.type === 'leaf' && n.content.kind === APP_KIND ? (n.content.data as AppData) : undefined
const appIdOf = (n: Doc['nodes'][NodeId] | undefined) => appDataOf(n)?.appId
const identity = ({ appId, pid }: AppData) => `${appId}#${pid ?? ''}`
const windowData = (w: ClientWindow): AppData => ({ appId: w.appId, pid: w.pid ?? null })

const isToplevel = (w: ClientWindow) => w.parent === undefined
/**
 * Windows that get a pane. A dialog (a client that gave its window a parent
 * or a fixed size: file choosers, prompts, pinentry) floats over the desktop
 * at the size it drew instead; see `Overlays.tsx`.
 */
export const isTiled = (w: ClientWindow) => isToplevel(w) && !w.dialog
export const isFloating = (w: ClientWindow) => isToplevel(w) && w.dialog

/** Doc edits made to follow the compositor skip undo history: undoing one would only be re-synced. */
export const edit = (fn: (d: Doc) => void) => {
  const { doc } = useStore.getState()
  const next = produce(doc, (d) => {
    fn(d)
  })
  if (next !== doc) useStore.setState({ doc: next })
}

// sync's own edits notify the store subscription, which must not re-enter it
// mid-pass: the inner pass would add a window the outer one then adds again.
let syncing = false

function sync() {
  if (syncing) return
  syncing = true
  try {
    syncPass()
  } finally {
    syncing = false
  }
}

function syncPass() {
  const { windows, listed } = useDesktop.getState()
  if (!windows) return
  const open = new Map(
    windows.filter(isTiled).map((w) => [identity(windowData(w)), { title: w.title || w.desktopId || 'Window', data: windowData(w) }]),
  )
  reconcile(APP_KIND, open, identity, listed)
}

/**
 * Keeps one reachable leaf of `kind` per entry of `open` (keyed as `keyOf`
 * keys a leaf's data): retitles the ones shown, removes the ones whose entry
 * has gone (only once `listed`, since a reloaded shell first sees an empty
 * list), and adds a pane beside the focused one for each new entry, as ⌥N
 * does. Native windows and browser windows (`browser.ts`) both sync this way.
 */
export function reconcile<D>(
  kind: string,
  open: ReadonlyMap<string, { title: string; data: D }>,
  keyOf: (data: D) => string,
  listed: boolean,
) {
  const { doc } = useStore.getState()
  const live = reachable(doc)

  const shown = new Set<string>()
  const stale: Leaf[] = []
  const retitle: [NodeId, string][] = []
  for (const id of live) {
    const n = doc.nodes[id]
    if (n?.type !== 'leaf' || n.content.kind !== kind) continue
    const key = keyOf(n.content.data as D)
    const entry = open.get(key)
    if (!entry) {
      if (listed) stale.push(n)
    } else {
      shown.add(key)
      if (n.title !== entry.title) retitle.push([id, entry.title])
    }
  }

  if (stale.length || retitle.length)
    edit((d) => {
      for (const leaf of stale)
        for (const path of occurrences(d, leaf.id)) {
          const { nodes } = resolvePath(d, path)
          removeSlot(d, nodes[nodes.length - 2].id, path[path.length - 1])
        }
      for (const [id, title] of retitle) d.nodes[id].title = title
    })

  for (const [key, entry] of open) {
    if (shown.has(key)) continue
    const t = addTarget(buildCtx())
    let sid = ''
    edit((d) => {
      sid = addChild(d, t.container.id, makeLeaf(entry.title, kind, entry.data), {
        meta: t.meta,
        index: t.index,
        parentView: t.view,
      })
      reveal(d, [...t.path, sid])
    })
    if (sid) useStore.getState().setFocus([...t.path, sid])
  }
}

/** Keyboard follows the focused pane: an app pane gets it, anything else gives it back to the page. */
function pushFocus() {
  const { domicile, focused } = useDesktop.getState()
  if (!domicile) return
  const { doc, focus } = useStore.getState()
  const { nodes } = resolvePath(doc, focus)
  const appId = appIdOf(nodes[nodes.length - 1])
  if (appId !== undefined && appId !== focused) domicile.windows.focus(appId)
  else if (appId === undefined && focused !== undefined) domicile.windows.focusShell()
}

/** A click (or the app itself) took the keyboard: focus that window's pane. */
function pullFocus() {
  const { focused } = useDesktop.getState()
  if (focused === undefined) return
  const { doc, focus } = useStore.getState()
  const { nodes } = resolvePath(doc, focus)
  if (appIdOf(nodes[nodes.length - 1]) === focused) return
  const leaf = [...reachable(doc)].find((id) => appIdOf(doc.nodes[id]) === focused)
  const path = leaf && occurrences(doc, leaf, 1)[0]
  if (path) useStore.getState().setFocus(path)
}

/**
 * Every window is tiled on all edges. Without it a client may commit any
 * size it likes (mpv keeps its video's aspect), and the engine draws the
 * whole buffer past its pane.
 */
const TILED = [WindowState.TiledLeft, WindowState.TiledRight, WindowState.TiledTop, WindowState.TiledBottom]

/** Show `appId` over the whole screen, or put it back in its pane (`undefined`). */
export function setFullscreen(appId: string | undefined) {
  const { domicile, fullscreen } = useDesktop.getState()
  if (!domicile || appId === fullscreen) return
  if (fullscreen !== undefined) void domicile.windows.setStates(fullscreen, TILED)
  if (appId !== undefined) void domicile.windows.setStates(appId, [WindowState.Fullscreen])
  useDesktop.setState({ fullscreen: appId })
}

/** The app in the focused pane, if any. */
export function focusedApp(): string | undefined {
  const { doc, focus } = useStore.getState()
  const { nodes } = resolvePath(doc, focus)
  return appIdOf(nodes[nodes.length - 1])
}

/**
 * Grants a client's fullscreen requests (a video, a game, F11) and ignores
 * maximize: a tiled window already fills its pane.
 */
async function followRequests(domicile: Domicile, signal: { stopped: boolean }) {
  const listening = await domicile.windows.requests()
  listening.match({
    Err: async (error) => console.warn('[cwm] window requests unavailable:', error.message),
    Ok: async ({ items, stop }) => {
      if (signal.stopped) return stop()
      const reader = items.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done || signal.stopped) return stop()
        if (value.kind === WindowRequestKind.Fullscreen) setFullscreen(value.appId)
        else if (value.kind === WindowRequestKind.Unfullscreen && useDesktop.getState().fullscreen === value.appId)
          setFullscreen(undefined)
      }
    },
  })
}

/**
 * A client asked for the keyboard (a link opened in a running browser, a
 * dialog): reveal and focus its pane, or give it the keyboard if it floats.
 */
function grantFocus(domicile: Domicile, appId: string) {
  const w = domicile.windows.list.find((x) => x.appId === appId)
  if (!w) return
  if (isFloating(w)) return domicile.windows.focus(appId)
  const { doc } = useStore.getState()
  const leaf = [...reachable(doc)].find((id) => appIdOf(doc.nodes[id]) === appId)
  const path = leaf && occurrences(doc, leaf, 1)[0]
  if (!path) return
  edit((d) => reveal(d, path))
  useStore.getState().setFocus(path)
  domicile.windows.focus(appId)
}

export function connect(domicile: Domicile): () => void {
  const tiled = new Set<string>()
  const tile = () => {
    for (const w of domicile.windows.list ?? [])
      if (isTiled(w) && !tiled.has(w.appId)) {
        tiled.add(w.appId)
        void domicile.windows.setStates(w.appId, TILED)
      }
  }
  const read = (listed: boolean) => {
    tile()
    const windows = domicile.windows.list ?? null
    const floating = windows?.filter(isFloating).map((w) => w.appId) ?? []
    const before = new Set(useDesktop.getState().windows?.filter(isFloating).map((w) => w.appId))
    useDesktop.setState((s) => ({
      domicile,
      windows,
      focused: domicile.windows.focused,
      listed: s.listed || listed,
      fullscreen: windows?.some((w) => w.appId === s.fullscreen) ? s.fullscreen : undefined,
    }))
    // A new dialog takes the keyboard, as it would on any desktop.
    const opened = floating.filter((id) => !before.has(id))
    if (listed && opened.length) domicile.windows.focus(opened[opened.length - 1])
  }
  read(false)
  sync()
  const signal = { stopped: false }
  followRequests(domicile, signal).catch((e: unknown) => console.warn('[cwm] window requests stopped:', e))
  const offs = [
    () => (signal.stopped = true),
    domicile.windows.on('focusrequest', (appId) => grantFocus(domicile, appId)),
    domicile.windows.on('change', () => {
      read(true)
      sync()
    }),
    // A page is sent the window list before its first focus change.
    domicile.windows.on('focuschange', () => {
      read(true)
      sync()
      pullFocus()
    }),
    useStore.subscribe((s, prev) => {
      if (s.doc !== prev.doc) sync()
      if (s.focus !== prev.focus) pushFocus()
    }),
  ]
  return () => offs.forEach((off) => off())
}

/** Closing an app pane closes the window; the pane goes when the compositor says it's gone. */
export function closeApp(appId: string) {
  useDesktop.getState().domicile?.windows.close(appId)
}
