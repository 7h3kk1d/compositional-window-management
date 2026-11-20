/**
 * Hosts for container types defined without React:
 * - `layout` views return a box per child; frames are drawn at those boxes.
 * - `mount` views render their own chrome and place each child's element.
 * Both get the same drag and drop, focus and keyboard as built-in views.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { regionIdAt, setSlotMeta, setViewState, type Container, type Path } from '@cwm/core'
import { useWs, useWsStore, type ChildBox, type ViewDef, type ViewHostCtx, type Workspace } from '../workspace'
import { Child, useDropAdapter } from './NodeView'

type Props = { def: ViewDef; container: Container; path: Path; depth: number }

export function CustomView(props: Props) {
  return props.def.layout ? <LayoutView {...props} /> : <MountView {...props} />
}

/** Nearest child (by center) in slot order: before it if the pointer is on its leading half. */
function nearestIndex(els: (HTMLElement | undefined)[], x: number, y: number): number {
  let best = els.length
  let bestD = Infinity
  els.forEach((el, i) => {
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) return
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const d = Math.hypot(x - cx, y - cy)
    if (d < bestD) {
      bestD = d
      best = (r.width >= r.height ? x < cx : y < cy) ? i : i + 1
    }
  })
  return best
}

function useHostCtx(ws: Workspace, def: ViewDef, container: Container, path: Path, childElement: (id: string) => HTMLElement) {
  return useMemo<ViewHostCtx>(
    () => ({
      container,
      path,
      childElement,
      setSlotMeta: (slotId, value) =>
        ws.act((d) => setSlotMeta(d, container.id, slotId, def.id, value), { key: `${def.id}:${container.id}:${slotId}` }),
      setViewState: (value) => ws.act((d) => setViewState(d, container.id, def.id, value), { key: `${def.id}:${container.id}` }),
      focus: (slotId) => ws.get().setFocus([...path, slotId]),
      act: ws.act,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ws, def, container, path.join('/'), childElement],
  )
}

function LayoutView({ def, container, path, depth }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const cells = useRef(new Map<string, HTMLDivElement>())
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  useDropAdapter(path, (x, y) => ({
    index: def.dropIndex
      ? def.dropIndex(container, x, y, ref.current!)
      : nearestIndex(container.slots.map((s) => cells.current.get(s.id)), x, y),
  }))

  let boxes: ChildBox[] = []
  try {
    boxes = size.w ? def.layout!(container, size) : []
  } catch (e) {
    console.warn(`[cwm] layout of view "${def.id}" failed`, e)
  }
  const byId = new Map(boxes.filter((b) => b.slotId).map((b) => [b.slotId!, b]))
  const regions = boxes.filter((b) => b.region && !b.hidden)
  return (
    <div className="layout-view" ref={ref}>
      {regions.map((b) => (
        <div key={'r:' + b.region} className="layout-region" style={{ left: b.x, top: b.y, width: b.w, height: b.h, zIndex: b.z }}>
          <Region region={b.region!} container={container} path={path} />
        </div>
      ))}
      {!container.slots.length && <div className="empty">Empty {def.label.toLowerCase()}. ⌘K › Add.</div>}
      {container.slots.map((s) => {
        const b = byId.get(s.id)
        return (
          <div
            key={s.id}
            className="layout-cell"
            ref={(el) => {
              if (el) cells.current.set(s.id, el)
              else cells.current.delete(s.id)
            }}
            hidden={!b || b.hidden}
            style={b ? { left: b.x, top: b.y, width: b.w, height: b.h, zIndex: b.z } : undefined}
          >
            <Child container={container} slot={s} path={path} depth={depth} />
          </div>
        )
      })}
    </div>
  )
}

/** A view's region: filled by a React app directly, or by the host app through a slot. */
function Region({ region, container, path }: { region: string; container: Container; path: Path }) {
  const ws = useWs()
  const id = useWsStore((s) => regionIdAt(s.doc, path, region, ws.regionsOf)) ?? `${container.id}/${region}`
  if (ws.renderRegion) return <>{ws.renderRegion({ region, container, path })}</>
  return <slot name={id} className="cwm-slot" />
}

function MountView({ def, container, path, depth }: Props) {
  const ws = useWs()
  const host = useRef<HTMLDivElement>(null)
  // one stable element per child, created on demand and never recreated
  const els = useRef(new Map<string, HTMLElement>())
  const childElement = useMemo(
    () => (id: string) => {
      let el = els.current.get(id)
      if (!el) {
        el = document.createElement('div')
        el.className = 'cwm-child'
        el.dataset.slot = id
        els.current.set(id, el)
      }
      return el
    },
    [],
  )
  // make sure every current child has an element before portals render into them
  for (const s of container.slots) childElement(s.id)
  for (const id of [...els.current.keys()]) if (!container.slots.some((s) => s.id === id)) {
    els.current.get(id)!.remove()
    els.current.delete(id)
  }

  const ctx = useHostCtx(ws, def, container, path, childElement)
  const inst = useRef<ReturnType<NonNullable<ViewDef['mount']>> | null>(null)
  useLayoutEffect(() => {
    try {
      inst.current = def.mount!(host.current!, ctx)
    } catch (e) {
      console.warn(`[cwm] mounting view "${def.id}" failed`, e)
    }
    return () => {
      inst.current?.destroy()
      inst.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def])
  const first = useRef(true)
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    inst.current?.update(ctx)
  }, [ctx])

  useDropAdapter(path, (x, y) => ({
    index: def.dropIndex
      ? def.dropIndex(container, x, y, host.current!)
      : nearestIndex(container.slots.map((s) => els.current.get(s.id)), x, y),
  }))

  useEffect(() => () => els.current.forEach((el) => el.remove()), [])

  return (
    <div className="mount-view" ref={host}>
      {container.slots.map((s) =>
        createPortal(<Child container={container} slot={s} path={path} depth={depth} />, childElement(s.id), s.id),
      )}
    </div>
  )
}
