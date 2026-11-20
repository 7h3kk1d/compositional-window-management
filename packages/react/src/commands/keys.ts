/**
 * Keyboard control. Focus moves by what is on screen (so it works the same
 * in every view); moving and resizing are delegated to the view a window
 * sits in (src/model/moves.ts), so each key means the same thing in that
 * view's own terms.
 */
import { liftOut, resolvePath, setViewAt, setViewState, stackWith, viewAt } from '@cwm/core'
import { moveWindow, resizeWindow, type Dir } from '@cwm/core'
import { pathKey } from '@cwm/core'
import { type Container, type Path, type ViewType } from '@cwm/core'
import { canvasRects } from '@cwm/core'
import { canvasViewState } from '../views/canvasUtil'
import { scrollToColumn } from '../views/ScrollView'
import { addNodeFromKeys, buildCtx, focusTo, rootItems, type Ctx } from './commands'
import type { Workspace } from '../workspace'

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

const parsePath = (k: string): Path => (k ? k.split('/') : [])
const isRelated = (a: string, b: string) => a === b || a === '' || b === '' || a.startsWith(b + '/') || b.startsWith(a + '/')

function visibleFrames(ws: Workspace): HTMLElement[] {
  return Array.from(ws.rootEl?.querySelectorAll<HTMLElement>('.frame[data-path]') ?? []).filter((f) => {
    const r = f.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  })
}

/** Focus the nearest window in a direction, by on-screen position (i3/niri-style). */
export function focusDirection(ctx: Ctx, dir: Dir) {
  const from = pathKey(ctx.focus)
  const frames = visibleFrames(ctx.ws)
  const origin = frames.find((f) => f.dataset.path === from)
  if (!origin) return
  const A = origin.getBoundingClientRect()
  const keys = frames.map((f) => f.dataset.path!)
  // only the innermost visible windows, never the focused one's ancestors or descendants
  const candidates = frames.filter((f) => {
    const k = f.dataset.path!
    return !isRelated(k, from) && !keys.some((o) => o !== k && o.startsWith(k + '/'))
  })
  const ax = A.left + A.width / 2
  const ay = A.top + A.height / 2
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const f of candidates) {
    const B = f.getBoundingClientRect()
    const bx = B.left + B.width / 2
    const by = B.top + B.height / 2
    let primary: number
    let gap: number
    if (dir === 'left' || dir === 'right') {
      if (dir === 'right' ? bx <= ax + 1 : bx >= ax - 1) continue
      primary = dir === 'right' ? B.left - A.right : A.left - B.right
      gap = Math.max(0, Math.max(A.top, B.top) - Math.min(A.bottom, B.bottom))
    } else {
      if (dir === 'down' ? by <= ay + 1 : by >= ay - 1) continue
      primary = dir === 'down' ? B.top - A.bottom : A.top - B.bottom
      gap = Math.max(0, Math.max(A.left, B.left) - Math.min(A.right, B.right))
    }
    const off = dir === 'left' || dir === 'right' ? Math.abs(by - ay) : Math.abs(bx - ax)
    const score = Math.max(0, primary) + gap * 3 + off * 0.05
    if (score < bestScore) {
      bestScore = score
      best = f
    }
  }
  if (!best) return
  focusTo(ctx.ws, parsePath(best.dataset.path!))
  best.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function focusParent(ctx: Ctx) {
  if (ctx.focus.length) focusTo(ctx.ws, ctx.focus.slice(0, -1))
}

function focusChild(ctx: Ctx) {
  if (ctx.node.type !== 'container' || !ctx.node.slots.length) return
  const c = ctx.node
  const s = (viewAt(ctx.doc, ctx.focus) === 'tabs' && c.slots.find((x) => x.id === c.viewState.tabs?.active)) || c.slots[0]
  focusTo(ctx.ws, [...ctx.focus, s.id])
}

/** Previous/next tab of the nearest tabs container around the focus. */
function cycleTab(ctx: Ctx, delta: 1 | -1) {
  const f = ctx.focus
  for (let k = f.length; k >= 0; k--) {
    const p = f.slice(0, k)
    if (viewAt(ctx.doc, p) !== 'tabs') continue
    const c = resolvePath(ctx.doc, p).nodes.at(-1) as Container
    if (!c.slots.length) return
    const cur = k < f.length ? f[k] : (c.viewState.tabs?.active ?? c.slots[0].id)
    const i = Math.max(0, c.slots.findIndex((s) => s.id === cur))
    focusTo(ctx.ws, [...p, c.slots[(i + delta + c.slots.length) % c.slots.length].id])
    return
  }
}

function move(ctx: Ctx, dir: Dir) {
  let p: Path | null = null
  ctx.ws.act((d) => {
    p = moveWindow(d, ctx.focus, dir)
  })
  if (p) focusTo(ctx.ws, p)
}

function resize(ctx: Ctx, delta: 1 | -1) {
  ctx.ws.act((d) => void resizeWindow(d, ctx.focus, delta), { key: 'resize:' + pathKey(ctx.focus) })
}

/**
 * niri's consume-or-expel: a window that shares a stack (a titleless nested
 * split) with others leaves it on that side; a window on its own is stacked
 * into its neighbour on that side.
 */
