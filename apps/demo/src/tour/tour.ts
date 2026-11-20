/**
 * First-run guided tour: spotlights parts of the screen with an explanation.
 * Uses driver.js for the overlay and popovers. Steps are prepared just in
 * time: a step may first switch tabs (`before`), then its target element is
 * looked up, since most windows only exist once their tab is showing.
 * Steps that need demo content the current layout lacks are skipped.
 */
import { driver, type DriveStep, type Side } from 'driver.js'
import 'driver.js/dist/driver.css'
import { occurrences, refCount, reveal, type Node, type Path } from '@cwm/core'
import { ws } from '../ws'

export const TOUR_KEY = 'cwm-tour-v1'

interface Step {
  title: string
  body: string
  /** Spotlight target; none (or not found) shows a centered card. */
  target?: () => Element | null | undefined
  /** Get the screen ready first (e.g. switch to the right tab). */
  before?: () => void
  side?: Side
  /** Skip the step when the layout lacks what it talks about. */
  requires?: () => boolean
}

const doc = () => ws.get().doc
const byTitle = (t: string): Node | undefined => Object.values(doc().nodes).find((n) => n.title === t)
const pathOf = (t: string): Path | undefined => {
  const n = byTitle(t)
  return n ? occurrences(doc(), n.id, 1)[0] : undefined
}
const has = (...titles: string[]) => () => titles.every((t) => !!pathOf(t))

/** Switch every tab along the way so the node is on screen. */
const show = (t: string) => () => {
  const p = pathOf(t)
  if (p) ws.act((d) => reveal(d, p))
}

const visible = (el: Element) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}
const firstVisible = (sel: string, within: ParentNode = document) =>
  Array.from(within.querySelectorAll(sel)).find(visible) ?? null
const frame = (t: string) => {
  const n = byTitle(t)
  return n ? firstVisible(`[data-node="${n.id}"]`) : null
}
const inFrame = (t: string, sel: string) => {
  const f = frame(t)
  return f ? firstVisible(sel, f) : null
}
const root = () => document.querySelector('.workspace > .frame')

const kbd = (k: string) => `<kbd>${k}</kbd>`

