import { useEffect, useRef } from 'react'
import { setSlotMeta, setViewState, stackWith } from '../model/ops'
import { act, pathKey, useStore } from '../model/store'
import type { Container, Path, Slot } from '../model/types'
import { DEFAULT_SCROLL_WIDTH, isDerived, stepWidth } from '../model/viewMeta'
import { Child, useDropAdapter, type ViewProps } from './NodeView'

const FRACTION: Record<string, string> = { '0.333': '⅓', '0.5': '½', '0.667': '⅔', '1': '1' }
export const fractionLabel = (w: number) => FRACTION[String(+w.toFixed(3))] ?? `${Math.round(w * 100)}%`
export const scrollCentered = (c: Container) => !!c.viewState.scroll?.center

/** Scroll a column into view, or to the middle when the container keeps focus centered. */
export function scrollToColumn(strip: HTMLElement | null, slotId: string, center: boolean, smooth = true) {
  const col = strip?.querySelector<HTMLElement>(`:scope > .scroll-strip > [data-scroll-slot="${slotId}"]`)
  if (!strip || !col) return
  const behavior = smooth ? 'smooth' : 'auto'
  if (center) strip.scrollTo({ left: col.offsetLeft + col.offsetWidth / 2 - strip.clientWidth / 2, behavior })
  else col.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior })
}

/**
 * Scrolling tiler (PaperWM, niri): an endless horizontal strip. Every child
 * is one column, in the shared order, with a width that is a fraction of
 * the visible area. Several windows in one column are simply a nested
 * vertical split (⇤ stacks a window into the column on its left), so the
 * column can be resized, or switched to tabs, like any other container.
 * Focus scrolls its column into view, or to the middle with "center".
 */
export function ScrollView({ container, path, depth }: ViewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const key = pathKey(path)
  const center = scrollCentered(container)

  // the child of this container that holds the focus, if any
  const focusedSlot = useStore((s) =>
    s.focus.length > path.length && path.every((p, i) => s.focus[i] === p) ? s.focus[path.length] : null,
  )
  useEffect(() => {
    // centered strips open on their first column rather than on the empty margin
    const target = focusedSlot ?? (center ? container.slots[0]?.id : undefined)
    if (target) scrollToColumn(ref.current, target, center, !!focusedSlot)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedSlot, center])

  // a centered strip stays centered when it is resized or first shown (e.g. its tab opens)
  const latest = useRef({ focusedSlot, center, first: container.slots[0]?.id })
  latest.current = { focusedSlot, center, first: container.slots[0]?.id }
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const { focusedSlot: f, center: c, first } = latest.current
      const target = f ?? first
      if (c && target && el.clientWidth) scrollToColumn(el, target, true, false)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // between columns by pointer x
  useDropAdapter(path, (x) => {
    const cols = Array.from(ref.current?.querySelectorAll<HTMLElement>(`[data-col-in="${key}"]`) ?? [])
    const i = cols.findIndex((c) => {
      const r = c.getBoundingClientRect()
      return x < r.left + r.width / 2
    })
    return { index: i < 0 ? cols.length : i, meta: { scroll: { width: DEFAULT_SCROLL_WIDTH } } }
  })

  if (!container.slots.length) return <div className="empty">Empty strip. ⌘K › Add, or drag windows here.</div>

  return (
    <div className={`scroll-view ${center ? 'centered' : ''}`} ref={ref}>
      <div className="scroll-strip">
        {container.slots.map((slot, i) => (
          <Column key={slot.id} container={container} slot={slot} index={i} path={path} depth={depth} k={key} />
        ))}
      </div>
    </div>
  )
}

function Column({
  container,
  slot,
  index,
  path,
  depth,
  k,
}: {
  container: Container
  slot: Slot
  index: number
  path: Path
  depth: number
  k: string
}) {
  const width = slot.meta.scroll?.width ?? DEFAULT_SCROLL_WIDTH
  return (
    <div
      className="scroll-col"
      data-col-in={k}
      data-scroll-slot={slot.id}
      style={{ width: `calc(${width * 100}cqw - 8px)` }}
    >
      <Child
        container={container}
        slot={slot}
        path={path}
        depth={depth}
        derived={isDerived(slot, 'scroll')}
        headerExtra={
          <>
            <button
              className="ghost small"
              title="Column width (cycles ⅓ ½ ⅔ 1) · ⌥= / ⌥-"
              onClick={() => act((d) => setSlotMeta(d, container.id, slot.id, 'scroll', { width: stepWidth(width, 1) }))}
            >
              ⇔{fractionLabel(width)}
            </button>
            {index > 0 && (
              <button
                className="ghost small"
                title="Stack into the column on the left (nests a vertical split) · ⌥["
                onClick={() => {
                  let p: Path | null = null
                  act((d) => {
                    p = stackWith(d, path, slot.id, -1)
                  })
                  if (p) useStore.getState().setFocus(p)
                }}
              >
                ⇤
              </button>
            )}
          </>
        }
      />
    </div>
  )
}

/** Header toggle for the container itself. */
export function ScrollControls({ container }: { container: Container }) {
  const on = scrollCentered(container)
  return (
    <button
      className={`ghost small toggle ${on ? 'on' : ''}`}
      title={on ? 'Keeping the focused column centered (click to turn off)' : 'Keep the focused column centered'}
      onClick={() => act((d) => setViewState(d, container.id, 'scroll', { center: !on }))}
    >
      ◎ center
    </button>
  )
}
