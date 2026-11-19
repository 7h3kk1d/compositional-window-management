import { describe, expect, it } from 'vitest'
import { addChild, getContainer, makeContainer, makeLeaf, materialize, setKanbanLanes, setViewAt } from './ops'
import type { Doc } from './types'
import { dayIso, dayNum, kanbanLanes, kanbanMeta, scrollColumns, scrollMeta, timelineMeta } from './viewMeta'

function doc(view: Parameters<typeof makeContainer>[1]) {
  const root = makeContainer('root', view)
  const d: Doc = { root: root.id, nodes: { [root.id]: root } }
  return { d, id: root.id, add: (meta = {}) => addChild(d, root.id, makeLeaf('x', 'note', { text: '' }), { meta }) }
}

describe('scrolling tiler', () => {
  it('stacks windows that share a column; unplaced ones get new columns after', () => {
    const { d, id, add } = doc('scroll')
    add({ scroll: { column: 0, width: 0.5 } })
    add({ scroll: { column: 0, width: 0.5 } })
    add({ scroll: { column: 1.5, width: 1 } })
    add()
    const cols = scrollColumns(getContainer(d, id))
    expect(cols.map((c) => [c.column, c.items.length])).toEqual([[0, 2], [1.5, 1], [2, 1]])
  })
})

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
    expect(getContainer(d, id).slots[1].meta.scroll).toEqual({ column: 1, width: 0.5 })
  })
})
