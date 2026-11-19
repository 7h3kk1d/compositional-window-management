import { useEffect, useRef } from 'react'
import { getContainer } from '../model/ops'
import { act, pathKey, useStore } from '../model/store'
import type { Container, Doc, NodeId, SlotId } from '../model/types'
import { SCROLL_WIDTHS, isDerived, scrollColumns, scrollMeta } from '../model/viewMeta'
import { Child, useDropAdapter, type ViewProps } from './NodeView'

const FRACTION: Record<string, string> = { '0.333': '⅓', '0.5': '½', '0.667': '⅔', '1': '1' }
const fractionLabel = (w: number) => FRACTION[String(+w.toFixed(3))] ?? `${Math.round(w * 100)}%`

/**
 * Edits in the scrolling tiler first store every window's resolved column
 * (like resizing a split), then apply the change, so derived columns never
 * shift underneath an edit.
 */
function editScroll(containerId: NodeId, fn: (meta: Map<SlotId, { column: number; width: number }>) => void) {
  act((d: Doc) => {
    const c = getContainer(d, containerId)
    const metas = scrollMeta(c)
    const map = new Map(c.slots.map((s, i) => [s.id, { ...metas[i] }]))
    fn(map)
    for (const s of c.slots) s.meta.scroll = map.get(s.id)!
  })
}

/**
 * Scrolling tiler (PaperWM, niri): an endless horizontal strip of columns.
 * Each column holds one or more stacked windows and has a width that is a
 * fraction of the visible area. Focus scrolls its column into view.
 */
export function ScrollView({ container, path, depth }: ViewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const key = pathKey(path)
  const cols = scrollColumns(container)

  // the child of this container that holds the focus, if any
  const focusedSlot = useStore((s) =>
    s.focus.length > path.length && path.every((p, i) => s.focus[i] === p) ? s.focus[path.length] : null,
  )
  useEffect(() => {
    if (!focusedSlot) return
    const el = ref.current?.querySelector(`[data-scroll-slot="${focusedSlot}"]`)?.closest('.scroll-col')
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [focusedSlot])

  useDropAdapter(path, (x, y) => {
    const els = Array.from(ref.current?.querySelectorAll<HTMLElement>(`[data-col-in="${key}"]`) ?? [])
    const between = (a?: number, b?: number) =>
      a === undefined ? (b ?? 0) - 1 : b === undefined ? Math.floor(a) + 1 : (a + b) / 2
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect()
      if (x > r.right) continue
      const col = cols[i]
      const fx = (x - r.left) / r.width
      if (fx < 0.2) return { meta: { scroll: { column: between(cols[i - 1]?.column, col.column), width: col.width } } }
      if (fx > 0.8) return { meta: { scroll: { column: between(col.column, cols[i + 1]?.column), width: col.width } } }
      // middle of a column: stack into it, above the window under the pointer
      const cells = Array.from(els[i].querySelectorAll<HTMLElement>(':scope > .scroll-cell'))
      const below = cells.findIndex((c) => {
        const cr = c.getBoundingClientRect()
        return y < cr.top + cr.height / 2
      })
      const index = below >= 0 ? col.items[below].index : col.items[col.items.length - 1].index + 1
      return { index, meta: { scroll: { column: col.column, width: col.width } } }
    }
    return { meta: { scroll: { column: between(cols[cols.length - 1]?.column, undefined), width: SCROLL_WIDTHS[1] } } }
  })

  if (!container.slots.length) return <div className="empty">Empty strip. ⌘K › Add, or drag windows here.</div>

  return (
    <div className="scroll-view" ref={ref}>
      <div className="scroll-strip">
        {cols.map((col, ci) => (
          <div
            key={col.column}
            className="scroll-col"
            data-col-in={key}
            style={{ width: `calc(${col.width * 100}cqw - 8px)` }}
          >
            {col.items.map(({ slot }) => (
              <div key={slot.id} className="scroll-cell" data-scroll-slot={slot.id}>
                <Child
                  container={container}
                  slot={slot}
                  path={path}
                  depth={depth}
                  derived={isDerived(slot, 'scroll')}
                  headerExtra={<ColumnControls container={container} cols={cols} ci={ci} slotId={slot.id} />}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function ColumnControls({
  container,
  cols,
  ci,
  slotId,
}: {
  container: Container
  cols: ReturnType<typeof scrollColumns>
  ci: number
  slotId: SlotId
}) {
  const col = cols[ci]
  const nextWidth = SCROLL_WIDTHS[(SCROLL_WIDTHS.findIndex((w) => Math.abs(w - col.width) < 0.01) + 1) % SCROLL_WIDTHS.length]
  return (
    <>
      <button
        className="ghost small"
        title="Column width (cycles ⅓ ½ ⅔ 1)"
        onClick={() =>
          editScroll(container.id, (m) => {
            for (const it of col.items) m.get(it.slot.id)!.width = nextWidth
          })
        }
      >
        ⇔{fractionLabel(col.width)}
      </button>
      {ci > 0 && (
        <button
          className="ghost small"
          title="Stack into the column on the left"
          onClick={() =>
            editScroll(container.id, (m) => {
              m.set(slotId, { column: cols[ci - 1].column, width: cols[ci - 1].width })
            })
          }
        >
          ⇤
        </button>
      )}
      {col.items.length > 1 && (
        <button
          className="ghost small"
          title="Move out into its own column"
          onClick={() =>
            editScroll(container.id, (m) => {
              const next = cols[ci + 1]?.column
              m.set(slotId, { column: next === undefined ? col.column + 1 : (col.column + next) / 2, width: col.width })
            })
          }
        >
          ⇥
        </button>
      )}
    </>
  )
}
