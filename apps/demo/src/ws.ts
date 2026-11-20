/** The demo's one workspace: every built-in view and content kind, kept in localStorage. */
import { BUILTIN_KINDS, BUILTIN_PAGES, BUILTIN_VIEWS, createWorkspace } from '@cwm/react'
import type { Doc } from '@cwm/core'
import { seedDoc } from './seed'
import { startTour } from './tour/tour'

export const ws = createWorkspace({
  doc: seedDoc,
  persist: 'cwm-doc-v1',
  views: BUILTIN_VIEWS,
  kinds: BUILTIN_KINDS,
  pages: BUILTIN_PAGES,
})

// local-only layouts (git-ignored *.local.ts files), absent from the published build
const LOCAL_LAYOUTS = import.meta.glob<{ title: string; seed: () => Doc }>('./*.local.ts', { eager: true })

ws.commands.register({
  id: 'demo',
  items: () => [
    { id: 'reset', title: 'Reset to demo layout', group: 'Data', run: () => ws.get().replaceDoc(seedDoc()) },
    ...Object.entries(LOCAL_LAYOUTS).map(([file, m]) => ({
      id: 'layout-' + file,
      title: `Load layout: ${m.title}`,
      group: 'Data',
      run: () => ws.get().replaceDoc(m.seed()),
    })),
    {
      id: 'tour',
      title: 'Take the tour',
      group: 'Help',
      keywords: ['help', 'tutorial', 'intro', 'onboarding', 'guide'],
      // after the palette closes
      run: () => setTimeout(startTour, 50),
    },
  ],
})
