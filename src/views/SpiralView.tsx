import { useRef } from 'react'
import { indexFromPoint } from '../dnd/dropAdapters'
import { pathKey } from '../model/store'
import type { Container, Path, Slot } from '../model/types'
import { Child, useDropAdapter, type ViewProps } from './NodeView'

// right, down, left, up: the remaining space turns a corner each time
const TURNS = ['row', 'column', 'row-reverse', 'column-reverse'] as const

/**
 * Spiral auto-tiling (bspwm, Hyprland "dwindle"): each window takes half of
 * the space that is left and the rest turns a corner. The layout is a pure
 * function of the order, so this view stores nothing at all.
 */
export function SpiralView({ container, path, depth }: ViewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const key = pathKey(path)
  useDropAdapter(path, (x, y) => ({ index: indexFromPoint(ref.current, `[data-slot-in="${key}"]`, x, y, 'xy') }))
  if (!container.slots.length) return <div className="empty">Empty. ⌘K › Add.</div>
  return (
    <div className="spiral-view" ref={ref}>
      <Turn container={container} slots={container.slots} turn={0} path={path} depth={depth} k={key} />
    </div>
  )
}

function Turn({
  container,
  slots,
  turn,
  path,
  depth,
  k,
}: {
  container: Container
  slots: Slot[]
  turn: number
  path: Path
  depth: number
  k: string
}) {
  const [first, ...rest] = slots
  const cell = (
    <div className="spiral-cell" data-slot-in={k}>
      <Child container={container} slot={first} path={path} depth={depth} />
    </div>
  )
  if (!rest.length) return cell
  return (
    <div className="spiral-pair" style={{ flexDirection: TURNS[turn % 4] }}>
      {cell}
      <div className="spiral-rest">
        <Turn container={container} slots={rest} turn={turn + 1} path={path} depth={depth} k={k} />
      </div>
    </div>
  )
}
