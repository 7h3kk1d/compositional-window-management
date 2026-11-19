import { useDraggable } from '@dnd-kit/core'
import { useRef, useState } from 'react'
import { contentKind } from '../content/registry'
import { indexFromPoint } from '../dnd/dropAdapters'
import { getContainer, refCounts, removeSlot, reveal, setViewState, slotView } from '../model/ops'
import { act, pathKey, useStore } from '../model/store'
import { displayTitle } from '../model/titles'
import { SLOT_META_VIEWS, type Container, type Path, type Slot, type SlotMeta, type SlotMetaView } from '../model/types'
import { resolvedMeta } from '../model/viewMeta'
import { Title, useDropAdapter, type ViewProps } from './NodeView'
import { VIEW_INFO } from './viewInfo'

const r = (n: number) => Math.round(n)
const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })

/** A compact rendering of one view's metadata for one child. */
function formatMeta(view: SlotMetaView, v: SlotMeta[SlotMetaView]): string {
  if (!v) return ''
  const m = v as Record<string, any>
  switch (view) {
    case 'canvas':
    case 'floating':
      return `${r(m.x)}, ${r(m.y)} · ${r(m.w)}×${r(m.h)}`
    case 'split':
      return `${+m.size.toFixed(1)}`
    case 'grid':
      return `${m.colSpan}×${m.rowSpan}`
    case 'dock':
      return m.side + (m.collapsed ? ' (collapsed)' : '')
    case 'document':
      return `${r(m.height)}px`
    case 'scroll':
      return `col ${+m.column.toFixed(2)} · ${Math.round(m.width * 100)}%`
    case 'kanban':
      return m.lane
    case 'timeline':
      return m.start === m.end ? shortDate(m.start) : `${shortDate(m.start)} → ${shortDate(m.end)}`
  }
}

/**
 * Table: one row per child, one column per view's layout metadata. This
 * makes the lens complement visible: stored values are plain, values the
 * view would derive are faded with "~". Click a cell to edit it as JSON
 * (empty clears it, i.e. forgets that view's layout for this child).
 */
