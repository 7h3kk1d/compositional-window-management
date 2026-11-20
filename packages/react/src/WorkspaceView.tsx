import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getContainer, mirror, moveSlot, pathKey, removeSlot, splitBeside, viewAt, type Edge, type Path } from '@cwm/core'
import { placementFor } from './commands/commands'
import { onWorkspaceKeyDown } from './commands/keys'
import { Palette } from './commands/Palette'
import { resolveDrop, type DragData, type DropData, type DropIntent } from './dnd/resolveDrop'
import { NodeView } from './views/NodeView'
import { useRegistry, useWsStore, WorkspaceProvider, type Workspace as WorkspaceInstance } from './workspace'

/** A band along the workspace edge: dropping there splits the whole desktop. */
function RootEdge({ edge, active }: { edge: Edge; active: boolean }) {
  const drop = useDroppable({
    id: 'rootedge:' + edge,
    disabled: !active,
    data: { kind: 'edge', edge, path: [], title: 'Desktop' } satisfies DropData,
  })
  return <div ref={drop.setNodeRef} className={`root-edge ${edge} ${drop.isOver ? 'over' : ''}`} />
}

/** The path a drop target stands for (used to exclude the dragged subtree). */
function targetPath(d: DropData): Path {
  return d.kind === 'tab' ? d.childPath : d.path
}

const isWithin = (p: Path, ancestor: Path) => {
  const a = pathKey(ancestor)
  const k = pathKey(p)
  return k === a || k.startsWith(a + '/')
}

/**
 * Among all drop targets under the pointer, pick the innermost (smallest),
 * never the dragged window itself or anything inside it.
 */
const innermost: CollisionDetection = (args) => {
  const dragged = (args.active.data.current as DragData | undefined)?.path
  const hits = pointerWithin(args).filter((h) => {
    const data = args.droppableContainers.find((c) => c.id === h.id)?.data.current as DropData | undefined
    return data && !(dragged && isWithin(targetPath(data), dragged))
  })
  const area = (id: string | number) => {
    const r = args.droppableRects.get(id)
    return r ? r.width * r.height : Infinity
  }
  return hits.sort((a, b) => area(a.id) - area(b.id)).slice(0, 1)
}

function pointerOf(e: DragMoveEvent | DragEndEvent) {
  const start = e.activatorEvent as PointerEvent
  return { x: start.clientX + e.delta.x, y: start.clientY + e.delta.y }
}

export interface WorkspaceProps {
  ws: WorkspaceInstance
  /**
   * Where keyboard shortcuts are heard: only while focus is inside the
   * workspace (default), or anywhere on the page (for a full-page app).
   */
  keyboard?: 'workspace' | 'window' | 'none'
  className?: string
  /** Rendered above the windows (e.g. an app's own toolbar). */
  children?: ReactNode
}

/** A complete workspace: the window tree, drag and drop, keyboard and the command palette. */
export function Workspace({ ws, keyboard = 'workspace', className = '', children }: WorkspaceProps) {
  return (
    <WorkspaceProvider value={ws}>
      <WorkspaceInner ws={ws} keyboard={keyboard} className={className}>
        {children}
      </WorkspaceInner>
    </WorkspaceProvider>
  )
}

