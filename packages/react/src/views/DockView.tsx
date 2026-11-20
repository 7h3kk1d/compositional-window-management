import { useRef } from 'react'
import { setSlotMeta } from '@cwm/core'
import { useWs } from '../workspace'

import type { DockSide, Slot } from '@cwm/core'
import { dockMeta, isDerived } from '@cwm/core'
import { Child, useDropAdapter, type ViewProps } from './NodeView'

const SIDES: DockSide[] = ['left', 'main', 'right', 'top', 'bottom']
const SIDE_ICON: Record<DockSide, string> = { left: '⇤', main: '◼', right: '⇥', top: '⤒', bottom: '⤓' }

export function DockView({ container, path, depth }: ViewProps) {
  const ws = useWs()
  const ref = useRef<HTMLDivElement>(null)
  const metas = container.slots.map((s, i) => dockMeta(s, i))
  const bySide = (side: DockSide) =>
    container.slots.map((s, i) => [s, metas[i]] as const).filter(([, m]) => m.side === side)

  // Drop: nearest edge region decides the side.
  useDropAdapter(path, (x, y) => {
    const r = ref.current!.getBoundingClientRect()
    const fx = (x - r.left) / r.width
    const fy = (y - r.top) / r.height
    const side: DockSide = fx < 0.22 ? 'left' : fx > 0.78 ? 'right' : fy > 0.75 ? 'bottom' : fy < 0.12 ? 'top' : 'main'
    return { meta: { dock: { side, collapsed: false } } }
  })

  const renderPanel = (s: Slot, m: { side: DockSide; collapsed: boolean }) => (
    <div key={s.id} className={`dock-item ${m.collapsed ? 'collapsed' : ''}`}>
      <Child
        container={container}
        slot={s}
        path={path}
        depth={depth}
        derived={isDerived(s, 'dock')}
        headerExtra={
          <>
            <select
              className="dock-side"
              value={m.side}
              title="Dock side"
              onChange={(e) =>
                ws.act((d) => setSlotMeta(d, container.id, s.id, 'dock', { ...m, side: e.target.value as DockSide }))
              }
            >
              {SIDES.map((x) => (
                <option key={x} value={x}>
                  {SIDE_ICON[x]} {x}
                </option>
              ))}
            </select>
            {m.side !== 'main' && (
              <button
                className="ghost small"
                title={m.collapsed ? 'Expand' : 'Collapse'}
                onClick={() => ws.act((d) => setSlotMeta(d, container.id, s.id, 'dock', { ...m, collapsed: !m.collapsed }))}
              >
                {m.collapsed ? '▸' : '▾'}
              </button>
            )}
          </>
        }
      />
    </div>
  )

  const left = bySide('left')
  const right = bySide('right')
  const top = bySide('top')
  const bottom = bySide('bottom')
  const main = bySide('main')
  // a side is as big as its biggest stored size (rows: height, columns: width);
  // a row of collapsed panels shrinks to their title bars
  const sized = (items: readonly (readonly [Slot, { size?: number; collapsed: boolean }])[], axis: 'width' | 'height') => {
    const sizes = items.map(([, m]) => m.size).filter((x): x is number => typeof x === 'number')
    if (axis === 'height' && items.every(([, m]) => m.collapsed)) return { height: 'auto' }
    return sizes.length ? { [axis]: Math.max(...sizes) } : undefined
  }

  return (
    <div className="dock-view" ref={ref}>
      {left.length > 0 && (
        <div className="dock-col left" style={sized(left, 'width')}>
          {left.map(([s, m]) => renderPanel(s, m))}
        </div>
      )}
      <div className="dock-center">
        {top.length > 0 && (
          <div className="dock-row top" style={sized(top, 'height')}>
            {top.map(([s, m]) => renderPanel(s, m))}
          </div>
        )}
        <div className="dock-main">
          {main.length ? main.map(([s, m]) => renderPanel(s, m)) : <div className="empty">Nothing docked in main</div>}
        </div>
        {bottom.length > 0 && (
          <div className="dock-row bottom" style={sized(bottom, 'height')}>
            {bottom.map(([s, m]) => renderPanel(s, m))}
          </div>
        )}
      </div>
      {right.length > 0 && (
        <div className="dock-col right" style={sized(right, 'width')}>
          {right.map(([s, m]) => renderPanel(s, m))}
        </div>
      )}
    </div>
  )
}
