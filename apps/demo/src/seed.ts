import { EMBED_EXAMPLES, WIDGET_TEMPLATES } from '@cwm/react'
import { addChild, makeContainer, makeLeaf, mirror } from '@cwm/core'
import type { Doc } from '@cwm/core'
import { dayIso, todayNum } from '@cwm/core'

/**
 * A demo document following the essay's examples: a tabbed top level with
 * one tab per "persona" (Work as tiling, Play as an infinite canvas, Social
 * as a document), a project tracker nested as tabs inside Work, and a note
 * mirrored into two places.
 */
export function seedDoc(): Doc {
  const root = makeContainer('Desktop', 'tabs')
  const doc: Doc = { root: root.id, nodes: { [root.id]: root } }

  // --- Work: tiling split, with code beside the running app
  const work = makeContainer('Work', 'split', { split: { direction: 'row' } })
  const workSlot = addChild(doc, root.id, work)
  const devPair = makeContainer('Dev', 'split', { split: { direction: 'column' } })
  addChild(doc, work.id, devPair, { meta: { split: { size: 3 } } })
  addChild(
    doc,
    devPair.id,
    makeLeaf('main.ts', 'note', {
      text: [
        '// source code beside the running app',
        "import { compose } from './wm'",
        '',
        'const desktop = compose.tabs(',
        '  compose.split(editor, preview),',
        '  compose.canvas(...ideas),',
        ')',
      ].join('\n'),
      mono: true,
    }),
    { meta: { split: { size: 1 } } },
  )
  addChild(
    doc,
    devPair.id,
    makeLeaf('Running app', 'iframe', {
      url: 'https://www.openstreetmap.org/export/embed.html?bbox=-83.76%2C42.26%2C-83.70%2C42.30&layer=mapnik',
    }),
    { meta: { split: { size: 1 } } },
  )

  const tracker = makeContainer('Projects', 'tabs')
  addChild(doc, work.id, tracker, { meta: { split: { size: 2 } } })
  const alpha = makeContainer('Alpha', 'grid', { grid: { columns: 2 } })
  addChild(doc, tracker.id, alpha)
  addChild(doc, alpha.id, makeLeaf('Status', 'placeholder', { color: '#7c9cff', label: 'On track' }), {
    meta: { grid: { colSpan: 2, rowSpan: 1 } },
  })
  addChild(
    doc,
    alpha.id,
    makeLeaf('Tasks', 'todo', {
      items: [
        { id: 't1', text: 'Container API', done: true },
        { id: 't2', text: 'Persistence post', done: false },
        { id: 't3', text: 'Marketplace of containers', done: false },
      ],
    }),
  )
  addChild(doc, alpha.id, makeLeaf('Clock', 'clock', {}))
  const beta = makeContainer('Beta', 'document')
  addChild(doc, tracker.id, beta)
  addChild(
    doc,
    beta.id,
    makeLeaf('Brief', 'note', {
      text: 'Beta is drilled-down another level. This container is a document view: notes flow inline as text and every other child is an embedded block.',
    }),
  )
  addChild(doc, beta.id, makeLeaf('Mood', 'placeholder', { color: '#f2b84b', label: 'Exploring' }), {
    meta: { document: { height: 140 } },
  })
  // A kanban board and a timeline over the same work: the "Write the post"
  // card is mirrored into both, with a lane in one and dates in the other.
  const board = makeContainer('Board', 'kanban', { kanban: { lanes: ['To do', 'Doing', 'Done'] } })
  addChild(doc, tracker.id, board)
  const post = makeLeaf('Write the post', 'note', { text: 'Draft "On compositional persistence".' })
  addChild(doc, board.id, post, { meta: { kanban: { lane: 'Doing' } } })
  addChild(doc, board.id, makeLeaf('Container API', 'placeholder', { color: '#46c2a5', label: 'Shipped' }), {
    meta: { kanban: { lane: 'Done' } },
  })
  addChild(doc, board.id, makeLeaf('Marketplace', 'note', { text: 'A marketplace of containers people can install.' }), {
    meta: { kanban: { lane: 'To do' } },
  })
  // no lane stored: the board derives one (first lane) and marks it
  addChild(doc, board.id, makeLeaf('Inbox idea', 'note', { text: 'Made in another view, so it has no lane yet.' }))

  const today = todayNum()
  const span = (from: number, to: number) => ({ timeline: { start: dayIso(today + from), end: dayIso(today + to) } })
  const roadmap = makeContainer('Roadmap', 'timeline')
  addChild(doc, tracker.id, roadmap)
  addChild(doc, roadmap.id, makeLeaf('Alpha launch', 'placeholder', { color: '#7c9cff', label: 'Alpha' }), { meta: span(-2, 2) })
  mirror(doc, post.id, roadmap.id, { meta: span(1, 5) })
  addChild(doc, roadmap.id, makeLeaf('Review', 'todo', { items: [{ id: 'r1', text: 'Read draft', done: false }] }), {
    meta: span(6, 7),
  })

  // the project tracker should open on Alpha
  tracker.viewState.tabs = { active: tracker.slots[0].id }

  // --- Play: infinite canvas with a personal and a work region
  const play = makeContainer('Play', 'canvas', { canvas: { panX: 40, panY: 30, zoom: 0.9 } })
  addChild(doc, root.id, play)
  const personal = makeContainer('Personal region', 'floating')
  addChild(doc, play.id, personal, { meta: { canvas: { x: 0, y: 0, w: 520, h: 380, z: 1 } } })
  addChild(doc, personal.id, makeLeaf('Sketch', 'placeholder', { color: '#e66f8f', label: 'Doodle' }), {
    meta: { floating: { x: 20, y: 20, w: 200, h: 150, z: 1 } },
  })
  addChild(doc, personal.id, makeLeaf('Photo', 'image', { url: 'https://picsum.photos/seed/cwm/400/300' }), {
    meta: { floating: { x: 160, y: 110, w: 260, h: 200, z: 2 } },
  })
  const ideas = makeLeaf('Ideas (mirrored)', 'note', {
    text: 'This note is mirrored: it appears in Play and in Work › Projects › Alpha. Edit it here and watch the other copy update.\n\nEach copy has its own position, because layout lives on the edge, not on the node.',
  })
  addChild(doc, play.id, ideas, { meta: { canvas: { x: 560, y: 0, w: 320, h: 240, z: 2 } } })
  mirror(doc, ideas.id, alpha.id)
  addChild(doc, play.id, makeLeaf('Wikipedia', 'iframe', { url: 'https://en.m.wikipedia.org/wiki/Window_manager' }), {
    meta: { canvas: { x: 560, y: 280, w: 420, h: 320, z: 3 } },
  })
  // The same Projects container that is a tabs view in Work, mirrored here
  // as an outline: views are per placement, so one container can be viewed
  // two ways at once, both live on the same data.
  mirror(doc, tracker.id, play.id, {
    view: 'outline',
    meta: { canvas: { x: 1020, y: 0, w: 300, h: 420, z: 4 } },
  })

  // An HTML widget: its state lives in the document, so the mirrored copy in
  // Social shows the same drawing.
  const sketchpad = makeLeaf('Sketchpad', 'widget', WIDGET_TEMPLATES.find((t) => t.id === 'sketch')!.data())
  addChild(doc, play.id, sketchpad, { meta: { canvas: { x: 0, y: 420, w: 520, h: 320, z: 5 } } })

  // --- Social: a document (timeline-ish)
  const social = makeContainer('Social', 'document')
  addChild(doc, root.id, social)
  addChild(
    doc,
    social.id,
    makeLeaf('Intro', 'note', {
      text: 'A document view is another container: sub-windows sit inline like blocks in Notion or Google Docs. Try ⌘K → "View as Canvas" on this container, then switch back.',
    }),
  )
  addChild(doc, social.id, makeLeaf('Feed', 'placeholder', { color: '#46c2a5', label: '3 new posts' }), {
    meta: { document: { height: 120 } },
  })
  addChild(doc, social.id, makeLeaf('Reply', 'note', { text: 'Window management should be compositional.' }))
  addChild(doc, social.id, makeLeaf('The Mother of All Demos', 'iframe', { url: EMBED_EXAMPLES[0].url }), {
    meta: { document: { height: 320 } },
  })
  mirror(doc, sketchpad.id, social.id, { meta: { document: { height: 280 } } })

  // --- Focus: classic tiling WM layouts. Master + stack (dwm) with a spiral
  // (bspwm) nested in its stack. Neither stores anything per window: the
  // layout comes from the order alone.
  const focus = makeContainer('Focus', 'master', { master: { ratio: 0.55, count: 1 } })
  addChild(doc, root.id, focus)
  addChild(
    doc,
    focus.id,
    makeLeaf('Today', 'note', {
      text: 'Master + stack: the first window is "main", the rest stack beside it. Press ⇱ main on a stacked window to promote it. That just moves it first in the shared order, so every other view of this container sees the new order too.',
    }),
  )
  const scratch = makeContainer('Scratch', 'spiral')
  addChild(doc, focus.id, scratch)
  for (const [label, color] of [
    ['one', '#7c9cff'],
    ['two', '#e66f8f'],
    ['three', '#46c2a5'],
    ['four', '#f2b84b'],
    ['five', '#a78bfa'],
  ])
    addChild(doc, scratch.id, makeLeaf(`Pane ${label}`, 'placeholder', { color, label }))
  addChild(doc, focus.id, makeLeaf('Timer', 'widget', WIDGET_TEMPLATES.find((t) => t.id === 'timer')!.data()))

  root.viewState.tabs = { active: workSlot }
  return doc
}
