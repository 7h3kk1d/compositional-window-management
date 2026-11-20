import { refCounts, reveal, setViewState, slotView } from '@cwm/core'
import { pathKey } from '@cwm/core'
import type { Container, NodeId, Path } from '@cwm/core'
import type { ViewProps } from './NodeView'
import { displayTitle, isAutoTitled } from '@cwm/core'
import { useWsStore, useWs, viewInfo } from '../workspace'

/** The same children, viewed as a tree. Mirrored nodes appear at every reference. */
export function OutlineView({ container, path }: ViewProps) {
  const ws = useWs()
  const collapsed = new Set(container.viewState.outline?.collapsed ?? [])
  const toggle = (k: string) => {
    const next = new Set(collapsed)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    ws.act((d) => setViewState(d, container.id, 'outline', { collapsed: [...next] }))
  }
  return (
    <div className="outline-view">
      <Items container={container} path={path} collapsed={collapsed} toggle={toggle} ancestors={[container.id]} />
    </div>
  )
}

function Items({
  container,
  path,
  collapsed,
  toggle,
  ancestors,
}: {
  container: Container
  path: Path
  collapsed: Set<string>
  toggle: (k: string) => void
  ancestors: NodeId[]
}) {
  const ws = useWs()
  const doc = useWsStore((s) => s.doc)
  const focusKey = useWsStore((s) => pathKey(s.focus))
  const counts = refCounts(doc)
  if (!container.slots.length) return <div className="outline-empty">(empty)</div>
  return (
    <ul>
      {container.slots.map((s) => {
        const node = doc.nodes[s.nodeId]
        if (!node) return null
        const p = [...path, s.id]
        const k = pathKey(p)
        const isC = node.type === 'container'
        const open = isC && !collapsed.has(k) && ancestors.length < 24
        return (
          <li key={s.id}>
            <div
              className={`outline-row ${focusKey === k ? 'focused' : ''}`}
              onClick={() => {
                ws.act((d) => reveal(d, p))
                ws.get().setFocus(p)
              }}
            >
              <button
                className="ghost twisty"
                disabled={!isC}
                onClick={(e) => {
                  e.stopPropagation()
                  toggle(k)
                }}
              >
                {isC ? (open ? '▾' : '▸') : '·'}
              </button>
              <span className="kind-icon">
                {isC ? viewInfo(ws, slotView(doc, s)).icon : ws.kinds.get(node.content.kind)?.icon}
              </span>
              <span className={`title ${isAutoTitled(doc, node.id) ? 'auto' : ''}`}>{displayTitle(doc, node.id, { view: s.view })}</span>
              {isC && <span className="tag">{viewInfo(ws, slotView(doc, s)).label}</span>}
              {(counts.get(node.id) ?? 0) > 1 && <span className="badge mirror-badge">⧉ {counts.get(node.id)}</span>}
            </div>
            {open && (
              <Items container={node} path={p} collapsed={collapsed} toggle={toggle} ancestors={[...ancestors, node.id]} />
            )}
          </li>
        )
      })}
    </ul>
  )
}
