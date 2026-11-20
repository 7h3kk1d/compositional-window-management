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
npm run build:element   # packages/element/dist: <cwm-workspace> as one file
```

The demo also serves two pages for the library: `/element.html`, an app with no framework on `<cwm-workspace>`,
and `/two.html`, two independent workspaces on one page.

## As a library

| package | |
|---|---|
| `@cwm/core` | The document model, ops and a framework-free store (one per workspace, optional persistence, its own undo or the host's). |
| `@cwm/react` | The renderer: frames, the 15 views, drag and drop, keyboard, palette. `createWorkspace()` + `<Workspace ws={…}/>`. |
| `@cwm/element` | `<cwm-workspace>`, for any framework or none. React stays inside its shadow root. |
| `apps/demo` | This site, built on `@cwm/react`. |

**The window manager owns the layout. The app owns everything in it.** With `<cwm-workspace>`, the app renders
window contents in its own tree, as light-DOM children:

```html
<cwm-workspace>
  <div slot="n_7f3a">…</div>   <!-- one per placement, from the cwm-placements event -->
</cwm-workspace>
```

Moving or hiding a window only reassigns its slot, so app DOM never moves: iframes don't reload and editors keep their state.

- **Payloads are addresses.** A window holds a small app-defined value (`{tree, path}`); a container can hold one
  too (`Container.data`). The library never reads them. Closing a window never deletes app state, and a payload
  whose thing is gone is the app's to show as missing.
- **The app asks for layout changes:** `open(kind, data, {where})` focuses a window already showing the payload,
  or opens one next to the last focused window of that kind. There are also `setData`, `closePlacement` and `focusPlacement`.
- **Mirroring is semantic:** a kind is `mirrorable` only if two live views of it make sense.
- **Apps define container types** with `registerView`:
  - `layout(container, {w, h})` is pure geometry: a box per child, and per named **region**, which the app fills
    through slots like windows.
  - `mount(host, ctx)` draws its own chrome around `ctx.childElement(id)`.
  - Placements carry their **ancestors** (each container's view, payload and the window's index in it), so content can
    know it is, say, the left side of a compare.
- **Undo:** the workspace keeps a layout undo stack by default.
  - With `history: 'host'` it records nothing and reports `cwm-commit` events, so an app with its own undo keeps one stack in true order.
  - The app puts a layout back with `restore(doc)`.

arbor's p27 prototype (OCaml + Bonsai) is the first app built on `<cwm-workspace>`.

A guided tour starts on the first visit (`apps/demo/src/tour/tour.ts`, built on driver.js). Replay it with the **?** button
or ⌘K → "Take the tour". Steps that need demo content your layout lacks are skipped.

## Ideas in the code

- **Layout lives on the edge** (`Slot.meta`, `packages/core/src/types.ts`). The same node can be mirrored into several
  parents, each with its own position and size.
- **Views are per placement too** (`Slot.view`). A container mirrored into two places can be a grid in one and an
  outline in the other, both live on the same data (the demo mirrors Projects onto the Play canvas as an outline).
  The root has no slot, so it uses `Container.defaultView`, which is also the starting view for new placements.
  View *state* (active tab, pan/zoom, grid columns) is still shared per container.
- **Lens complement.** Each view's metadata is kept side by side, so switching canvas → tabs → canvas restores the original layout exactly.
  Actions only write the active view's key. A child created in tabs has no canvas position, so the canvas *derives*
  one, shown dashed with a "derived" badge (`packages/core/src/viewMeta.ts`), until you move it or run "Materialize".
- **Each view stores a different amount**, which is the point of having them side by side:
  - *Spiral* (bspwm-style auto-tiling) stores nothing: its layout is a pure function of the order.
  - *Master + stack* (dwm/xmonad) stores only a ratio and a count on the container; "make main" reorders the shared
    order, so it changes every other linear view too.
  - *Scrolling* (PaperWM/niri) stores only a width fraction per column. Each child is one column, in the shared order;
    several windows in a column are just a nested titleless vertical split (⇤ or ⌥[ stacks, ⌥] unstacks), so they
    resize, or turn into tabs, like any other container. New windows open beside the focused column, and “◎ center”
    keeps the focused column in the middle.
  - *Kanban* stores a lane per card, and the lane list on the container. Cards made in other views sit in the first
    lane, marked derived. *Timeline* stores inclusive start/end dates; undated windows are laid end to end after the
    dated ones. (The demo's "Write the post" is mirrored into both, with a lane in one and dates in the other.)
  - *Table* shows the lens complement itself: one column per view's metadata, stored values plain and derived ones
    faded with "~". Click a cell to edit it as JSON; clear it to forget that view's layout for that child.
- **Pure ops** (`packages/core/src/ops.ts`) are used by the palette, keyboard and buttons through one command registry
  (`packages/react/src/commands/commands.ts`).
- **Pluggable content** (`packages/react/src/content/registry.tsx`): note, embed, HTML widget, pane, clock, todo, image.
  - **Embeds** (`packages/react/src/content/embeds.ts`): paste an ordinary share link and known sites become their embeddable player
    (YouTube, Vimeo, Spotify, SoundCloud, CodePen, Observable, Figma, Google Maps, OpenStreetMap, Desmos, StackBlitz,
    CodeSandbox, Loom, gists, Excalidraw, tldraw, Wikipedia). Pure URL rewriting, no API keys. The pasted link is what's
    stored, so better recipes upgrade old windows. Sites that refuse framing (GitHub, X, …) show an "open" link instead.
  - **HTML widgets** (`packages/react/src/content/htmlWidget.tsx`): HTML/JS in a sandboxed iframe with a tiny bridge
    (`cwm.state`, `cwm.setState`, `cwm.onState`, `cwm.onTheme`). The code and the state live in the document, so
    widget state persists, undoes, and stays in sync across mirrors (the demo Sketchpad is mirrored into Play and
    Social). Templates: Sketchpad, Counter, Timer, Markdown (loads a library from a CDN), Blank. Hover a widget and
    click `</>` to edit its code; ⌘↵ runs it.

## Keys

The same keys work in every view; each view decides what “move right” or “grow” means in its own terms
(`packages/core/src/moves.ts`). Press ⌥/ in the app for this list.

| | |
|---|---|
| ⌘K | Command palette (acts on the focused window) |
| ⌘P | Go to any window |
| ⌘Z / ⌘⇧Z | Undo / redo |
| ⌥/ | This list |
| ⌥Esc | Leave a text field (then the keys below work) |
| ⌥← ⌥→ ⌥↑ ⌥↓ | Focus the window in that direction on screen |
| ⌥Esc / ⌥↵ | Focus the parent container / go into a container |
| ⌥, / ⌥. | Previous / next tab (nearest tabs container) |
| ⌥C | Center the focused window (scrolling strip, canvas, document) |
| ⌥⇧← ⌥⇧→ ⌥⇧↑ ⌥⇧↓ | Move the window, in its container’s terms; past the end of a tiled container it moves out |
| ⌥= / ⌥- | Grow / shrink (split share, column width, grid span, canvas size, dates…) |
| ⌥[ / ⌥] | Stack into the neighbour on the left / right, or out of a stack (nests a split) |
| ⌥T | Toggle the window’s container between tabs and its previous view |
| ⌥N | New note, right after the focused window |
| ⌥W | Close |
| ⌥M / ⌥⇧M | Move to… / mirror into… |
| ⌥1 … ⌥9 | View the focused container as tabs, split, canvas, floating, grid, dock, document, outline, JSON |

## Dragging

Drag a window by its ⠿ grip, or drag a tab itself. A blue preview shows what the drop will do. Hold ⌥ to mirror instead of move.

- **Into a container:** drop in its middle. Each view places it in its own terms (canvas: x/y, split/grid/tabs: index, dock: side).
- **Into another tab:** drop onto the middle of a tab that holds a container, or hover any tab for about ½s to switch to it, then drop inside.
- **Reorder tabs:** drop on the left or right side of a tab.
- **Beside something (split):** drop near the edge of a window or container. It is replaced by a split holding both.
  Inside canvas and floating views there is no edge-splitting; drops just place the window.
- **Out of everything:** drop on the striped bands around the workspace edge to split the whole desktop.
