import { useMemo, useState } from 'react'
import { useWsStore } from '../workspace'

import type { Doc, NodeId } from '@cwm/core'
import type { ViewProps } from './NodeView'

/**
 * The container's subtree as data. Mirrored nodes are written once and then
 * referenced with {"$ref"}; every slot's per-view meta is shown, so you can
 * see exactly what each view has stored (and what is merely derived).
 */
export function toJson(doc: Doc, rootId: NodeId) {
  const seen = new Set<NodeId>()
  const walk = (id: NodeId): unknown => {
    const n = doc.nodes[id]
    if (!n) return { $missing: id }
    if (seen.has(id)) return { $ref: id }
    seen.add(id)
    if (n.type === 'leaf') return { id: n.id, title: n.title, content: n.content }
    return {
      id: n.id,
      title: n.title,
      defaultView: n.defaultView,
      viewState: n.viewState,
      // each slot is a placement: its own view, plus per-view layout meta
      slots: n.slots.map((s) => ({ slot: s.id, ...(s.view ? { view: s.view } : {}), meta: s.meta, node: walk(s.nodeId) })),
    }
  }
  return walk(rootId)
}

export function JsonView({ container }: ViewProps) {
  const doc = useWsStore((s) => s.doc)
  const [copied, setCopied] = useState(false)
  const text = useMemo(() => JSON.stringify(toJson(doc, container.id), null, 2), [doc, container.id])
  return (
    <div className="json-view">
      <div className="json-toolbar">
        <span className="hint">Meta for views other than the active one is kept, so switching back round-trips.</span>
        <button
          className="ghost small"
          onClick={() => {
            void navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1000)
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>{highlight(text)}</pre>
    </div>
  )
}

function highlight(text: string) {
  // tiny tokenizer: keys, strings, numbers
  const out: React.ReactNode[] = []
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] && m[2]) {
      const k = m[1]
      const cls = k === '"$ref"' ? 'j-ref' : /^"(canvas|floating|split|tabs|grid|dock|document|outline)"$/.test(k) ? 'j-view' : 'j-key'
      out.push(
        <span key={i++} className={cls}>
          {k}
        </span>,
        m[2],
      )
    } else if (m[1]) out.push(<span key={i++} className="j-str">{m[1]}</span>)
    else out.push(<span key={i++} className="j-num">{m[3]}</span>)
    last = re.lastIndex
  }
  out.push(text.slice(last))
  return out
}
