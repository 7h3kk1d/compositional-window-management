import { describe, expect, it } from 'vitest'
import { addChild, makeContainer, makeLeaf } from './ops'
import { createWorkspaceStore, type LayoutCommit } from './store'
import type { Doc } from './types'

const doc = (): Doc => {
  const root = makeContainer('Root', 'tabs')
  return { root: root.id, nodes: { [root.id]: root } }
}
const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }
}

describe('workspace store', () => {
  it('keeps instances independent', () => {
    const a = createWorkspaceStore({ doc })
    const b = createWorkspaceStore({ doc })
    a.getState().act((d) => void addChild(d, d.root, makeLeaf('x', 'note', {})))
    expect(Object.keys(a.getState().doc.nodes)).toHaveLength(2)
    expect(Object.keys(b.getState().doc.nodes)).toHaveLength(1)
    expect(b.getState().past).toHaveLength(0)
  })

  it('persists through a custom storage and restores it', () => {
    const storage = memory()
    const a = createWorkspaceStore({ doc, persist: { key: 'k', storage } })
    a.getState().act((d) => void addChild(d, d.root, makeLeaf('kept', 'note', {})))
    const b = createWorkspaceStore({ doc, persist: { key: 'k', storage } })
    expect(Object.values(b.getState().doc.nodes).some((n) => n.title === 'kept')).toBe(true)
  })

  it('falls back to the initial doc when the stored one is broken', () => {
    const storage = memory()
    storage.setItem('k', JSON.stringify({ state: { doc: { root: 'gone', nodes: {} }, focus: [] }, version: 2 }))
    const s = createWorkspaceStore({ doc, persist: { key: 'k', storage } })
    expect(s.getState().doc.nodes[s.getState().doc.root]).toBeTruthy()
  })

  it("with history: 'host', reports commits and leaves undo to the app", () => {
    const commits: LayoutCommit[] = []
    let undos = 0
    const s = createWorkspaceStore({ doc, history: 'host', onCommit: (c) => commits.push(c), onUndo: () => undos++ })
    const before = s.getState().doc
    s.getState().act((d) => void addChild(d, d.root, makeLeaf('x', 'note', {})), { key: 'k1' })
    expect(commits).toHaveLength(1)
    expect(commits[0].before).toBe(before)
    expect(commits[0].key).toBe('k1')
    expect(s.getState().past).toHaveLength(0)
    s.getState().undo()
    expect(undos).toBe(1)
    s.getState().restore(commits[0].before)
    expect(s.getState().doc).toBe(before)
    expect(commits).toHaveLength(1) // restoring is not a new commit
  })
})
