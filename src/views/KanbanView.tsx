import { useRef, useState } from 'react'
import { setKanbanLanes, setSlotMeta } from '../model/ops'
import { act, pathKey } from '../model/store'
import type { Container, NodeId } from '../model/types'
import { isDerived, kanbanLanes, kanbanMeta, newLaneName } from '../model/viewMeta'
import { Child, useDropAdapter, type ViewProps } from './NodeView'

const editLanes = (id: NodeId, fn: (lanes: string[]) => string[], rename?: [string, string]) =>
  act((d) => setKanbanLanes(d, id, fn, rename))

/**
 * Kanban: children are cards in named lanes. The lane is stored per child
 * (on the slot), the list of lanes on the container. Cards with no lane
 * (made in another view) sit in the first lane, marked derived.
 */
export function KanbanView({ container, path, depth }: ViewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const key = pathKey(path)
  const lanes = kanbanLanes(container)
  const metas = kanbanMeta(container)
  const cards = (lane: string) =>
    container.slots.map((slot, index) => ({ slot, index })).filter(({ index }) => metas[index].lane === lane)

  useDropAdapter(path, (x, y) => {
    const els = Array.from(ref.current?.querySelectorAll<HTMLElement>(`[data-lane-in="${key}"]`) ?? [])
    let li = els.findIndex((el) => x < el.getBoundingClientRect().right)
    if (li < 0) li = els.length - 1
    const lane = lanes[li]
    const inLane = cards(lane)
    const cells = Array.from(els[li]?.querySelectorAll<HTMLElement>('.kanban-card') ?? [])
    const below = cells.findIndex((c) => {
      const r = c.getBoundingClientRect()
      return y < r.top + r.height / 2
    })
    const index =
      below >= 0 ? inLane[below].index : inLane.length ? inLane[inLane.length - 1].index + 1 : undefined
    return { index, meta: { kanban: { lane } } }
  })

  return (
    <div className="kanban-view" ref={ref}>
      {lanes.map((lane, li) => {
        const inLane = cards(lane)
        return (
          <section key={lane} className="kanban-lane" data-lane-in={key}>
            <header className="kanban-lane-head">
              <LaneName container={container} lane={lane} />
              <span className="count">{inLane.length}</span>
              <span className="spacer" />
              {!inLane.length && lanes.length > 1 && (
                <button
                  className="ghost small"
                  title="Remove this empty lane"
                  onClick={() => editLanes(container.id, (ls) => ls.filter((l) => l !== lane))}
                >
                  ×
                </button>
              )}
            </header>
            <div className="kanban-cards">
              {inLane.map(({ slot }) => (
                <div key={slot.id} className="kanban-card">
                  <Child
                    container={container}
                    slot={slot}
                    path={path}
                    depth={depth}
                    derived={isDerived(slot, 'kanban')}
                    headerExtra={
                      <>
                        {li > 0 && (
                          <button
                            className="ghost small"
                            title={`Move to “${lanes[li - 1]}”`}
                            onClick={() => act((d) => setSlotMeta(d, container.id, slot.id, 'kanban', { lane: lanes[li - 1] }))}
                          >
                            ←
                          </button>
                        )}
                        {li < lanes.length - 1 && (
                          <button
                            className="ghost small"
                            title={`Move to “${lanes[li + 1]}”`}
                            onClick={() => act((d) => setSlotMeta(d, container.id, slot.id, 'kanban', { lane: lanes[li + 1] }))}
                          >
                            →
                          </button>
                        )}
                      </>
                    }
                  />
                </div>
              ))}
              {!inLane.length && <div className="kanban-empty">Drop cards here</div>}
            </div>
          </section>
        )
      })}
      <button
        className="kanban-add-lane ghost"
        onClick={() => editLanes(container.id, (ls) => [...ls, newLaneName(container)])}
        title="Add a lane"
      >
        + Lane
      </button>
    </div>
  )
}

function LaneName({ container, lane }: { container: Container; lane: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  if (draft === null)
    return (
      <span className="lane-name" title="Double-click to rename" onDoubleClick={() => setDraft(lane)}>
        {lane}
      </span>
    )
  const commit = () => {
    const next = draft.trim()
    setDraft(null)
    if (!next || next === lane || kanbanLanes(container).includes(next)) return
    editLanes(container.id, (ls) => ls.map((l) => (l === lane ? next : l)), [lane, next])
  }
  return (
    <input
      className="title-input"
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setDraft(null)
      }}
    />
  )
}
