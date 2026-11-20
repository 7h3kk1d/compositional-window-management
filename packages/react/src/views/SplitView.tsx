import { Fragment, useRef } from 'react'
import { indexFromPoint } from '../dnd/dropAdapters'
import { getContainer, setViewState } from '@cwm/core'
import { pathKey } from '@cwm/core'
import { isDerived, splitSizes } from '@cwm/core'
import type { Container } from '@cwm/core'
import { Child, startPointerDrag, useDropAdapter, type ViewProps } from './NodeView'
import { useWs } from '../workspace'

export function SplitView({ container, path, depth }: ViewProps) {
  const ws = useWs()
  const ref = useRef<HTMLDivElement>(null)
  const key = pathKey(path)
  const dir = container.viewState.split?.direction ?? 'row'
  const sizes = splitSizes(container)

  useDropAdapter(path, (x, y) => ({
    index: indexFromPoint(ref.current, `:scope > [data-slot-in="${key}"]`, x, y, dir === 'row' ? 'x' : 'y'),
  }))

  const onDivider = (i: number) => (e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    const total = dir === 'row' ? el.clientWidth : el.clientHeight
    const start = splitSizes(container)
    startPointerDrag(e, (dx, dy) => {
      const deltaPct = ((dir === 'row' ? dx : dy) / total) * 100
      const pair = start[i] + start[i + 1]
      const a = Math.max(5, Math.min(pair - 5, start[i] + deltaPct))
      const next = [...start]
      next[i] = a
      next[i + 1] = pair - a
      // Interacting materializes sizes for every child (they become stored).
      ws.act(
        (d) => {
          getContainer(d, container.id).slots.forEach((s, j) => (s.meta.split = { size: next[j] }))
        },
        { key: 'split:' + container.id },
      )
    })
  }

  if (!container.slots.length) return <div className="empty">Empty split. ⌘K › Add.</div>

  return (
    <div className={`split-view ${dir}`} ref={ref}>
      {container.slots.map((s, i) => (
        <Fragment key={s.id}>
          {i > 0 && <div className={`divider ${dir}`} onPointerDown={onDivider(i - 1)} />}
          <div className="split-cell" data-slot-in={key} style={{ flexGrow: sizes[i], flexBasis: 0 }}>
            <Child container={container} slot={s} path={path} depth={depth} derived={isDerived(s, 'split') && container.slots.some((x) => !isDerived(x, 'split'))} />
          </div>
        </Fragment>
      ))}
    </div>
  )
}

/** Header toggle: side by side ↔ stacked. */
export function SplitControls({ container }: { container: Container }) {
  const ws = useWs()
  const dir = container.viewState.split?.direction ?? 'row'
  return (
    <button
      className="ghost small"
      title={dir === 'row' ? 'Side by side (click to stack)' : 'Stacked (click to put side by side)'}
      onClick={() => ws.act((d) => setViewState(d, container.id, 'split', { direction: dir === 'row' ? 'column' : 'row' }))}
    >
      {dir === 'row' ? '⇆' : '⇅'}
    </button>
  )
}
