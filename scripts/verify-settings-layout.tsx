/**
 * Settings chrome stability gate: title / status / hint rows must not move
 * when focus changes, and focused field hints must never expand the list.
 *
 * Env (`DSH_TUI_LANG`) must be pinned BEFORE any `src/` import — ESM hoists
 * static imports above top-level assignments, so this file uses dynamic import.
 * Mount under AlternateScreen (product path) so a trailing newline cannot
 * scroll the title out of the viewport.
 *
 * Run: node --import tsx/esm scripts/verify-settings-layout.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'

import { Writable, PassThrough } from 'node:stream'
import xtermPkg from '@xterm/headless'
import { sleep, viewportLines } from './lib/term-test.mjs'

const XTerm = xtermPkg.Terminal
const COLS = 80
const ROWS = 24

let failed = 0
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failed += 1
}

async function main(): Promise<void> {
  const React = (await import('react')).default
  const { render, AlternateScreen } = await import('../src/ui.js')
  const { Settings } = await import('../src/screens/Settings.js')
  const { clearSettingsSession } = await import('../src/screens/settingsSession.js')
  clearSettingsSession()

  const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 20, allowProposedApi: true })
  class FakeStdout extends Writable {
    columns = COLS
    rows = ROWS
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

  function chrome() {
    const view = viewportLines(term, ROWS)
    const titleY = view.findIndex(l => /^Settings(\s|$|·)/.test(l))
    const dividers = view.map((l, y) => (/[─-]{8,}/.test(l) ? y : -1)).filter(y => y >= 0)
    const navY = view.findIndex(l => /Enter/.test(l) && /(edit|toggle|save|Esc|confirm)/i.test(l))
    const longHintInList = view.some((l, y) => y < (navY === -1 ? ROWS : navY - 1) && /vim\/less|native scrollback/.test(l))
    const unsavedInListWell = view.some((l, y) => y > 4 && y < (navY === -1 ? ROWS : navY) && /^\s*unsaved\s*$/.test(l))
    return { titleY, dividers, navY, longHintInList, unsavedInListWell, plain: view.join('\n') }
  }

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

  const stdin = new FakeStdin()
  const instance = await render(
    React.createElement(
      AlternateScreen,
      null,
      React.createElement(Settings as any, {
        channel,
        onClose: () => {},
      }),
    ),
    {
      stdout: new FakeStdout() as any,
      stdin: stdin as any,
      stderr: new FakeStderr() as any,
      patchConsole: false,
      exitOnCtrlC: false,
    },
  )
  await sleep(150)
  const before = chrome()
  check('title present', before.titleY === 0, `titleY=${before.titleY}`)
  check('english chrome', /\bGeneral\b/.test(before.plain) && /\bOff\b/.test(before.plain), before.plain.slice(0, 200))
  check('two chrome rules', before.dividers.length >= 2, `dividers=${before.dividers.join(',')}`)
  check('footer hint present', before.navY === ROWS - 1, `navY=${before.navY}`)
  check('long hint not in list body', !before.longHintInList)

  // Focus next field (Language → Fullscreen) — long hint must stay in footer.
  stdin.write('\u001b[B')
  await sleep(80)
  const after = chrome()

  check('title row stable on focus change', before.titleY === after.titleY && after.titleY === 0, `before=${before.titleY} after=${after.titleY}`)
  check('status rule stable', before.dividers[0] === after.dividers[0], `${before.dividers[0]}→${after.dividers[0]}`)
  check('hint rule stable', before.dividers[1] === after.dividers[1] || before.dividers.at(-1) === after.dividers.at(-1), `${before.dividers.join(',')}→${after.dividers.join(',')}`)
  check('footer hint row stable', before.navY === after.navY && after.navY === ROWS - 1, `nav ${before.navY}→${after.navY}`)
  check('long hint still not in list after focus', !after.longHintInList)
  check('no Session category', !/\bSession\b/.test(after.plain))
  check('boolean shows Off not false', /\bOff\b/.test(after.plain) && !/\bfalse\b/.test(after.plain))
  check('values show English not clipped', /\bEnglish\b/.test(before.plain))
  check('unsaved not floating in list well', !before.unsavedInListWell && !after.unsavedInListWell)

  // Toggle dirty: title carries unsaved, value shows On without user* glue.
  stdin.write('\r')
  await sleep(80)
  const dirty = chrome()
  check('dirty title suffix', /Settings · unsaved/.test(dirty.plain))
  check('dirty value shows On', /\bOn\b/.test(dirty.plain))
  check('dirty star spaced before value', /\*\s+On/.test(dirty.plain))
  check('no glued star value', !/\*On\b/.test(dirty.plain))
  check('no override letter in row', !/\bu\s+\*/.test(dirty.plain) && !/\s+u\s+\*/.test(dirty.plain))
  check('footer shows user source', /user · On:/.test(dirty.plain))
  check('unsaved not in list well when dirty', !dirty.unsavedInListWell)
  check('footer hint row stable when dirty', before.navY === dirty.navY && dirty.navY === ROWS - 1)

  stdin.write('\x1b[C')
  await sleep(120)
  stdin.write('\x1b[C')
  await sleep(120)
  const shortcuts = chrome()
  check('shortcut value readable', /ctrl\+p/i.test(shortcuts.plain))

  // Edit mode: caret must stay visible (truncate-start on the value cell).
  stdin.write('\r')
  await sleep(80)
  for (let i = 0; i < 24; i++) stdin.write('\x1b[C')
  await sleep(80)
  const editing = chrome()
  check('edit mode shows caret', /▌/.test(editing.plain))
  check('edit value prefix visible', /ctrl\+p/i.test(editing.plain))

  instance.unmount()
  term.dispose()
  process.exit(failed ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
