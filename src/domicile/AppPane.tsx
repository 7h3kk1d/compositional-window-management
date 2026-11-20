import type { ClientWindow } from '@domicile-desktop/sdk/desktop/windows'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { ContentProps } from '../content/registry'
import { useDesktop, type AppData } from './desktop'

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      /** Domicile's engine element: a Wayland window, sized and placed by its layout box. */
      app: { 'app-id': string; style?: CSSProperties; className?: string; ref?: Ref<HTMLElement> }
    }
  }
}

/** A popup and its own popups, at the offsets the client asked for, in its parent's coordinates. */
function PopupTree({ parent, all }: { parent: string; all: readonly ClientWindow[] }) {
  return all
    .filter((w) => w.parent === parent)
    .map((w) => (
      <div key={w.appId} className="app-popup" style={{ left: w.x ?? 0, top: w.y ?? 0 }}>
        <app app-id={w.appId} style={{ width: w.width ?? 0, height: w.height ?? 0, display: 'block' }} />
        <PopupTree parent={w.appId} all={all} />
      </div>
    ))
}

/**
 * Menus and tooltips may reach past their window's pane, which clips, so they
 * live in a page-level layer laid over the window's on-screen box (scaled by
 * any canvas zoom) and follow it each frame while open.
 */
function Popups({ appId, anchor, all }: { appId: string; anchor: RefObject<HTMLElement | null>; all: readonly ClientWindow[] }) {
  const layer = useRef<HTMLDivElement>(null)
  const open = all.some((w) => w.parent === appId)
  useLayoutEffect(() => {
    if (!open) return
    let frame = 0
    const follow = () => {
      const el = anchor.current
      const box = layer.current
      if (el && box) {
        const r = el.getBoundingClientRect()
        box.style.transform = `translate(${r.x}px, ${r.y}px) scale(${el.offsetWidth ? r.width / el.offsetWidth : 1})`
      }
      frame = requestAnimationFrame(follow)
    }
    follow()
    return () => cancelAnimationFrame(frame)
  }, [open, anchor])
  if (!open) return null
  return createPortal(
    <div ref={layer} className="app-popups">
      <PopupTree parent={appId} all={all} />
    </div>,
    document.body,
  )
}

/**
 * Every mounted `<app>` per window. A client has one size, and the engine
 * sends a box's size only when that box changes, so when one mirror of a
 * window unmounts the survivors are nudged 1px for a frame to re-send theirs.
 */
const mounted = new Map<string, Set<HTMLElement>>()

function trackMirror(appId: string) {
  return (el: HTMLElement | null) => {
    if (!el) return
    const set = mounted.get(appId) ?? new Set()
    mounted.set(appId, set.add(el))
    return () => {
      set.delete(el)
      for (const other of set) {
        other.style.width = 'calc(100% - 1px)'
        requestAnimationFrame(() => requestAnimationFrame(() => (other.style.width = '')))
      }
    }
  }
}

export function AppPane({ data }: ContentProps<AppData>) {
  const windows = useDesktop((s) => s.windows)
  const anchor = useRef<HTMLElement | null>(null)
  const ref = useMemo(() => {
    const track = trackMirror(data.appId)
    return (el: HTMLElement | null) => {
      anchor.current = el
      return track(el)
    }
  }, [data.appId])
  if (!windows) return <div className="app-missing">Native windows need Domicile (see README).</div>
  if (!windows.some((w) => w.appId === data.appId)) return <div className="app-missing">Window closed</div>
  return (
    <div className="app-kind">
      <app app-id={data.appId} ref={ref} />
      <Popups appId={data.appId} anchor={anchor} all={windows} />
    </div>
  )
}
