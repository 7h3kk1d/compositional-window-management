import { describe, expect, it } from 'vitest'
import { normalizeUrl, resolveEmbed } from './embeds'

describe('resolveEmbed', () => {
  const src = (u: string) => resolveEmbed(u).src
  it('rewrites YouTube links, keeping the start time', () => {
    expect(src('https://www.youtube.com/watch?v=abc123&t=1m30s')).toBe('https://www.youtube-nocookie.com/embed/abc123?start=90')
    expect(src('youtu.be/abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123')
    expect(src('https://youtube.com/shorts/xyz')).toBe('https://www.youtube-nocookie.com/embed/xyz')
  })
  it('rewrites other players', () => {
    expect(src('https://vimeo.com/76979871')).toBe('https://player.vimeo.com/video/76979871')
    expect(src('https://open.spotify.com/intl-de/album/4LH4')).toBe('https://open.spotify.com/embed/album/4LH4')
    expect(src('https://codepen.io/team/pen/PNaGbb')).toBe('https://codepen.io/team/embed/PNaGbb?default-tab=result')
    expect(src('https://www.desmos.com/calculator/abc')).toBe('https://www.desmos.com/calculator/abc?embed')
    expect(src('https://codesandbox.io/p/sandbox/foo-123')).toBe('https://codesandbox.io/embed/foo-123')
    expect(resolveEmbed('https://www.figma.com/design/KEY/Name').src).toContain('figma.com/embed?embed_host=cwm&url=https%3A')
  })
  it('turns map links into embeddable maps', () => {
    expect(src('https://www.google.com/maps/place/Eiffel+Tower')).toBe('https://www.google.com/maps?q=Eiffel%20Tower&output=embed')
    expect(src('https://www.openstreetmap.org/#map=14/42.28/-83.74')).toMatch(/export\/embed\.html\?bbox=.*marker=42.28%2C-83.74/)
  })
  it('gives gists a script document', () => {
    expect(resolveEmbed('https://gist.github.com/someone/abc').srcdoc).toContain('gist.github.com/someone/abc.js')
  })
  it('flags sites that refuse framing and passes everything else through', () => {
    expect(resolveEmbed('https://github.com/foo/bar').blocked).toBe(true)
    expect(resolveEmbed('example.com/page')).toEqual({ provider: null, src: 'https://example.com/page' })
  })
  it('accepts pasted embed code', () => {
    expect(normalizeUrl('<iframe width="560" src="https://example.com/e?a=1&amp;b=2"></iframe>')).toBe('https://example.com/e?a=1&b=2')
  })
})
