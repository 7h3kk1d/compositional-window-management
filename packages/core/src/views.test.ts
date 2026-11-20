import { describe, expect, it } from 'vitest'
import { addChild, getContainer, liftOut, makeContainer, makeLeaf, materialize, setKanbanLanes, setViewAt, splitBeside, stackWith } from './ops'
import type { Doc } from './types'
import { dayIso, dayNum, kanbanLanes, kanbanMeta, scrollMeta, timelineMeta } from './viewMeta'

function doc(view: Parameters<typeof makeContainer>[1]) {
  const root = makeContainer('root', view)
  const d: Doc = { root: root.id, nodes: { [root.id]: root } }
  return { d, id: root.id, add: (meta = {}) => addChild(d, root.id, makeLeaf('x', 'note', { text: '' }), { meta }) }
}

describe('scrolling tiler', () => {
  it('stacking nests a vertical split; lifting out dissolves it again', () => {
    const { d, id, add } = doc('scroll')
    const a = add({ scroll: { width: 1 / 3 } })
    const b = add()
    const p = stackWith(d, [], b, -1)!
    const root = getContainer(d, id)
    expect(root.slots.map((s) => s.id)).toEqual([a])
    const col = getContainer(d, root.slots[0].nodeId)
    expect(col.title).toBe('')
    expect(col.viewState.split?.direction).toBe('column')
    expect(col.slots).toHaveLength(2)
    // the column keeps the width the window had
    expect(root.slots[0].meta.scroll).toEqual({ width: 1 / 3 })
    const back = liftOut(d, p, 1)!
    expect(root.slots).toHaveLength(2)
    expect(d.nodes[col.id]).toBeUndefined()
    expect(root.slots.every((s) => d.nodes[s.nodeId].type === 'leaf')).toBe(true)
    expect(back).toEqual([root.slots[1].id])
  })
  it('stacking onto an existing column joins it', () => {
    const { d, id, add } = doc('scroll')
    add()
    const b = add()
    const c = add()
    stackWith(d, [], b, -1)
    stackWith(d, [], c, -1)
    const root = getContainer(d, id)
    expect(root.slots).toHaveLength(1)
    expect(getContainer(d, root.slots[0].nodeId).slots).toHaveLength(3)
  })
})

describe('splitting beside a window', () => {
  it('joins a parent split on the same axis instead of nesting', () => {
    const { d, id, add } = doc('split')
    const a = add({ split: { size: 2 } })
    add({ split: { size: 2 } })
    const extra = makeLeaf('x', 'note', { text: '' })
    d.nodes[extra.id] = extra
    splitBeside(d, [a], extra.id, 'right')
    const root = getContainer(d, id)
    expect(root.slots).toHaveLength(3)
    expect(root.slots.map((s) => s.meta.split?.size)).toEqual([1, 1, 2])
    // across the axis it still nests
    splitBeside(d, [a], makeLeafIn(d).id, 'bottom')
    expect(d.nodes[getContainer(d, id).slots[0].nodeId].type).toBe('container')
  })
})

function makeLeafIn(d: Doc) {
  const l = makeLeaf('y', 'note', { text: '' })
  d.nodes[l.id] = l
  return l
}

describe('kanban', () => {
  it('derives the first lane and keeps lanes named only by cards', () => {
    const { d, id, add } = doc('kanban')
    add({ kanban: { lane: 'Someday' } })
    add()
    const c = getContainer(d, id)
    expect(kanbanLanes(c)).toEqual(['To do', 'Doing', 'Done', 'Someday'])
    expect(kanbanMeta(c).map((m) => m.lane)).toEqual(['Someday', 'To do'])
  })
  it('renaming a lane relabels stored cards', () => {
    const { d, id, add } = doc('kanban')
    add({ kanban: { lane: 'Doing' } })
    setKanbanLanes(d, id, (ls) => ls.map((l) => (l === 'Doing' ? 'Now' : l)), ['Doing', 'Now'])
    expect(getContainer(d, id).slots[0].meta.kanban).toEqual({ lane: 'Now' })
    expect(getContainer(d, id).viewState.kanban?.lanes).toEqual(['To do', 'Now', 'Done'])
  })
})

describe('timeline', () => {
  it('lays undated windows end to end after the dated ones', () => {
    const { d, id, add } = doc('timeline')
    add({ timeline: { start: '2026-03-02', end: '2026-03-04' } })
    add()
    add()
    const m = timelineMeta(getContainer(d, id))
    expect(m.slice(1)).toEqual([
      { start: '2026-03-05', end: '2026-03-07' },
      { start: '2026-03-08', end: '2026-03-10' },
    ])
    expect(dayIso(dayNum('2026-02-28') + 1)).toBe('2026-03-01')
  })
})

describe('new views keep the lens', () => {
  it('materialize stores derived values; switching views and back keeps them', () => {
    const { d, id, add } = doc('scroll')
    add({ canvas: { x: 1, y: 2, w: 3, h: 4, z: 1 } })
    add()
    materialize(d, id, 'scroll')
    expect(getContainer(d, id).slots.map((s) => s.meta.scroll)).toEqual(scrollMeta(getContainer(d, id)))
    setViewAt(d, [], 'kanban')
    setViewAt(d, [], 'canvas')
    expect(getContainer(d, id).slots[0].meta.canvas).toEqual({ x: 1, y: 2, w: 3, h: 4, z: 1 })
    expect(getContainer(d, id).slots[1].meta.scroll).toEqual({ width: 0.5 })
  })
})
