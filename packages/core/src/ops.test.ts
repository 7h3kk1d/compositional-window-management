import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import {
  addChild,
  clearOtherViewMeta,
  deepCopy,
  collectOrphans,
  getContainer,
  insertRef,
  makeContainer,
  makeLeaf,
  materialize,
  mirror,
  moveSlot,
  occurrences,
  refCount,
  removeSlot,
  setLeafData,
  setSlotMeta,
  setDefaultView,
  setViewAt,
  viewAt,
  splitBeside,
  unwrap,
  wouldCycle,
  wrap,
} from './ops'
import { displayTitle } from './titles'
import type { Doc } from './types'
import { canvasRects, isDerived } from './viewMeta'

function canvasDoc() {
  const root = makeContainer('root', 'canvas')
  const doc: Doc = { root: root.id, nodes: { [root.id]: root } }
  const a = addChild(doc, root.id, makeLeaf('a', 'note', { text: 'a' }), {
    meta: { canvas: { x: 10, y: 20, w: 100, h: 100, z: 1 } },
  })
  const b = addChild(doc, root.id, makeLeaf('b', 'note', { text: 'b' }), {
    meta: { canvas: { x: 300, y: 50, w: 100, h: 100, z: 2 } },
  })
  return { doc, root: getContainer(doc, root.id), a, b }
}

describe('lens round-tripping', () => {
  it('A -> B -> A without edits is the identity', () => {
    const { doc, root } = canvasDoc()
    const before = structuredClone(doc)
    setDefaultView(doc, root.id, 'tabs')
    setDefaultView(doc, root.id, 'split')
    setDefaultView(doc, root.id, 'canvas')
    expect(doc).toEqual(before)
  })

  it('edits in B keep A metadata for untouched slots', () => {
    const { doc, root, a, b } = canvasDoc()
    setDefaultView(doc, root.id, 'split')
    setSlotMeta(doc, root.id, a, 'split', { size: 3 })
    moveSlot(doc, root.id, b, root.id, { index: 0 }) // reorder
    setDefaultView(doc, root.id, 'canvas')
    const sa = root.slots.find((s) => s.id === a)!
    const sb = root.slots.find((s) => s.id === b)!
    expect(sa.meta.canvas).toEqual({ x: 10, y: 20, w: 100, h: 100, z: 1 })
    expect(sb.meta.canvas).toEqual({ x: 300, y: 50, w: 100, h: 100, z: 2 })
    expect(sa.meta.split).toEqual({ size: 3 })
  })

  it('children created in B have no A metadata until materialized', () => {
    const { doc, root } = canvasDoc()
    setDefaultView(doc, root.id, 'tabs')
    const c = addChild(doc, root.id, makeLeaf('c', 'note', { text: '' }))
    setDefaultView(doc, root.id, 'canvas')
    const sc = root.slots.find((s) => s.id === c)!
    expect(isDerived(sc, 'canvas')).toBe(true)
    // derived placement goes to the right of the placed windows
    const rects = canvasRects(root, 'canvas')
    expect(rects[2].x).toBeGreaterThan(400)
    materialize(doc, root.id)
    expect(isDerived(sc, 'canvas')).toBe(false)
    expect(sc.meta.canvas).toEqual(rects[2])
  })

  it('removing a slot loses all of its metadata', () => {
    const { doc, root, a } = canvasDoc()
    removeSlot(doc, root.id, a)
    expect(root.slots.map((s) => s.id)).not.toContain(a)
  })

  it('moving across containers drops metadata that described the old parent', () => {
    const { doc, root, a } = canvasDoc()
    const box = makeContainer('box', 'grid')
    addChild(doc, root.id, box)
    const moved = moveSlot(doc, root.id, a, box.id, { meta: { grid: { colSpan: 2, rowSpan: 1 } } })!
    const s = getContainer(doc, box.id).slots.find((x) => x.id === moved)!
    expect(s.meta).toEqual({ grid: { colSpan: 2, rowSpan: 1 } })
  })

  it('clearOtherViewMeta forgets other views', () => {
    const { doc, root, a } = canvasDoc()
    setSlotMeta(doc, root.id, a, 'split', { size: 2 })
    clearOtherViewMeta(doc, root.id)
    expect(root.slots[0].meta).toEqual({ canvas: { x: 10, y: 20, w: 100, h: 100, z: 1 } })
  })
})

