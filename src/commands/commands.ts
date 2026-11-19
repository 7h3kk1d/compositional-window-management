/**
 * One command registry drives the palette, keyboard shortcuts and frame
 * buttons: the essay's "one set of window controls" for every container.
 */
import { CONTENT_KINDS } from '../content/registry'
import {
  addChild,
  allContainers,
  clearOtherViewMeta,
  collectOrphans,
  deepCopy,
  getContainer,
  insertRef,
  makeContainer,
  makeLeaf,
  materialize,
  mirror,
  moveSlot,
  occurrences,
  purgeOrphans,
  resolvePath,
  rename,
  reveal,
  setViewAt,
  viewAt,
  setKanbanLanes,
  setViewState,
  unwrap,
  wouldCycle,
  wrap,
} from '../model/ops'
import { seedDoc } from '../model/seed'
import { act, useStore } from '../model/store'
import { VIEW_TYPES, type Container, type Doc, type Node, type Path, type Slot, type SlotMeta, type ViewType } from '../model/types'
import {
  DEFAULT_H,
  DEFAULT_SCROLL_WIDTH,
  DEFAULT_W,
  DERIVED_SPAN_DAYS,
  canvasRects,
  dayIso,
  dayNum,
  dayWidthOf,
  kanbanLanes,
  masterState,
  newLaneName,
  scrollMeta,
  timelineMeta,
} from '../model/viewMeta'

import { canvasSizes, canvasViewState, fitCanvas } from '../views/canvasUtil'
import { toJson } from '../views/JsonView'
import { displayTitle } from '../model/titles'
import { VIEW_INFO } from '../views/viewInfo'

export interface Ctx {
  doc: Doc
  focus: Path
  node: Node
  /** Parent container of the focused node and the slot that holds it. */
  parent?: Container
  slot?: Slot
  /** Nearest container: the focused node if it is one, otherwise its parent. */
  container: Container
  containerPath: Path
  /** How the nearest container is shown *at this placement* (views are per reference). */
  view: ViewType
  label: string
}

export interface Item {
  id: string
  title: string
  group?: string
  keywords?: string[]
  shortcut?: string
  hint?: string
  /** Run and close the palette. */
  run?: (ctx: Ctx) => void
  /** Open a sub-page instead. */
  page?: string
}

export function buildCtx(): Ctx {
  const { doc, focus } = useStore.getState()
  const { nodes, slots } = resolvePath(doc, focus)
  const node = nodes[nodes.length - 1]
  const parent = nodes.length > 1 ? (nodes[nodes.length - 2] as Container) : undefined
  const slot = slots[slots.length - 1]
  const isC = node.type === 'container'
  const container = isC ? node : parent!
  const containerPath = isC ? focus.slice(0, slots.length) : focus.slice(0, slots.length - 1)
  return {
    doc,
    focus: focus.slice(0, slots.length),
    node,
    parent,
    slot,
    container,
    containerPath,
    view: viewAt(doc, containerPath),
    label: nodes.map((n, i) => displayTitle(doc, n.id, { view: i ? slots[i - 1].view : undefined })).join(' › '),
  }
}

/** Metadata for a new child, in the semantics of the view the target is shown in. */
export function placementFor(c: Container, view: ViewType): SlotMeta {
  if (view === 'canvas') {
    const vs = canvasViewState(c)
    const size = canvasSizes.get(c.id) ?? { w: 800, h: 600 }
    const z = canvasRects(c, 'canvas').reduce((m, r) => Math.max(m, r.z), 0) + 1
    const jitter = (c.slots.length % 5) * 24
    return {
      canvas: {
        x: (size.w / 2 - vs.panX) / vs.zoom - DEFAULT_W / 2 + jitter,
        y: (size.h / 2 - vs.panY) / vs.zoom - DEFAULT_H / 2 + jitter,
        w: DEFAULT_W,
        h: DEFAULT_H,
        z,
      },
    }
  }
  if (view === 'floating') {
    const rects = canvasRects({ ...c, slots: [...c.slots, { id: '_', nodeId: '_', meta: {} }] }, 'floating')
    return { floating: rects[rects.length - 1] }
  }
  if (view === 'scroll') {
    // a new column at the end of the strip
    const cols = scrollMeta(c).map((m) => m.column)
    return { scroll: { column: cols.length ? Math.floor(Math.max(...cols)) + 1 : 0, width: DEFAULT_SCROLL_WIDTH } }
  }
  if (view === 'kanban') return { kanban: { lane: kanbanLanes(c)[0] } }
  if (view === 'timeline') {
    // right after the last thing on the timeline
    const ends = timelineMeta(c).map((m) => dayNum(m.end))
    const start = ends.length ? Math.max(...ends) + 1 : dayNum(timelineMeta({ ...c, slots: [{ id: '_', nodeId: '_', meta: {} }] })[0].start)
    return { timeline: { start: dayIso(start), end: dayIso(start + DERIVED_SPAN_DAYS - 1) } }
  }
  return {}
}

