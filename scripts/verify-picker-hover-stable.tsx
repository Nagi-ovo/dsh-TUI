/**
 * Select-based pickers: mouse hover must not move title/hint chrome or
 * description rows (PlanPicker + ActivityPicker + PresetPicker).
 *
 * Run: node --import tsx/esm scripts/verify-picker-hover-stable.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'

import { Writable, PassThrough } from 'node:stream'
import xtermPkg from '@xterm/headless'
import { sleep, viewportLines } from './lib/term-test.mjs'

const XTerm = xtermPkg.Terminal
let failed = 0
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failed += 1
}

function chromePins(lines: string[]): { titleY: number; hintY: number; descYs: number[] } {
  const titleY = lines.findIndex(l => /Plan mode|Activity|Preset/i.test(l))
  const hintY = lines.findIndex(l => /Enter|Esc/i.test(l))
  const descYs = lines.map((l, y) => (l.trim().length > 0 && !/Plan mode|Activity|Preset|Enter|Esc|❯|✓/.test(l) ? y : -1)).filter(y => y >= 0)
  return { titleY, hintY, descYs }
}

async function hoverSweep(
  stdin: PassThrough,
  term: InstanceType<typeof XTerm>,
  rows: number,
  rowYs: number[],
): Promise<void> {
  for (const y of rowYs) {
    stdin.write(`\x1b[<35;12;${y + 1}M`)
    await sleep(40)
  }
  stdin.write('\x1b[<35;1;1M')
  await sleep(40)
}

async function main(): Promise<void> {
  const React = (await import('react')).default
  const { render } = await import('../src/ui.js')
  const { PlanPicker } = await import('../src/components/PlanPicker.js')
  const { ActivityPicker } = await import('../src/components/ActivityPicker.js')
  const { PresetPicker } = await import('../src/components/PresetPicker.js')

  const COLS = 80
  const ROWS = 20
  const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 0, allowProposedApi: true })
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
  const stdin = new FakeStdin()

  const presets = [
    { id: 'default', name: 'Default', description: 'Balanced preset', isDefault: true },
    { id: 'fast', name: 'Fast', description: 'Lower latency routing' },
  ]

  const cases: [string, React.ReactNode][] = [
    ['plan', React.createElement(PlanPicker, { focusIndex: 0, currentOn: true, onPick: () => {} })],
    ['activity', React.createElement(ActivityPicker, { focusIndex: 1, currentPreset: 'dots', onPick: () => {} })],
    ['preset', React.createElement(PresetPicker, { presets, focusIndex: 0, currentPreset: 'default', onPick: () => {} })],
  ]

  for (const [name, node] of cases) {
    const app = await render(node, {
      stdout: new FakeStdout() as any,
      stdin: stdin as any,
      stderr: new FakeStderr() as any,
      exitOnCtrlC: false,
      patchConsole: false,
    })
    await sleep(120)
    const before = chromePins(viewportLines(term, ROWS))
    await hoverSweep(stdin, term, ROWS, before.descYs)
    const after = chromePins(viewportLines(term, ROWS))
    check(`${name} titleY stable on hover`, before.titleY === after.titleY, `${before.titleY}→${after.titleY}`)
    check(`${name} hintY stable on hover`, before.hintY === after.hintY, `${before.hintY}→${after.hintY}`)
    check(`${name} description rows stable`, before.descYs.join(',') === after.descYs.join(','))
    await app.unmount()
    await sleep(60)
  }

  term.dispose()
  if (failed > 0) process.exit(1)
  console.log('verify-picker-hover-stable: all checks passed')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
