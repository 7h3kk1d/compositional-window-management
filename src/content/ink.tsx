import { useEffect, useRef, useState } from 'react'
import type { ContentProps } from './registry'

/**
 * Ink: marks drawn straight onto whatever is behind them. No frame, no
 * background, and clicks pass through until you pick "✎ Draw", so on a
 * canvas it reads as pen on the board rather than as a window. Strokes and
 * labels are stored in 0..1 coordinates of the window, so resizing the
 * window stretches the drawing with it, and mirrored copies agree.
 */
export interface InkStroke {
  c: string
  w: number
  p: [number, number][]
}
export interface InkLabel {
  x: number
  y: number
  text: string
  c: string
  size?: number
  rot?: number
}
export interface InkData {
  strokes: InkStroke[]
  labels: InkLabel[]
}

const COLORS = ['currentColor', '#e5484d', '#3d63dd', '#30a46c', '#f76b15']

/** Smooth a polyline through midpoints (quadratic segments): looks hand-drawn, not jagged. */
function pathOf(pts: [number, number][], w: number, h: number) {
  if (!pts.length) return ''
  const P = pts.map(([x, y]) => [x * w, y * h])
  if (P.length < 3) return `M${P[0][0]},${P[0][1]} ` + P.slice(1).map(([x, y]) => `L${x},${y}`).join(' ')
  let d = `M${P[0][0]},${P[0][1]}`
  for (let i = 1; i < P.length - 1; i++) {
    const mx = (P[i][0] + P[i + 1][0]) / 2
    const my = (P[i][1] + P[i + 1][1]) / 2
    d += ` Q${P[i][0]},${P[i][1]} ${mx},${my}`
  }
  const last = P[P.length - 1]
  return d + ` L${last[0]},${last[1]}`
}