const focusTo = (path: Path) => {
  act((d) => reveal(d, path))
  useStore.getState().setFocus(path)
}

function addNode(ctx: Ctx, node: Node) {
  const c = ctx.container
  let sid = ''
  act((d) => {
    sid = addChild(d, c.id, node, { meta: placementFor(c, ctx.view), parentView: ctx.view })
  })
  if (sid) focusTo([...ctx.containerPath, sid])
}

// ---------------------------------------------------------------- pages

export const PAGES: Record<string, { title: string; items: (ctx: Ctx) => Item[] }> = {
  add: {
    title: 'Add child',
    items: (ctx) => [
      ...CONTENT_KINDS.map((k) => ({
        id: 'add-' + k.id,
        title: `${k.icon}  ${k.label}`,
        group: 'Content',
        run: () => addNode(ctx, makeLeaf(k.label, k.id, k.create())),
      })),
      ...CONTENT_KINDS.flatMap((k) =>
        (k.presets ?? []).map((p) => ({
          id: `add-${k.id}-${p.id}`,
          title: `${k.icon}  ${p.label}`,
          group: k.label,
          keywords: [k.label],
          run: () => addNode(ctx, makeLeaf(p.label, k.id, p.data())),
        })),
      ),
      ...VIEW_TYPES.map((v) => ({
        id: 'add-c-' + v,
        title: `${VIEW_INFO[v].icon}  ${VIEW_INFO[v].label} container`,
        group: 'Container',
        keywords: [VIEW_INFO[v].blurb],
        run: () => addNode(ctx, makeContainer('', v)),
      })),
    ],
  },
  wrap: {
    title: 'Wrap in',
    items: (ctx) =>
      VIEW_TYPES.map((v) => ({
        id: 'wrap-' + v,
        title: `${VIEW_INFO[v].icon}  ${VIEW_INFO[v].label}`,
        run: () => act((d) => wrap(d, ctx.parent!.id, ctx.slot!.id, v)),
      })),
  },
  move: {
    title: 'Move to',
    items: (ctx) =>
      allContainers(ctx.doc)
        .filter(({ container }) => container.id !== ctx.parent?.id && !wouldCycle(ctx.doc, container.id, ctx.node.id))
        .map(({ container, path, view, label }) => ({
          id: 'move-' + container.id,
          title: label,
          hint: VIEW_INFO[view].label,
          run: () => {
            let sid: string | null = null
            act((d) => {
              sid = moveSlot(d, ctx.parent!.id, ctx.slot!.id, container.id, {
                meta: placementFor(container, view),
                parentView: view,
              })
            })
            if (sid) focusTo([...path, sid])
          },
        })),
  },
  mirror: {
    title: 'Mirror into',
    items: (ctx) =>
      allContainers(ctx.doc)
        .filter(({ container }) => !wouldCycle(ctx.doc, container.id, ctx.node.id))
        .map(({ container, path, view, label }) => ({
          id: 'mirror-' + container.id,
          title: label,
          hint: VIEW_INFO[view].label,
          run: () => {
            let sid: string | null = null
            act((d) => {
              // the mirror starts with the view of the copy it came from; after
              // that, each placement's view is independent
              sid = mirror(d, ctx.node.id, container.id, {
                meta: placementFor(container, view),
                parentView: view,
                view: ctx.slot?.view,
              })
            })
            if (sid) focusTo([...path, sid])
          },
        })),
  },
  goto: {
    title: 'Go to',
    items: (ctx) => {
      const out: Item[] = []
      const seen = new Set<string>()
      const walk = (id: string, path: Path, labels: string[], depth: number) => {
        const n = ctx.doc.nodes[id]
        if (!n || depth > 24) return
        const view = n.type === 'container' ? viewAt(ctx.doc, path) : undefined
        const here = [...labels, displayTitle(ctx.doc, id, { view })]
        if (!seen.has(id)) {
          seen.add(id)
          out.push({
            id: 'goto-' + id,
            title: here.join(' › '),
            hint: view ? VIEW_INFO[view].label : 'leaf',
            run: () => focusTo(path),
          })
        }
        if (n.type === 'container') for (const s of n.slots) walk(s.nodeId, [...path, s.id], here, depth + 1)
      }
      walk(ctx.doc.root, [], [], 0)
      return out
    },
  },
  occurrences: {
    title: 'Occurrences',
    items: (ctx) =>
      occurrences(ctx.doc, ctx.node.id).map((p, i) => ({
        id: 'occ-' + i,
        title: resolvePath(ctx.doc, p).nodes.map((n) => displayTitle(ctx.doc, n.id)).join(' › '),
        run: () => focusTo(p),
      })),
  },
  orphans: {
    title: 'Restore closed',
    items: (ctx) =>
      collectOrphans(ctx.doc).map((id) => ({
        id: 'orphan-' + id,
        title: displayTitle(ctx.doc, id),
        hint: 'into ' + displayTitle(ctx.doc, ctx.container.id),
        run: () => {
          let sid: string | null = null
          act((d) => {
            sid = insertRef(d, ctx.container.id, id, { meta: placementFor(ctx.container, ctx.view), parentView: ctx.view })
          })
          if (sid) focusTo([...ctx.containerPath, sid])
        },
      })),
  },
}

