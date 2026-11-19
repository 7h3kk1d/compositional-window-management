import { useEffect, useMemo, useRef, useState, type FC } from 'react'
import { EMBED_EXAMPLES, normalizeUrl, resolveEmbed } from './embeds'
import { HtmlWidget, WIDGET_TEMPLATES } from './htmlWidget'

export interface ContentProps<D> {
  data: D
  update: (d: D) => void
}

export interface ContentKind<D = any> {
  id: string
  label: string
  icon: string
  create(): D
  Render: FC<ContentProps<D>>
  /** Rendered as flowing text (no frame) in document view. */
  inline?: boolean
  /** Ready-made starting points, listed separately in "Add child". */
  presets?: { id: string; label: string; data: () => D }[]
}

// ------------------------------------------------------------ note

interface NoteData {
  text: string
  mono?: boolean
}

function Note({ data, update }: ContentProps<NoteData>) {
  return (
    <textarea
      className={`note ${data.mono ? 'mono' : ''}`}
      value={data.text}
      spellCheck={false}
      onChange={(e) => update({ ...data, text: e.target.value })}
      placeholder="Write something…"
    />
  )
}

/** Auto-growing variant used inline in document view. */
export function InlineNote({ data, update }: ContentProps<NoteData>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = el.scrollHeight + 'px'
  }, [data.text])
  return (
    <textarea
      ref={ref}
      className={`note inline ${data.mono ? 'mono' : ''}`}
      value={data.text}
      onChange={(e) => update({ ...data, text: e.target.value })}
      placeholder="Write something…"
      rows={1}
    />
  )
}

// ------------------------------------------------------------ embed / web page

interface IframeData {
  url: string
}

/** Any URL; known sites (YouTube, Spotify, Figma, maps, …) become their embeddable player. */
function Embed({ data, update }: ContentProps<IframeData>) {
  const [draft, setDraft] = useState(data.url)
  useEffect(() => setDraft(data.url), [data.url])
  const embed = useMemo(() => (data.url ? resolveEmbed(data.url) : null), [data.url])
  return (
    <div className="iframe-kind">
      <form
        className="urlbar"
        onSubmit={(e) => {
          e.preventDefault()
          update({ url: normalizeUrl(draft) })
        }}
      >
        {embed?.provider && <span className="embed-provider">{embed.provider}</span>}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== data.url && update({ url: normalizeUrl(draft) })}
          placeholder="Paste a link or embed code…"
        />
        {data.url && (
          <a className="urlbar-open" href={normalizeUrl(data.url)} target="_blank" rel="noreferrer" title="Open in a new tab">
            ↗
          </a>
        )}
      </form>
      {!embed ? (
        <div className="embed-empty">
          <div className="muted">Paste any link. These sites become embedded players:</div>
          <div className="embed-examples">
            {EMBED_EXAMPLES.map((x) => (
              <button key={x.url} onClick={() => update({ url: x.url })}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
      ) : embed.blocked ? (
        <div className="empty">
          This site doesn’t allow embedding.{' '}
          <a href={embed.src} target="_blank" rel="noreferrer">
            Open it in a new tab ↗
          </a>
        </div>
      ) : (
        <iframe
          key={embed.src ?? 'doc'}
          src={embed.src}
          srcDoc={embed.srcdoc}
          title={data.url}
          sandbox={
            embed.srcdoc
              ? 'allow-scripts allow-popups'
              : 'allow-scripts allow-same-origin allow-forms allow-popups allow-presentation allow-popups-to-escape-sandbox'
          }
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------ placeholder

interface PlaceholderData {
  color: string
  label?: string
}

const SWATCHES = ['#7c9cff', '#e66f8f', '#46c2a5', '#f2b84b', '#a78bfa', '#9aa5b1']

function Placeholder({ data, update }: ContentProps<PlaceholderData>) {
  return (
    <div className="placeholder" style={{ background: data.color }}>
      <input
        className="placeholder-label"
        value={data.label ?? ''}
        onChange={(e) => update({ ...data, label: e.target.value })}
        placeholder="label"
      />
      <div className="swatches">
        {SWATCHES.map((c) => (
          <button
            key={c}
            aria-label={`color ${c}`}
            style={{ background: c }}
            onClick={() => update({ ...data, color: c })}
          />
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------ widgets

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="clock">
      <div className="time">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
      <div className="date">{now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</div>
    </div>
  )
}

interface TodoData {
  items: { id: string; text: string; done: boolean }[]
}

function Todo({ data, update }: ContentProps<TodoData>) {
  const [text, setText] = useState('')
  const set = (items: TodoData['items']) => update({ items })
  return (
    <div className="todo">
      <ul>
        {data.items.map((it) => (
          <li key={it.id} className={it.done ? 'done' : ''}>
            <input
              type="checkbox"
              checked={it.done}
              onChange={() => set(data.items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}
            />
            <span>{it.text}</span>
            <button className="ghost" onClick={() => set(data.items.filter((x) => x.id !== it.id))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          set([...data.items, { id: Math.random().toString(36).slice(2), text: text.trim(), done: false }])
          setText('')
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task…" />
      </form>
    </div>
  )
}

interface ImageData {
  url: string
}

function Image({ data, update }: ContentProps<ImageData>) {
  return (
    <div className="image-kind">
      {data.url ? <img src={data.url} alt="" draggable={false} /> : null}
      <input
        className="image-url"
        value={data.url}
        onChange={(e) => update({ url: e.target.value })}
        placeholder="image URL"
      />
    </div>
  )
}

// ------------------------------------------------------------ registry

export const CONTENT_KINDS: ContentKind[] = [
  { id: 'note', label: 'Note', icon: '✎', create: () => ({ text: '' }), Render: Note, inline: true },
  {
    id: 'iframe',
    label: 'Embed / web page',
    icon: '◎',
    create: () => ({ url: '' }),
    Render: Embed,
    presets: EMBED_EXAMPLES.map((x) => ({ id: x.label, label: x.label, data: () => ({ url: x.url }) })),
  },
  {
    id: 'widget',
    label: 'HTML widget',
    icon: '⌬',
    create: WIDGET_TEMPLATES[0].data,
    Render: HtmlWidget,
    presets: WIDGET_TEMPLATES.map((t) => ({ id: t.id, label: t.label, data: t.data })),
  },
  {
    id: 'placeholder',
    label: 'Pane',
    icon: '■',
    create: () => ({ color: SWATCHES[Math.floor(Math.random() * SWATCHES.length)], label: '' }),
    Render: Placeholder,
  },
  { id: 'clock', label: 'Clock', icon: '◷', create: () => ({}), Render: Clock },
  { id: 'todo', label: 'Todo list', icon: '☑', create: () => ({ items: [] }), Render: Todo },
  { id: 'image', label: 'Image', icon: '▣', create: () => ({ url: 'https://picsum.photos/400/300' }), Render: Image },
]

export const contentKind = (id: string): ContentKind | undefined => CONTENT_KINDS.find((k) => k.id === id)

/** Content kinds can be registered at runtime (e.g. adapters for embed standards). */
export function registerContentKind(kind: ContentKind) {
  const i = CONTENT_KINDS.findIndex((k) => k.id === kind.id)
  if (i >= 0) CONTENT_KINDS[i] = kind
  else CONTENT_KINDS.push(kind)
}
