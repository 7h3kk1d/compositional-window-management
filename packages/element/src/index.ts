/**
 * <cwm-workspace>: compositional window management for any framework.
 *
 * The window manager draws the layout (frames, tabs, splits, drag and drop,
 * keyboard, palette) inside its shadow root. The app draws everything inside
 * the windows, in its own render tree, as children of the element:
 *
 *   <cwm-workspace>
 *     <div slot="n_7f3a">…</div>   ← one child per placement (see `placements`)
 *   </cwm-workspace>
 *
 * Moving a window only reassigns its slot, so the app's DOM never moves:
 * iframes don't reload and editors keep their state.
 *
 * The window manager stores addresses (small payloads the app defines, e.g.
 * `{tree, path}`); the app stores the things they point at. Closing a window
 * never deletes app state, and a payload whose thing is gone is the app's to
 * show as missing.
 */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  findLeaf,
  makeContainer,
  makeLeaf,
  pathKey,
  placements,
  resolvePath,
  splitBeside,
  type Doc,
  type LayoutCommit,
  type Leaf,
  type Path,
  type Placement,
} from '@cwm/core'
import {
  addNode,
  BUILTIN_KINDS,
  BUILTIN_PAGES,
  BUILTIN_VIEWS,
  buildCtx,
  createWorkspace,
  focusTo,
  Workspace,
  type CommandSource,
  type ContentKind,
  type ViewDef,
  type WorkspaceInstance,
} from '@cwm/react'
import css from '@cwm/react/cwm.css?inline'

export type { Placement, LayoutCommit, ViewDef, ContentKind }
/** The document model and its operations, for apps building layouts and commands. */
export * as core from '@cwm/core'
export { addNode, addTarget, buildCtx, focusTo, type Ctx, type Item } from '@cwm/react'

export interface OpenOptions {
  /**
   * - 'reuse' (default): focus a window already showing this payload, else open one.
   * - 'focused': a new window next to the focused one, in its container.
   * A new window goes next to the most recently focused window of the same
   * kind when there is one (terms open among terms, not in the sidebar the
   * click came from), else next to the focused window.
   * - 'beside': split the focused window and open beside it.
   */
  where?: 'reuse' | 'focused' | 'beside'
  edge?: 'left' | 'right' | 'top' | 'bottom'
  /** Which existing window counts as "this payload" for 'reuse' (default: same kind and equal data). */
  match?: (data: unknown) => boolean
  title?: string
}

/** A content kind the app renders itself: by slot (default) or by a mount function. */
export interface AppKind {
  id: string
  label: string
  icon?: string
  /** Can two windows show the same payload at once? (Mirroring is semantic.) Default false. */
  mirrorable?: boolean
  /** Render into an element the workspace creates (in the light DOM, so it is never moved). */
  mount?(el: HTMLElement, p: { data: unknown; placementId: string }): { update?(data: unknown): void; destroy?(): void } | void
}

export interface WorkspaceConfig {
  /** The layout to start from when nothing was persisted. */
  doc?: Doc
  /** localStorage key to keep the layout under (or set the `storage-key` attribute). */
  storageKey?: string
  /** Built-in views to offer (default: all). App views are added with registerView. */
  views?: string[]
  /** Built-in content kinds to offer (default: none; the app brings its own). */
  builtinKinds?: string[]
  /** Who keeps undo history: the workspace ('own') or the app ('host'; see cwm-commit). */
  history?: 'own' | 'host'
  /**
   * Where shortcuts (⌘K, ⌥-keys, ⌘Z) are heard: while focus is in the
   * workspace (default), or anywhere on the page (a full-page app).
   */
  keyboard?: 'workspace' | 'window'
}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const emptyDoc = (): Doc => {
  const root = makeContainer('', 'tabs')
  return { root: root.id, nodes: { [root.id]: root } }
}

