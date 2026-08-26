/**
 * Settings chrome stability gate (upstream #575 card UI + auto-save):
 * title / notice slot / help bar must not jump on focus changes; field hints
 * live in the bottom bar, not the scroll list.
 *
 * Env (`DSH_TUI_LANG`) must be pinned BEFORE any `src/` import — ESM hoists
 * static imports above top-level assignments, so this file uses dynamic import.
 *
 * Run: node --import tsx/esm scripts/verify-settings-layout.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'

import { Writable, PassThrough } from 'node:stream'
import xtermPkg from '@xterm/headless'
import { sleep, viewportLines, settled } from './lib/term-test.mjs'

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
    const titleY = view.findIndex(l => /^Settings(\s|$|›)/.test(l))
    const helpY = view.findIndex(l => /auto-saves|confirm & save/i.test(l) && /Esc/.test(l))
    const noticeY = view.findIndex((l, y) => y > titleY && y < helpY && (l.trim() === '' || /Saved|✓|✗/.test(l)))
    const cardTop = view.findIndex(l => /╭/.test(l))
    const longHintInList = view.some((l, y) => y > titleY && y < helpY - 2 && /vim\/less|native scrollback/.test(l))
    return { titleY, helpY, noticeY, cardTop, longHintInList, plain: view.join('\n') }
  }

  let writes = 0
  const docs: Record<string, { revision: number; value: Record<string, unknown>; user: Record<string, unknown> }> = {
    'dsh-tui': {
      revision: 1,
      value: { lang: 'en', fullscreen: false, statusBar: { model: true }, keymap: { openModelPicker: 'ctrl+p' } },
      user: { keymap: { openModelPicker: 'ctrl+p' } },
    },
  }
  const host = {
    listNamespaces: () => Object.entries(docs).map(([ns, doc]) => ({
      ns, revision: doc.revision, applies: 'live' as const, value: { ...doc.value }, user: { ...doc.user },
    })),
    write: (ns: string, ops: readonly { op: string; path: readonly string[]; value?: unknown }[], expected?: number) => {
      writes += 1
      const doc = docs[ns]
      if (doc === undefined) return Promise.reject(new Error(`unknown namespace ${ns}`))
      if (expected !== undefined && expected !== doc.revision) {
        return Promise.reject(Object.assign(new Error('stale'), { code: 'SETTINGS_CONFLICT' }))
      }
      for (const op of ops) {
        let parent = doc.value
        for (const segment of op.path.slice(0, -1)) {
          const child = parent[segment]
          if (typeof child === 'object' && child !== null && !Array.isArray(child)) parent = child as Record<string, unknown>
          else {
            const created: Record<string, unknown> = {}
            parent[segment] = created
            parent = created
          }
        }
        const leaf = op.path.at(-1)
        if (leaf === undefined) continue
        if (op.op === 'set') parent[leaf] = op.value
        else delete parent[leaf]
      }
      doc.revision += 1
      return Promise.resolve()
    },
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
  check('card chrome', before.cardTop >= 0, `cardTop=${before.cardTop}`)
  check('english select chip', /\bEnglish\b/.test(before.plain))
  check('boolean toggle chip', /\[\s*\]/.test(before.plain))
  check('help bar present', before.helpY === ROWS - 1, `helpY=${before.helpY}`)
  check('long hint not in list body', !before.longHintInList)

  stdin.write('\u001b[B')
  await sleep(80)
  const after = chrome()
  check('title row stable on focus change', before.titleY === after.titleY && after.titleY === 0)
  check('help bar row stable', before.helpY === after.helpY && after.helpY === ROWS - 1)
  check('long hint still not in list after focus', !after.longHintInList)

  stdin.write('\r')
  check(await settled(() => writes >= 1), 'boolean toggle auto-saves')
  check(await settled(() => /Saved dsh-tui|✓/.test(chrome().plain)), 'save notice renders')
  check(await settled(() => docs['dsh-tui']?.value.fullscreen === true), 'host document updated')

  stdin.write('\x1b[B')
  await sleep(80)
  stdin.write('\r')
  await sleep(80)
  const shortcuts = chrome()
  check('shortcuts group opens', /Open model picker/.test(shortcuts.plain))
  check('shortcut value readable', /ctrl\+p/i.test(shortcuts.plain))

  stdin.write('\r')
  await sleep(80)
  for (let i = 0; i < 24; i++) stdin.write('\x1b[C')
  await sleep(80)
  check(/▌/.test(chrome().plain), 'edit mode shows caret')
  check(/ctrl\+p/i.test(chrome().plain), 'edit value prefix visible')

  instance.unmount()
  term.dispose()
  process.exit(failed ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
