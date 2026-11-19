import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { contentKind } from '../content/registry'
import { dropAdapters, type DropAdapter } from '../dnd/dropAdapters'
import type { DropData } from '../dnd/resolveDrop'
import { refCounts, removeSlot, rename, setLeafData, setView } from '../model/ops'
import { act, pathKey, useStore } from '../model/store'
import { VIEW_TYPES, type Container, type Leaf, type NodeId, type Path, type Slot, type ViewType } from '../model/types'
import { VIEW_INFO } from './viewInfo'
import { VIEW_COMPONENTS } from './registry'

export const MAX_DEPTH = 24

export interface ViewProps {
  container: Container
  path: Path
  depth: number
}

interface NodeViewProps {
  nodeId: NodeId
  path: Path
  depth: number
  /** The container this node is rendered in (absent for the root). */
  parentId?: NodeId
  slot?: Slot
  /** Extra controls placed in the header (view-specific, e.g. grid span). */
  headerExtra?: ReactNode
  /** Lets a parent view (canvas) handle dragging the title bar. */
  onHeaderPointerDown?: (e: React.PointerEvent) => void
  className?: string
  style?: CSSProperties
  derived?: boolean
  /** Hide the header entirely (used by inline document blocks). */
  bare?: boolean
}

/** Renders any node (leaf or container) in a uniform window frame. */
export function NodeView(props: NodeViewProps) {
  const node = useStore((s) => s.doc.nodes[props.nodeId])
  if (!node) return <div className="missing">missing node</div>
  if (props.depth > MAX_DEPTH) return <div className="missing">∞ nesting limit</div>
  return <Frame {...props} node={node} />
}

function Frame({
  node,
  path,
  depth,
  parentId,
  slot,
  headerExtra,
  onHeaderPointerDown,
  className = '',
  style,
  derived,
  bare,
}: NodeViewProps & { node: Leaf | Container }) {
  const key = pathKey(path)
  const focused = useStore((s) => pathKey(s.focus) === key)
  const flashing = useStore((s) => s.highlight === node.id)
  const refs = useStore((s) => refCounts(s.doc).get(node.id) ?? 0)
  const setFocus = useStore((s) => s.setFocus)

  // Inside a spatial parent (canvas/floating) dropping on a window just
  // places beside it; edge-splitting only applies in tiled layouts.
  const inSpatial = useStore((s) => {
    const p = parentId ? s.doc.nodes[parentId] : undefined
    return p?.type === 'container' && (p.view === 'canvas' || p.view === 'floating')
  })
  const leafDrop = useDroppable({
    id: 'dropleaf:' + key,
    disabled: node.type !== 'leaf' || !parentId,
    data: {
      kind: 'leaf',
      parentId: parentId ?? '',
      parentPath: path.slice(0, -1),
      path,
      title: node.title,
      noSplit: inSpatial,
    } satisfies DropData,
  })

  const drag = useDraggable({
    // headerless frames (tab pages) are dragged by their tab, which owns 'drag:'+key
    id: (bare ? 'drag-bare:' : 'drag:') + key,
    disabled: !parentId || bare,
    data: { fromId: parentId, slotId: slot?.id, nodeId: node.id, path, title: node.title },
  })

  return (
    <section
      className={`frame ${node.type} ${focused ? 'focused' : ''} ${flashing ? 'flash' : ''} ${
        derived ? 'derived' : ''} ${bare ? 'bare' : ''
      } ${drag.isDragging ? 'dragging' : ''} ${className}`}
      style={style}
      data-node={node.id}
      onPointerDownCapture={() => setFocus(path)}
    >
      {!bare && (
        <header
          className="frame-header"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button,input,select,.grip')) return
            onHeaderPointerDown?.(e)
          }}
        >
          {parentId && (
            <span
              className="grip"
              title="Drag to move into any container (hold Alt to mirror)"
              ref={drag.setNodeRef}
              {...drag.listeners}
              {...drag.attributes}
            >
              ⠿
            </span>
          )}
          <span className="kind-icon">
            {node.type === 'container' ? VIEW_INFO[node.view].icon : contentKind(node.content.kind)?.icon ?? '?'}
          </span>
          <Title id={node.id} title={node.title} />
          {derived && (
            <span className="badge derived-badge" title="No stored layout for this view yet: position is derived">
              derived
            </span>
          )}
          <MirrorBadge nodeId={node.id} refs={refs} />
          <span className="spacer" />
          {headerExtra}
          <FrameControls node={node} path={path} />
          {parentId && slot && (
            <button className="ghost close" title="Close (remove this reference)" onClick={() => act((d) => removeSlot(d, parentId, slot.id))}>
              ×
            </button>
          )}
        </header>
      )}
      <div className="frame-body" ref={node.type === 'leaf' ? leafDrop.setNodeRef : undefined}>
        {node.type === 'leaf' ? <LeafBody leaf={node} /> : <ContainerBody container={node} path={path} depth={depth} noSplit={inSpatial} />}
      </div>
    </section>
  )
}

