import { useEffect, useRef } from 'react'
import { getContainer, setSlotMeta, setViewState } from '../model/ops'
import { act, useStore } from '../model/store'
import type { Rect } from '../model/types'
import { canvasRects, DEFAULT_H, DEFAULT_W, isDerived } from '../model/viewMeta'
import { canvasSizes, canvasViewState, DEFAULT_VS } from './canvasUtil'
import { Child, startPointerDrag, useDropAdapter, type ViewProps } from './NodeView'

function SpatialView({ container, path, depth, bounded }: ViewProps & { bounded: boolean }) {
  const view = bounded ? 'floating' : 'canvas'
  const ref = useRef<HTMLDivElement>(null)
  const vs = bounded ? DEFAULT_VS : canvasViewState(container)
  const rects = canvasRects(container, view)
  const maxZ = rects.reduce((m, r) => Math.max(m, r.z), 0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (el.clientWidth) canvasSizes.set(container.id, { w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [container.id])

  const toWorld = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: (clientX - r.left - vs.panX) / vs.zoom, y: (clientY - r.top - vs.panY) / vs.zoom }
  }

  useDropAdapter(path, (x, y) => {
    const p = toWorld(x, y)
    return { meta: { [view]: { x: p.x - 20, y: p.y - 12, w: DEFAULT_W, h: DEFAULT_H, z: maxZ + 1 } } }
  })

  // wheel: pan, ctrl/⌘+wheel (or pinch): zoom around the pointer
  useEffect(() => {
    const el = ref.current
    if (!el || bounded) return
    const onWheel = (e: WheelEvent) => {
      // let scrollable content inside windows scroll
      const inWindow = (e.target as HTMLElement).closest('.canvas-item')
      if (inWindow && !e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const cur = canvasViewState(getContainer(useStore.getState().doc, container.id))
      let next
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        const px = e.clientX - r.left
        const py = e.clientY - r.top
        const zoom = Math.min(3, Math.max(0.1, cur.zoom * Math.exp(-e.deltaY * 0.01)))
        const k = zoom / cur.zoom
        next = { zoom, panX: px - (px - cur.panX) * k, panY: py - (py - cur.panY) * k }
      } else {
        next = { ...cur, panX: cur.panX - e.deltaX, panY: cur.panY - e.deltaY }
      }
      act((d) => setViewState(d, container.id, 'canvas', next), { key: 'pan:' + container.id })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [bounded, container.id])

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (bounded || e.target !== e.currentTarget) return
    const start = vs
    startPointerDrag(e, (dx, dy) =>
      act((d) => setViewState(d, container.id, 'canvas', { ...start, panX: start.panX + dx, panY: start.panY + dy }), {
        key: 'pan:' + container.id,
      }),
    )
  }

  const clamp = (r: Rect): Rect => {
    if (!bounded || !ref.current) return r
    const W = ref.current.clientWidth
    const H = ref.current.clientHeight
    const w = Math.min(r.w, W)
    const h = Math.min(r.h, H)
    return { ...r, w, h, x: Math.max(0, Math.min(W - w, r.x)), y: Math.max(0, Math.min(H - h, r.y)) }
  }

  const write = (slotId: string, r: Rect, key: string) =>
    act((d) => setSlotMeta(d, container.id, slotId, view, clamp(r)), { key })

  const raise = (slotId: string, r: Rect) => {
    if (r.z < maxZ || isDerived(container.slots.find((s) => s.id === slotId)!, view)) {
      write(slotId, { ...r, z: r.z < maxZ ? maxZ + 1 : r.z }, 'raise:' + slotId)
    }
  }

  return (
    <div className={`canvas-view ${bounded ? 'bounded' : 'infinite'}`} ref={ref} onPointerDown={onBackgroundDown}>
      {!bounded && (
        <div
          className="canvas-grid"
          style={{
            backgroundPosition: `${vs.panX}px ${vs.panY}px`,
            backgroundSize: `${24 * vs.zoom}px ${24 * vs.zoom}px`,
          }}
        />
      )}
      <div
        className="canvas-layer"
        style={{ transform: `translate(${vs.panX}px, ${vs.panY}px) scale(${vs.zoom})` }}
        onPointerDown={onBackgroundDown}
      >
        {container.slots.map((s, i) => {
          const r = rects[i]
          return (
            <div
              key={s.id}
              className="canvas-item"
              style={{ left: r.x, top: r.y, width: r.w, height: r.h, zIndex: r.z }}
              onPointerDown={() => raise(s.id, r)}
            >
              <Child
                container={container}
                slot={s}
                path={path}
                depth={depth}
                derived={isDerived(s, view)}
                onHeaderPointerDown={(e) => {
                  const start = { ...r, z: Math.max(r.z, maxZ + 1) }
                  startPointerDrag(e, (dx, dy) =>
                    write(s.id, { ...start, x: start.x + dx / vs.zoom, y: start.y + dy / vs.zoom }, 'move:' + s.id),
                  )
                }}
              />
              <div
                className="resize-handle"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  const start = r
                  startPointerDrag(e, (dx, dy) =>
                    write(
                      s.id,
                      { ...start, w: Math.max(120, start.w + dx / vs.zoom), h: Math.max(80, start.h + dy / vs.zoom) },
                      'resize:' + s.id,
                    ),
                  )
                }}
              />
            </div>
          )
        })}
      </div>
      {!container.slots.length && <div className="empty overlay">Empty canvas. ⌘K › Add, or drag windows here.</div>}
    </div>
  )
}

export const CanvasView = (p: ViewProps) => <SpatialView {...p} bounded={false} />
export const FloatingView = (p: ViewProps) => <SpatialView {...p} bounded />
