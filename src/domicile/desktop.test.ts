import { expect, it } from 'vitest'
import { addChild, makeLeaf, reachable } from '../model/ops'
import { seedDoc } from '../model/seed'
import { useStore } from '../model/store'
import { connect } from './desktop'

const titles = () => {
  const d = useStore.getState().doc
  return [...reachable(d)].map((id) => d.nodes[id].title)
}

// A pane goes only once Domicile has delivered its list (a reloaded shell first
// sees an empty one); it goes without taking siblings, and a window with no
// pane gets one.
it('window sync keeps one pane per open window', () => {
  const doc = seedDoc()
  addChild(doc, doc.root, makeLeaf('gone', 'app', { appId: 'app-1', pid: 1 }))
  useStore.setState({ doc, focus: [] })
  const others = titles().filter((t) => t !== 'gone')
  let list: { appId: string; title: string; pid: number }[] = []
  let changed = () => {}
  const domicile = {
    windows: {
      get list() {
        return list
      },
      on: (event: string, fn: () => void) => {
        if (event === 'change') changed = fn
        return () => {}
      },
      focus: () => {},
      focusShell: () => {},
      setStates: async () => {},
    },
  } as unknown as Parameters<typeof connect>[0]

  const off = connect(domicile)
  expect(titles()).toContain('gone')

  list = [{ appId: 'app-1', title: 'new', pid: 2 }]
  changed()
  off()
  expect(titles().filter((t) => t !== 'new')).toEqual(others)
  expect(titles()).toContain('new')
})
