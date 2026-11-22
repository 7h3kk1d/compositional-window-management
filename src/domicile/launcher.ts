/**
 * The app launcher: installed desktop entries as a palette page ("Launch
 * app…", Super+Space). A launched app's window opens beside the focused pane,
 * as every new window does (see `desktop.ts`).
 */
import type { Domicile } from '@domicile-desktop/sdk/shell'
import { dataDirs } from '@domicile-desktop/system-apps/data-dirs'
import type { DesktopEntry } from '@domicile-desktop/system-apps/desktop-entry'
import { installedApps } from '@domicile-desktop/system-apps/installed'
import { PAGES, registerRootItems } from '../commands/commands'
import { useStore } from '../model/store'
import { withX11 } from './x11'

export const TERMINAL = ['alacritty']

let entries: readonly DesktopEntry[] = []
let loading: Promise<void> | undefined

/**
 * Reads every installed application. The palette lists what the last read
 * found, so opening the launcher starts a fresh read for the next time
 * (an app installed by `nixos-rebuild` appears on the second open).
 */
function refresh(domicile: Domicile) {
  loading ??= (async () => {
    try {
      const apps = await (await dataDirs(domicile)).andThenAsync((dirs) => installedApps(domicile, dirs))
      apps.match({
        Ok: (found) => {
          entries = found.toSorted((a, b) => a.name.localeCompare(b.name))
        },
        Err: (error) => console.warn('[cwm] could not read installed applications:', error.message),
      })
    } catch (e) {
      console.warn('[cwm] could not read installed applications', e)
    } finally {
      loading = undefined
    }
  })()
  return loading
}

export const appEntries = () => entries

export function setupLauncher(domicile: Domicile) {
  void refresh(domicile)
  PAGES.apps = {
    title: 'Launch app',
    items: () => {
      void refresh(domicile)
      return entries.map((e) => ({
        id: 'app-' + e.id,
        title: e.name,
        keywords: [e.words, e.id],
        hint: e.comment || undefined,
        run: () => domicile.processes.launch(withX11(e.command)),
      }))
    },
  }
  registerRootItems(() => [
    {
      id: 'launch',
      title: 'Launch app…',
      group: 'Desktop',
      keywords: ['open', 'run', 'start', 'application', 'program'],
      shortcut: 'Super+Space',
      page: 'apps',
    },
    {
      id: 'terminal',
      title: 'Open terminal',
      group: 'Desktop',
      keywords: ['shell', 'console', TERMINAL[0]],
      shortcut: 'Super+↵',
      run: () => domicile.processes.launch(withX11(TERMINAL)),
    },
  ])
}

export const openLauncher = () => useStore.getState().openPalette('apps')
