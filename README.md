# Compositional WM

A webapp illustrating [On Compositional Window Management](https://bandukwala.me/on-compositional-window-management/).
The content is one DAG of nodes. Every container is a *view* of its children, and any container can switch views in place:
tabs, split, canvas, floating, grid, dock, document, outline, or JSON.

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # model tests (lens round-trips, mirroring, cycles)
```

## Ideas in the code

- **Layout lives on the edge** (`Slot.meta`, `src/model/types.ts`). The same node can be mirrored into several
  parents, each with its own position and size.
- **Lens complement.** Each view's metadata is kept side by side, so switching canvas → tabs → canvas restores the original layout exactly.
  Actions only write the active view's key. A child created in tabs has no canvas position, so the canvas *derives*
  one, shown dashed with a "derived" badge (`src/model/viewMeta.ts`), until you move it or run "Materialize".
- **Pure ops** (`src/model/ops.ts`) are used by the palette, keyboard and buttons through one command registry
  (`src/commands/commands.ts`).
- **Pluggable content** (`src/content/registry.tsx`): note, web page, pane, clock, todo, image.

## Keys

| | |
|---|---|
| ⌘K | command palette (acts on the focused window) |
| ⌘P | go to any node |
| ⌥1–9 | view focused container as tabs/split/canvas/floating/grid/dock/document/outline/json |
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