export function stackOrExpel(ctx: Ctx, dir: -1 | 1) {
  if (!ctx.parent || !ctx.slot) return
  const parentPath = ctx.focus.slice(0, -1)
  const inStack =
    parentPath.length > 0 && !ctx.parent.title && viewAt(ctx.doc, parentPath) === 'split' && ctx.parent.slots.length > 1
  let p: Path | null = null
  if (inStack) {
    ctx.ws.act((d) => {
      p = liftOut(d, ctx.focus, dir)
    })
  } else {
    // stack across the container's main axis
    const v = viewAt(ctx.doc, parentPath)
    const across = v === 'split' && (ctx.parent.viewState.split?.direction ?? 'row') === 'column' ? 'row' : 'column'
    ctx.ws.act((d) => {
      p = stackWith(d, parentPath, ctx.slot!.id, dir, across)
    })
  }
  if (p) focusTo(ctx.ws, p)
}

/** Bring the focused window to the middle of the nearest scrolling strip or canvas. */
export function centerFocused(ctx: Ctx) {
  const f = ctx.focus
  for (let k = f.length - 1; k >= 0; k--) {
    const p = f.slice(0, k)
    const v = viewAt(ctx.doc, p)
    if (v === 'scroll') {
      const strip = ctx.ws.rootEl?.querySelector<HTMLElement>(`.frame[data-path="${pathKey(p)}"] .scroll-view`) ?? null
      scrollToColumn(strip, f[k], true)
      return
    }
    if (v === 'canvas') {
      const c = resolvePath(ctx.doc, p).nodes.at(-1) as Container
      const i = c.slots.findIndex((s) => s.id === f[k])
      const r = canvasRects(c, 'canvas')[i]
      const size = ctx.ws.canvasSizes.get(c.id) ?? { w: 800, h: 600 }
      const vs = canvasViewState(c)
      ctx.ws.act((d) =>
        setViewState(d, c.id, 'canvas', {
          ...vs,
          panX: size.w / 2 - (r.x + r.w / 2) * vs.zoom,
          panY: size.h / 2 - (r.y + r.h / 2) * vs.zoom,
        }),
      )
      return
    }
  }
  ctx.ws.rootEl
    ?.querySelector(`.frame[data-path="${pathKey(f)}"]`)
    ?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
}

const previousView = new Map<string, ViewType>()

/** Show the focused window's container as tabs, or back to what it was. */
export function toggleTabs(ctx: Ctx) {
  if (!ctx.focus.length) return
  const parentPath = ctx.focus.slice(0, -1)
  const key = pathKey(parentPath)
  const cur = viewAt(ctx.doc, parentPath)
  if (cur === 'tabs') {
    ctx.ws.act((d) => setViewAt(d, parentPath, previousView.get(key) ?? 'split'))
  } else {
    previousView.set(key, cur)
    ctx.ws.act((d) => setViewAt(d, parentPath, 'tabs'))
    focusTo(ctx.ws, ctx.focus) // make the focused window the open tab
  }
}

const ARROWS: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }

/** The workspace's keyboard handler (attach it to the workspace, or to the window for a full-page app). */
export function onWorkspaceKeyDown(ws: Workspace, e: KeyboardEvent) {
  const st = ws.get()
  const mod = e.metaKey || e.ctrlKey
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (st.paletteOpen) st.closePalette()
    else st.openPalette()
    return
  }
  if (mod && e.key.toLowerCase() === 'p') {
    e.preventDefault()
    st.openPalette('goto')
    return
  }
  if (st.paletteOpen) return
  if (mod && e.key.toLowerCase() === 'z' && !isEditable(e.target)) {
    e.preventDefault()
    if (e.shiftKey) st.redo()
    else st.undo()
    return
  }
  if (!e.altKey || mod) return
  // In text fields ⌥ types characters (– “ ≠ …): only ⌥Esc is ours, to leave the field.
  if (isEditable(e.target)) {
    if (e.code === 'Escape') {
      e.preventDefault()
      ;(e.target as HTMLElement).blur()
    }
    return
  }
  const ctx = buildCtx(ws)
  const dir = ARROWS[e.code]
  if (dir) {
    e.preventDefault()
    if (e.shiftKey) move(ctx, dir)
    else focusDirection(ctx, dir)
    return
  }
  const digit = /^Digit([1-9])$/.exec(e.code)
  if (digit) {
    e.preventDefault()
    const v: ViewType | undefined = ws.views.ids()[Number(digit[1]) - 1]
    if (v) ws.act((d) => setViewAt(d, ctx.containerPath, v))
    return
  }
  const run = (id: string) => rootItems(ctx).find((x) => x.id === id)?.run?.(ctx)
  const handled = (() => {
    switch (e.code) {
      case 'Escape':
        focusParent(ctx)
        return true
      case 'Enter':
        focusChild(ctx)
        return true
      case 'Comma':
        cycleTab(ctx, -1)
        return true
      case 'Period':
        cycleTab(ctx, 1)
        return true
      case 'Equal':
        resize(ctx, 1)
        return true
      case 'Minus':
        resize(ctx, -1)
        return true
      case 'BracketLeft':
        stackOrExpel(ctx, -1)
        return true
      case 'BracketRight':
        stackOrExpel(ctx, 1)
        return true
      case 'KeyC':
        centerFocused(ctx)
        return true
      case 'KeyT':
        toggleTabs(ctx)
        return true
      case 'KeyN':
        addNodeFromKeys(ctx)
        return true
      case 'KeyW':
        run('close')
        return true
      case 'KeyM':
        if (ctx.parent) st.openPalette(e.shiftKey ? 'mirror' : 'move')
        return true
      case 'Slash':
        st.openPalette('keys')
        return true
      default:
        return false
    }
  })()
  if (handled) e.preventDefault()
}
