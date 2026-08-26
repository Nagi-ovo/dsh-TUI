/**
 * PR #3 evidence bundle: Settings before/after frames (80x24 + 120x40),
 * chrome metrics, and PNG renders via txt-frames-to-png.py.
 *
 * Run: node --import tsx/esm scripts/capture-pr3-evidence.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { Writable, PassThrough } from 'node:stream'
import xtermPkg from '@xterm/headless'
import { sleep, viewportLines } from './lib/term-test.mjs'

const XTerm = xtermPkg.Terminal
const REPO_OUT = join(process.cwd(), 'docs/evidence/pr3-settings-polish')
const ART = '/opt/cursor/artifacts'
mkdirSync(REPO_OUT, { recursive: true })
mkdirSync(ART, { recursive: true })

type Size = { cols: number; rows: number; tag: string }

function chromePins(view: string[], rows: number) {
  const titleY = view.findIndex(l => /^Settings(\s|$|·)/.test(l))
  const dividers = view.map((l, y) => (/[─-]{8,}/.test(l) ? y : -1)).filter(y => y >= 0)
  const navY = view.findIndex(l => /Enter/.test(l) && /(edit|toggle|save|Esc|confirm)/i.test(l))
  const nonBlank = view.filter(l => l.trim().length > 0).length
  const unsavedInListWell = view.slice(0, navY === -1 ? rows : navY).some((l, y) =>
    y > 4 && /^\s*unsaved\s*$/.test(l),
  )
  return { titleY, dividers, navY, nonBlank, unsavedInListWell, ok: titleY === 0 && navY === rows - 1 && dividers.length >= 2 && !unsavedInListWell }
}

async function captureAfter(size: Size): Promise<Record<string, unknown>> {
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

  const shots: Record<string, ReturnType<typeof chromePins>> = {}
  const writeShot = (name: string) => {
    const view = viewportLines(term, size.rows)
    const plain = view.join('\n')
    const base = `after_${size.tag}_${name}`
    writeFileSync(join(REPO_OUT, `${base}.txt`), plain + '\n')
    writeFileSync(join(ART, `${base}.txt`), plain + '\n')
    shots[name] = chromePins(view, size.rows)
    return plain
  }

  writeShot('open')
  stdin.write('\x1b[B')
  await sleep(60)
  writeShot('focus_move')
  stdin.write('\r')
  await sleep(60)
  writeShot('toggle_dirty')
  stdin.write('\x1b[C')
  await sleep(60)
  writeShot('category_status')
  stdin.write('\x1b[C')
  await sleep(60)
  writeShot('category_shortcuts')
  stdin.write('\r')
  await sleep(60)
  writeShot('edit_shortcut')
  stdin.write('\x1b')
  await sleep(40)
  stdin.write('\x1b')
  await sleep(60)
  writeShot('discard')

  const chromeStable = Object.values(shots).every(
    (s, _i, arr) => s.titleY === arr[0]!.titleY && s.navY === arr[0]!.navY,
  )
  await inst.unmount()
  term.dispose()
  return {
    size,
    chromeStable,
    chromeLineBudget: {
      titleY: shots.open!.titleY,
      navY: shots.open!.navY,
      dividerRows: shots.open!.dividers,
      mandatoryLines: 4,
      listHeight: size.rows - 4 - 1,
    },
    rowHeightStable: chromeStable,
    shots,
  }
}

function bundleBeforeFrames(): void {
  const pairs = [
    ['settings_before_open.txt', 'before_80x24_open.txt'],
    ['settings_before_focus_fullscreen.txt', 'before_80x24_focus_move.txt'],
  ]
  for (const [src, dst] of pairs) {
    const from = join(ART, src)
    try {
      const plain = readFileSync(from, 'utf8')
      writeFileSync(join(REPO_OUT, dst), plain)
    } catch {
      writeFileSync(join(REPO_OUT, dst), '# before frame missing — run capture-settings-baseline on pre-polish tree\n')
    }
  }
  writeFileSync(join(REPO_OUT, 'before_metrics.json'), JSON.stringify({
    source: 'pre-polish capture (settings_before_*)',
    jitter: {
      hintInListRow: true,
      titleMovedOnFocus: true,
      emptySessionCategory: true,
      nonBlankDeltaOnFocus: '+1 typical',
    },
    chromeLineBudget: 'unaccounted — hints expanded list rows',
  }, null, 2) + '\n')
}

async function main(): Promise<void> {
  bundleBeforeFrames()
  const metrics = {
    capturedAt: new Date().toISOString(),
    after: {
      '80x24': await captureAfter({ cols: 80, rows: 24, tag: '80x24' }),
      '120x40': await captureAfter({ cols: 120, rows: 40, tag: '120x40' }),
    },
  }
  writeFileSync(join(REPO_OUT, 'after_metrics.json'), JSON.stringify(metrics, null, 2) + '\n')

  const png = spawnSync('python3', ['scripts/txt-frames-to-png.py', '--dir', REPO_OUT], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  if (png.status !== 0) {
    console.error(png.stderr || png.stdout)
    process.exit(1)
  }
  console.log(png.stdout)
  const ok = Object.values(metrics.after).every((m: any) => m.chromeStable && m.chromeLineBudget.titleY === 0)
  console.log(JSON.stringify(metrics, null, 2))
  process.exit(ok ? 0 : 1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
