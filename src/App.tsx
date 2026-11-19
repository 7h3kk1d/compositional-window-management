import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useDroppable,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useEffect, useRef, useState } from 'react'
import { onGlobalKeyDown, placementFor } from './commands/commands'
import { Palette } from './commands/Palette'
import { resolveDrop, type DragData, type DropData, type DropIntent } from './dnd/resolveDrop'
import { collectOrphans, getContainer, type Edge, mirror, moveSlot, removeSlot, splitBeside, viewAt } from './model/ops'
import { act, pathKey, useStore } from './model/store'
import type { Path } from './model/types'
import { maybeStartTour, startTour } from './tour/tour'
import { NodeView } from './views/NodeView'

/** The path a drop target stands for (used to exclude the dragged subtree). */
function RootEdge({ edge, active }: { edge: Edge; active: boolean }) {
  const drop = useDroppable({
    id: 'rootedge:' + edge,
    disabled: !active,
    data: { kind: 'edge', edge, path: [], title: 'Desktop' } satisfies DropData,
  })
  return <div ref={drop.setNodeRef} className={`root-edge ${edge} ${drop.isOver ? 'over' : ''}`} />
}

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

function intentOf(e: DragMoveEvent | DragEndEvent): DropIntent | null {
  if (!e.over?.data.current) return null
  const { x, y } = pointerOf(e)
  return resolveDrop(e.over.data.current as DropData, e.over.rect, x, y)
}

export default function App() {
  const root = useStore((s) => s.doc.root)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const orphans = useStore((s) => collectOrphans(s.doc).length)
  const [dragging, setDragging] = useState<DragData | null>(null)
  const [hint, setHint] = useState<DropIntent | null>(null)
  const [altDown, setAltDown] = useState(false)
  const alt = useRef(false)

  useEffect(() => {
    const track = (e: KeyboardEvent) => {
      alt.current = e.altKey
      setAltDown(e.altKey)
    }
    maybeStartTour()
    window.addEventListener('keydown', onGlobalKeyDown)
    window.addEventListener('keydown', track)
    window.addEventListener('keyup', track)
    return () => {
      window.removeEventListener('keydown', onGlobalKeyDown)
      window.removeEventListener('keydown', track)
      window.removeEventListener('keyup', track)
    }
  }, [])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const onDragStart = (e: DragStartEvent) => setDragging(e.active.data.current as DragData)
  const onDragMove = (e: DragMoveEvent) => setHint(intentOf(e))
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    setHint(null)
    const src = e.active.data.current as DragData | undefined
    const intent = intentOf(e)
    if (!src || !intent) return
    const asMirror = alt.current || (e.activatorEvent as PointerEvent).altKey
    let focus: Path | null = null
    act((d) => {
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
        ...(intent.placement ?? { meta: placementFor(getContainer(d, intent.containerId), targetView) }),
        parentView: targetView,
      }
      const sid = asMirror
        ? mirror(d, src.nodeId, intent.containerId, { ...placement, view: srcView })
        : moveSlot(d, src.fromId, src.slotId, intent.containerId, placement)
      if (sid) focus = [...intent.path, sid]
    })
    if (focus) useStore.getState().setFocus(focus)
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Compositional WM</span>
        <span className="muted">one tree of content · many views</span>
        <span className="spacer" />
        <button className="ghost" disabled={!canUndo} onClick={() => useStore.getState().undo()} title="Undo (⌘Z)">
          ↶
        </button>
        <button className="ghost" disabled={!canRedo} onClick={() => useStore.getState().redo()} title="Redo (⌘⇧Z)">
          ↷
        </button>
        {orphans > 0 && (
          <button className="ghost" onClick={() => useStore.getState().openPalette('orphans')} title="Closed windows are kept until purged">
            ⌫ {orphans} closed
          </button>
        )}
        <button className="ghost tour-button" onClick={startTour} title="Take the tour">
          ?
        </button>
        <button className="palette-button" onClick={() => useStore.getState().openPalette()}>
          Commands <kbd>⌘K</kbd>
        </button>
      </header>
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
              <span className="muted">
                {hint ? ` → ${altDown ? 'mirror · ' : ''}${hint.label}` : ' (edges split · ⌥ mirrors)'}
              </span>
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
