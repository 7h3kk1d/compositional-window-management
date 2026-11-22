/**
 * X11 apps (Steam and its games, older apps) through xwayland-satellite.
 *
 * Domicile has no Xwayland, but xwayland-satellite bridges X11 windows to
 * ordinary Wayland toplevels, which then tile like any window. On a real
 * Domicile login there is no X display, so the shell starts the bridge once
 * on `X_DISPLAY` (a reloaded shell finds its socket and leaves it be) and
 * puts `DISPLAY` on everything it launches; a terminal passes it on, so
 * `steam` typed there works too. Nested in another desktop, `DISPLAY` is
 * already set to that desktop's X server and nothing changes.
 *
 * Needs `xwayland-satellite` on PATH (the NixOS module installs it).
 */
import type { Domicile } from '@domicile-desktop/sdk/shell'

export const X_DISPLAY = ':11'

/** The display to add to launched commands, once known; none while nested. */
let display: string | undefined

export async function setupX11(domicile: Domicile) {
  // The page can't see the environment its processes start with; ask one.
  const own = (await domicile.processes.run(['sh', '-c', 'printf %s "$DISPLAY"'])).match({
    Ok: (ran) => ran.stdout || undefined,
    Err: () => undefined,
  })
  if (own !== undefined) return
  const socket = `/tmp/.X11-unix/X${X_DISPLAY.slice(1)}`
  const running = (await domicile.processes.run(['test', '-S', socket])).match({
    Ok: (ran) => ran.code === 0,
    Err: () => false,
  })
  if (!running) domicile.processes.launch(['xwayland-satellite', X_DISPLAY])
  display = X_DISPLAY
}

/** `argv` with the X display the desktop's X11 apps use, if the shell runs one. */
export const withX11 = (argv: readonly string[]): string[] =>
  display === undefined ? [...argv] : ['env', `DISPLAY=${display}`, ...argv]