describe('mirroring', () => {
  it('shares node data between references', () => {
    const { doc, root } = canvasDoc()
    const other = makeContainer('other', 'tabs')
    addChild(doc, root.id, other)
    const nodeId = root.slots[0].nodeId
    mirror(doc, nodeId, other.id)
    expect(refCount(doc, nodeId)).toBe(2)
    expect(occurrences(doc, nodeId)).toHaveLength(2)
    setLeafData(doc, nodeId, { text: 'changed' })
    const viaOther = doc.nodes[getContainer(doc, other.id).slots[0].nodeId]
    expect(viaOther.type === 'leaf' && viaOther.content.data).toEqual({ text: 'changed' })
  })

  it('prevents cycles', () => {
    const { doc, root } = canvasDoc()
    const box = makeContainer('box', 'tabs')
    addChild(doc, root.id, box)
    expect(wouldCycle(doc, box.id, root.id)).toBe(true)
    expect(insertRef(doc, box.id, root.id)).toBeNull()
    expect(insertRef(doc, box.id, box.id)).toBeNull()
  })

  it('removed nodes become orphans rather than vanishing', () => {
    const { doc, root, a } = canvasDoc()
    const nodeId = root.slots[0].nodeId
    removeSlot(doc, root.id, a)
    expect(collectOrphans(doc)).toEqual([nodeId])
  })
})

describe('wrap / unwrap', () => {
  it('wrap keeps the outer slot metadata; unwrap lifts children', () => {
    const { doc, root, a } = canvasDoc()
    const leafId = root.slots[0].nodeId
    const boxId = wrap(doc, root.id, a, 'tabs')
    expect(root.slots[0].nodeId).toBe(boxId)
    expect(root.slots[0].meta.canvas?.x).toBe(10)
    unwrap(doc, root.id, a)
    expect(root.slots[0].nodeId).toBe(leafId)
  })
})

describe('splitBeside', () => {
  it('wraps the target in a split, keeping the outer slot meta', () => {
    const { doc, root, a, b } = canvasDoc()
    const nodeB = root.slots[1].nodeId
    removeSlot(doc, root.id, b)
    const p = splitBeside(doc, [a], nodeB, 'left')!
    const split = getContainer(doc, root.slots[0].nodeId)
    expect(split.defaultView).toBe('split')
    expect(split.slots[0].nodeId).toBe(nodeB)
    expect(root.slots[0].meta.canvas?.x).toBe(10)
    expect(p).toEqual([a, split.slots[0].id])
  })

  it('at the root creates a new root', () => {
    const { doc, root } = canvasDoc()
    const extra = makeLeaf('x', 'note', { text: '' })
    doc.nodes[extra.id] = extra
    splitBeside(doc, [], extra.id, 'bottom')
    const newRoot = getContainer(doc, doc.root)
    expect(newRoot.viewState.split?.direction).toBe('column')
    expect(newRoot.slots.map((s) => s.nodeId)).toEqual([root.id, extra.id])
  })

  it('refuses to split a node beside its own ancestor', () => {
    const { doc, root } = canvasDoc()
    expect(splitBeside(doc, [root.slots[0].id], root.id, 'right')).toBeNull()
  })
})

describe('ops inside immer (as the store runs them)', () => {
  // Regression: structuredClone rejected drafts, and arrow bodies that
  // return a value (e.g. wrap's new id) made immer reject the update.
  const run = (doc: Doc, fn: (d: Doc) => unknown) =>
    produce(doc, (d) => {
      fn(d)
    })

  it('wrap, unwrap, duplicate and materialize work on drafts', () => {
    const { doc, root, a } = canvasDoc()
    let next = run(doc, (d) => wrap(d, root.id, a, 'tabs'))
    expect(next.nodes[next.nodes[root.id].type === 'container' ? (next.nodes[root.id] as typeof root).slots[0].nodeId : ''].type).toBe('container')
    next = run(next, (d) => unwrap(d, root.id, a))
    next = run(next, (d) => deepCopy(d, (d.nodes[root.id] as typeof root).slots[0].nodeId))
    next = run(next, (d) => {
      setDefaultView(d, root.id, 'canvas')
      materialize(d, root.id)
    })
    expect(Object.keys(next.nodes).length).toBeGreaterThan(Object.keys(doc.nodes).length)
  })
})