// ---------------------------------------------------------------- root commands

export function rootItems(ctx: Ctx): Item[] {
  const c = ctx.container
  const items: Item[] = []
  const hasParent = !!ctx.parent && !!ctx.slot

  VIEW_TYPES.forEach((v, i) =>
    items.push({
      id: 'view-' + v,
      title: `View as ${VIEW_INFO[v].label}`,
      group: 'View',
      keywords: [VIEW_INFO[v].blurb, 'switch', 'layout'],
      hint: ctx.view === v ? 'current' : undefined,
      shortcut: i < 9 ? `⌥${i + 1}` : undefined,
      // only this placement changes; other mirrors keep their own views
      run: () => act((d) => setViewAt(d, ctx.containerPath, v)),
    }),
  )
  if (ctx.view === 'split')
    items.push({
      id: 'split-dir',
      title: 'Toggle split direction',
      group: 'View',
      run: () =>
        act((d) =>
          setViewState(d, c.id, 'split', { direction: c.viewState.split?.direction === 'column' ? 'row' : 'column' }),
        ),
    })
  if (ctx.view === 'canvas')
    items.push({
      id: 'canvas-fit',
      title: 'Zoom canvas to fit',
      group: 'View',
      run: () => {
        const size = canvasSizes.get(c.id) ?? { w: 800, h: 600 }
        act((d) => setViewState(d, c.id, 'canvas', fitCanvas(c, size.w, size.h)))
      },
    })
  if (ctx.view === 'grid')
    for (const delta of [1, -1])
      items.push({
        id: 'grid-cols' + delta,
        title: delta > 0 ? 'Grid: more columns' : 'Grid: fewer columns',
        group: 'View',
        run: () =>
          act((d) => {
            const g = getContainer(d, c.id)
            const cur = g.viewState.grid?.columns ?? Math.max(1, Math.ceil(Math.sqrt(g.slots.length)))
            g.viewState.grid = { columns: Math.max(1, cur + delta) }
          }),
      })

  if (ctx.view === 'master')
    for (const delta of [1, -1])
      items.push({
        id: 'master-count' + delta,
        title: delta > 0 ? 'Master: more main windows' : 'Master: fewer main windows',
        group: 'View',
        run: () =>
          act((d) => {
            const st = masterState(getContainer(d, c.id))
            setViewState(d, c.id, 'master', { ...st, count: Math.max(1, Math.min(c.slots.length, st.count + delta)) })
          }),
      })
  if (ctx.view === 'kanban')
    items.push({
      id: 'kanban-lane',
      title: 'Kanban: add lane',
      group: 'View',
      run: () => act((d) => setKanbanLanes(d, c.id, (ls) => [...ls, newLaneName(c)])),
    })
  if (ctx.view === 'timeline')
    for (const k of [2, 0.5])
      items.push({
        id: 'tl-zoom' + k,
        title: k > 1 ? 'Timeline: zoom in' : 'Timeline: zoom out',
        group: 'View',
        run: () => act((d) => setViewState(d, c.id, 'timeline', { dayWidth: Math.min(200, Math.max(12, dayWidthOf(c) * k)) })),
      })

  items.push(
    { id: 'add', title: 'Add child…', group: 'Structure', page: 'add', shortcut: '⌥N note', hint: '→ ' + displayTitle(ctx.doc, c.id) },
  )
  if (hasParent) {
    items.push(
      { id: 'wrap', title: 'Wrap in container…', group: 'Structure', page: 'wrap' },
      { id: 'move', title: 'Move to…', group: 'Structure', page: 'move', shortcut: '⌥M' },
      { id: 'mirror', title: 'Mirror into…', group: 'Structure', page: 'mirror', keywords: ['link', 'reference', 'alias'], shortcut: '⌥⇧M' },
      {
        id: 'dup',
        title: 'Duplicate (independent copy)',
        group: 'Structure',
        run: (x) => {
          let sid: string | null = null
          act((d) => {
            const copy = deepCopy(d, x.node.id)
            const i = getContainer(d, x.parent!.id).slots.findIndex((s) => s.id === x.slot!.id)
            const parentView = viewAt(d, x.focus.slice(0, -1))
            sid = insertRef(d, x.parent!.id, copy, {
              index: i + 1,
              meta: placementFor(x.parent!, parentView),
              parentView,
              view: x.slot!.view,
            })
          })
          if (sid) focusTo([...ctx.focus.slice(0, -1), sid])
        },
      },
      {
        id: 'earlier',
        title: 'Move earlier',
        group: 'Structure',
        shortcut: '⌥⇧←',
        run: (x) => reorder(x, -1),
      },
      { id: 'later', title: 'Move later', group: 'Structure', shortcut: '⌥⇧→', run: (x) => reorder(x, 1) },
    )
    if (ctx.node.type === 'container' && ctx.node.title)
      items.push({
        id: 'auto-title',
        title: 'Use automatic title',
        group: 'Structure',
        keywords: ['rename', 'titleless', 'name'],
        hint: 'shows “' + displayTitle(ctx.doc, ctx.node.id, { view: ctx.view, ignoreOwnTitle: true }) + '”',
        run: (x) => act((d) => rename(d, x.node.id, '')),
      })
    if (ctx.node.type === 'container')
      items.push({
        id: 'unwrap',
        title: 'Unwrap (lift children into parent)',
        group: 'Structure',
        keywords: ['flatten'],
        run: (x) => act((d) => unwrap(d, x.parent!.id, x.slot!.id)),
      })
    items.push({
      id: 'close',
      title: 'Close',
      group: 'Structure',
      shortcut: '⌥W',
      keywords: ['remove', 'delete'],
      run: (x) => {
        act((d) => {
          const p = getContainer(d, x.parent!.id)
          const i = p.slots.findIndex((s) => s.id === x.slot!.id)
          p.slots.splice(i, 1)
          if (p.viewState.tabs?.active === x.slot!.id) p.viewState.tabs.active = p.slots[Math.max(0, i - 1)]?.id
        })
        useStore.getState().setFocus(ctx.focus.slice(0, -1))
      },
    })
  }

  items.push(
    { id: 'goto', title: 'Go to…', group: 'Navigate', page: 'goto', shortcut: '⌘P' },
    {
      id: 'parent',
      title: 'Focus parent',
      group: 'Navigate',
      shortcut: '⌥↑',
      run: () => useStore.getState().setFocus(ctx.focus.slice(0, -1)),
    },
  )
  if (occurrences(ctx.doc, ctx.node.id, 2).length > 1)
    items.push({ id: 'occ', title: 'Show other occurrences (mirrors)', group: 'Navigate', page: 'occurrences' })

  const orphanCount = collectOrphans(ctx.doc).length
  items.push(
    {
      id: 'materialize',
      title: `Materialize derived ${VIEW_INFO[ctx.view].label.toLowerCase()} layout`,
      group: 'Layout data',
      keywords: ['store', 'derived', 'lens'],
      run: () => act((d) => materialize(d, c.id, ctx.view)),
    },
    {
      id: 'clear-other',
      title: `Forget layout for views other than ${VIEW_INFO[ctx.view].label}`,
      group: 'Layout data',
      keywords: ['lossy', 'meta', 'clear'],
      run: () => act((d) => clearOtherViewMeta(d, c.id, ctx.view)),
    },
    { id: 'undo', title: 'Undo', group: 'Edit', shortcut: '⌘Z', run: () => useStore.getState().undo() },
    { id: 'redo', title: 'Redo', group: 'Edit', shortcut: '⌘⇧Z', run: () => useStore.getState().redo() },
  )
  if (orphanCount)
    items.push(
      { id: 'orphans', title: `Restore closed window… (${orphanCount})`, group: 'Edit', page: 'orphans' },
      { id: 'purge', title: 'Permanently delete closed windows', group: 'Edit', run: () => act(purgeOrphans) },
    )
  items.push(
    {
      id: 'export',
      title: 'Export document JSON',
      group: 'Data',
      run: (x) => download('layout.json', JSON.stringify(x.doc, null, 2)),
    },
    {
      id: 'export-sub',
      title: `Export “${displayTitle(ctx.doc, c.id)}” as nested JSON`,
      group: 'Data',
      run: (x) => download(`${displayTitle(x.doc, c.id)}.json`, JSON.stringify(toJson(x.doc, c.id), null, 2)),
    },
    { id: 'import', title: 'Import document JSON…', group: 'Data', run: () => importDoc() },
    {
      id: 'reset',
      title: 'Reset to demo layout',
      group: 'Data',
      run: () => useStore.getState().replaceDoc(seedDoc()),
    },
  )
  return items
}

