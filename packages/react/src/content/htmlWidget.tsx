import { useEffect, useMemo, useRef, useState } from 'react'
import type { ContentProps } from './registry'

/**
 * HTML widgets: a snippet of HTML/JS running in a sandboxed iframe (opaque
 * origin, scripts only) with a tiny bridge to the host. This is the client
 * half of MCP Apps without the server: the widget's code and its state both
 * live in the document, so state persists, undoes, and stays in sync across
 * mirrored copies.
 *
 * Inside the widget:
 *   cwm.state                    current state (available immediately)
 *   cwm.setState(next | fn)      save state (fn receives the previous state)
 *   cwm.onState(fn)              called now and whenever state changes,
 *                                including from another mirrored copy
 *   cwm.theme / cwm.onTheme(fn)  { dark, colors }; CSS vars --bg --fg --muted
 *                                --surface --border --accent are kept current
 */
export interface WidgetData {
  source: string
  state: unknown
}

interface Theme {
  dark: boolean
  colors: Record<string, string>
}

const TOKENS: Record<string, string> = {
  bg: '--cwm-surface',
  fg: '--cwm-text',
  muted: '--cwm-muted',
  surface: '--cwm-surface-2',
  border: '--cwm-border',
  accent: '--cwm-accent',
}

/** The workspace's colours, read where the widget sits (they may be scoped to a shadow root). */
function hostTheme(at?: Element | null): Theme {
  const cs = getComputedStyle(at ?? document.documentElement)
  const colors: Record<string, string> = {}
  for (const [k, v] of Object.entries(TOKENS)) colors[k] = cs.getPropertyValue(v).trim()
  return { dark: matchMedia('(prefers-color-scheme: dark)').matches, colors }
}

/** JSON that is safe to inline inside a <script> element. */
const inlineJson = (v: unknown) => JSON.stringify(v ?? null).replace(/</g, '\\u003c')

function buildDoc(source: string, state: unknown, theme: Theme) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><base target="_blank">
<style>
:root { color-scheme: light dark; font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--fg); }
* { box-sizing: border-box; }
button, input, select, textarea { font: inherit; color: inherit; }
</style>
<script>
(() => {
  let state = ${inlineJson(state)}, theme = ${inlineJson(theme)}
  const stateFns = [], themeFns = []
  const post = (m) => parent.postMessage({ cwm: 1, ...m }, '*')
  const applyTheme = () => {
    const r = document.documentElement.style
    for (const [k, v] of Object.entries(theme.colors)) r.setProperty('--' + k, v)
    r.colorScheme = theme.dark ? 'dark' : 'light'
  }
  applyTheme()
  window.cwm = {
    get state() { return state },
    get theme() { return theme },
    setState(next) {
      state = typeof next === 'function' ? next(state) : next
      stateFns.forEach((f) => f(state))
      post({ type: 'setState', state })
    },
    onState(f) { stateFns.push(f); f(state) },
    onTheme(f) { themeFns.push(f); f(theme) },
  }
  addEventListener('message', (e) => {
    const m = e.data
    if (e.source !== parent || !m || !m.cwm) return
    if ('state' in m) { state = m.state; stateFns.forEach((f) => f(state)) }
    if (m.theme) { theme = m.theme; applyTheme(); themeFns.forEach((f) => f(theme)) }
  })
  post({ type: 'ready' })
})()
</script></head><body>
${source}
</body></html>`
}

export function HtmlWidget({ data, update }: ContentProps<WidgetData>) {
  const frame = useRef<HTMLIFrameElement>(null)
  const latest = useRef(data)
  latest.current = data
  const updateRef = useRef(update)
  updateRef.current = update
  /** The last state this frame sent us: don't echo it back. */
  const fromFrame = useRef<unknown>(Symbol())
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.source)
  useEffect(() => setDraft(data.source), [data.source])

  // Rebuilt only when the code changes; state updates go over postMessage.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const srcdoc = useMemo(() => buildDoc(data.source, latest.current.state, hostTheme(frame.current)), [data.source])

  const send = (m: object) => frame.current?.contentWindow?.postMessage({ cwm: 1, ...m }, '*')

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      const m = e.data
      if (!m?.cwm) return
      if (m.type === 'ready') send({ state: latest.current.state, theme: hostTheme(frame.current) })
      if (m.type === 'setState') {
        fromFrame.current = m.state
        updateRef.current({ ...latest.current, state: m.state })
      }
    }
    window.addEventListener('message', onMessage)
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => send({ theme: hostTheme(frame.current) })
    mq.addEventListener('change', onScheme)
    return () => {
      window.removeEventListener('message', onMessage)
      mq.removeEventListener('change', onScheme)
    }
  }, [])

  // state changed elsewhere (a mirrored copy, undo, import): push it in
  useEffect(() => {
    if (data.state !== fromFrame.current) send({ state: data.state })
  }, [data.state])

  const run = () => update({ ...data, source: draft })

  return (
    <div className={`widget-kind ${editing ? 'editing' : ''}`}>
      {editing && (
        <div className="widget-editor">
          <textarea
            className="note mono"
            value={draft}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                run()
              }
              e.stopPropagation()
            }}
          />
          <div className="widget-editor-bar">
            <button onClick={run} disabled={draft === data.source} title="Run (⌘↵)">
              ▶ Run
            </button>
            <button className="ghost" onClick={() => update({ ...data, state: null })} title="Forget the saved state">
              Reset state
            </button>
            <span className="muted">state: {JSON.stringify(data.state ?? null).length} bytes</span>
            <span className="spacer" />
            <button className="ghost" onClick={() => setEditing(false)}>
              Done
            </button>
          </div>
        </div>
      )}
      <iframe ref={frame} srcDoc={srcdoc} sandbox="allow-scripts allow-popups allow-forms" title="widget" />
      {!editing && (
        <button className="widget-edit-toggle ghost" onClick={() => setEditing(true)} title="Edit this widget's HTML">
          {'</>'}
        </button>
      )}
    </div>
  )
}

// ------------------------------------------------------------ templates

const COUNTER = `<style>
  body { display: grid; place-items: center; text-align: center; }
  .n { font-size: 56px; font-weight: 650; font-variant-numeric: tabular-nums; }
  button { font-size: 18px; width: 44px; height: 36px; border-radius: 8px;
           border: 1px solid var(--border); background: var(--surface); cursor: pointer; }
