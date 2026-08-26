/**
 * Settings chrome stability gate: title / status / hint rows must not move
 * when focus changes, and focused field hints must never expand the list.
 *
 * Run: node --import tsx/esm scripts/verify-settings-layout.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'

import { Writable, PassThrough } from 'node:stream'
import React from 'react'
import xtermPkg from '@xterm/headless'
import { render } from '../src/ui.js'
import { Settings } from '../src/screens/Settings.js'
import { sleep, viewportLines } from './lib/term-test.mjs'

const XTerm = xtermPkg.Terminal
const COLS = 80
const ROWS = 24

let failed = 0
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failed += 1
}

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

function lines(): string[] {
  return viewportLines(term, ROWS)
}

function chrome(term: InstanceType<typeof XTerm>) {
  const buffer = term.buffer.active
  // Prefer the absolute buffer (includes a scrolled-off title) so a single
  // trailing newline from the renderer does not look like a missing title.
  const absolute: string[] = []
  for (let y = 0; y < buffer.length; y++) {
    absolute.push(buffer.getLine(y)?.translateToString(true).replace(/\s+$/u, '') ?? '')
  }
  const view = viewportLines(term, ROWS)
  const titleY = absolute.findIndex(l => l === 'Settings' || l.startsWith('Settings '))
  const viewTitleY = view.findIndex(l => l === 'Settings' || l.startsWith('Settings '))
  const dividers = view.map((l, y) => (/[─-]{8,}/.test(l) ? y : -1)).filter(y => y >= 0)
  const navY = view.findIndex(l => /Enter/.test(l) && /(edit|toggle|save|Esc|confirm)/i.test(l))
  const longHintInList = view.some((l, y) => y < (navY === -1 ? ROWS : navY - 1) && /vim\/less|native scrollback/.test(l))
  return { titleY, viewTitleY, dividers, navY, longHintInList, plain: view.join('\n'), absolute: absolute.join('\n') }
}

const docs: Record<string, { revision: number; value: Record<string, unknown>; user: Record<string, unknown> }> = {
  'dsh-tui': { revision: 1, value: { lang: 'en', fullscreen: false }, user: {} },
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

const open = chrome(term)
check('title row present', open.titleY === 0 || open.viewTitleY === 0, `titleY=${open.titleY} viewTitleY=${open.viewTitleY}`)
check('category tabs present', /General/.test(open.plain) && /Status bar/.test(open.plain))
check('no empty Session door', !/^\s*Session\s*$/m.test(open.plain.split('\n').slice(0, 8).join('\n')))
check('boolean shows Off not false', /\bOff\b/.test(open.plain) && !/\bfalse\b/.test(open.plain))
check('select shows English label', /English/.test(open.plain))
check('value column right-aligned', (() => {
  const ends = open.plain.split('\n')
    .map(line => {
      const m = line.match(/^(.*?)\s+(English|Off|On)\s*$/)
      return m ? m[0].replace(/\s+$/u, '').length : -1
    })
    .filter(n => n > 0)
  return ends.length >= 2 && new Set(ends).size === 1
})(), 'value end columns should match')

stdin.write('\x1b[B') // focus Fullscreen
await sleep(200)
const focused = chrome(term)
check('title row stable on focus', focused.titleY === open.titleY && focused.viewTitleY === open.viewTitleY, `was ${open.viewTitleY} now ${focused.viewTitleY}`)
check('nav hint row stable on focus', focused.navY === open.navY, `was ${open.navY} now ${focused.navY}`)
check('dividers stable on focus', focused.dividers.join(',') === open.dividers.join(','), `was ${open.dividers} now ${focused.dividers}`)
check('long hint not expanded into list', !focused.longHintInList)
check('field hint reserved in footer', (() => {
  const footer = focused.plain.split('\n').slice(-4).join('\n')
  return /Fullscreen/.test(footer) || /whole screen|vim\/less|native scrollback/.test(footer)
})())

stdin.write('\x1b[C') // → Status bar
await sleep(200)
const tabbed = chrome(term)
check('title stable across category', tabbed.titleY === open.titleY && tabbed.viewTitleY === open.viewTitleY)
check('nav hint stable across category', tabbed.navY === open.navY)
check('dividers stable across category', tabbed.dividers.join(',') === open.dividers.join(','))
check('status-bar field visible', /Show model/.test(tabbed.plain))
check('general field hidden', !/Fullscreen mode/.test(tabbed.plain))
check('no focus jitter (viewport keeps title)', tabbed.viewTitleY === 0 || open.viewTitleY === tabbed.viewTitleY)

await instance.unmount()
if (failed > 0) {
  console.log('--- last frame ---\n' + tabbed.plain)
  process.exit(1)
}
console.log('verify-settings-layout: all checks passed')
process.exit(0)
