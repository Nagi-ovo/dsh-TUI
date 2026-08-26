/**
 * Capture lookable Settings frames (AlternateScreen so the title stays in
 * viewport) plus side-by-side picker chrome for visual QA.
 *
 * Run: node --import tsx/esm scripts/capture-visual-qa-frames.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'
process.env.DSH_TUI_THEME = 'dark'

import { mkdirSync, writeFileSync } from 'node:fs'
import { Writable, PassThrough } from 'node:stream'
import React from 'react'
import xtermPkg from '@xterm/headless'
import { render, AlternateScreen } from '../src/ui.js'
import { Settings } from '../src/screens/Settings.js'
import { ThemePicker } from '../src/components/ThemePicker.js'
import { LangPicker } from '../src/components/LangPicker.js'
import { PermissionsPicker } from '../src/components/PermissionsPicker.js'
import { ThinkingToggle } from '../src/components/ThinkingToggle.js'
import { clearSettingsSession } from '../src/screens/settingsSession.js'
import { sleep, viewportLines } from './lib/term-test.mjs'

const XTerm = xtermPkg.Terminal
const OUT = '/opt/cursor/artifacts'
mkdirSync(OUT, { recursive: true })

function makeIo(cols: number, rows: number) {
  const term = new XTerm({ cols, rows, scrollback: 40, allowProposedApi: true })
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

const host = {
  listNamespaces: () => [
    { ns: 'dsh-tui', revision: 1, applies: 'live' as const, value: { lang: 'en', fullscreen: false, whale: true }, user: {} },
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
      path: ['lang'], label: 'Language',
      hint: 'UI language for the whole interface — applies immediately and is saved.',
      kind: 'select' as const,
      options: [{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }],
    },
    {
      path: ['fullscreen'], label: 'Fullscreen mode',
      hint: 'On: app takes the whole screen (vim/less style), in-app mouse. Off: native scrollback.',
      kind: 'boolean' as const,
    },
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
const s = makeIo(80, 24)
const sInst = await render(
  <AlternateScreen>
    <Settings channel={channel} onClose={() => clearSettingsSession()} />
  </AlternateScreen>,
  { stdout: s.stdout, stdin: s.stdin, stderr: s.stderr, exitOnCtrlC: false, patchConsole: false },
)
await sleep(250)
dump(s.term, 24, 'visual_settings_open')
s.stdin.write('\x1b[B')
await sleep(120)
dump(s.term, 24, 'visual_settings_focus')
s.stdin.write('\x1b[C')
await sleep(120)
dump(s.term, 24, 'visual_settings_status_tab')
await sInst.unmount()
clearSettingsSession()

const pickers: [string, React.ReactNode][] = [
  ['visual_picker_theme', <ThemePicker focusIndex={0} currentTheme="dark" />],
  ['visual_picker_lang', <LangPicker focusIndex={0} currentLang="en" />],
  ['visual_picker_permission', <PermissionsPicker focusIndex={1} currentMode="workspace-write" cwd="/tmp/demo" />],
  ['visual_picker_thinking', <ThinkingToggle focusIndex={0} currentValue={true} />],
]
for (const [name, node] of pickers) {
  const io = makeIo(80, 20)
  const inst = await render(node, {
    stdout: io.stdout, stdin: io.stdin, stderr: io.stderr, exitOnCtrlC: false, patchConsole: false,
  })
  await sleep(100)
  dump(io.term, 20, name)
  await inst.unmount()
}

const open = (await import('node:fs')).readFileSync(`${OUT}/visual_settings_open.txt`, 'utf8')
writeFileSync(`${OUT}/visual_qa_metrics.json`, JSON.stringify({
  settingsTitleVisible: /^Settings\b/m.test(open) || open.includes('\nSettings'),
  settingsHasTabs: /General/.test(open) && /Status bar/.test(open),
  settingsAligned: open.split('\n').filter(l => /(English|Off|On)\s*$/.test(l)).length >= 2,
}, null, 2) + '\n')
console.log('visual QA frames written')
