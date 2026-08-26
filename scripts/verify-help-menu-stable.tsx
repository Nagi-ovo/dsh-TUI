/**
 * HelpMenu: fixed viewport chrome must not move when the command list grows
 * (async plugin registration) or when rows are mouse-hovered.
 *
 * Run: node --import tsx/esm scripts/verify-help-menu-stable.tsx
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

function pins(lines: string[], rows: number): { hintY: number; heightOk: boolean } {
  const hintY = lines.findIndex(l => /scroll|PgUp|PgDn/i.test(l))
  return { hintY, heightOk: lines.length === rows }
}

async function main(): Promise<void> {
  const React = (await import('react')).default
  const { render } = await import('../src/ui.js')
  const { HelpMenu } = await import('../src/components/HelpMenu.js')
  const { LOCAL_COMMANDS } = await import('../src/commands.js')

  const COLS = 80
  const ROWS = 24
  const VIEWPORT = 12
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

  const base = LOCAL_COMMANDS.slice(0, 6)
  const grown = [
    ...base,
    ...Array.from({ length: 20 }, (_, i) => ({
      name: `plugin-${i}`,
      description: `Plugin command ${i}`,
      external: true,
    })),
  ]

  const app = await render(
    React.createElement(HelpMenu, {
      commands: base,
      viewportHeight: VIEWPORT,
      viewportWidth: COLS,
      onCommandPick: () => {},
    }),
    { stdout: new FakeStdout() as any, stdin: stdin as any, stderr: new FakeStderr() as any, exitOnCtrlC: false, patchConsole: false },
  )
  await sleep(120)
  const small = pins(viewportLines(term, ROWS), ROWS)

  app.rerender(React.createElement(HelpMenu, {
    commands: grown,
    viewportHeight: VIEWPORT,
    viewportWidth: COLS,
    onCommandPick: () => {},
  }))
  await sleep(120)
  const big = pins(viewportLines(term, ROWS), ROWS)
  check('scroll hint Y stable when list grows', small.hintY === big.hintY, `${small.hintY}→${big.hintY}`)

  stdin.write('\x1b[<35;40;6M')
  await sleep(80)
  const hovered = pins(viewportLines(term, ROWS), ROWS)
  stdin.write('\x1b[<35;1;1M')
  await sleep(80)
  const after = pins(viewportLines(term, ROWS), ROWS)
  check('scroll hint Y stable on command hover', big.hintY === hovered.hintY && hovered.hintY === after.hintY)

  await app.unmount()
  term.dispose()
  if (failed > 0) process.exit(1)
  console.log('verify-help-menu-stable: all checks passed')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
