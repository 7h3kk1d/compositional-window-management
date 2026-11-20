/**
 * An app with no framework at all, managing its windows with <cwm-workspace>.
 * It owns its state (the terms' text) and draws every window's content; the
 * workspace owns the layout. Also a test page for the element (see the
 * puppeteer checks): iframes must never reload when windows move.
 */
import '@cwm/element'
import type { Placement } from '@cwm/element'
import { addChild, makeContainer, makeLeaf, type Doc } from '@cwm/core'

// ------------------------------------------------------------ app state (not the WM's)

const terms: Record<string, string> = { main: 'let main = util(41)', util: 'let util = x => x + 1', test: 'assert(main == 42)' }
const loads: Record<string, number> = {}
;(window as unknown as { cwmTest: unknown }).cwmTest = { terms, loads }

// ------------------------------------------------------------ the starting layout

function initialDoc(): Doc {
  const root = makeContainer('', 'split')
  const doc: Doc = { root: root.id, nodes: { [root.id]: root } }
  const left = makeContainer('Terms', 'tabs')
  addChild(doc, root.id, left)
  addChild(doc, left.id, makeLeaf('main', 'term', { name: 'main' }))
  addChild(doc, left.id, makeLeaf('util', 'term', { name: 'util' }))
  const right = makeContainer('Tools', 'tabs')
  addChild(doc, root.id, right)
  addChild(doc, right.id, makeLeaf('Preview', 'preview', { label: 'live preview' }))
  addChild(doc, right.id, makeLeaf('Clock', 'clock', {}))
  const cmp = makeContainer('Compare', 'compare')
  cmp.data = { a: 'main', b: 'util' }
  addChild(doc, right.id, cmp)
  addChild(doc, cmp.id, makeLeaf('main', 'term', { name: 'main' }))
  addChild(doc, cmp.id, makeLeaf('util', 'term', { name: 'util' }))
  const stack = makeContainer('Stack', 'accordion')
  addChild(doc, root.id, stack)
  addChild(doc, stack.id, makeLeaf('test', 'term', { name: 'test' }))
  addChild(doc, stack.id, makeLeaf('Notes preview', 'preview', { label: 'second preview' }))
  return doc
}

// ------------------------------------------------------------ the workspace

const ws = document.querySelector('cwm-workspace')!
ws.configure({ doc: initialDoc(), views: ['tabs', 'split', 'scroll', 'dock'], storageKey: 'cwm-vanilla-v1' })

// a term can be shown twice: both copies edit the same text (mirroring is semantic)
ws.registerKind({ id: 'term', label: 'Term', icon: 'λ', mirrorable: true })
// a live iframe: one instance only
ws.registerKind({ id: 'preview', label: 'Preview', icon: '◎' })
// a kind drawn by a plain mount function (the workspace keeps its element)
ws.registerKind({
  id: 'clock',
  label: 'Clock',
  icon: '◷',
  mount(el) {
    const t = setInterval(() => (el.textContent = new Date().toLocaleTimeString()), 1000)
    el.textContent = new Date().toLocaleTimeString()
    el.style.cssText += ';font-size:28px;display:grid;place-items:center'
    return { destroy: () => clearInterval(t) }
  },
})

// Tier 1: a pure layout with a header region the app fills
ws.registerView({
  id: 'compare',
  label: 'Compare',
  icon: '⇹',
  regions: ['header'],
  layout(c, { w, h }) {
    const head = 34
    const half = (w - 6) / 2
    return [
      { region: 'header', x: 0, y: 0, w, h: head - 4 },
      ...c.slots.map((s, i) => (i < 2 ? { slotId: s.id, x: i * (half + 6), y: head, w: half, h: h - head } : { slotId: s.id, x: 0, y: 0, w: 0, h: 0, hidden: true })),
    ]
  },
})

