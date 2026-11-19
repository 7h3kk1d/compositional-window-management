import { Fragment, useRef } from 'react'
import { indexFromPoint } from '../dnd/dropAdapters'
import { getContainer } from '../model/ops'
import { act, pathKey } from '../model/store'
import { isDerived, splitSizes } from '../model/viewMeta'
import { Child, startPointerDrag, useDropAdapter, type ViewProps } from './NodeView'

export function SplitView({ container, path, depth }: ViewProps) {
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
      act(
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
