import { Command } from 'cmdk'
import { useEffect, useMemo, useState } from 'react'
import { useWs, useWsStore } from '../workspace'

import { buildCtx, rootItems, type Item } from './commands'

/** Separates the unique item id from its title inside cmdk's `value`. */
const SEP = '␟'

/**
 * Ranking: title matches beat keyword matches, which beat loose fuzzy
 * matches. cmdk's default fuzzy scorer also searched the long description
 * keywords, so "wrap" matched w…r…a…p in "Main area with collapsible…" and
 * Enter ran "View as Dock" instead of "Wrap in container…".
 */
export function rank(value: string, search: string, keywords?: string[]): number {
  const q = search.trim().toLowerCase()
  if (!q) return 1
  const title = (value.split(SEP)[1] ?? value).toLowerCase()
  const words = q.split(/\s+/)
  if (words.every((w) => title.includes(w))) {
    if (title.startsWith(q)) return 1
    const tokens = title.split(/[^a-z0-9.]+/)
    if (words.every((w) => tokens.some((t) => t.startsWith(w)))) return 0.8
    return 0.6
  }
  const kw = (keywords ?? []).join(' ').toLowerCase()
  if (words.every((w) => title.includes(w) || kw.includes(w))) return 0.4
  // last resort: letters of the query in order, within the title only
  let i = 0
  for (const ch of title) if (ch === q[i]) i++
  return i === q.length ? 0.1 : 0
}

export function Palette() {
  const ws = useWs()
  const open = useWsStore((s) => s.paletteOpen)
  const initialPage = useWsStore((s) => s.palettePage)
  const doc = useWsStore((s) => s.doc)
  const focus = useWsStore((s) => s.focus)
  const close = useWsStore((s) => s.closePalette)
  const [pages, setPages] = useState<string[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (open) {
      setPages(initialPage ? [initialPage] : [])
      setSearch('')
    }
  }, [open, initialPage])

  // In a shadow root the dialog's focus trap lands on its container, not on
  // the input (autoFocus is judged against document.activeElement): focus it.
  useEffect(() => {
    if (!open) return
    const t = requestAnimationFrame(() => ws.rootEl?.querySelector<HTMLInputElement>('[cmdk-input]')?.focus())
    return () => cancelAnimationFrame(t)
  }, [open, ws, pages.length])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => (open ? buildCtx(ws) : null), [open, doc, focus])
  if (!ctx) return null

  const page = pages[pages.length - 1]
  const items: Item[] = page ? (ws.pages.get(page)?.items(ctx) ?? []) : rootItems(ctx)
  const groups = new Map<string, Item[]>()
  for (const it of items) {
    const g = it.group ?? ''
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(it)
  }

  const choose = (it: Item) => {
    if (it.page) {
      setPages([...pages, it.page])
      setSearch('')
      return
    }
    close()
    it.run?.(ctx)
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      label="Command palette"
      filter={rank}
      className="palette"
      overlayClassName="palette-overlay"
      // inside the workspace's root, so its styles apply even in a shadow root
      container={ws.rootEl ?? undefined}
      onKeyDown={(e) => {
        if (e.key === 'Backspace' && !search && pages.length) {
          e.preventDefault()
          setPages(pages.slice(0, -1))
        }
      }}
    >
      <div className="palette-target">
        <span className="muted">acting on</span> {ctx.label}
        {page && (
          <>
            {' '}
            <span className="muted">›</span> <span className="crumb">{ws.pages.get(page)?.title}</span>
          </>
        )}
      </div>
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder={page ? `${ws.pages.get(page)?.title}…` : 'Type a command… (views, add, move, mirror, go to)'}
        autoFocus
      />
      <Command.List>
        <Command.Empty>No matches.</Command.Empty>
        {[...groups].map(([g, its]) => (
          <Command.Group key={g} heading={g || undefined}>
            {its.map((it) => (
              <Command.Item
                key={it.id}
                value={it.id + SEP + it.title}
                keywords={it.keywords}
                onSelect={() => choose(it)}
              >
                <span className="item-title">{it.title}</span>
                {it.page && <span className="muted">›</span>}
                <span className="spacer" />
                {it.hint && <span className="item-hint">{it.hint}</span>}
                {it.shortcut && <kbd>{it.shortcut}</kbd>}
              </Command.Item>
            ))}
          </Command.Group>
        ))}
      </Command.List>
      <div className="palette-footer">
        <span>↵ run</span>
        <span>⌫ back</span>
        <span>esc close</span>
      </div>
    </Command.Dialog>
  )
}
