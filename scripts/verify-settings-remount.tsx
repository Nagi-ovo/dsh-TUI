/**
 * Settings remount persistence: Chat interrupt unmounts Settings while
 * `settingsOpen` stays true; focus, category, and staged dirty edits must
 * survive the remount (session bag), and clear on explicit close.
 *
 * Run: node --import tsx/esm scripts/verify-settings-remount.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'

import { Writable, PassThrough } from 'node:stream'
import React from 'react'
import xtermPkg from '@xterm/headless'
import { render } from '../src/ui.js'
import { Settings } from '../src/screens/Settings.js'
import {
  clearSettingsSession,
  getSettingsSession,
} from '../src/screens/settingsSession.js'
import { sleep, viewportLines } from './lib/term-test.mjs'

const XTerm = xtermPkg.Terminal
const COLS = 80
const ROWS = 24

let failed = 0
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failed += 1
}

function makeTerm() {
  const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 40, allowProposedApi: true })
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
  return { term, stdout: new FakeStdout(), stdin: new FakeStdin(), stderr: new FakeStderr() }
}

function frame(term: InstanceType<typeof XTerm>): string {
  return viewportLines(term, ROWS).join('\n')
}

const docs: Record<string, { revision: number; value: Record<string, unknown>; user: Record<string, unknown> }> = {
  'dsh-tui': { revision: 1, value: { lang: 'en', fullscreen: false, statusBar: { model: true } }, user: {} },
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
      kind: 'select' as const,
      options: [{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }],
    },
    {
      path: ['fullscreen'], label: 'Fullscreen mode',
      hint: 'On: app takes the whole screen (vim/less style).',
      kind: 'boolean' as const,
    },
    {
      path: ['statusBar', 'model'], label: 'Show model',
      group: 'status-bar', kind: 'boolean' as const,
    },
  ],
}
const channel: any = {
  settingsHost: () => host,
  settingsSections: () => [section],
  subscribeSettingsSections: () => () => {},
}

clearSettingsSession()

const first = makeTerm()
let closed = false
const instance1 = await render(
  <Settings channel={channel} onClose={() => { closed = true }} />,
  { stdout: first.stdout, stdin: first.stdin, stderr: first.stderr, exitOnCtrlC: false, patchConsole: false },
)
await sleep(200)

first.stdin.write('\x1b[B') // focus Fullscreen
await sleep(120)
first.stdin.write('\r') // toggle boolean → dirty On
await sleep(120)
const beforeRemount = frame(first.term)
check('before remount shows Fullscreen focused dirty', /Fullscreen mode/.test(beforeRemount) && /\bOn\b/.test(beforeRemount) && /\*/.test(beforeRemount))
const bagBefore = getSettingsSession()
check('session bag alive before remount', bagBefore !== null)
check('session focus on second field', bagBefore?.focusIndex === 1, `focus=${bagBefore?.focusIndex}`)
check('session form dirty', [...(bagBefore?.forms.values() ?? [])].some(f => f.shell().dirty) === true)

// Simulate Chat interrupt remount: unmount without closing (settingsOpen stays).
await instance1.unmount()
await sleep(50)
check('bag survives interrupt unmount', getSettingsSession() !== null)
check('user did not close', closed === false)

const second = makeTerm()
const instance2 = await render(
  <Settings channel={channel} onClose={() => { closed = true; clearSettingsSession() }} />,
  { stdout: second.stdout, stdin: second.stdin, stderr: second.stderr, exitOnCtrlC: false, patchConsole: false },
)
await sleep(250)
const afterRemount = frame(second.term)
check('after remount still on General (not Status bar)', /Fullscreen mode/.test(afterRemount) && !/Show model/.test(afterRemount))
check('after remount keeps dirty On', /\bOn\b/.test(afterRemount) && /\*/.test(afterRemount))
check('after remount still focused Fullscreen row', (() => {
  // Focused row carries ❯ pointer from ListItem
  return afterRemount.split('\n').some(line => /❯/.test(line) && /Fullscreen/.test(line))
})())

// Explicit close clears the bag
second.stdin.write('\x1b') // Esc → discard dirty
await sleep(150)
second.stdin.write('\x1b') // Esc → close
await sleep(150)
await instance2.unmount()
check('close cleared session bag', getSettingsSession() === null)

if (failed > 0) {
  console.log('--- before ---\n' + beforeRemount)
  console.log('--- after ---\n' + afterRemount)
  process.exit(1)
}
console.log('verify-settings-remount: all checks passed')
process.exit(0)
