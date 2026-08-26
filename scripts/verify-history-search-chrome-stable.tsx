/**
 * HistorySearchDialog chrome: title/hint rows must stay pinned while focus
 * walks results or the filter empties the list.
 *
 * Run: node --import tsx/esm scripts/verify-history-search-chrome-stable.tsx
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
  const { HistorySearchDialog } = await import('../src/components/HistorySearchDialog.js')

  const COLS = 80
  const ROWS = 24
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

  const matches = Array.from({ length: 8 }, (_, i) => ({
    text: `command number ${i}`,
    ts: Date.now() - i * 60_000,
  }))

  function pins(): { titleY: number; hintY: number } {
    const lines = viewportLines(term, ROWS)
    const titleY = lines.findIndex(l => /History|history/i.test(l))
    const hintY = lines.findIndex(l => /Enter|Esc/i.test(l))
    return { titleY, hintY }
  }

  const app = await render(
    React.createElement(HistorySearchDialog, {
      query: '',
      cursorOffset: 0,
      matches,
      focusIndex: 0,
    }),
    { stdout: new FakeStdout() as any, stdin: new FakeStdin() as any, stderr: new FakeStderr() as any, exitOnCtrlC: false, patchConsole: false },
  )
  await sleep(120)
  const a = pins()

  app.rerender(React.createElement(HistorySearchDialog, {
    query: '',
    cursorOffset: 0,
    matches,
    focusIndex: 3,
  }))
  await sleep(80)
  const b = pins()

  app.rerender(React.createElement(HistorySearchDialog, {
    query: 'zzz',
    cursorOffset: 3,
    matches: [],
    focusIndex: 0,
  }))
  await sleep(80)
  const c = pins()

  check('title row present', a.titleY >= 0, `y=${a.titleY}`)
  check('hint row present', a.hintY >= 0, `y=${a.hintY}`)
  check('title Y stable on focus walk', a.titleY === b.titleY, `${a.titleY}→${b.titleY}`)
  check('hint Y stable on focus walk', a.hintY === b.hintY, `${a.hintY}→${b.hintY}`)
  check('title Y stable on empty filter', a.titleY === c.titleY, `${a.titleY}→${c.titleY}`)
  check('hint Y stable on empty filter', a.hintY === c.hintY, `${a.hintY}→${c.hintY}`)
  check('empty filter shows reserved row', viewportLines(term, ROWS).some(l => /No matching commands/i.test(l)))

  await app.unmount()
  term.dispose()
  if (failed > 0) process.exit(1)
  console.log('verify-history-search-chrome-stable: all checks passed')
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
