/**
 * Capture Settings remount before/after frames + ModelPicker height stability
 * metrics for the polish PR. Writes under /opt/cursor/artifacts/.
 *
 * Run: node --import tsx/esm scripts/capture-settings-remount.tsx
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
import { ModelPicker } from '../src/components/ModelPicker.js'
import { clearSettingsSession } from '../src/screens/settingsSession.js'
import { sleep, viewportLines } from './lib/term-test.mjs'
import type { LlmModelInfo } from '../src/dsh-adapter/types.js'

const XTerm = xtermPkg.Terminal
const OUT = '/opt/cursor/artifacts'
mkdirSync(OUT, { recursive: true })

function makeIo(cols: number, rows: number) {
  const term = new XTerm({ cols, rows, scrollback: 80, allowProposedApi: true })
  class FakeStdout extends Writable {
    columns = cols
    rows = rows
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

function dump(term: InstanceType<typeof XTerm>, rows: number, name: string): string {
  const plain = viewportLines(term, rows).join('\n')
  writeFileSync(`${OUT}/${name}.txt`, plain + '\n')
  return plain
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
    { path: ['lang'], label: 'Language', kind: 'select' as const,
      options: [{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }] },
    { path: ['fullscreen'], label: 'Fullscreen mode',
      hint: 'On: app takes the whole screen (vim/less style).', kind: 'boolean' as const },
    { path: ['statusBar', 'model'], label: 'Show model', group: 'status-bar', kind: 'boolean' as const },
  ],
}
const channel: any = {
  settingsHost: () => host,
  settingsSections: () => [section],
  subscribeSettingsSections: () => () => {},
}

clearSettingsSession()
const a = makeIo(80, 24)
const i1 = await render(
  <Settings channel={channel} onClose={() => {}} />,
  { stdout: a.stdout, stdin: a.stdin, stderr: a.stderr, exitOnCtrlC: false, patchConsole: false },
)
await sleep(200)
a.stdin.write('\x1b[B')
await sleep(100)
a.stdin.write('\r')
await sleep(150)
const before = dump(a.term, 24, 'settings_remount_before')
await i1.unmount()

const b = makeIo(80, 24)
const i2 = await render(
  <Settings channel={channel} onClose={() => clearSettingsSession()} />,
  { stdout: b.stdout, stdin: b.stdin, stderr: b.stderr, exitOnCtrlC: false, patchConsole: false },
)
await sleep(250)
const after = dump(b.term, 24, 'settings_remount_after')
await i2.unmount()
clearSettingsSession()

// ModelPicker height stability: mixed description catalog, walk focus.
const models: LlmModelInfo[] = Array.from({ length: 12 }, (_, i) => ({
  provider: 'demo',
  id: `m${i}`,
  name: `model-${i}`,
  description: i % 3 === 0 ? `desc for model ${i}` : undefined,
}))
const heights: number[] = []
const spans: number[] = []
for (let focus = 0; focus < models.length; focus++) {
  const io = makeIo(100, 30)
  const inst = await render(
    <ModelPicker
      models={models}
      showBack={false}
      focusIndex={focus}
      currentModel="demo/m0"
    />,
    { stdout: io.stdout, stdin: io.stdin, stderr: io.stderr, exitOnCtrlC: false, patchConsole: false },
  )
  await sleep(80)
  const lines = viewportLines(io.term, 30)
  const titleAt = lines.findIndex(l => /Model|模型/.test(l))
  const footerAt = lines.findIndex(l => /Enter/.test(l))
  spans.push(titleAt >= 0 && footerAt > titleAt ? footerAt - titleAt + 1 : -1)
  heights.push(lines.filter(l => l.trim() !== '').length)
  if (focus === 0) dump(io.term, 30, 'modelpicker_height_focus0')
  if (focus === 5) dump(io.term, 30, 'modelpicker_height_focus5')
  await inst.unmount()
}

const uniqueSpans = [...new Set(spans)]
writeFileSync(`${OUT}/settings_remount_metrics.json`, JSON.stringify({
  remount: {
    beforeHasFullscreen: /Fullscreen/.test(before),
    afterHasFullscreen: /Fullscreen/.test(after),
    beforeDirtyOn: /\bOn\b/.test(before) && /\*/.test(before),
    afterDirtyOn: /\bOn\b/.test(after) && /\*/.test(after),
    beforeFocusPointer: before.split('\n').some(l => /❯/.test(l) && /Fullscreen/.test(l)),
    afterFocusPointer: after.split('\n').some(l => /❯/.test(l) && /Fullscreen/.test(l)),
  },
  modelPicker: {
    heights,
    spans,
    uniqueSpans,
    stablePaneSpan: uniqueSpans.length === 1,
  },
}, null, 2) + '\n')

console.log(JSON.stringify({
  remountOk: /Fullscreen/.test(after) && /\*/.test(after),
  modelStable: uniqueSpans.length === 1,
  uniqueSpans,
}, null, 2))