export function Ink({ data, update }: ContentProps<InkData>) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [drawing, setDrawing] = useState(false)
  const [tool, setTool] = useState<'pen' | 'text'>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [live, setLive] = useState<InkStroke | null>(null)
  const [typing, setTyping] = useState<{ x: number; y: number; text: string } | null>(null)
  const strokes = data.strokes ?? []
  const labels = data.labels ?? []

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const at = (e: React.PointerEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect()
    return [+((e.clientX - r.left) / r.width).toFixed(4), +((e.clientY - r.top) / r.height).toFixed(4)]
  }

  const onDown = (e: React.PointerEvent) => {
    if (!drawing) return
    e.stopPropagation()
    const p = at(e)
    if (tool === 'text') {
      setTyping({ x: p[0], y: p[1], text: '' })
      return
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    setLive({ c: color, w: 2.5, p: [p] })
  }
  const onMove = (e: React.PointerEvent) => {
    if (live) setLive({ ...live, p: [...live.p, at(e)] })
  }
  const onUp = () => {
    if (!live) return
    if (live.p.length > 1) update({ strokes: [...strokes, live], labels })
    setLive(null)
  }
  const commitText = () => {
    if (typing?.text.trim()) update({ strokes, labels: [...labels, { x: typing.x, y: typing.y, text: typing.text.trim(), c: color }] })
    setTyping(null)
  }

  const { w, h } = size
  return (
    <div className={`ink-root ${drawing ? 'drawing' : ''}`} ref={ref}>
      <svg
        className="ink-svg"
        width={w}
        height={h}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        style={{ cursor: drawing ? (tool === 'text' ? 'text' : 'crosshair') : undefined }}
      >
        {[...strokes, ...(live ? [live] : [])].map((s, i) => (
          <path
            key={i}
            d={pathOf(s.p, w, h)}
            fill="none"
            stroke={s.c}
            strokeWidth={s.w}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {labels.map((l, i) => (
          <text
            key={i}
            x={l.x * w}
            y={l.y * h}
            fill={l.c}
            fontSize={l.size ?? 22}
            className="ink-label"
            transform={l.rot ? `rotate(${l.rot} ${l.x * w} ${l.y * h})` : undefined}
          >
            {l.text}
          </text>
        ))}
      </svg>
      {typing && (
        <input
          className="ink-typing"
          autoFocus
          style={{ left: typing.x * w, top: typing.y * h - 18, color }}
          value={typing.text}
          placeholder="write…"
          onChange={(e) => setTyping({ ...typing, text: e.target.value })}
          onBlur={commitText}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') commitText()
            if (e.key === 'Escape') setTyping(null)
          }}
        />
      )}
      <div className="ink-toolbar" onPointerDown={(e) => e.stopPropagation()}>
        <button
          className={`ghost small ${drawing ? 'on' : ''}`}
          title={drawing ? 'Stop drawing (clicks pass through again)' : 'Draw on this layer'}
          onClick={() => setDrawing(!drawing)}
        >
          {drawing ? '✓ Done' : '✎ Draw'}
        </button>
        {drawing && (
          <>
            <button className={`ghost small ${tool === 'text' ? 'on' : ''}`} title="Write text" onClick={() => setTool(tool === 'text' ? 'pen' : 'text')}>
              T
            </button>
            {COLORS.map((c) => (
              <button
                key={c}
                className={`ink-swatch ${c === color ? 'on' : ''}`}
                style={{ background: c === 'currentColor' ? 'var(--text)' : c }}
                onClick={() => setColor(c)}
                aria-label={'ink ' + c}
              />
            ))}
            <button className="ghost small" title="Erase everything on this layer" onClick={() => update({ strokes: [], labels: [] })}>
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------ hand-drawn helpers

/** A little deterministic wobble, so generated marks look drawn by hand. */
function rng(seed: number) {
  let s = seed % 2147483647 || 1
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

/** A wobbly line from a to b. */
export function inkLine(a: [number, number], b: [number, number], c = 'currentColor', seed = 1): InkStroke {
  const r = rng(seed)
  const n = 8
  const p: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const j = i === 0 || i === n ? 0 : (r() - 0.5) * 0.006
    p.push([+(a[0] + (b[0] - a[0]) * t + j).toFixed(4), +(a[1] + (b[1] - a[1]) * t + j).toFixed(4)])
  }
  return { c, w: 2.5, p }
}

/** An arrow from a to b, with a two-stroke head. */
export function inkArrow(a: [number, number], b: [number, number], c = 'currentColor', seed = 1, aspect = 1): InkStroke[] {
  const ang = Math.atan2((b[1] - a[1]) / aspect, b[0] - a[0])
  const L = 0.025
  const head = (d: number): [number, number] => [b[0] - L * Math.cos(ang + d), b[1] - L * aspect * Math.sin(ang + d)]
  return [inkLine(a, b, c, seed), inkLine(head(0.5), b, c, seed + 1), inkLine(head(-0.5), b, c, seed + 2)]
}

/** A loose hand-drawn box (corners overshoot a little). */
export function inkBox(x: number, y: number, w: number, h: number, c = 'currentColor', seed = 1): InkStroke[] {
  const o = 0.006
  return [
    inkLine([x - o, y], [x + w + o, y + o / 2], c, seed),
    inkLine([x + w, y - o], [x + w - o / 2, y + h + o], c, seed + 1),
    inkLine([x + w + o, y + h], [x - o, y + h - o / 2], c, seed + 2),
    inkLine([x, y + h + o], [x + o / 2, y - o], c, seed + 3),
  ]
}

/** A loose ellipse around a centre, not quite closing. */
export function inkCircle(cx: number, cy: number, rx: number, ry: number, c = 'currentColor', seed = 1): InkStroke {
  const r = rng(seed)
  const p: [number, number][] = []
  const start = r() * Math.PI
  for (let i = 0; i <= 26; i++) {
    const t = start + (i / 24) * Math.PI * 2
    const k = 1 + (r() - 0.5) * 0.08
    p.push([+(cx + rx * k * Math.cos(t)).toFixed(4), +(cy + ry * k * Math.sin(t)).toFixed(4)])
  }
  return { c, w: 2.5, p }
}

export const INK_PRESETS: { id: string; label: string; data: () => InkData }[] = [
  {
    id: 'arrows',
    label: 'Ink: arrow and note',
    data: () => ({
      strokes: [...inkArrow([0.1, 0.75], [0.8, 0.3], 'currentColor', 7), inkCircle(0.85, 0.25, 0.1, 0.15, '#e5484d', 3)],
      labels: [{ x: 0.12, y: 0.9, text: 'look at this!', c: 'currentColor', rot: -6 }],
    }),
  },
]
