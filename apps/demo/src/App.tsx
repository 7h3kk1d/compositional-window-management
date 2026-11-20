import { collectOrphans } from '@cwm/core'
import { useWsStore, Workspace, WorkspaceProvider } from '@cwm/react'
import { useEffect } from 'react'
import { maybeStartTour, startTour } from './tour/tour'
import { ws } from './ws'

function TopBar() {
  const canUndo = useWsStore((s) => s.past.length > 0)
  const canRedo = useWsStore((s) => s.future.length > 0)
  const orphans = useWsStore((s) => collectOrphans(s.doc).length)
  return (
    <header className="topbar">
      <span className="brand">Compositional WM</span>
      <span className="muted">one tree of content · many views</span>
      <span className="spacer" />
      <button className="ghost" disabled={!canUndo} onClick={() => ws.get().undo()} title="Undo (⌘Z)">
        ↶
      </button>
      <button className="ghost" disabled={!canRedo} onClick={() => ws.get().redo()} title="Redo (⌘⇧Z)">
        ↷
      </button>
      {orphans > 0 && (
        <button className="ghost" onClick={() => ws.get().openPalette('orphans')} title="Closed windows are kept until purged">
          ⌫ {orphans} closed
        </button>
      )}
      <a
        className="ghost round-button info-link"
        href="https://bandukwala.me/on-compositional-window-management/"
        target="_blank"
        rel="noopener"
        title="Read the essay: On Compositional Window Management"
        aria-label="About: read the original essay"
      >
        i
      </a>
      <button className="ghost round-button tour-button" onClick={startTour} title="Take the tour">
        ?
      </button>
      <button className="palette-button" onClick={() => ws.get().openPalette()}>
        Commands <kbd>⌘K</kbd>
      </button>
    </header>
  )
}

export default function App() {
  useEffect(() => {
    maybeStartTour()
  }, [])
  return (
    <WorkspaceProvider value={ws}>
      <Workspace ws={ws} keyboard="window" className="app">
        <TopBar />
      </Workspace>
    </WorkspaceProvider>
  )
}
