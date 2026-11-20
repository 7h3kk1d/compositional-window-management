import { useRef } from 'react'
import { moveSlot, setViewState } from '@cwm/core'
import { useWs } from '../workspace'

import type { Slot } from '@cwm/core'
import { masterState } from '@cwm/core'
import { Child, startPointerDrag, useDropAdapter, type ViewProps } from './NodeView'

/**
 * Master + stack (dwm, xmonad): the first `count` children share the main
 * area, the rest stack beside it. Nothing is stored per child: who is
 * "master" is just the shared order, so promoting a window reorders the
 * container for every other view too.
 */
export function MasterView({ container, path, depth }: ViewProps) {
  const ws = useWs()
  const ref = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const { ratio, count: wanted } = masterState(container)
  const count = Math.max(1, Math.min(wanted, container.slots.length))
  const masters = container.slots.slice(0, count)
  const stack = container.slots.slice(count)

  const indexIn = (el: HTMLElement | null, y: number) => {
    const cells = Array.from(el?.querySelectorAll<HTMLElement>(':scope > .master-cell') ?? [])
    const i = cells.findIndex((c) => {
      const r = c.getBoundingClientRect()
      return y < r.top + r.height / 2
    })
    return i < 0 ? cells.length : i
  }
  useDropAdapter(path, (x, y) => {
    const main = mainRef.current?.getBoundingClientRect()
    if (!stack.length || (main && x < main.right)) return { index: indexIn(mainRef.current, y) }
    return { index: count + indexIn(stackRef.current, y) }
  })

  const onDivider = (e: React.PointerEvent) => {
    const total = ref.current?.clientWidth ?? 1
    startPointerDrag(e, (dx) => {
      const next = Math.max(0.15, Math.min(0.85, ratio + dx / total))
      ws.act((d) => setViewState(d, container.id, 'master', { ...masterState(container), ratio: next }), {
        key: 'master:' + container.id,
      })
    })
  }

  const cell = (s: Slot, isMaster: boolean) => (
    <div key={s.id} className="master-cell">
      <Child
        container={container}
        slot={s}
        path={path}
        depth={depth}
        headerExtra={
          !isMaster && (
            <button
              className="ghost small"
              title="Make this the main window (moves it first in the shared order)"
              onClick={() => {
                ws.act((d) => moveSlot(d, container.id, s.id, container.id, { index: 0 }))
                ws.get().setFocus([...path, s.id])
              }}
            >
              ⇱ main
            </button>
          )
        }
      />
    </div>
  )

  if (!container.slots.length) return <div className="empty">Empty. ⌘K › Add.</div>

  return (
    <div className="master-view" ref={ref}>
      <div className="master-area main" ref={mainRef} style={{ flexBasis: stack.length ? `${ratio * 100}%` : '100%' }}>
        {masters.map((s) => cell(s, true))}
      </div>
      {stack.length > 0 && (
        <>
          <div className="divider row" onPointerDown={onDivider} title="Drag to resize the main area" />
          <div className="master-area stack" ref={stackRef}>
            {stack.map((s) => cell(s, false))}
          </div>
        </>
      )}
    </div>
  )
}
