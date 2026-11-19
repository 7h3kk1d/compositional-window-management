/** Every keyboard shortcut, for the help page (⌥/) and the README. */
export const KEYMAP: { keys: string; what: string; group: string }[] = [
  { group: 'Anywhere', keys: '⌘K', what: 'Command palette (acts on the focused window)' },
  { group: 'Anywhere', keys: '⌘P', what: 'Go to any window' },
  { group: 'Anywhere', keys: '⌘Z / ⌘⇧Z', what: 'Undo / redo' },
  { group: 'Anywhere', keys: '⌥/', what: 'This list' },
  { group: 'Anywhere', keys: '⌥Esc', what: 'Leave a text field (then the keys below work)' },

  { group: 'Focus', keys: '⌥← ⌥→ ⌥↑ ⌥↓', what: 'Focus the window in that direction on screen' },
  { group: 'Focus', keys: '⌥Esc / ⌥↵', what: 'Focus the parent container / go into a container' },
  { group: 'Focus', keys: '⌥, / ⌥.', what: 'Previous / next tab (nearest tabs container)' },
  { group: 'Focus', keys: '⌥C', what: 'Center the focused window (scrolling strip, canvas, document)' },

  { group: 'Move & size', keys: '⌥⇧← ⌥⇧→ ⌥⇧↑ ⌥⇧↓', what: 'Move the window, in its container’s terms; past the end of a tiled container it moves out' },
  { group: 'Move & size', keys: '⌥= / ⌥-', what: 'Grow / shrink (split share, column width, grid span, canvas size, dates…)' },
  { group: 'Move & size', keys: '⌥[ / ⌥]', what: 'Stack into the neighbour on the left / right, or out of a stack (nests a split)' },
  { group: 'Move & size', keys: '⌥T', what: 'Toggle the window’s container between tabs and its previous view' },

  { group: 'Windows', keys: '⌥N', what: 'New note, right after the focused window' },
  { group: 'Windows', keys: '⌥W', what: 'Close' },
  { group: 'Windows', keys: '⌥M / ⌥⇧M', what: 'Move to… / mirror into…' },
  { group: 'Windows', keys: '⌥1 … ⌥9', what: 'View the focused container as tabs, split, canvas, floating, grid, dock, document, outline, JSON' },
]
