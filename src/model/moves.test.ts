import { describe, expect, it } from 'vitest'
import { moveWindow, resizeWindow } from './moves'
import { addChild, getContainer, makeContainer, makeLeaf } from './ops'
import type { Doc, ViewState, ViewType } from './types'

function setup(view: ViewType, n = 3, vs: ViewState = {}) {
  const root = makeContainer('root', view, vs)
  const d: Doc = { root: root.id, nodes: { [root.id]: root } }
  const ids = Array.from({ length: n }, (_, i) => addChild(d, root.id, makeLeaf('w' + i, 'note', { text: '' })))
  const order = () => getContainer(d, root.id).slots.map((s) => d.nodes[s.nodeId].title)
  return { d, root: getContainer(d, root.id), ids, order }
}

describe('keyboard move, per view', () => {
  it('split: along its axis only', () => {
    const { d, ids, order } = setup('split', 3, { split: { direction: 'row' } })
    expect(moveWindow(d, [ids[0]], 'right')).toEqual([ids[0]])
    expect(order()).toEqual(['w1', 'w0', 'w2'])
    // across the axis: no move inside, and the root has nowhere to move out to
    expect(moveWindow(d, [ids[0]], 'down')).toBeNull()
  })
  it('kanban: left/right changes lane, up/down reorders within the lane', () => {
    const { d, root, ids } = setup('kanban', 2)
    moveWindow(d, [ids[1]], 'right')
    expect(root.slots[1].meta.kanban).toEqual({ lane: 'Doing' })
    expect(moveWindow(d, [ids[0]], 'left')).toBeNull() // already the first lane
  })
  it('timeline: shifts by a day; canvas: nudges', () => {
    const t = setup('timeline', 1)
    t.root.slots[0].meta.timeline = { start: '2026-03-01', end: '2026-03-02' }
    moveWindow(t.d, [t.ids[0]], 'right')
    expect(t.root.slots[0].meta.timeline).toEqual({ start: '2026-03-02', end: '2026-03-03' })
    const c = setup('canvas', 1)
    c.root.slots[0].meta.canvas = { x: 0, y: 0, w: 100, h: 100, z: 1 }
    moveWindow(c.d, [c.ids[0]], 'down')
    expect(c.root.slots[0].meta.canvas?.y).toBe(40)
  })
  it('past the end of a tiled container, the window moves out beside it', () => {
    const { d, root, ids } = setup('split', 1, { split: { direction: 'row' } })
    const inner = makeContainer('', 'split', { split: { direction: 'column' } })
    const innerSlot = addChild(d, root.id, inner)
    const a = addChild(d, inner.id, makeLeaf('a', 'note', { text: '' }))
    addChild(d, inner.id, makeLeaf('b', 'note', { text: '' }))
    // 'right' is across the column split, so it leaves it, landing after it in the row
    const p = moveWindow(d, [innerSlot, a], 'right')!
    expect(p).toHaveLength(1)
    expect(root.slots.map((s) => d.nodes[s.nodeId].title)).toEqual(['w0', 'b', 'a'])
    void ids
  })
})

describe('keyboard resize', () => {
  it('climbs to the nearest ancestor with a notion of size', () => {
    const { d, root } = setup('split', 1, { split: { direction: 'row' } })
    const tabs = makeContainer('t', 'tabs')
    const ts = addChild(d, root.id, tabs)
    const leaf = addChild(d, tabs.id, makeLeaf('x', 'note', { text: '' }))
    expect(resizeWindow(d, [ts, leaf], 1)).toEqual([ts])
    const sizes = root.slots.map((s) => s.meta.split!.size)
    expect(sizes[1]).toBeGreaterThan(sizes[0])
  })
  it('scroll: steps through the preset widths', () => {
    const { d, root, ids } = setup('scroll', 1)
    resizeWindow(d, [ids[0]], 1)
    expect(root.slots[0].meta.scroll).toEqual({ width: 2 / 3 })
  })
})