export class CwmWorkspace extends HTMLElement {
  /** Set before the element is connected (or call configure()). */
  config: WorkspaceConfig = {}
  #ws: WorkspaceInstance | null = null
  #root: Root | null = null
  #unsub: (() => void) | null = null
  #lastPlacements = ''
  #lastFocus = ''
  #mounted = new Map<string, { el: HTMLElement; inst: ReturnType<NonNullable<AppKind['mount']>>; data: unknown }>()
  #mountKinds = new Map<string, NonNullable<AppKind['mount']>>()
  #observer: MutationObserver | null = null
  #pending: (() => void)[] = []
  /** The last focused window of each kind (by node), to open its kind next to it. */
  #lastOfKind = new Map<string, string>()

  static get observedAttributes() {
    return ['storage-key', 'history', 'keyboard']
  }

  /** Configure and start (call before or instead of relying on attributes). */
  configure(config: WorkspaceConfig) {
    this.config = { ...this.config, ...config }
    return this
  }

  /** The underlying workspace (store, registries); null until connected. */
  get workspace() {
    return this.#ws
  }
  get doc(): Doc | undefined {
    return this.#ws?.get().doc
  }
  /** Replace the layout (recorded as one undoable change). */
  set doc(doc: Doc) {
    this.#whenReady((ws) => ws.get().replaceDoc(doc))
  }
  /** Put back an earlier layout without recording it (for `history: 'host'` undo). */
  restore(doc: Doc) {
    this.#whenReady((ws) => ws.get().restore(doc))
  }
  /** Everything the app is asked to draw right now. */
  get placements(): Placement[] {
    const ws = this.#ws
    return ws ? this.#appPlacements(ws) : []
  }