// Tier 2: a view that draws its own chrome (an accordion), in plain DOM
ws.registerView({
  id: 'accordion',
  label: 'Accordion',
  icon: '☰',
  mount(host, ctx) {
    host.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:4px;height:100%;box-sizing:border-box'
    let open = (ctx.container.viewState.accordion as { open?: string } | undefined)?.open
    const render = (c: typeof ctx) => {
      open = (c.container.viewState.accordion as { open?: string } | undefined)?.open ?? c.container.slots[0]?.id
      host.replaceChildren()
      for (const s of c.container.slots) {
        const bar = document.createElement('button')
        bar.textContent = (s.id === open ? '▾ ' : '▸ ') + (c.container.slots.indexOf(s) + 1)
        bar.className = 'accordion-bar'
        bar.style.cssText = 'text-align:left;border:1px solid var(--cwm-border);background:var(--cwm-surface-2);border-radius:5px;padding:3px 8px'
        bar.onclick = () => c.setViewState({ open: s.id })
        const child = c.childElement(s.id)
        child.style.flex = s.id === open ? '1' : '0 0 0'
        child.style.overflow = 'hidden'
        child.style.minHeight = '0'
        host.append(bar, child)
      }
    }
    render(ctx)
    return { update: render, destroy: () => host.replaceChildren() }
  },
})

// ------------------------------------------------------------ drawing what the WM asks for

const rendered = new Map<string, HTMLElement>()

function draw(p: Placement): HTMLElement {
  const el = document.createElement('div')
  el.slot = p.id
  el.dataset.placement = p.id
  if (p.type === 'region') {
    el.className = 'region'
    return el
  }
  if (p.kind === 'term') {
    el.className = 'term'
    const ctx = document.createElement('div')
    ctx.className = 'ctx'
    const ta = document.createElement('textarea')
    ta.oninput = () => {
      const name = (p.data as { name: string }).name
      terms[name] = ta.value
      // every copy of this term shows the new text
      for (const [, other] of rendered) if (other.dataset.term === name && other !== el) other.querySelector('textarea')!.value = ta.value
    }
    el.append(ctx, ta)
  }
  if (p.kind === 'preview') {
    const f = document.createElement('iframe')
    f.srcdoc = `<body style="font:13px system-ui;padding:8px">${(p.data as { label: string }).label}: <input placeholder="type here; survives moves"></body>`
    f.onload = () => (loads[p.id] = (loads[p.id] ?? 0) + 1)
    el.append(f)
  }
  return el
}

function update(el: HTMLElement, p: Placement) {
  if (p.type === 'region') {
    const d = p.data as { a: string; b: string } | undefined
    el.textContent = `comparing ${d?.a} ⇹ ${d?.b} (header drawn by the app, data on the container)`
    return
  }
  if (p.kind === 'term') {
    const name = (p.data as { name: string }).name
    el.dataset.term = name
    const ta = el.querySelector('textarea')!
    if (document.activeElement !== ta) ta.value = terms[name] ?? ''
    const parent = p.ancestors.at(-1)
    el.querySelector('.ctx')!.textContent = `${name} · in a ${parent?.view ?? 'root'}${parent?.view === 'compare' ? (parent.index === 0 ? ' (left side)' : ' (right side)') : ''}`
  }
}

ws.addEventListener('cwm-placements', (e) => {
  const list = (e as CustomEvent<Placement[]>).detail
  const live = new Set(list.map((p) => p.id))
  for (const p of list) {
    if (p.type === 'leaf' && p.kind === 'clock') continue // drawn by its mount function
    let el = rendered.get(p.id)
    if (!el) {
      el = draw(p)
      rendered.set(p.id, el)
      ws.append(el)
    }
    update(el, p)
  }
  for (const [id, el] of rendered)
    if (!live.has(id)) {
      el.remove()
      rendered.delete(id)
    }
})

document.getElementById('open-a')!.onclick = () => ws.open('term', { name: 'main' }, { title: 'main' })
document.getElementById('open-b')!.onclick = () => ws.open('term', { name: 'util' }, { where: 'beside', title: 'util' })