function steps(): Step[] {
  const demo = has('Work', 'Play', 'Projects', 'Board', 'Roadmap')()
  return [
    {
      title: 'Welcome to Compositional WM',
      body:
        'A window manager where <b>every container is a view</b> of the windows inside it. Tabs, splits, canvases and boards are all the same thing, shown different ways, and they nest.<br><br>' +
        'This tour takes about a minute.' +
        (demo ? '' : '<br><br><i>Your layout differs from the demo, so some steps are skipped. ⌘K → “Reset to demo layout” shows the full tour.</i>'),
    },
    {
      title: 'The desktop is a container too',
      body: 'Everything you see is one tree. Its top is this “Desktop” container, currently shown as <b>Tabs</b>.',
      target: () => root()?.querySelector(':scope > .frame-header'),
      side: 'bottom',
    },
    {
      title: 'Any container can change its view',
      body:
        'This switcher is on every container. Pick another view (split, canvas, grid, kanban, timeline, table…) and the same windows are laid out again.<br><br>' +
        'Each view remembers its own layout, so switching back restores it exactly.',
      target: () => root()?.querySelector(':scope > .frame-header .view-select'),
      side: 'left',
    },
    {
      title: 'One tab per kind of work',
      body: 'Each top-level tab is set up for a different kind of work, using a different view: <b>Work</b> tiles windows side by side, <b>Play</b> is an infinite canvas, <b>Social</b> is a scrolling document and <b>Focus</b> is a tiling window manager.',
      before: show('Work'),
      target: () => root()?.querySelector('.tab-bar'),
      side: 'bottom',
      requires: has('Work'),
    },
    {
      title: 'Containers nest',
      body: 'Work is a split. Inside it, “Dev” is another split (code beside the running app), and Projects is a set of tabs. Any container can hold any other.',
      before: show('Dev'),
      target: () => frame('Dev'),
      side: 'right',
      requires: has('Dev'),
    },
    {
      title: 'Mirrored windows',
      body: '<b>⧉ 2</b> means this container appears in two places: the same Projects is also on the Play canvas, as an outline. Edits show up in both, and each copy keeps its own view and position.',
      before: show('Projects'),
      target: () => inFrame('Projects', '.mirror-badge') ?? frame('Projects'),
      side: 'bottom',
      requires: () => {
        const p = byTitle('Projects')
        return !!p && refCount(doc(), p.id) > 1
      },
    },
    {
      title: 'Drag windows anywhere',
      body:
        `Grab a window by ${kbd('⠿')} and drop it into any container. Drop near an edge to split beside a window, or hold ${kbd('⌥')} to mirror it instead of moving it.`,
      before: show('Running app'),
      target: () => inFrame('Running app', '.grip'),
      side: 'right',
      requires: has('Running app'),
    },
    {
      title: 'A board is a view too',
      body: 'This Projects tab is shown as a <b>Kanban</b> board. A card’s lane is stored on its link to the board, not on the card, so the same card can be somewhere else with a different layout…',
      before: show('Board'),
      target: () => frame('Board')?.querySelector('.kanban-view') ?? frame('Board'),
      side: 'left',
      requires: has('Board'),
    },
    {
      title: '…like this timeline',
      body: '“Write the post” is mirrored here with <b>dates</b> in place of a lane. One window, two placements, each with its own kind of layout data.',
      before: show('Roadmap'),
      target: () => frame('Roadmap')?.querySelector('.timeline-view') ?? frame('Roadmap'),
      side: 'left',
      requires: has('Roadmap'),
    },
    {
      title: 'An infinite canvas',
      body:
        `Play is a canvas: drag the background to pan, ${kbd('⌘')} + scroll to zoom. Windows made while it was another view get a <b>derived</b> position (dashed) until you move them.`,
      before: show('Play'),
      target: () => frame('Play')?.querySelector('.canvas-view') ?? frame('Play'),
      side: 'top',
      requires: has('Play'),
    },
    {
      title: 'Widgets and embeds',
      body: 'Windows can hold notes, web embeds (YouTube, maps, Figma…) or small sandboxed HTML widgets. A widget keeps its state in the document, so this drawing is shared with its mirror in Social.',
      before: show('Sketchpad'),
      target: () => frame('Sketchpad'),
      side: 'right',
      requires: has('Sketchpad'),
    },
    {
      title: 'Everything is a command',
      body:
        `${kbd('⌘K')} opens the palette: switch views, add windows and embeds, wrap, move, mirror. It acts on the focused window. ${kbd('⌘P')} jumps to any window.`,
      target: () => document.querySelector('.palette-button'),
      side: 'bottom',
    },
    {
      title: 'Nothing is lost',
      body: `Every change can be undone (${kbd('⌘Z')}), and your layout saves itself in this browser.`,
      target: () => document.querySelector('.topbar .ghost'),
      side: 'bottom',
    },
    {
      title: 'Your turn',
      body:
        `Click a container and press ${kbd('⌥1')}–${kbd('⌥9')} to flip through views, or ${kbd('⌘K')} → “View as Table” to see every view’s stored layout side by side. ` +
        `Everything works from the keyboard too: ${kbd('⌥')} + arrows moves focus, ${kbd('⌥/')} lists every shortcut.<br><br>` +
        'Replay this tour any time with the <b>?</b> button or ⌘K → “Take the tour”.',
      before: show('Work'),
    },
  ]
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

let active: ReturnType<typeof driver> | null = null

export function startTour() {
  if (active?.isActive()) return
  ws.get().closePalette()
  const list = steps().filter((s) => !s.requires || s.requires())
  const ds: DriveStep[] = list.map((s) => ({ popover: { title: s.title, description: s.body, side: s.side, align: 'start' } }))
  ds[0].popover!.nextBtnText = 'Start the tour →'
  ds[0].popover!.showButtons = ['next', 'close']
  ds[ds.length - 1].popover!.doneBtnText = 'Done'

  const prepare = async (i: number) => {
    const s = list[i]
    if (s.before) {
      s.before()
      await wait(180) // let React render the newly shown tab
    }
    ds[i].element = s.target?.() ?? undefined
  }
  let busy = false
  const go = async (i: number) => {
    if (busy) return
    if (i >= list.length) return d.destroy()
    if (i < 0) return
    busy = true
    await prepare(i)
    busy = false
    d.moveTo(i)
  }

  const d = driver({
    steps: ds,
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    popoverClass: 'cwm-tour',
    stagePadding: 6,
    stageRadius: 10,
    overlayOpacity: 0.7,
    smoothScroll: true,
    disableActiveInteraction: true,
    onNextClick: () => void go((d.getActiveIndex() ?? -1) + 1),
    onPrevClick: () => void go((d.getActiveIndex() ?? 1) - 1),
    onDestroyed: () => {
      active = null
      try {
        localStorage.setItem(TOUR_KEY, 'done')
      } catch {
        /* private mode: the tour may show again next time */
      }
    },
  })
  active = d
  void prepare(0).then(() => d.drive(0))
}

/** Show the tour on a first visit. */
export function maybeStartTour() {
  let seen = false
  try {
    seen = !!localStorage.getItem(TOUR_KEY)
  } catch {
    seen = true
  }
  if (!seen) setTimeout(startTour, 700)
}
