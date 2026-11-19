import { useRef } from 'react'
import { indexFromPoint } from '../dnd/dropAdapters'
import { setSlotMeta } from '../model/ops'
import { act, pathKey } from '../model/store'
import { gridColumns, gridSpan } from '../model/viewMeta'
import { Child, useDropAdapter, type ViewProps } from './NodeView'

export function GridView({ container, path, depth }: ViewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const key = pathKey(path)
  const cols = gridColumns(container)

  useDropAdapter(path, (x, y) => ({ index: indexFromPoint(ref.current, `:scope > [data-slot-in="${key}"]`, x, y, 'xy') }))

  if (!container.slots.length) return <div className="empty">Empty grid. ⌘K › Add.</div>

  return (
    <div className="grid-view" ref={ref} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {container.slots.map((s) => {
        const span = gridSpan(s)
        const colSpan = Math.min(span.colSpan, cols)
        return (
          <div
            key={s.id}
            className="grid-cell"
            data-slot-in={key}
            style={{ gridColumn: `span ${colSpan}`, gridRow: `span ${span.rowSpan}` }}
          >
            <Child
              container={container}
              slot={s}
              path={path}
              depth={depth}
             
              headerExtra={
                <>
                  <button
                    className="ghost small"
                    title="Cycle column span"
                    onClick={() =>
                      act((d) => setSlotMeta(d, container.id, s.id, 'grid', { ...span, colSpan: (colSpan % cols) + 1 }))
                    }
                  >
                    ↔{colSpan}
                  </button>
                  <button
                    className="ghost small"
                    title="Cycle row span"
                    onClick={() =>
                      act((d) => setSlotMeta(d, container.id, s.id, 'grid', { ...span, rowSpan: (span.rowSpan % 3) + 1 }))
                    }
                  >
                    ↕{span.rowSpan}
                  </button>
                </>
              }
            />
          </div>
        )
      })}
    </div>
  )
}
