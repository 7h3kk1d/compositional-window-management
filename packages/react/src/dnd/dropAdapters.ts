import type { SlotMeta } from '@cwm/core'

/**
 * Each rendered container registers how a drop at a screen point maps into
 * *its own* semantics: canvas → x/y, tabs/split/grid → index, dock → side.
 */
export type DropPlacement = { index?: number; meta?: SlotMeta }
export type DropAdapter = (clientX: number, clientY: number) => DropPlacement


/** Index for linear layouts: compare the pointer to child midpoints. */
export function indexFromPoint(
  body: HTMLElement | null,
  selector: string,
  x: number,
  y: number,
  axis: 'x' | 'y' | 'xy',
): number | undefined {
  if (!body) return undefined
  const items = Array.from(body.querySelectorAll<HTMLElement>(selector))
  if (!items.length) return 0
  if (axis === 'xy') {
    let best = items.length
    let bestD = Infinity
    items.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const d = Math.hypot(x - cx, y - cy)
      if (d < bestD) {
        bestD = d
        best = x < cx ? i : i + 1
      }
    })
    return best
  }
  for (let i = 0; i < items.length; i++) {
    const r = items[i].getBoundingClientRect()
    const mid = axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2
    if ((axis === 'x' ? x : y) < mid) return i
  }
  return items.length
}
