import { useEffect, useRef, useState } from 'react'
import { getContainer, setSlotMeta, setViewState } from '@cwm/core'
import { useWs } from '../workspace'

import { dayIso, dayNum, dayWidthOf, DERIVED_SPAN_DAYS, isDerived, timelineMeta, todayNum } from '@cwm/core'
import { Child, startPointerDrag, useDropAdapter, type ViewProps } from './NodeView'

const AXIS_H = 40
const ROW_MIN = 120
const ROW_MAX = 260

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Greedy interval packing: each window takes the first row that is free by its start. */
function packRows(spans: { s: number; e: number }[]): number[] {
  const rowEnds: number[] = []
  const rows = new Array<number>(spans.length)
  spans
    .map((sp, i) => ({ ...sp, i }))
    .sort((a, b) => a.s - b.s || a.e - b.e)
    .forEach(({ s, e, i }) => {
      let r = rowEnds.findIndex((end) => end < s)
      if (r < 0) r = rowEnds.push(e) - 1
      else rowEnds[r] = e
      rows[i] = r
    })
  return rows
}

/**
 * Timeline: windows placed on a day axis (Gantt-style). Each child stores
 * an inclusive start/end date. Undated children (made in other views) are
 * laid end to end after the dated ones, marked derived. Drag a window's
 * title bar to move it in time, its right edge to change its end;
 * ⌘/ctrl+wheel zooms.
 */
export function TimelineView({ container, path, depth }: ViewProps) {
  const ws = useWs()
  const ref = useRef<HTMLDivElement>(null)
  const dw = dayWidthOf(container)
  const metas = timelineMeta(container)
  const spans = metas.map((m) => ({ s: dayNum(m.start), e: dayNum(m.end) }))
  const today = todayNum()
  const first = Math.min(today, ...spans.map((x) => x.s)) - 1
  const last = Math.max(today, ...spans.map((x) => x.e)) + 7
  const days = last - first + 1
  const rows = packRows(spans)
  const nRows = Math.max(1, ...rows.map((r) => r + 1))
  // rows share the height that's there (within limits), so a short panel needs no scrolling
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const ROW_H = Math.max(ROW_MIN, Math.min(ROW_MAX, Math.floor((height - AXIS_H - 14) / nRows) || ROW_MAX))

  useDropAdapter(path, (x) => {
    const el = ref.current!
    const day = first + Math.floor((x - el.getBoundingClientRect().left + el.scrollLeft) / dw)
    return { meta: { timeline: { start: dayIso(day), end: dayIso(day + DERIVED_SPAN_DAYS - 1) } } }
  })

  // ⌘/ctrl + wheel: zoom the day width around the pointer
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const cur = dayWidthOf(getContainer(ws.get().doc, container.id))
      const next = Math.min(200, Math.max(12, cur * Math.exp(-e.deltaY * 0.01)))
      const px = e.clientX - el.getBoundingClientRect().left
      const anchor = (el.scrollLeft + px) / cur
      ws.act((d) => setViewState(d, container.id, 'timeline', { dayWidth: next }), { key: 'tlzoom:' + container.id })
      requestAnimationFrame(() => (el.scrollLeft = anchor * next - px))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [container.id])

  const ticks = []
  for (let i = 0; i < days; i++) {
    const n = first + i
    const date = new Date(dayIso(n) + 'T00:00:00Z')
    const dom = date.getUTCDate()
    const dow = date.getUTCDay()
    const showDay = dw >= 34 || (dw >= 18 && dow === 1) || dom === 1
    ticks.push(
      <div
        key={n}
        className={`tl-day ${dow === 0 || dow === 6 ? 'weekend' : ''} ${dom === 1 ? 'month-start' : ''} ${n === today ? 'today' : ''}`}
        style={{ left: i * dw, width: dw }}
      >
        {(dom === 1 || i === 0) && <span className="tl-month">{MONTHS[date.getUTCMonth()]}</span>}
        {showDay && (
          <span className="tl-label">
            {dw >= 50 ? DOW[dow] + ' ' : ''}
            {dom}
          </span>
        )}
      </div>,
    )
  }

  return (
    <div className="timeline-view" ref={ref}>
      <div className="tl-canvas" style={{ width: days * dw, height: AXIS_H + nRows * ROW_H + 12 }}>
        <div className="tl-days">{ticks}</div>
        <div className="tl-now" style={{ left: (today - first + 0.5) * dw }} title="Today" />
        {container.slots.map((slot, i) => {
          const { s, e } = spans[i]
          return (
            <div
              key={slot.id}
              className="tl-item"
              title={`${metas[i].start} → ${metas[i].end}`}
              style={{
                left: (s - first) * dw + 2,
                top: AXIS_H + rows[i] * ROW_H + 6,
                width: Math.max(dw, (e - s + 1) * dw) - 4,
                height: ROW_H - 12,
              }}
            >
              <Child
                container={container}
                slot={slot}
                path={path}
                depth={depth}
                derived={isDerived(slot, 'timeline')}
                headerExtra={
                  (e - s + 1) * dw > 280 && <span className="tl-dates muted">
                    {metas[i].start === metas[i].end ? metas[i].start.slice(5) : `${metas[i].start.slice(5)} → ${metas[i].end.slice(5)}`}
                  </span>
                }
                onHeaderPointerDown={(ev) =>
                  startPointerDrag(ev, (dx) => {
                    const shift = Math.round(dx / dw)
                    ws.act((d) => setSlotMeta(d, container.id, slot.id, 'timeline', { start: dayIso(s + shift), end: dayIso(e + shift) }), {
                      key: 'tlmove:' + slot.id,
                    })
                  })
                }
              />
              <div
                className="tl-resize"
                title="Drag to change the end date"
                onPointerDown={(ev) => {
                  ev.stopPropagation()
                  startPointerDrag(ev, (dx) => {
                    const end = Math.max(s, e + Math.round(dx / dw))
                    ws.act((d) => setSlotMeta(d, container.id, slot.id, 'timeline', { start: dayIso(s), end: dayIso(end) }), {
                      key: 'tlresize:' + slot.id,
                    })
                  })
                }}
              />
            </div>
          )
        })}
        {!container.slots.length && <div className="empty overlay">Empty timeline. ⌘K › Add, or drag windows onto a day.</div>}
      </div>
    </div>
  )
}
