/**
 * Capture Settings value-column alignment frames for the polish PR.
 * Run: node --import tsx/esm scripts/capture-settings-valuecol.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'
process.env.DSH_TUI_THEME = 'dark'

import { mkdirSync, writeFileSync } from 'node:fs'
import { Writable, PassThrough } from 'node:stream'
import React from 'react'
import xtermPkg from '@xterm/headless'
import { render } from '../src/ui.js'
import { Settings } from '../src/screens/Settings.js'
import { clearSettingsSession } from '../src/screens/settingsSession.js'
import { sleep, viewportLines } from './lib/term-test.mjs'

const XTerm = xtermPkg.Terminal
const OUT = '/opt/cursor/artifacts'
mkdirSync(OUT, { recursive: true })
const COLS = 80
const ROWS = 24

function makeIo() {
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

const docs = {
  'dsh-tui': {
    revision: 1,
    value: { lang: 'en', fullscreen: false, whale: true },
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
  groups: [{ id: 'status-bar', title: 'Status bar' }],
  fields: [
    { path: ['lang'], label: 'Language', kind: 'select' as const,
      options: [{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }] },
    { path: ['fullscreen'], label: 'Fullscreen mode', kind: 'boolean' as const },
    { path: ['whale'], label: 'Whale', kind: 'boolean' as const },
    { path: ['statusBar', 'model'], label: 'Show model', group: 'status-bar', kind: 'boolean' as const },
  ],
}
const channel: any = {
  settingsHost: () => host,
  settingsSections: () => [section],
  subscribeSettingsSections: () => () => {},
}

clearSettingsSession()
const io = makeIo()
const inst = await render(
  <Settings channel={channel} onClose={() => clearSettingsSession()} />,
  { stdout: io.stdout, stdin: io.stdin, stderr: io.stderr, exitOnCtrlC: false, patchConsole: false },
)
await sleep(250)
const open = viewportLines(io.term, ROWS)
writeFileSync(`${OUT}/settings_valuecol_after.txt`, open.join('\n') + '\n')

// Value end columns should cluster (right-aligned).
const valueEnds = open
  .map(line => {
    const m = line.match(/^(.*?)\s+(English|Off|On)\s*$/)
    if (!m) return -1
    return m[0].length
  })
  .filter(n => n > 0)
const uniqueEnds = [...new Set(valueEnds)]
writeFileSync(`${OUT}/settings_valuecol_metrics.json`, JSON.stringify({
  valueEnds,
  uniqueEnds,
  aligned: uniqueEnds.length <= 1 && valueEnds.length >= 2,
  sample: open.filter(l => /Language|Fullscreen|Whale/.test(l)),
}, null, 2) + '\n')
console.log(JSON.stringify({ uniqueEnds, aligned: uniqueEnds.length <= 1, samples: open.filter(l => /Language|Fullscreen|Whale/.test(l)) }, null, 2))
await inst.unmount()
clearSettingsSession()
