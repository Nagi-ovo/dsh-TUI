/**
 * Settings baseline capture: prove focus-driven layout shift before polish.
 *
 * Renders the real Settings screen with the packaged-style dsh-tui section
 * (long fullscreen hint) on 80x24, walks focus, and records:
 *   - per-frame non-blank line counts
 *   - title / divider / hint row y-positions
 *   - whether the focused field's hint expands the list (jitter)
 *
 * Writes JSON + plain frames under /tmp/dsh-tui-baseline/.
 * Run: node --import tsx/esm scripts/capture-settings-baseline.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'

import { mkdirSync, writeFileSync } from 'node:fs'
import { Writable, PassThrough } from 'node:stream'
import React from 'react'
import xtermPkg from '@xterm/headless'
import { render } from '../src/ui.js'
import { Settings } from '../src/screens/Settings.js'
import { sleep, viewportLines } from './lib/term-test.mjs'

const XTerm = xtermPkg.Terminal

const COLS = 80
const ROWS = 24
const OUT = '/tmp/dsh-tui-baseline'
mkdirSync(OUT, { recursive: true })

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

function frame() {
  const lines = viewportLines(term, ROWS)
  const nonBlank = lines.map((l, y) => ({ y, text: l })).filter(r => r.text.trim().length > 0)
  const titleY = lines.findIndex(l => /\bSettings\b|设置/.test(l))
  const dividers = lines.map((l, y) => (/[─-]{8,}/.test(l) ? y : -1)).filter(y => y >= 0)
  const hintY = lines.findIndex(l => /Enter/.test(l) && /(edit|toggle|save|Esc)/i.test(l))
  const longHintVisible = lines.some(l => /whole screen|接管整个终端|vim\/less/i.test(l))
  return {
    lines,
    nonBlankCount: nonBlank.length,
    titleY,
    dividers,
    hintY,
    longHintVisible,
    plain: lines.join('\n'),
  }
}

const docs: Record<string, { revision: number; value: Record<string, unknown>; user: Record<string, unknown> }> = {
  'dsh-tui': {
    revision: 1,
    value: { lang: 'en', fullscreen: false, statusBar: { model: true } },
    user: {},
  },
  'orphan-ns': {
    revision: 1,
    value: { nested: { a: 1, b: 2 } },
    user: {},
  },
}

const host = {
  listNamespaces: () => Object.entries(docs).map(([ns, doc]) => ({
    ns,
    revision: doc.revision,
    applies: ns === 'dsh-tui' ? 'restart' as const : 'live' as const,
    value: { ...doc.value },
    user: { ...doc.user },
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
    { id: 'session', title: 'Session' },
  ],
  fields: [
    {
      path: ['lang'],
      label: 'Language',
      hint: 'UI language for the whole interface — applies immediately and is saved.',
      kind: 'select' as const,
      options: [
        { value: 'zh', label: '中文' },
        { value: 'en', label: 'English' },
      ],
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
const snapshots: Array<{ label: string; metrics: ReturnType<typeof frame> }> = []

function snap(label: string) {
  const metrics = frame()
  snapshots.push({ label, metrics })
  writeFileSync(`${OUT}/${label}.txt`, metrics.plain)
  console.log(`--- ${label} ---`)
  console.log(`nonBlank=${metrics.nonBlankCount} titleY=${metrics.titleY} hintY=${metrics.hintY} dividers=${metrics.dividers.join(',')} longHint=${metrics.longHintVisible}`)
  console.log(metrics.plain)
}

snap('00_open')

// Focus Language (index 0) → Fullscreen (index 1): long hint appears and expands height.
stdin.write('\x1b[B')
await sleep(200)
snap('01_focus_fullscreen')

stdin.write('\x1b[A')
await sleep(200)
snap('02_focus_language_again')

stdin.write('\x1b[B')
await sleep(120)
stdin.write('\x1b[B') // Status bar group
await sleep(200)
snap('03_focus_status_group')

stdin.write('\x1b[B') // Session empty group
await sleep(200)
snap('04_focus_empty_session')

stdin.write('\r')
await sleep(250)
snap('05_enter_empty_session')

const open = snapshots[0]!.metrics
const fullscreen = snapshots[1]!.metrics
const report = {
  cols: COLS,
  rows: ROWS,
  snapshots: snapshots.map(s => ({
    label: s.label,
    nonBlankCount: s.metrics.nonBlankCount,
    titleY: s.metrics.titleY,
    hintY: s.metrics.hintY,
    dividers: s.metrics.dividers,
    longHintVisible: s.metrics.longHintVisible,
  })),
  jitter: {
    titleMoved: open.titleY !== fullscreen.titleY,
    hintMoved: open.hintY !== fullscreen.hintY,
    nonBlankDelta: fullscreen.nonBlankCount - open.nonBlankCount,
    longHintAppearsOnFocus: !open.longHintVisible && fullscreen.longHintVisible,
  },
}
writeFileSync(`${OUT}/metrics.json`, JSON.stringify(report, null, 2))
console.log('=== METRICS ===')
console.log(JSON.stringify(report, null, 2))

await instance.unmount()
process.exit(0)