  connectedCallback() {
    // Lets code outside the app's render tree configure an element the app
    // renders (register kinds and views, set the starting doc) before it starts.
    if (!this.#ws) this.#emit('cwm-connect', this)
    // start after the current script finishes, so code right after the import /
    // element creation can configure() it and add listeners first
    queueMicrotask(() => this.#start())
  }

  #start() {
    if (this.#ws || !this.isConnected) return
    const cfg = this.config
    const history = cfg.history ?? (this.getAttribute('history') === 'host' ? 'host' : 'own')
    const storageKey = cfg.storageKey ?? this.getAttribute('storage-key') ?? undefined
    const views = cfg.views ? BUILTIN_VIEWS.filter((v) => cfg.views!.includes(v.id)) : BUILTIN_VIEWS
    const kinds = BUILTIN_KINDS.filter((k) => cfg.builtinKinds?.includes(k.id))
    const ws = createWorkspace({
      doc: cfg.doc ?? emptyDoc,
      persist: storageKey ?? false,
      history,
      onCommit: (c) => this.#emit('cwm-commit', c),
      onUndo: () => this.#emit('cwm-undo', null),
      onRedo: () => this.#emit('cwm-redo', null),
      views,
      kinds,
      pages: BUILTIN_PAGES,
    })
    this.#ws = ws

    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    shadow.innerHTML = ''
    const style = document.createElement('style')
    style.textContent =
      css +
      `
:host { display: block; position: relative; overflow: hidden; }
:host([dragging]) ::slotted(*) { pointer-events: none; }
::slotted(*) { flex: 1; min-width: 0; min-height: 0; }
`
    const mount = document.createElement('div')
    // fill the host whatever display the page gives it (block, flex or grid)
    mount.style.cssText = 'width:100%;height:100%;flex:1;min-width:0;min-height:0'
    shadow.append(style, mount)
    this.#root = createRoot(mount)
    const keyboard = cfg.keyboard ?? (this.getAttribute('keyboard') === 'window' ? 'window' : 'workspace')
    this.#root.render(createElement(Workspace, { ws, keyboard }))

    // drags over app content (e.g. iframes) need its pointer events off meanwhile
    queueMicrotask(() => {
      const rootEl = mount.querySelector('.cwm-root')
      if (!rootEl) return
      this.#observer = new MutationObserver(() =>
        this.toggleAttribute('dragging', rootEl.classList.contains('is-dragging') || rootEl.classList.contains('pointer-dragging')),
      )
      this.#observer.observe(rootEl, { attributes: true, attributeFilter: ['class'] })
    })

    this.#unsub = ws.store.subscribe(() => this.#sync())
    const off = ws.views.subscribe(() => this.#sync(true))
    const prev = this.#unsub
    this.#unsub = () => (prev(), off())
    for (const f of this.#pending.splice(0)) f()
    this.#sync(true)
  }

  disconnectedCallback() {
    // a move within the document reconnects right away: only tear down if it stays out
    queueMicrotask(() => {
      if (this.isConnected) return
      this.#unsub?.()
      this.#observer?.disconnect()
      this.#root?.unmount()
      for (const m of this.#mounted.values()) m.inst?.destroy?.()
      this.#mounted.clear()
      this.#root = null
      this.#ws = null
    })
  }

  // ------------------------------------------------------------ registration

  /** A kind of window content the app renders (by slot, or with `mount`). */
  registerKind(kind: AppKind) {
    if (kind.mount) this.#mountKinds.set(kind.id, kind.mount)
    const def: ContentKind = {
      id: kind.id,
      label: kind.label,
      icon: kind.icon ?? '▢',
      slotted: true,
      mirrorable: kind.mirrorable ?? false,
    }
    this.#whenReady((ws) => {
      ws.kinds.register(def)
      this.#sync(true)
    })
    return this
  }

  /** An app-defined container type (see ViewDef: `layout` or `mount`, optional `regions`). */
  registerView(view: ViewDef) {
    this.#whenReady((ws) => ws.views.register(view))
    return this
  }

  /** Palette commands, recomputed each time the palette opens. */
  registerCommands(source: CommandSource) {
    this.#whenReady((ws) => ws.commands.register(source))
    return this
  }

  // ------------------------------------------------------------ app requests

  /**
   * Show a payload in a window and focus it. Returns the window's placement id.
   */
  open(kind: string, data: unknown, opts: OpenOptions = {}): string | null {
    const ws = this.#ws
    if (!ws) return null
    const where = opts.where ?? 'reuse'
    const doc = ws.get().doc
    if (where === 'reuse') {
      const match = opts.match ?? ((d: unknown) => equal(d, data))
      const p = findLeaf(doc, (l: Leaf) => l.content.kind === kind && match(l.content.data))
      if (p) {
        focusTo(ws, p)
        return this.#placementAt(ws, p)
      }
    }
    const leaf = makeLeaf(opts.title ?? '', kind, data)
    const focus = ws.get().focus
    if (where === 'beside' && focus.length) {
      // beside the focused *window* (not a container that holds the focus)
      let path: Path | null = null
      ws.act((d) => {
        d.nodes[leaf.id] = leaf
        path = splitBeside(d, focus, leaf.id, opts.edge ?? 'right')
        if (!path) throw new Error('cannot split here')
      })
      if (path) {
        focusTo(ws, path)
        return this.#placementAt(ws, path)
      }
    }
    // next to the last focused window of this kind, if it is still shown
    const all = placements(ws.get().doc)
    const lastNode = this.#lastOfKind.get(kind)
    const near =
      (lastNode && all.find((p) => p.nodeId === lastNode)?.path) ||
      all.find((p) => p.type === 'leaf' && p.kind === kind)?.path
    if (near) ws.get().setFocus(near)
    const path = addNode(buildCtx(ws), leaf)
    return path ? this.#placementAt(ws, path) : null
  }

  /** Focus the first window showing this node. */
  focusNode(nodeId: string) {
    const ws = this.#ws
    if (!ws) return
    const p = placements(ws.get().doc).find((x) => x.nodeId === nodeId)
    if (p) focusTo(ws, p.path)
  }

  /** Focus a window by placement id. */
  focusPlacement(placementId: string) {
    const ws = this.#ws
    if (!ws) return
    const p = this.#appPlacements(ws).find((x) => x.id === placementId)
    if (p) focusTo(ws, p.path)
  }

  /** Close a window (its node is kept, restorable from the palette). */
  closePlacement(placementId: string) {
    const ws = this.#ws
    if (!ws) return
    const p = this.#appPlacements(ws).find((x) => x.id === placementId)
    if (!p || !p.path.length) return
    const { nodes } = resolvePath(ws.get().doc, p.path.slice(0, -1))
    const parent = nodes[nodes.length - 1]
    const sid = p.path[p.path.length - 1]
    ws.act((d) => {
      const c = d.nodes[parent.id]
      if (c?.type === 'container') c.slots = c.slots.filter((s) => s.id !== sid)
    })
  }

  /**
   * Merge fields into a window's or container's payload (a field set to
   * null is removed): e.g. pin one setting of a window, or change a default
   * a container gives its children.
   */
  patchData(nodeId: string, patch: Record<string, unknown>) {
    this.#ws?.act(
      (d) => {
        const n = d.nodes[nodeId]
        if (!n) return
        const cur = (n.type === 'leaf' ? n.content.data : n.data) ?? {}
        const next: Record<string, unknown> = { ...(cur as Record<string, unknown>) }
        for (const [k, v] of Object.entries(patch)) if (v === null) delete next[k]
        else next[k] = v
        if (n.type === 'leaf') n.content.data = next
        else n.data = next
      },
      { key: 'patch:' + nodeId },
    )
  }

  /** Update a window's payload (e.g. after a rename in the app). */
  setData(nodeId: string, data: unknown) {
    this.#ws?.act((d) => {
      const n = d.nodes[nodeId]
      if (n?.type === 'leaf') n.content.data = data
      else if (n) n.data = data
    })
  }

  // ------------------------------------------------------------ internals

  #whenReady(f: (ws: WorkspaceInstance) => void) {
    if (this.#ws) f(this.#ws)
    else this.#pending.push(() => f(this.#ws!))
  }

  #emit(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }))
  }

  #placementAt(ws: WorkspaceInstance, path: Path) {
    const k = pathKey(path)
    return this.#appPlacements(ws).find((p) => pathKey(p.path) === k && p.type === 'leaf')?.id ?? null
  }

  /** Placements the app draws: windows of app kinds, and regions of views. */
  #appPlacements(ws: WorkspaceInstance): Placement[] {
    return placements(ws.get().doc, ws.regionsOf).filter(
      (p) => p.type === 'region' || ws.kinds.get(p.kind)?.slotted,
    )
  }

  #sync(force = false) {
    const ws = this.#ws
    if (!ws) return
    const list = this.#appPlacements(ws)
    const sig = JSON.stringify(list.map((p) => [p.id, p.type === 'leaf' ? p.kind : p.region, p.data, p.path, p.ancestors]))
    if (force || sig !== this.#lastPlacements) {
      this.#lastPlacements = sig
      this.#syncMounted(list)
      this.#emit('cwm-placements', list)
    }
    const st = ws.get()
    const focusKey = pathKey(st.focus)
    if (focusKey !== this.#lastFocus) {
      this.#lastFocus = focusKey
      const p = list.find((x) => x.type === 'leaf' && pathKey(x.path) === focusKey)
      if (p?.type === 'leaf') this.#lastOfKind.set(p.kind, p.nodeId)
      this.#emit('cwm-focus', { path: st.focus, placement: p ?? null })
    }
    this.#emit('cwm-change', { doc: st.doc })
  }

  /** Kinds registered with `mount`: the element keeps their slotted children itself. */
  #syncMounted(list: Placement[]) {
    const live = new Set<string>()
    for (const p of list) {
      if (p.type !== 'leaf') continue
      const mount = this.#mountKinds.get(p.kind)
      if (!mount) continue
      live.add(p.id)
      const cur = this.#mounted.get(p.id)
      if (cur) {
        if (!equal(cur.data, p.data)) {
          cur.data = p.data
          cur.inst?.update?.(p.data)
        }
        continue
      }
      const el = document.createElement('div')
      el.slot = p.id
      el.style.cssText = 'display:flex;flex-direction:column;overflow:auto'
      this.append(el)
      this.#mounted.set(p.id, { el, inst: mount(el, { data: p.data, placementId: p.id }), data: p.data })
    }
    for (const [id, m] of this.#mounted) {
      if (live.has(id)) continue
      m.inst?.destroy?.()
      m.el.remove()
      this.#mounted.delete(id)
    }
  }
}

if (!customElements.get('cwm-workspace')) customElements.define('cwm-workspace', CwmWorkspace)

declare global {
  interface HTMLElementTagNameMap {
    'cwm-workspace': CwmWorkspace
  }
}
