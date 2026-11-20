/**
 * Entry point when Domicile loads this app as its desktop shell
 * (`npm run build:shell`, then `domicile ./dist-shell/shell.js`).
 *
 * WM keys use Super instead of ⌥, because a focused native window would take
 * ⌥ for itself: Domicile delivers grabbed chords to the shell whichever window
 * has the keyboard, and each is replayed as the ⌥ key the app already handles.
 */
import type { Domicile } from '@domicile-desktop/sdk/shell'
import { StrictMode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import App from '../App'
import { onGlobalKeyDown } from '../commands/keys'
import { registerContentKind } from '../content/registry'
import css from '../index.css?inline'
// Domicile serves only the module, so stylesheets travel inside it.
import tourCss from 'driver.js/dist/driver.css?inline'
import { AppPane } from './AppPane'
import { APP_KIND, closeApp, connect, useDesktop, type AppData } from './desktop'
import * as ops from '../model/ops'
import { useStore } from '../model/store'

const TERMINAL = ['alacritty']

/** keysym → the KeyboardEvent `code`/`key` the app's handler reads. */
const KEYS: Record<string, [code: string, key: string]> = {
  Left: ['ArrowLeft', 'ArrowLeft'],
  Right: ['ArrowRight', 'ArrowRight'],
  Up: ['ArrowUp', 'ArrowUp'],
  Down: ['ArrowDown', 'ArrowDown'],
  Escape: ['Escape', 'Escape'],
  comma: ['Comma', ','],
  period: ['Period', '.'],
  equal: ['Equal', '='],
  minus: ['Minus', '-'],
  bracketleft: ['BracketLeft', '['],
  bracketright: ['BracketRight', ']'],
  slash: ['Slash', '/'],
  ...Object.fromEntries('ctnwm'.split('').map((c) => [c, ['Key' + c.toUpperCase(), c]])),
  ...Object.fromEntries('123456789'.split('').map((d) => [d, ['Digit' + d, d]])),
}
/** Shifted variants the app gives a meaning to. */
const SHIFTED = ['Left', 'Right', 'Up', 'Down', 'm']
/** Super+X replayed as ⌘X (palette, go to, undo/redo). */
const CMD = ['k', 'p', 'z']

function bindKeys(domicile: Domicile) {
  const kb = domicile.keyboard
  const replay = (code: string, key: string, mods: KeyboardEventInit) =>
    onGlobalKeyDown(new KeyboardEvent('keydown', { code, key, ...mods, cancelable: true }))
  const handlers = new Map<string, () => void>()
  for (const [sym, [code, key]] of Object.entries(KEYS)) {
    handlers.set(`Meta+${sym}`, () => replay(code, key, { altKey: true }))
    if (SHIFTED.includes(sym)) handlers.set(`Meta+Shift+${sym}`, () => replay(code, key, { altKey: true, shiftKey: true }))
  }
  for (const k of CMD) handlers.set(`Meta+${k}`, () => replay('Key' + k.toUpperCase(), k, { ctrlKey: true }))
  handlers.set('Meta+Shift+z', () => replay('KeyZ', 'z', { ctrlKey: true, shiftKey: true }))
  // Super+Return is the terminal, as in most tiling WMs; "go into container" moves to Super+Shift+Return.
  handlers.set('Meta+Return', () => domicile.processes.launch(TERMINAL))
  handlers.set('Meta+Shift+Return', () => replay('Enter', 'Enter', { altKey: true }))

  for (const chord of handlers.keys()) kb.grab(chord)
  const off = kb.on('shortcut', ({ chord }) => {
    // The replayed handlers act on whatever has focus, which the page's own
    // focus tracking already mirrors; palette/text input needs the keyboard.
    if (['Meta+k', 'Meta+p'].includes(chord)) domicile.windows.focusShell()
    handlers.get(chord)?.()
  })
  return () => {
    off()
    for (const chord of handlers.keys()) kb.ungrab(chord)
  }
}

export const Shell = (root: HTMLElement, domicile: Domicile) => {
  const style = document.createElement('style')
  style.textContent = css + tourCss
  document.head.append(style)
  registerContentKind({
    id: APP_KIND,
    label: 'Native window',
    icon: '▢',
    create: (): AppData => ({ appId: '', pid: null }),
    Render: AppPane,
    close: ({ appId }: AppData) => closeApp(appId),
  })
  connect(domicile)
  bindKeys(domicile)
  // Handles for driving the desktop from DevTools (DOMICILE_ENGINE_ARGS=--remote-debugging-port=…).
  Object.assign(globalThis, { cwm: { domicile, useStore, useDesktop, ops, key: onGlobalKeyDown } })
  // Domicile shows the page once Shell returns, so the first frame must be drawn by then.
  flushSync(() =>
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
}