describe('views are per placement', () => {
  function mirroredBox() {
    const root = makeContainer('root', 'split')
    const doc: Doc = { root: root.id, nodes: { [root.id]: root } }
    const box = makeContainer('box', 'grid')
    const s1 = addChild(doc, root.id, box)
    addChild(doc, box.id, makeLeaf('x', 'note', { text: '' }))
    addChild(doc, box.id, makeLeaf('y', 'note', { text: '' }))
    const s2 = mirror(doc, box.id, root.id, { view: 'outline' })!
    return { doc, root, box, p1: [s1], p2: [s2] }
  }

  it('a mirrored container can show a different view in each place', () => {
    const { doc, p1, p2 } = mirroredBox()
    expect(viewAt(doc, p1)).toBe('grid') // new placements start at defaultView
    expect(viewAt(doc, p2)).toBe('outline') // or the view asked for
    setViewAt(doc, p1, 'canvas')
    expect(viewAt(doc, p1)).toBe('canvas')
    expect(viewAt(doc, p2)).toBe('outline') // the other placement is untouched
  })

  it('the root has no slot, so its view is the default view', () => {
    const { doc, root } = mirroredBox()
    setViewAt(doc, [], 'tabs')
    expect(root.defaultView).toBe('tabs')
    expect(viewAt(doc, [])).toBe('tabs')
  })

  it('moving keeps the placement view; wrapping keeps the inner view', () => {
    const { doc, root, box, p1 } = mirroredBox()
    setViewAt(doc, p1, 'dock')
    const other = makeContainer('other', 'tabs')
    addChild(doc, root.id, other)
    const moved = moveSlot(doc, root.id, p1[0], other.id)!
    expect(viewAt(doc, [root.slots.find((s) => s.nodeId === other.id)!.id, moved])).toBe('dock')
    // wrap the outline placement: outer shows tabs, inner keeps outline
    const outline = root.slots.find((s) => s.nodeId === box.id)!
    wrap(doc, root.id, outline.id, 'tabs')
    expect(outline.view).toBe('tabs')
    const wrapper = getContainer(doc, outline.nodeId)
    expect(wrapper.slots[0].view).toBe('outline')
  })

  it('splitBeside keeps the target view and gives the outer slot a split', () => {
    const { doc, root, p2 } = mirroredBox()
    const leaf = makeLeaf('z', 'note', { text: '' })
    doc.nodes[leaf.id] = leaf
    splitBeside(doc, p2, leaf.id, 'top') // across the parent split's axis, so it nests
    const outer = root.slots.find((s) => s.id === p2[0])!
    expect(outer.view).toBe('split')
    const split = getContainer(doc, outer.nodeId)
    expect(split.slots[1].view).toBe('outline')
  })

  it('round-trips layout per view regardless of which placement switched', () => {
    const { doc, box, p1, p2 } = mirroredBox()
    setViewAt(doc, p1, 'canvas')
    materialize(doc, box.id, 'canvas')
    const before = structuredClone(box.slots.map((s) => s.meta.canvas))
    setViewAt(doc, p2, 'canvas') // the outline placement becomes a canvas too
    setViewAt(doc, p1, 'tabs')
    setViewAt(doc, p1, 'canvas')
    expect(box.slots.map((s) => s.meta.canvas)).toEqual(before)
  })
})

describe('titleless containers', () => {
  it('derive their display title from what they show', () => {
    const { doc, root, a } = canvasDoc() // children "a", "b"
    wrap(doc, root.id, a, 'tabs') // titleless wrapper around "a"
    const box = root.slots[0].nodeId
    expect(getContainer(doc, box).title).toBe('')
    expect(displayTitle(doc, box)).toBe('a')
    // a titleless split beside it: named after its first child, "+N" for the rest
    const p = splitBeside(doc, [a], root.slots[1].nodeId, 'right')!
    const split = getContainer(doc, root.slots[0].nodeId)
    expect(p).toBeTruthy()
    expect(displayTitle(doc, split.id)).toBe('a +1')
    // tabs follow the active tab
    setDefaultView(doc, split.id, 'tabs')
    split.viewState.tabs = { active: split.slots[1].id }
    expect(displayTitle(doc, split.id)).toBe('b')
    // empty
    const empty = makeContainer('', 'grid')
    doc.nodes[empty.id] = empty
    expect(displayTitle(doc, empty.id)).toBe('Empty grid')
  })
})
