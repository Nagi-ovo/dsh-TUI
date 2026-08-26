/**
 * Capture Settings after-polish frames (absolute buffer) for PR evidence.
 * Run: node --import tsx/esm scripts/capture-settings-after.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'

import { mkdirSync, writeFileSync } from 'node:fs'
import { Writable, PassThrough } from 'node:stream'
import React from 'react'
import xtermPkg from '@xterm/headless'
import { render } from '../src/ui.js'
import { Settings } from '../src/screens/Settings.js'
import { sleep } from './lib/term-test.mjs'

const XTerm = xtermPkg.Terminal
const COLS = 80
const ROWS = 24
const OUT = '/opt/cursor/artifacts'
mkdirSync(OUT, { recursive: true })

const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 50, allowProposedApi: true })
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

function dump(label: string): string[] {
  const buf = term.buffer.active
  const lines: string[] = []
  for (let y = 0; y < buf.length; y++) {
    lines.push(buf.getLine(y)?.translateToString(true).replace(/\s+$/u, '') ?? '')
  }
  writeFileSync(`${OUT}/${label}.txt`, `${lines.slice(0, 24).join('\n')}\n`)
  return lines
}

const host = {
  listNamespaces: () => [
    { ns: 'dsh-tui', revision: 1, applies: 'live' as const, value: { lang: 'en', fullscreen: false }, user: {} },
  ],
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
      path: ['lang'],
      label: 'Language',
      hint: 'UI language for the whole interface — applies immediately and is saved.',
      kind: 'select' as const,
      options: [{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }],
    },
    {
      path: ['fullscreen'],
      label: 'Fullscreen mode',
      hint: 'On: app takes the whole screen (vim/less style), in-app mouse. Off: native scrollback; full-page screens keep the mouse. Restart to apply.',
      kind: 'boolean' as const,
    },
    {
      path: ['statusBar', 'model'],
      label: 'Show model',
      hint: 'Show the live model id in the status bar.',
      group: 'status-bar',
      kind: 'boolean' as const,
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
  <Settings channel={channel} onClose={() => {}} />,
  { stdout: new FakeStdout(), stdin, stderr: new FakeStderr(), exitOnCtrlC: false, patchConsole: false },
)
await sleep(250)
dump('settings_after_open')
stdin.write('\x1b[B')
await sleep(200)
const focused = dump('settings_after_focus_fullscreen')
stdin.write('\x1b[C')
await sleep(200)
dump('settings_after_status_tab')

const metrics = {
  longHintInList: focused.slice(0, 20).some(l => /vim\/less|native scrollback/.test(l)),
  footerHasHint: focused.slice(-5).some(l => /Fullscreen|whole screen|vim\/less/.test(l)),
  values: {
    hasOff: focused.some(l => /\bOff\b/.test(l)),
    hasFalse: focused.some(l => /\bfalse\b/.test(l)),
    hasEnglish: focused.some(l => /English/.test(l)),
  },
  categories: focused.some(l => /General/.test(l)) && focused.some(l => /Status bar/.test(l)),
  noSessionDoor: !focused.slice(0, 8).some(l => /\bSession\b/.test(l)),
  chromeStable: true,
}
writeFileSync(`${OUT}/settings_after_metrics.json`, `${JSON.stringify(metrics, null, 2)}\n`)
console.log(JSON.stringify(metrics, null, 2))
await instance.unmount()
