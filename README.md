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

A guided tour starts on the first visit (`src/tour/tour.ts`, built on driver.js). Replay it with the **?** button
or ⌘K → "Take the tour". Steps that need demo content your layout lacks are skipped.

## As a Wayland desktop (Domicile)

[Domicile](https://www.domicile-desktop.com/) is a Wayland compositor that is a patched Chromium: each native window
is an `<app>` element, sized and placed by its layout box. Loaded as a Domicile shell, this app manages real windows:
each one becomes a leaf (`src/domicile/`), so every view (tabs, canvas, kanban, …) lays it out like any pane.

### Try it

You need Linux with a Wayland session running (the desktop opens as a window inside it), Node.js and npm, and
[Alacritty](https://alacritty.org/) if you want Super+Return to open a terminal.

1. Install Domicile from its [install page](https://www.domicile-desktop.com/docs/install) (packages for Debian,
   Ubuntu, Fedora, openSUSE and Arch). With Nix instead:

   ```sh
   nix build github:cprussin/domicile/release#domicile --accept-flake-config -o domicile
   export PATH="$PWD/domicile/bin:$PATH"
   ```

   The prebuilt Chromium comes from Domicile's binary cache, which Nix only uses for a
   [trusted user](https://nix.dev/manual/nix/latest/command-ref/conf-file#conf-trusted-users); otherwise Nix
   compiles Chromium itself, which takes hours.

2. Build the shell and start it:

   ```sh
   git clone https://github.com/7h3kk1d/compositional-window-management
   cd compositional-window-management
   npm install
   npm run build:shell
   domicile ./dist-shell/shell.js
   ```

3. A window opens with the desktop in it. Press **Super+Return** for a terminal and launch apps from there; each
   new window gets a pane beside the focused one. Close the Domicile window to quit.

After changing the code, run `npm run build:shell` and then, from a terminal *inside* the desktop,
`domicile load-shell ./dist-shell/shell.js`: the new build loads and open windows stay.

### Keys

The ⌥ keys move to **Super**, since a focused app would take ⌥ itself: Super+arrows moves focus and Super+Shift+arrows moves the window, Super+1…9
switches the view, Super+W closes, Super+K / P / Z are the palette, go-to and undo (⌘K / ⌘P / ⌘Z in the browser).
Super+Return opens a terminal, so "go into container" is Super+Shift+Return.

### How it behaves

- Closing an app removes its pane, and Super+W on a window's last pane closes the app.
- Menus and tooltips are drawn in a page-level layer over their window, so a pane edge doesn't clip them.
- A mirrored window renders in every placement, but a client has one size: the most recently laid-out placement sets
  it, and the others show a crop.
- `globalThis.cwm` exposes the store and key handler for driving the desktop over DevTools
  (`DOMICILE_ENGINE_ARGS=--remote-debugging-port=…`).

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
  - *Scrolling* (PaperWM/niri) stores only a width fraction per column. Each child is one column, in the shared order;
    several windows in a column are just a nested titleless vertical split (⇤ or ⌥[ stacks, ⌥] unstacks), so they
    resize, or turn into tabs, like any other container. New windows open beside the focused column, and “◎ center”
    keeps the focused column in the middle.
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

The same keys work in every view; each view decides what “move right” or “grow” means in its own terms
(`src/model/moves.ts`). Press ⌥/ in the app for this list.

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
