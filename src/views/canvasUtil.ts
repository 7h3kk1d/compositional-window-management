import type { Container } from '../model/types'
import { canvasRects } from '../model/viewMeta'

export const DEFAULT_VS = { panX: 0, panY: 0, zoom: 1 }

export function canvasViewState(c: Container) {
  return c.viewState.canvas ?? DEFAULT_VS
}

/** Pan/zoom so that every window is visible. */
export function fitCanvas(c: Container, width: number, height: number) {
  const rects = canvasRects(c, 'canvas')
  if (!rects.length) return DEFAULT_VS
  const minX = Math.min(...rects.map((r) => r.x))
  const minY = Math.min(...rects.map((r) => r.y))
  const maxX = Math.max(...rects.map((r) => r.x + r.w))
  const maxY = Math.max(...rects.map((r) => r.y + r.h))
  const zoom = Math.min(2, Math.max(0.1, Math.min((width - 40) / (maxX - minX), (height - 40) / (maxY - minY))))
  return { zoom, panX: 20 - minX * zoom, panY: 20 - minY * zoom }
}

/** Last measured size of each rendered canvas (for placing new windows at the viewport center). */
export const canvasSizes = new Map<string, { w: number; h: number }>()
