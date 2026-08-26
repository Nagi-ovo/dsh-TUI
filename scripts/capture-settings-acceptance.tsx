/**
 * Settings acceptance capture: 80x24 + 120x40 chrome pins across
 * arrow / category / toggle / select / edit / discard.
 *
 * Run: node --import tsx/esm scripts/capture-settings-acceptance.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'

import { mkdirSync, writeFileSync } from 'node:fs'
import { Writable, PassThrough } from 'node:stream'
import xtermPkg from '@xterm/headless'
import { sleep, viewportLines } from './lib/term-test.mjs'

const XTerm = xtermPkg.Terminal
const OUT = '/opt/cursor/artifacts'
mkdirSync(OUT, { recursive: true })

type Size = { cols: number; rows: number }

async function main(): Promise<void> {
  const React = (await import('react')).default
  const { render, AlternateScreen } = await import('../src/ui.js')
  const { Settings } = await import('../src/screens/Settings.js')
  const { clearSettingsSession } = await import('../src/screens/settingsSession.js')

  const docs: Record<string, { revision: number; value: Record<string, unknown>; user: Record<string, unknown> }> = {
    'dsh-tui': {
      revision: 1,
      value: { lang: 'en', fullscreen: false, statusBar: { model: true }, keymap: { openModelPicker: 'ctrl+p' } },
      user: {},
    },
  }
  const host = {
    listNamespaces: () => Object.entries(docs).map(([ns, doc]) => ({
      ns, revision: doc.revision, applies: 'live' as const, value: { ...doc.value }, user: { ...doc.user },
    })),
    write: async () => {},
    credentialConfigured: async () => false,
    writeCredential: async () => {},
  }
  const section = {
    ns: 'dsh-tui',
    title: 'dsh-tui',
    groups: [
      { id: 'status-bar', title: 'Status bar' },
      { id: 'shortcuts', title: 'Shortcuts' },
    ],
    fields: [
      {
        path: ['lang'], label: 'Language',
        hint: 'UI language for the whole interface — applies immediately and is saved.',
        kind: 'select' as const,
        options: [{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }],
      },
      {
        path: ['fullscreen'], label: 'Fullscreen mode',
        hint: 'On: app takes the whole screen (vim/less style), in-app mouse. Off: native scrollback; full-page screens keep the mouse. Restart to apply.',
        kind: 'boolean' as const,
      },
      {
        path: ['statusBar', 'model'], label: 'Show model',
        hint: 'Show the live model id in the status bar.',
        group: 'status-bar', kind: 'boolean' as const,
      },
      {
        path: ['keymap', 'openModelPicker'], label: 'Open model picker',
        hint: 'Open the model picker from chat.',
        group: 'shortcuts', kind: 'text' as const,
      },
    ],
  }
  const channel: any = {
    settingsHost: () => host,
    settingsSections: () => [section],
    subscribeSettingsSections: () => () => {},
  }

  function chromePins(view: string[], rows: number) {
    const titleY = view.findIndex(l => l === 'Settings' || l.startsWith('Settings '))
    const dividers = view.map((l, y) => (/[─-]{8,}/.test(l) ? y : -1)).filter(y => y >= 0)
    const navY = view.findIndex(l => /Enter/.test(l) && /(edit|toggle|save|Esc|confirm)/i.test(l))
    return { titleY, dividers, navY, ok: titleY === 0 && navY === rows - 1 && dividers.length >= 2 }
  }

  async function runSize(size: Size): Promise<Record<string, unknown>> {
    clearSettingsSession()
    const term = new XTerm({ cols: size.cols, rows: size.rows, scrollback: 40, allowProposedApi: true })
    class FakeStdout extends Writable {
      columns = size.cols
      rows = size.rows
      isTTY = true
      _write(chunk: unknown, _e: BufferEncoding, cb: () => void) { term.write(String(chunk), cb) }
    }
    class FakeStderr extends Writable {
      isTTY = true
      _write(_c: unknown, _e: BufferEncoding, cb: () => void) { cb() }
    }
    class FakeStdin extends PassThrough {
      isTTY = true
      setRawMode() { return this }
      ref() { return this }
      unref() { return this }
    }
    const stdin = new FakeStdin()
    const inst = await render(
      React.createElement(AlternateScreen, null, React.createElement(Settings as any, { channel, onClose: () => clearSettingsSession() })),
      { stdout: new FakeStdout() as any, stdin: stdin as any, stderr: new FakeStderr() as any, exitOnCtrlC: false, patchConsole: false },
    )
    await sleep(150)

    const shots: Record<string, string> = {}
    const pin = (name: string) => {
      const view = viewportLines(term, size.rows)
      const plain = view.join('\n')
      const tag = `accept_${size.cols}x${size.rows}_${name}`
      writeFileSync(`${OUT}/${tag}.txt`, plain + '\n')
      shots[name] = plain
      return { view, pins: chromePins(view, size.rows), plain }
    }

    const open = pin('open')
    stdin.write('\x1b[B') // Fullscreen
    await sleep(60)
    const focus = pin('focus_fullscreen')
    stdin.write('\r') // toggle
    await sleep(60)
    const toggled = pin('toggled')
    stdin.write('\x1b[A') // back to Language
    await sleep(40)
    stdin.write('\r') // open select
    await sleep(80)
    const select = pin('select_open')
    stdin.write('\x1b') // close select
    await sleep(60)
    stdin.write('\x1b[C') // Status bar
    await sleep(60)
    const status = pin('status_tab')
    stdin.write('\x1b[C') // Shortcuts
    await sleep(60)
    const shortcuts = pin('shortcuts_tab')
    stdin.write('\r') // edit shortcut
    await sleep(60)
    const editing = pin('editing')
    stdin.write('\x1b') // cancel edit
    await sleep(40)
    stdin.write('\x1b') // discard dirty
    await sleep(60)
    const discarded = pin('discarded')

    const noSession = !/\bSession\b/.test(open.plain)
    const booleanOffOn = /\bOff\b|\bOn\b/.test(focus.plain) && !/\bfalse\b|\btrue\b/.test(focus.plain.replace(/Fullscreen/g, ''))
    const allPins = [open, focus, toggled, select, status, shortcuts, editing, discarded]
      .every(s => s.pins.titleY === open.pins.titleY && s.pins.navY === open.pins.navY)

    await inst.unmount()
    term.dispose()
    return {
      size,
      chromeStable: allPins && open.pins.ok,
      noSession,
      booleanLabels: booleanOffOn,
      titleY: open.pins.titleY,
      navY: open.pins.navY,
      hasGeneral: /\bGeneral\b/.test(open.plain),
      hasStatus: /\bStatus bar\b/.test(status.plain),
      hasShortcuts: /\bOpen model picker\b/.test(shortcuts.plain),
      dirtyThenDiscard: /Unsaved|Discarded|unsaved|discarded/i.test(toggled.plain + discarded.plain),
    }
  }

  const metrics = {
    '80x24': await runSize({ cols: 80, rows: 24 }),
    '120x40': await runSize({ cols: 120, rows: 40 }),
  }
  writeFileSync(`${OUT}/settings_acceptance_metrics.json`, JSON.stringify(metrics, null, 2) + '\n')
  console.log(JSON.stringify(metrics, null, 2))
  const ok = Object.values(metrics).every((m: any) => m.chromeStable && m.noSession && m.booleanLabels && m.hasGeneral)
  process.exit(ok ? 0 : 1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