</style>
<div>
  <div class="n" id="n">0</div>
  <button id="dec">−</button> <button id="inc">+</button>
</div>
<script>
  const n = document.getElementById('n')
  cwm.onState((s) => (n.textContent = s?.count ?? 0))
  const add = (d) => cwm.setState((s) => ({ count: (s?.count ?? 0) + d }))
  inc.onclick = () => add(1)
  dec.onclick = () => add(-1)
</script>`

const SKETCHPAD = `<style>
  body { overflow: hidden; }
  canvas { display: block; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }
  .bar { position: absolute; left: 8px; bottom: 8px; display: flex; gap: 6px; align-items: center; }
  .bar button { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--bg); padding: 0; cursor: pointer;
                box-shadow: 0 0 0 1px var(--border); }
  .bar button.on { box-shadow: 0 0 0 2px var(--accent); }
  .bar .clear { width: auto; height: auto; border-radius: 6px; padding: 2px 8px; background: var(--surface); }
</style>
<canvas id="c"></canvas>
<div class="bar" id="bar"></div>
<script>
  // Strokes are stored in 0..1 coordinates, so mirrored copies of
  // different sizes draw the same picture.
  const COLORS = ['fg', '#e66f8f', '#3d63dd', '#46c2a5', '#f2b84b']
  const c = document.getElementById('c'), ctx = c.getContext('2d')
  let color = COLORS[0], live = null
  const strokes = () => cwm.state?.strokes ?? []
  const ink = (k) => (k === 'fg' ? getComputedStyle(document.body).color : k)
  function draw() {
    const r = devicePixelRatio, w = c.clientWidth, h = c.clientHeight
    c.width = w * r; c.height = h * r; ctx.setTransform(r, 0, 0, r, 0, 0)
    ctx.lineCap = ctx.lineJoin = 'round'
    for (const s of [...strokes(), ...(live ? [live] : [])]) {
      ctx.strokeStyle = ink(s.c); ctx.lineWidth = 3; ctx.beginPath()
      s.p.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)))
      ctx.stroke()
    }
  }
  const pt = (e) => [+(e.offsetX / c.clientWidth).toFixed(4), +(e.offsetY / c.clientHeight).toFixed(4)]
  c.onpointerdown = (e) => { c.setPointerCapture(e.pointerId); live = { c: color, p: [pt(e)] } }
  c.onpointermove = (e) => { if (live) { live.p.push(pt(e)); draw() } }
  c.onpointerup = () => {
    if (!live) return
    const s = live; live = null
    cwm.setState((st) => ({ strokes: [...(st?.strokes ?? []), s] }))
  }
  for (const k of COLORS) {
    const b = document.createElement('button')
    b.style.background = k === 'fg' ? 'var(--fg)' : k
    b.onclick = () => { color = k; [...bar.children].forEach((x) => x.classList.toggle('on', x === b)) }
    if (k === color) b.classList.add('on')
    bar.append(b)
  }
  const clear = document.createElement('button')
  clear.className = 'clear'; clear.textContent = 'Clear'
  clear.onclick = () => cwm.setState({ strokes: [] })
  bar.append(clear)
  cwm.onState(draw)
  cwm.onTheme(draw)
  new ResizeObserver(draw).observe(c)