export function TableView({ container, path }: ViewProps) {
  const ref = useRef<HTMLTableSectionElement>(null)
  const key = pathKey(path)
  const doc = useStore((s) => s.doc)
  const sort = container.viewState.table ?? { sort: null }
  const derived = Object.fromEntries(SLOT_META_VIEWS.map((v) => [v, resolvedMeta(container, v)])) as Record<
    SlotMetaView,
    SlotMeta[SlotMetaView][]
  >

  let rows = container.slots.map((slot, index) => ({ slot, index }))
  if (sort.sort) {
    const val = ({ slot }: { slot: Slot }) => {
      const n = doc.nodes[slot.nodeId]
      if (sort.sort === 'title') return displayTitle(doc, slot.nodeId, { view: slot.view }).toLowerCase()
      return n?.type === 'container' ? 'container ' + slotView(doc, slot) : 'leaf ' + (n?.content.kind ?? '')
    }
    rows = [...rows].sort((a, b) => val(a).localeCompare(val(b)) * (sort.desc ? -1 : 1))
  }

  // sorting is display only, so a sorted table can't take a positional drop
  useDropAdapter(path, (x, y) => (sort.sort ? {} : { index: indexFromPoint(ref.current, `[data-slot-in="${key}"]`, x, y, 'y') }))

  const toggleSort = (k: 'title' | 'kind') =>
    act((d) =>
      setViewState(
        d,
        container.id,
        'table',
        sort.sort !== k ? { sort: k } : sort.desc ? { sort: null } : { sort: k, desc: true },
      ),
    )
  const arrow = (k: string) => (sort.sort === k ? (sort.desc ? ' ↓' : ' ↑') : '')
  const storedAny = (v: SlotMetaView) => container.slots.some((s) => s.meta[v] !== undefined)

  if (!container.slots.length) return <div className="empty">Empty table. ⌘K › Add.</div>

  return (
    <div className="table-view">
      <table>
        <thead>
          <tr>
            <th className="sortable" onClick={() => toggleSort('title')}>
              Title{arrow('title')}
            </th>
            <th className="sortable" onClick={() => toggleSort('kind')}>
              Kind{arrow('kind')}
            </th>
            <th title="How many places show this node">⧉</th>
            {SLOT_META_VIEWS.map((v) => (
              <th key={v} className={storedAny(v) ? '' : 'unused'} title={VIEW_INFO[v].blurb}>
                {VIEW_INFO[v].icon} {VIEW_INFO[v].label}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody ref={ref}>
          {rows.map(({ slot, index }) => (
            <Row key={slot.id} container={container} slot={slot} path={path} derived={(v) => derived[v][index]} k={key} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({
  container,
  slot,
  path,
  derived,
  k,
}: {
  container: Container
  slot: Slot
  path: Path
  derived: (v: SlotMetaView) => SlotMeta[SlotMetaView]
  k: string
}) {
  const node = useStore((s) => s.doc.nodes[slot.nodeId])
  const refs = useStore((s) => refCounts(s.doc).get(slot.nodeId) ?? 0)
  const view = useStore((s) => (node?.type === 'container' ? slotView(s.doc, slot) : undefined))
  const title = useStore((s) => displayTitle(s.doc, slot.nodeId, { view: slot.view }))
  const childPath = [...path, slot.id]
  const childKey = pathKey(childPath)
  const focused = useStore((s) => pathKey(s.focus) === childKey)
  const drag = useDraggable({
    id: 'drag:' + childKey,
    data: { fromId: container.id, slotId: slot.id, nodeId: slot.nodeId, path: childPath, title },
  })
  if (!node) return null
  const kind =
    node.type === 'container'
      ? `${VIEW_INFO[view!].icon} ${VIEW_INFO[view!].label}`
      : `${contentKind(node.content.kind)?.icon ?? '?'} ${contentKind(node.content.kind)?.label ?? node.content.kind}`
  return (
    <tr
      className={`${focused ? 'focused' : ''} ${drag.isDragging ? 'dragging' : ''}`}
      data-slot-in={k}
      onClick={() => {
        act((d) => reveal(d, childPath))
        useStore.getState().setFocus(childPath)
      }}
    >
      <td className="title-cell">
        <span className="grip" ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} title="Drag to move (⌥ mirrors)">
          ⠿
        </span>
        <Title id={node.id} view={view} />
      </td>
      <td className="muted">{kind}</td>
      <td>{refs > 1 && <span className="badge mirror-badge">⧉ {refs}</span>}</td>
      {SLOT_META_VIEWS.map((v) => (
        <MetaCell key={v} container={container} slot={slot} view={v} derived={derived(v)} />
      ))}
      <td>
        <button
          className="ghost close"
          title="Close (remove this reference)"
          onClick={(e) => {
            e.stopPropagation()
            act((d) => removeSlot(d, container.id, slot.id))
          }}
        >
          ×
        </button>
      </td>
    </tr>
  )
}

function MetaCell({
  container,
  slot,
  view,
  derived,
}: {
  container: Container
  slot: Slot
  view: SlotMetaView
  derived: SlotMeta[SlotMetaView]
}) {
  const stored = slot.meta[view]
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState(false)
  if (draft !== null) {
    const commit = () => {
      const text = draft.trim()
      try {
        const value = text ? JSON.parse(text) : undefined
        if (value !== undefined && (typeof value !== 'object' || Array.isArray(value) || value === null)) throw new Error()
        act((d) => {
          const s = getContainer(d, container.id).slots.find((x) => x.id === slot.id)!
          if (value === undefined) delete s.meta[view]
          else (s.meta as Record<string, unknown>)[view] = value
        })
        setDraft(null)
      } catch {
        setError(true)
      }
    }
    return (
      <td className="meta-cell editing" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className={error ? 'error' : ''}
          onFocus={(e) => e.target.select()}
          value={draft}
          placeholder="empty = forget"
          onChange={(e) => {
            setDraft(e.target.value)
            setError(false)
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setDraft(null)
          }}
        />
      </td>
    )
  }
  return (
    <td
      className={`meta-cell ${stored === undefined ? 'derived' : 'stored'}`}
      title={
        stored === undefined
          ? 'Not stored: this is what the view would derive. Click to store a value.'
          : 'Stored. Click to edit as JSON (empty forgets it).'
      }
      onClick={(e) => {
        e.stopPropagation()
        setDraft(JSON.stringify(stored ?? derived))
      }}
    >
      {stored === undefined ? '~ ' : ''}
      {formatMeta(view, stored ?? derived)}
    </td>
  )
}