export function MirrorBadge({ nodeId, refs }: { nodeId: NodeId; refs: number }) {
  if (refs < 2) return null
  return (
    <button
      className="badge mirror-badge"
      title="Mirrored: this node appears in several places. Click to flash all occurrences."
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        useStore.getState().setHighlight(nodeId)
        setTimeout(() => useStore.getState().setHighlight(null), 1200)
      }}
    >
      ⧉ {refs}
    </button>
  )
}

/** View switcher, add and commands buttons. Shared by frame headers and tab strips. */
export function FrameControls({ node, path }: { node: Leaf | Container; path: Path }) {
  const setFocus = useStore.getState().setFocus
  return (
    <>
      {node.type === 'container' && <ViewSelect container={node} />}
      {node.type === 'container' && (
        <button
          className="ghost"
          title="Add child (⌘K › Add)"
          onClick={() => {
            setFocus(path)
            useStore.getState().openPalette('add')
          }}
        >
          +
        </button>
      )}
      <button
        className="ghost"
        title="Commands (⌘K)"
        onClick={() => {
          setFocus(path)
          useStore.getState().openPalette()
        }}
      >
        ⋯
      </button>
    </>
  )
}

export function Title({ id, title }: { id: NodeId; title: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  if (!editing)
    return (
      <span
        className="title"
        title="Double-click to rename"
        onDoubleClick={() => {
          setDraft(title)
          setEditing(true)
        }}
      >
        {title}
      </span>
    )
  const commit = () => {
    setEditing(false)
    if (draft.trim() && draft !== title) act((d) => rename(d, id, draft.trim()))
  }
  return (
    <input
      className="title-input"
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setEditing(false)
      }}
    />
  )
}

function ViewSelect({ container }: { container: Container }) {
  return (
    <select
      className="view-select"
      value={container.view}
      title="View this container as… (the children and every view's layout are kept)"
      onChange={(e) => act((d) => setView(d, container.id, e.target.value as ViewType))}
    >
      {VIEW_TYPES.map((v) => (
        <option key={v} value={v}>
          {VIEW_INFO[v].icon} {VIEW_INFO[v].label}
        </option>
      ))}
    </select>
  )
}

export function LeafBody({ leaf }: { leaf: Leaf }) {
  const kind = contentKind(leaf.content.kind)
  if (!kind) return <div className="missing">Unknown content kind “{leaf.content.kind}”</div>
  const R = kind.Render
  return (
    <R data={leaf.content.data} update={(data) => act((d) => setLeafData(d, leaf.id, data), { key: 'edit:' + leaf.id })} />
  )
}

function ContainerBody({ container, path, depth, noSplit }: ViewProps & { noSplit: boolean }) {
  const key = pathKey(path)
  const drop = useDroppable({
    id: 'drop:' + key,
    data: { kind: 'container', containerId: container.id, path, title: container.title, noSplit } satisfies DropData,
  })
  const View = VIEW_COMPONENTS[container.view]
  return (
    <div className={`container-body view-${container.view}`} ref={drop.setNodeRef}>
      <View container={container} path={path} depth={depth} />
    </div>
  )
}

/** Register how a drop maps into this container's view semantics. */
export function useDropAdapter(path: Path, adapter: DropAdapter) {
  const ref = useRef(adapter)
  ref.current = adapter
  const key = pathKey(path)
  useEffect(() => {
    dropAdapters.set(key, (x, y) => ref.current(x, y))
    return () => {
      dropAdapters.delete(key)
    }
  }, [key])
}

/** Helper for views: render the child behind a slot. */
export function Child({
  container,
  slot,
  path,
  depth,
  ...rest
}: {
  container: Container
  slot: Slot
  path: Path
  depth: number
} & Omit<NodeViewProps, 'nodeId' | 'path' | 'depth' | 'parentId' | 'slot'>) {
  return <NodeView nodeId={slot.nodeId} path={[...path, slot.id]} depth={depth + 1} parentId={container.id} slot={slot} {...rest} />
}

/** Pointer-drag helper: calls onMove with the delta since pointerdown. */
export function startPointerDrag(
  e: React.PointerEvent | PointerEvent,
  onMove: (dx: number, dy: number, ev: PointerEvent) => void,
  onEnd?: () => void,
) {
  e.preventDefault()
  const sx = e.clientX
  const sy = e.clientY
  document.body.classList.add('pointer-dragging')
  const move = (ev: PointerEvent) => onMove(ev.clientX - sx, ev.clientY - sy, ev)
  const up = () => {
    document.body.classList.remove('pointer-dragging')
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    onEnd?.()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
