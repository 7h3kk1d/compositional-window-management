# Compositional WM

A webapp illustrating [On Compositional Window Management](https://bandukwala.me/on-compositional-window-management/).
Try it at <https://bandukwala.me/compositional-window-management/>.
The content is one DAG of nodes. Every container is a *view* of its children, and any container can switch views in place:
tabs, split, canvas, floating, grid, dock, document, outline, JSON, scrolling, master + stack, spiral, table, kanban,
or timeline.

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # model tests (lens round-trips, mirroring, cycles)
```

## Ideas in the code

- **Layout lives on the edge** (`Slot.meta`, `src/model/types.ts`). The same node can be mirrored into several
  parents, each with its own position and size.
- **Views are per placement too** (`Slot.view`). A container mirrored into two places can be a grid in one and an
  outline in the other, both live on the same data (the demo mirrors Projects onto the Play canvas as an outline).
  The root has no slot, so it uses `Container.defaultView`, which is also the starting view for new placements.
  View *state* (active tab, pan/zoom, grid columns) is still shared per container.
- **Lens complement.** Each view's metadata is kept side by side, so switching canvas → tabs → canvas restores the original layout exactly.
  Actions only write the active view's key. A child created in tabs has no canvas position, so the canvas *derives*
  one, shown dashed with a "derived" badge (`src/model/viewMeta.ts`), until you move it or run "Materialize".
- **Each view stores a different amount**, which is the point of having them side by side:
  - *Spiral* (bspwm-style auto-tiling) stores nothing: its layout is a pure function of the order.
  - *Master + stack* (dwm/xmonad) stores only a ratio and a count on the container; "make main" reorders the shared
    order, so it changes every other linear view too.
  - *Scrolling* (PaperWM/niri) stores a column and a width fraction per window. Windows sharing a column stack; columns
    can be fractional so a drop can land between two without renumbering.
  - *Kanban* stores a lane per card, and the lane list on the container. Cards made in other views sit in the first
    lane, marked derived. *Timeline* stores inclusive start/end dates; undated windows are laid end to end after the
    dated ones. (The demo's "Write the post" is mirrored into both, with a lane in one and dates in the other.)
  - *Table* shows the lens complement itself: one column per view's metadata, stored values plain and derived ones
    faded with "~". Click a cell to edit it as JSON; clear it to forget that view's layout for that child.
- **Pure ops** (`src/model/ops.ts`) are used by the palette, keyboard and buttons through one command registry
  (`src/commands/commands.ts`).
- **Pluggable content** (`src/content/registry.tsx`): note, embed, HTML widget, pane, clock, todo, image.
  - **Embeds** (`src/content/embeds.ts`): paste an ordinary share link and known sites become their embeddable player
    (YouTube, Vimeo, Spotify, SoundCloud, CodePen, Observable, Figma, Google Maps, OpenStreetMap, Desmos, StackBlitz,
    CodeSandbox, Loom, gists, Excalidraw, tldraw, Wikipedia). Pure URL rewriting, no API keys. The pasted link is what's
    stored, so better recipes upgrade old windows. Sites that refuse framing (GitHub, X, …) show an "open" link instead.
  - **HTML widgets** (`src/content/htmlWidget.tsx`): HTML/JS in a sandboxed iframe with a tiny bridge
    (`cwm.state`, `cwm.setState`, `cwm.onState`, `cwm.onTheme`). The code and the state live in the document, so
    widget state persists, undoes, and stays in sync across mirrors (the demo Sketchpad is mirrored into Play and
    Social). Templates: Sketchpad, Counter, Timer, Markdown (loads a library from a CDN), Blank. Hover a widget and
    click `</>` to edit its code; ⌘↵ runs it.

## Keys

| | |
|---|---|
| ⌘K | command palette (acts on the focused window) |
| ⌘P | go to any node |
| ⌥1–9 | view focused container as tabs/split/canvas/floating/grid/dock/document/outline/json (the rest via ⌘K → "View as") |
| ⌥↑ ⌥↓ ⌥← ⌥→ | focus parent / first child / siblings |
| ⌥⇧← ⌥⇧→ | reorder |
| ⌥N / ⌥W | add note / close |
| ⌥M / ⌥⇧M | move to… / mirror into… |
| ⌘Z / ⌘⇧Z | undo / redo |

## Dragging

Drag a window by its ⠿ grip, or drag a tab itself. A blue preview shows what the drop will do. Hold ⌥ to mirror instead of move.

- **Into a container:** drop in its middle. Each view places it in its own terms (canvas: x/y, split/grid/tabs: index, dock: side).
- **Into another tab:** drop onto the middle of a tab that holds a container, or hover any tab for about ½s to switch to it, then drop inside.
- **Reorder tabs:** drop on the left or right side of a tab.
- **Beside something (split):** drop near the edge of a window or container. It is replaced by a split holding both.
  Inside canvas and floating views there is no edge-splitting; drops just place the window.
- **Out of everything:** drop on the striped bands around the workspace edge to split the whole desktop.
