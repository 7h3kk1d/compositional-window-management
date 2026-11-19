import { addChild, makeContainer, makeLeaf, mirror } from './ops'
import type { Doc } from './types'

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

  root.viewState.tabs = { active: workSlot }
  return doc
}
