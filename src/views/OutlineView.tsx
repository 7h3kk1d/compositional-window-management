import { contentKind } from '../content/registry'
import { refCounts, reveal, setViewState } from '../model/ops'
import { act, pathKey, useStore } from '../model/store'
import type { Container, NodeId, Path } from '../model/types'
import type { ViewProps } from './NodeView'
import { displayTitle, isAutoTitled } from '../model/titles'
import { VIEW_INFO } from './viewInfo'

/** The same children, viewed as a tree. Mirrored nodes appear at every reference. */
export function OutlineView({ container, path }: ViewProps) {
  const collapsed = new Set(container.viewState.outline?.collapsed ?? [])
  const toggle = (k: string) => {
    const next = new Set(collapsed)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    act((d) => setViewState(d, container.id, 'outline', { collapsed: [...next] }))
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
  const doc = useStore((s) => s.doc)
  const focusKey = useStore((s) => pathKey(s.focus))
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
                act((d) => reveal(d, p))
                useStore.getState().setFocus(p)
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
                {isC ? VIEW_INFO[node.view].icon : contentKind(node.content.kind)?.icon}
              </span>
              <span className={`title ${isAutoTitled(doc, node.id) ? 'auto' : ''}`}>{displayTitle(doc, node.id)}</span>
              {isC && <span className="tag">{VIEW_INFO[node.view].label}</span>}
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
