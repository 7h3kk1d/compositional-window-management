import type { ViewType } from '../model/types'

export const VIEW_INFO: Record<ViewType, { label: string; icon: string; blurb: string }> = {
  tabs: { label: 'Tabs', icon: '▭', blurb: 'One child visible at a time, chosen by named tabs' },
  split: { label: 'Split', icon: '◫', blurb: 'Tiling: children share the space, resizable' },
  canvas: { label: 'Canvas', icon: '✣', blurb: 'Infinite pan/zoom 2D space' },
  floating: { label: 'Floating', icon: '❐', blurb: 'Fixed-size canvas: the classic stacking WM' },
  grid: { label: 'Grid', icon: '▦', blurb: 'Gallery of rows and columns' },
  dock: { label: 'Dock', icon: '◧', blurb: 'Main area with collapsible side panels' },
  document: { label: 'Document', icon: '☰', blurb: 'Linear document with inline blocks' },
  outline: { label: 'Outline', icon: '⋮', blurb: 'The structure as a tree' },
  json: { label: 'JSON', icon: '{}', blurb: 'The raw data, including every view’s stored layout' },
}
