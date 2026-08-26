/**
 * ExtensionDialog chrome: PickerTitle + PickerHint rows must not move when
 * focus walks confirm rows or when message slot is empty vs filled.
 *
 * Run: node --import tsx/esm scripts/verify-ext-dialog-chrome-stable.tsx
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
  const { ExtensionDialog } = await import('../src/components/ExtensionDialog.js')

  const COLS = 72
  const ROWS = 16
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

  function pins(): { titleY: number; hintY: number } {
    const lines = viewportLines(term, ROWS)
    const titleY = lines.findIndex(l => /Confirm|Delete|Plugin/i.test(l))
    const hintY = lines.findIndex(l => /Enter|Esc/i.test(l))
    return { titleY, hintY }
  }

  const dialog = {
    key: 'd1',
    kind: 'confirm' as const,
    title: 'Delete cache?',
    message: 'This cannot be undone.',
    confirmLabel: 'Delete',
    cancelLabel: 'Keep',
  }
  const app = await render(
    React.createElement(ExtensionDialog, {
      dialog,
      onDecide: () => {},
      onCancel: () => {},
    }),
    { stdout: new FakeStdout() as any, stdin: stdin as any, stderr: new FakeStderr() as any, exitOnCtrlC: false, patchConsole: false },
  )
  await sleep(120)
  const a = pins()
  stdin.write('\x1b[B')
  await sleep(80)
  const b = pins()

  app.rerender(React.createElement(ExtensionDialog, {
    key: 'd2',
    dialog: { ...dialog, key: 'd2', message: undefined },
    onDecide: () => {},
    onCancel: () => {},
  }))
  await sleep(120)
  const c = pins()

  check('title row present', a.titleY >= 0, `y=${a.titleY}`)
  check('hint row present', a.hintY >= 0, `y=${a.hintY}`)
  check('title Y stable on focus walk', a.titleY === b.titleY, `${a.titleY}→${b.titleY}`)
  check('hint Y stable on focus walk', a.hintY === b.hintY, `${a.hintY}→${b.hintY}`)
  check('title Y stable empty message slot', a.titleY === c.titleY, `${a.titleY}→${c.titleY}`)
  check('hint Y stable empty message slot', a.hintY === c.hintY, `${a.hintY}→${c.hintY}`)

  await app.unmount()

  // Input dialog: caret windowing keeps the prefix visible at end-of-line.
  const inputTerm = new XTerm({ cols: COLS, rows: ROWS, scrollback: 0, allowProposedApi: true })
  class InputStdout extends Writable {
    columns = COLS
    rows = ROWS
    isTTY = true
    _write(chunk: unknown, _e: BufferEncoding, cb: () => void) { inputTerm.write(String(chunk), cb) }
  }
  const long = 'plugin-name-' + 'x'.repeat(COLS)
  const inputApp = await render(
    React.createElement(ExtensionDialog, {
      dialog: {
        key: 'in1',
        kind: 'input',
        title: 'Rename plugin',
        initial: long,
        placeholder: 'name',
      },
      onDecide: () => {},
      onCancel: () => {},
    }),
    { stdout: new InputStdout() as any, stdin: new FakeStdin() as any, stderr: new FakeStderr() as any, exitOnCtrlC: false, patchConsole: false },
  )
  await sleep(120)
  const inputLines = viewportLines(inputTerm, ROWS).join('\n')
  const valueLine = inputLines.split('\n').find(l => /x{4,}/.test(l)) ?? ''
  check('input dialog shows windowed tail at caret', /x{6,}/.test(valueLine), valueLine.slice(0, 60))
  check('input dialog hint present', /Enter|Esc/i.test(inputLines))
  await inputApp.unmount()
  inputTerm.dispose()

  term.dispose()
  if (failed > 0) process.exit(1)
  console.log('verify-ext-dialog-chrome-stable: all checks passed')
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
