/**
 * ThemePicker list height: footer hint must stay on-screen on short terminals.
 * Fixed visibleOptionCount=6 × 2-line rows overflowed inline 18-row viewports.
 *
 * Run: node --import tsx/esm scripts/verify-theme-picker-slots.tsx
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

async function main(): Promise<void> {
  const React = (await import('react')).default
  const { render } = await import('../src/ui.js')
  const { ThemePicker } = await import('../src/components/ThemePicker.js')

  const COLS = 80
  const ROWS = 18
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

  const app = await render(
    React.createElement(ThemePicker, { focusIndex: 0, currentTheme: 'dark', onPick: () => {} }),
    { stdout: new FakeStdout() as any, stdin: new FakeStdin() as any, stderr: new FakeStderr() as any, exitOnCtrlC: false, patchConsole: false },
  )
  await sleep(120)
  const lines = viewportLines(term, ROWS)
  const titleY = lines.findIndex(l => /Theme|theme/i.test(l))
  const hintY = lines.findIndex(l => /Enter|Esc/i.test(l))
  check('title present', titleY >= 0, `y=${titleY}`)
  check('footer hint on screen', hintY >= 0 && hintY < ROWS, `hintY=${hintY} rows=${ROWS}`)
  check('footer below title', hintY > titleY, `title=${titleY} hint=${hintY}`)
  // listSlots at 18 rows = 4 screen lines → 2 visible options (4 lines), not 6×2=12.
  const themeRows = lines.filter(l => /dark|light|auto|built/i.test(l)).length
  check('option window capped for short terminal', themeRows <= 4, `rows=${themeRows}`)

  await app.unmount()
  term.dispose()
  if (failed > 0) process.exit(1)
  console.log('verify-theme-picker-slots: all checks passed')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