</script>`

const TIMER = `<style>
  body { display: grid; place-items: center; text-align: center; }
  .t { font-size: 48px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -1px; }
  .t.done { color: var(--accent); }
  .row { display: flex; gap: 6px; justify-content: center; margin-top: 8px; }
  button { border-radius: 7px; border: 1px solid var(--border); background: var(--surface); padding: 3px 10px; cursor: pointer; }
</style>
<div>
  <div class="t" id="t"></div>
  <div class="row"><button id="go"></button><button id="reset">Reset</button></div>
  <div class="row"><button data-m="5">5m</button><button data-m="15">15m</button><button data-m="25">25m</button></div>
</div>
<script>
  // State holds an absolute end time, so every mirrored copy (and a reload)
  // shows the same countdown.
  const fresh = (m) => ({ duration: m * 60000, endsAt: null, left: m * 60000 })
  const s = () => cwm.state ?? fresh(25)
  const left = () => (s().endsAt ? Math.max(0, s().endsAt - Date.now()) : s().left)
  function render() {
    const ms = left(), sec = Math.ceil(ms / 1000)
    t.textContent = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0')
    t.classList.toggle('done', ms === 0)
    go.textContent = s().endsAt && ms > 0 ? 'Pause' : 'Start'
  }
  go.onclick = () => {
    const st = s()
    if (st.endsAt && left() > 0) cwm.setState({ ...st, endsAt: null, left: left() })
    else cwm.setState({ ...st, endsAt: Date.now() + (left() || st.duration), left: left() || st.duration })
  }
  reset.onclick = () => cwm.setState(fresh(s().duration / 60000))
  document.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => cwm.setState(fresh(+b.dataset.m))))
  cwm.onState(render)
  setInterval(render, 250)
</script>`

const MARKDOWN = `<!-- Widgets can load libraries from a CDN: this one uses marked. -->
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<style>
  body { display: flex; flex-direction: column; }
  textarea { flex: 1; border: none; outline: none; resize: none; padding: 10px 12px; background: transparent;
             font: 12px/1.5 ui-monospace, Menlo, monospace; display: none; }
  #out { flex: 1; overflow: auto; padding: 4px 14px; }
  #out code { background: var(--surface); padding: 1px 4px; border-radius: 4px; }
  .edit textarea { display: block; } .edit #out { display: none; }
  .tog { position: absolute; top: 6px; right: 8px; border: 1px solid var(--border); background: var(--bg);
         border-radius: 6px; padding: 1px 8px; cursor: pointer; }
</style>
<button class="tog" id="tog">Edit</button>
<textarea id="src"></textarea>
<div id="out"></div>
<script>
  cwm.onState((s) => {
    const text = s?.text ?? ''
    if (src.value !== text) src.value = text
    out.innerHTML = marked.parse(text)
  })
  src.oninput = () => cwm.setState({ text: src.value })
  tog.onclick = () => { tog.textContent = document.body.classList.toggle('edit') ? 'Preview' : 'Edit' }
</script>`

const BLANK = `<!--
  A blank widget. Click </> to edit.
    cwm.state               saved state (persists, undoes, syncs across mirrors)
    cwm.setState(v | fn)    save new state
    cwm.onState(fn)         called now and on every change
    cwm.onTheme(fn)         theme changes; CSS vars: --bg --fg --muted --surface --border --accent
-->
<div style="padding: 12px">
  <p>Clicked <b id="n">0</b> times.</p>
  <button id="b">Click me</button>
</div>
<script>
  cwm.onState((s) => (n.textContent = s?.clicks ?? 0))
  b.onclick = () => cwm.setState((s) => ({ clicks: (s?.clicks ?? 0) + 1 }))
</script>`

export const WIDGET_TEMPLATES: { id: string; label: string; data: () => WidgetData }[] = [
  { id: 'sketch', label: 'Sketchpad', data: () => ({ source: SKETCHPAD, state: { strokes: [] } }) },
  { id: 'counter', label: 'Counter', data: () => ({ source: COUNTER, state: { count: 0 } }) },
  { id: 'timer', label: 'Timer', data: () => ({ source: TIMER, state: null }) },
  {
    id: 'markdown',
    label: 'Markdown',
    data: () => ({
      source: MARKDOWN,
      state: { text: '# Markdown widget\n\nThis widget loads **marked** from a CDN. Click *Edit* to change the text.' },
    }),
  },
  { id: 'blank', label: 'Blank widget', data: () => ({ source: BLANK, state: null }) },
]