function reorder(ctx: Ctx, delta: number) {
  if (!ctx.parent || !ctx.slot) return
  const i = ctx.parent.slots.findIndex((s) => s.id === ctx.slot!.id)
  const j = i + delta
  if (j < 0 || j >= ctx.parent.slots.length) return
  act((d) => moveSlot(d, ctx.parent!.id, ctx.slot!.id, ctx.parent!.id, { index: delta > 0 ? j + 1 : j }))
}

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function importDoc() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.onchange = async () => {
    const f = input.files?.[0]
    if (!f) return
    try {
      const doc = JSON.parse(await f.text()) as Doc
      if (!doc.root || !doc.nodes?.[doc.root]) throw new Error('not a layout document')
      useStore.getState().replaceDoc(doc)
    } catch (e) {
      console.warn('[cwm] import failed', e)
    }
  }
  input.click()
}

// ---------------------------------------------------------------- keyboard

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

function siblingFocus(ctx: Ctx, delta: number) {
  if (!ctx.parent || !ctx.slot) return
  const i = ctx.parent.slots.findIndex((s) => s.id === ctx.slot!.id)
  const next = ctx.parent.slots[(i + delta + ctx.parent.slots.length) % ctx.parent.slots.length]
  if (next) focusTo([...ctx.focus.slice(0, -1), next.id])
}