function WorkspaceInner({ ws, keyboard, className, children }: WorkspaceProps) {
  const root = useWsStore((s) => s.doc.root)
  // re-render when an app registers views or kinds after mount
  useRegistry(ws.views)
  useRegistry(ws.kinds)
  const [dragging, setDragging] = useState<DragData | null>(null)
  const [hint, setHint] = useState<DropIntent | null>(null)
  const [altDown, setAltDown] = useState(false)
  const alt = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const [, setMounted] = useState(false)

  // Focus follows the pointer into any window, including app content slotted in
  // from outside a shadow root (React's own handlers don't see those events).
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onDown = (e: Event) => {
      for (const t of e.composedPath()) {
        if (t === el) return
        if (t instanceof HTMLElement && t.classList.contains('frame') && t.dataset.path !== undefined) {
          ws.get().setFocus(t.dataset.path ? t.dataset.path.split('/') : [])
          return
        }
      }
    }
    el.addEventListener('pointerdown', onDown, true)
    return () => el.removeEventListener('pointerdown', onDown, true)
  }, [ws])

  useEffect(() => {
    ws.rootEl = rootRef.current
    setMounted(true) // the palette portals into the root once it exists
    return () => {
      if (ws.rootEl === rootRef.current) ws.rootEl = null
    }
  }, [ws])

  useEffect(() => {
    if (keyboard === 'none') return
    const target: EventTarget | null = keyboard === 'window' ? window : rootRef.current
    if (!target) return
    const track = (e: Event) => {
      const k = e as KeyboardEvent
      alt.current = k.altKey
      setAltDown(k.altKey)
    }
    const down = (e: Event) => onWorkspaceKeyDown(ws, e as KeyboardEvent)
    target.addEventListener('keydown', down)
    target.addEventListener('keydown', track)
    target.addEventListener('keyup', track)
    return () => {
      target.removeEventListener('keydown', down)
      target.removeEventListener('keydown', track)
      target.removeEventListener('keyup', track)
    }
  }, [ws, keyboard])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const intentOf = (e: DragMoveEvent | DragEndEvent): DropIntent | null => {
    if (!e.over?.data.current) return null
    const { x, y } = pointerOf(e)
    return resolveDrop(ws, e.over.data.current as DropData, e.over.rect, x, y)
  }
  const onDragStart = (e: DragStartEvent) => setDragging(e.active.data.current as DragData)
  const onDragMove = (e: DragMoveEvent) => setHint(intentOf(e))
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    setHint(null)
    const src = e.active.data.current as DragData | undefined
    const intent = intentOf(e)
    if (!src || !intent) return
    // mirroring is semantic: content that can't be shown twice is moved instead
    const asMirror = (alt.current || (e.activatorEvent as PointerEvent).altKey) && ws.mirrorable(src.nodeId)
    let focus: Path | null = null
    ws.act((d) => {
      // the dragged placement's view goes with it (moved, mirrored, or split)
      const srcView = getContainer(d, src.fromId).slots.find((s) => s.id === src.slotId)?.view
      if (intent.kind === 'split') {
        if (!asMirror) removeSlot(d, src.fromId, src.slotId)
        focus = splitBeside(d, intent.path, src.nodeId, intent.edge, srcView)
        if (!focus) throw new Error('cannot split here') // rolls back the removal
        return
      }
      const targetView = viewAt(d, intent.path)
      const placement = {
        ...(intent.placement ?? { meta: placementFor(ws, getContainer(d, intent.containerId), targetView) }),
        parentView: targetView,
      }
      const sid = asMirror
        ? mirror(d, src.nodeId, intent.containerId, { ...placement, view: srcView })
        : moveSlot(d, src.fromId, src.slotId, intent.containerId, placement)
      if (sid) focus = [...intent.path, sid]
    })
    if (focus) ws.get().setFocus(focus)
  }

  const mirrorHint = altDown && dragging ? (ws.mirrorable(dragging.nodeId) ? 'mirror · ' : 'can’t mirror · ') : ''
  return (
    <div className={`cwm-root ${dragging ? 'is-dragging' : ''} ${className}`} ref={rootRef} tabIndex={-1}>
      {children}
      <DndContext
        sensors={sensors}
        collisionDetection={innermost}
        // re-measure while dragging: hovering a tab reveals new drop targets
        measuring={{ droppable: { strategy: MeasuringStrategy.Always, frequency: 120 } }}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragOver={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragging(null)
          setHint(null)
        }}
      >
        <main className={`workspace ${dragging ? 'is-dragging' : ''}`}>
          <NodeView nodeId={root} path={[]} depth={0} />
          {(['left', 'right', 'top', 'bottom'] as const).map((e) => (
            <RootEdge key={e} edge={e} active={!!dragging} />
          ))}
        </main>
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="drag-ghost">
              ⠿ {dragging.title}
              <span className="muted">{hint ? ` → ${mirrorHint}${hint.label}` : ' (edges split · ⌥ mirrors)'}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {hint && (
        <div
          className={`drop-hint ${hint.kind}`}
          style={{ left: hint.rect.left, top: hint.rect.top, width: hint.rect.width, height: hint.rect.height }}
        />
      )}
      <Palette />
    </div>
  )
}
