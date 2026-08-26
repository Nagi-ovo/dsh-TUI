/**
 * SuggestionCard footer row must stay reserved so crossing the window
 * boundary (scroll indicators appearing/disappearing) cannot change card
 * height — the bottom ╰ border must not jump when ↑/↓ moves selection.
 *
 * Run: node --import tsx/esm scripts/verify-suggestion-card-stable.tsx
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

function bottomBorderY(lines: string[]): number {
  return lines.findIndex(line => line.includes('╰'))
}

async function main(): Promise<void> {
  const React = (await import('react')).default
  const { render } = await import('../src/ui.js')
  const { CommandSuggestions } = await import('../src/components/CommandSuggestions.js')
  const { LOCAL_COMMANDS } = await import('../src/commands.js')

  const COLS = 60
  const ROWS = 20
  const commands = LOCAL_COMMANDS.filter(c => !c.skill).slice(0, 12)
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
    React.createElement(CommandSuggestions, {
      commands,
      selectedIndex: 0,
      columns: COLS,
    }),
    {
      stdout: new FakeStdout() as any,
      stdin: new FakeStdin() as any,
      stderr: new FakeStderr() as any,
      exitOnCtrlC: false,
      patchConsole: false,
    },
  )
  await sleep(120)

  const yTop = bottomBorderY(viewportLines(term, ROWS))
  check('top selection bottom border present', yTop >= 0, `y=${yTop}`)

  app.rerender(React.createElement(CommandSuggestions, {
    commands,
    selectedIndex: commands.length - 1,
    columns: COLS,
  }))
  await sleep(120)

  const linesBottom = viewportLines(term, ROWS)
  const yBottom = bottomBorderY(linesBottom)
  check('bottom selection bottom border present', yBottom >= 0, `y=${yBottom}`)
  check('bottom border Y stable across window scroll', yTop === yBottom, `${yTop}→${yBottom}`)

  const footerLine = linesBottom.find(line => line.includes('↓') || line.includes('↑'))
  check('scroll indicator visible at bottom', footerLine !== undefined, '')

  await app.unmount()
  term.dispose()

  if (failed > 0) process.exit(1)
  console.log('verify-suggestion-card-stable: all checks passed')
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