function firstChildFocus(ctx: Ctx) {
  if (ctx.node.type !== 'container' || !ctx.node.slots.length) return
  const c = ctx.node
  const s = (ctx.view === 'tabs' && c.slots.find((x) => x.id === c.viewState.tabs?.active)) || c.slots[0]
  focusTo([...ctx.focus, s.id])
}

export function onGlobalKeyDown(e: KeyboardEvent) {
  const st = useStore.getState()
  const mod = e.metaKey || e.ctrlKey
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (st.paletteOpen) st.closePalette()
    else st.openPalette()
    return
  }
  if (mod && e.key.toLowerCase() === 'p') {
    e.preventDefault()
    st.openPalette('goto')
    return
  }
  if (st.paletteOpen) return
  if (mod && e.key.toLowerCase() === 'z' && !isEditable(e.target)) {
    e.preventDefault()
    if (e.shiftKey) st.redo()
    else st.undo()
    return
  }
  if (!e.altKey || mod) return
  // keep Alt+arrows for word-wise text navigation inside editors
  if (isEditable(e.target) && e.code.startsWith('Arrow')) return
  const ctx = buildCtx()
  const digit = /^Digit([1-9])$/.exec(e.code)
  if (digit) {
    e.preventDefault()
    const v: ViewType = VIEW_TYPES[Number(digit[1]) - 1]
    act((d) => setViewAt(d, ctx.containerPath, v))
    return
  }
  const run = (id: string) => rootItems(ctx).find((x) => x.id === id)?.run?.(ctx)
  const handled = (() => {
    switch (e.code) {
      case 'ArrowUp':
        st.setFocus(ctx.focus.slice(0, -1))
        return true
      case 'ArrowDown':
        firstChildFocus(ctx)
        return true
      case 'ArrowLeft':
        if (e.shiftKey) run('earlier')
        else siblingFocus(ctx, -1)
        return true
      case 'ArrowRight':
        if (e.shiftKey) run('later')
        else siblingFocus(ctx, 1)
        return true
      case 'KeyN':
        addNode(ctx, makeLeaf('Note', 'note', { text: '' }))
        return true
      case 'KeyW':
        run('close')
        return true
      case 'KeyM':
        if (ctx.parent) st.openPalette(e.shiftKey ? 'mirror' : 'move')
        return true
      default:
        return false
    }
  })()
  if (handled) e.preventDefault()
}
