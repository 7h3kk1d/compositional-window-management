/**
 * Smart embeds: turn an ordinary share link into the site's own embeddable
 * player. Pure URL rewriting, no oEmbed service or API key involved. The
 * stored data is always the link the user pasted; the embed URL is derived
 * at render time, so better recipes later upgrade old windows for free.
 */

export interface Embed {
  /** Display name of the recognized site, or null for a plain web page. */
  provider: string | null
  /** URL for the iframe. */
  src?: string
  /** Or a whole document (for script-based embeds such as gists). */
  srcdoc?: string
  /** Sites that refuse to be framed: shown as a link instead. */
  blocked?: boolean
}

/** Accepts a bare URL, a URL without scheme, or a pasted `<iframe src=…>` embed code. */
export function normalizeUrl(input: string): string {
  let s = input.trim()
  const m = s.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i)
  if (m) s = m[1].replace(/&amp;/g, '&')
  if (s && !/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s
  return s
}

const seconds = (t: string | null) => {
  if (!t) return 0
  if (/^\d+$/.test(t)) return +t
  const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/)
  return m ? +(m[1] ?? 0) * 3600 + +(m[2] ?? 0) * 60 + +(m[3] ?? 0) : 0
}

/** Hosts known to forbid framing (X-Frame-Options / frame-ancestors). */
const BLOCKED = ['github.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'reddit.com', 'news.ycombinator.com']

type Recipe = (u: URL, path: string[]) => Embed | null

const RECIPES: [RegExp, Recipe][] = [
  [
    /(^|\.)youtube\.com$|^youtu\.be$|(^|\.)youtube-nocookie\.com$/,
    (u, p) => {
      const list = u.searchParams.get('list')
      let id: string | null = null
      if (u.hostname === 'youtu.be') id = p[0]
      else if (p[0] === 'watch') id = u.searchParams.get('v')
      else if (['shorts', 'embed', 'live', 'v'].includes(p[0])) id = p[1]
      if (!id && list) return { provider: 'YouTube', src: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}` }
      if (!id) return null
      const start = seconds(u.searchParams.get('t') ?? u.searchParams.get('start'))
      return { provider: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}` }
    },
  ],
  [
    /(^|\.)vimeo\.com$/,
    (u, p) => {
      const id = u.hostname === 'player.vimeo.com' ? p[1] : p.find((s) => /^\d+$/.test(s))
      return id ? { provider: 'Vimeo', src: `https://player.vimeo.com/video/${id}` } : null
    },
  ],
  [
    /^open\.spotify\.com$/,
    (_u, p) => {
      const q = p[0]?.startsWith('intl-') ? p.slice(1) : p
      const [type, id] = q[0] === 'embed' ? q.slice(1) : q
      return type && id ? { provider: 'Spotify', src: `https://open.spotify.com/embed/${type}/${id}` } : null
    },
  ],
  [
    /^soundcloud\.com$/,
    (u) => ({
      provider: 'SoundCloud',
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(u.origin + u.pathname)}&visual=true`,
    }),
  ],
  [
    /^codepen\.io$/,
    (_u, p) =>
      p.length >= 3 && ['pen', 'full', 'details', 'embed'].includes(p[1])
        ? { provider: 'CodePen', src: `https://codepen.io/${p[0]}/embed/${p[2]}?default-tab=result` }
        : null,
  ],
  [
    /^observablehq\.com$/,
    (u, p) => {
      if (!p.length) return null
      const rest = p[0] === 'embed' ? p.slice(1) : p
      return { provider: 'Observable', src: `https://observablehq.com/embed/${rest.join('/')}${u.search}` }
    },
  ],
  [
    /(^|\.)openstreetmap\.org$/,
    (u, p) => {
      if (p[0] === 'export') return { provider: 'OpenStreetMap', src: u.href }
      const m = u.hash.match(/map=(\d+)\/(-?[\d.]+)\/(-?[\d.]+)/)
      if (!m) return null
      const [z, lat, lon] = [+m[1], +m[2], +m[3]]
      const dLon = (360 / 2 ** z) * 1.6
      const dLat = dLon * Math.cos((lat * Math.PI) / 180) * 0.7
      const bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((n) => n.toFixed(5)).join('%2C')
      return {
        provider: 'OpenStreetMap',
        src: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}`,
      }
    },
  ],
  [
    /^(www\.|maps\.)?google\.[a-z.]+$/,
    (u, p) => {
      if (p[0] !== 'maps' && u.hostname !== 'maps.google.com') return null
      if (p[1] === 'embed') return { provider: 'Google Maps', src: u.href }
      const place = p[1] === 'place' || p[1] === 'search' ? decodeURIComponent(p[2] ?? '').replace(/\+/g, ' ') : ''
      const at = u.pathname.match(/@(-?[\d.]+),(-?[\d.]+),(\d+(?:\.\d+)?)z/)
      const q = u.searchParams.get('q') ?? (place || (at ? `${at[1]},${at[2]}` : ''))
      if (!q) return null
      const zoom = at ? `&z=${Math.round(+at[3])}` : ''
      return { provider: 'Google Maps', src: `https://www.google.com/maps?q=${encodeURIComponent(q)}${zoom}&output=embed` }
    },
  ],
  [
    /(^|\.)figma\.com$/,
    (u, p) =>
      ['file', 'design', 'proto', 'board', 'slides', 'deck'].includes(p[0])
        ? { provider: 'Figma', src: `https://www.figma.com/embed?embed_host=cwm&url=${encodeURIComponent(u.href)}` }
        : null,
  ],
  [
    /^gist\.github\.com$/,
    (_u, p) => {
      const id = p.length >= 2 ? `${p[0]}/${p[1]}` : null
      if (!id) return null
      return {
        provider: 'Gist',
        // gists only offer a script embed, so give it a small document of its own
        srcdoc: `<!doctype html><base target="_blank"><style>body{margin:0}.gist .blob-wrapper{max-height:none}</style><script src="https://gist.github.com/${id}.js"></script>`,
      }
    },
  ],
  [
    /^stackblitz\.com$/,
    (u) => {
      const v = new URL(u.href)
      v.searchParams.set('embed', '1')
      return { provider: 'StackBlitz', src: v.href }
    },
  ],
  [
    /^codesandbox\.io$/,
    (_u, p) => {
      const id = p[0] === 's' || p[0] === 'embed' ? p[1] : p[0] === 'p' ? p[2] : null
      return id ? { provider: 'CodeSandbox', src: `https://codesandbox.io/embed/${id}` } : null
    },
  ],
  [
    /(^|\.)desmos\.com$/,
    (u) => {
      const v = new URL(u.href)
      if (!v.searchParams.has('embed')) v.search += (v.search ? '&' : '?') + 'embed'
      return { provider: 'Desmos', src: v.href }
    },
  ],
  [/^(www\.)?loom\.com$/, (_u, p) => (p[0] === 'share' && p[1] ? { provider: 'Loom', src: `https://www.loom.com/embed/${p[1]}` } : null)],
  [/(^|\.)excalidraw\.com$/, (u) => ({ provider: 'Excalidraw', src: u.href })],
  [/(^|\.)tldraw\.com$/, (u) => ({ provider: 'tldraw', src: u.href })],
  [/(^|\.)wikipedia\.org$/, (u) => ({ provider: 'Wikipedia', src: u.href })],
]

export function resolveEmbed(raw: string): Embed {
  const href = normalizeUrl(raw)
  let u: URL
  try {
    u = new URL(href)
  } catch {
    return { provider: null, src: href }
  }
  const host = u.hostname.replace(/^www\.(?=.*\.)/, '')
  const path = u.pathname.split('/').filter(Boolean)
  for (const [re, recipe] of RECIPES) {
    if (!re.test(host) && !re.test(u.hostname)) continue
    const e = recipe(u, path)
    if (e) return e
  }
  if (BLOCKED.some((b) => host === b || host.endsWith('.' + b))) return { provider: null, src: u.href, blocked: true }
  return { provider: null, src: u.href }
}

/** Ready-made examples, shown in an empty embed and in "Add child". */
export const EMBED_EXAMPLES: { label: string; url: string }[] = [
  { label: 'YouTube video', url: 'https://www.youtube.com/watch?v=yJDv-zdhzMY' },
  { label: 'Spotify album', url: 'https://open.spotify.com/album/4LH4d3cOWNNsVw41Gqt2kv' },
  { label: 'Vimeo video', url: 'https://vimeo.com/76979871' },
  { label: 'Desmos graph', url: 'https://www.desmos.com/calculator' },
  { label: 'Excalidraw board', url: 'https://excalidraw.com' },
  { label: 'tldraw board', url: 'https://www.tldraw.com' },
  { label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/#map=14/42.2808/-83.7430' },
  { label: 'Google Maps', url: 'https://www.google.com/maps/place/Eiffel+Tower' },
  { label: 'Wikipedia article', url: 'https://en.wikipedia.org/wiki/Douglas_Engelbart' },
  { label: 'StackBlitz project', url: 'https://stackblitz.com/edit/vitejs-vite' },
]
