import { useDraggable } from '@dnd-kit/core'
import { useRef } from 'react'
import { contentKind, InlineNote } from '../content/registry'
import { indexFromPoint } from '../dnd/dropAdapters'
import { removeSlot, setLeafData, setSlotMeta } from '../model/ops'
import { act, pathKey, useStore } from '../model/store'
import type { Container, Path, Slot } from '../model/types'
import { documentHeight } from '../model/viewMeta'
import { Child, startPointerDrag, useDropAdapter, type ViewProps } from './NodeView'

/**
 * A linear document. Inline-capable leaves (notes) flow as text; every
 * other child is embedded as a block, i.e. "literate computing".
 */
export function DocumentView({ container, path, depth }: ViewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const key = pathKey(path)
  useDropAdapter(path, (x, y) => ({ index: indexFromPoint(ref.current, `:scope > [data-slot-in="${key}"]`, x, y, 'y') }))

  return (
    <div className="document-view" ref={ref}>
      {container.slots.map((s) => (
        <Block key={s.id} container={container} slot={s} path={path} depth={depth} />
      ))}
      <button
        className="ghost add-block"
        onClick={() => {
          useStore.getState().setFocus(path)
          useStore.getState().openPalette('add')
        }}
      >
        + Add block
      </button>
    </div>
  )
}

function Block({ container, slot, path, depth }: { container: Container; slot: Slot; path: Path; depth: number }) {
  const node = useStore((s) => s.doc.nodes[slot.nodeId])
  const key = pathKey(path)
  const childPath = [...path, slot.id]
  const childKey = pathKey(childPath)
  const focused = useStore((s) => pathKey(s.focus) === childKey)
  const drag = useDraggable({
    id: 'drag:' + childKey,
    data: { fromId: container.id, slotId: slot.id, nodeId: slot.nodeId, path: childPath, title: node?.title },
  })
  const inline = node?.type === 'leaf' && contentKind(node.content.kind)?.inline

  if (inline && node?.type === 'leaf') {
    return (
      <div
        className={`doc-inline ${focused ? 'focused' : ''}`}
        data-slot-in={key}
        onPointerDownCapture={() => useStore.getState().setFocus(childPath)}
      >
        <div className="doc-gutter">
          <span className="grip" ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} title={node.title}>
            ⠿
          </span>
          <button className="ghost small" title="Remove" onClick={() => act((d) => removeSlot(d, container.id, slot.id))}>
            ×
          </button>
        </div>
        <InlineNote
          data={node.content.data as { text: string }}
          update={(data) => act((d) => setLeafData(d, node.id, data), { key: 'edit:' + node.id })}
        />
      </div>
    )
  }

  const h = documentHeight(slot)
  return (
    <div className="doc-block" data-slot-in={key} style={{ height: h }}>
      <Child container={container} slot={slot} path={path} depth={depth} />
      <div
        className="doc-resize"
        title="Drag to resize block"
        onPointerDown={(e) =>
          startPointerDrag(e, (_dx, dy) =>
            act((d) => setSlotMeta(d, container.id, slot.id, 'document', { height: Math.max(60, h + dy) }), {
              key: 'doc-h:' + slot.id,
            }),
          )
        }
      />
    </div>
  )
}
