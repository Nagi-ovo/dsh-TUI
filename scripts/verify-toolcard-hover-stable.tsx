/**
 * Tool-card hover glyph: ▾/▴ column is always reserved so hover cannot shove
 * the header title by one cell.
 *
 * Run: node --import tsx/esm scripts/verify-toolcard-hover-stable.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'

import { readFileSync } from 'node:fs'
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
  // Structural: idle paints a width-1 disclose cell (space), never mounts on hover.
  const src = readFileSync(new URL('../src/components/messages/AssistantToolUseMessage.tsx', import.meta.url), 'utf8')
  check(
    'disclose column always rendered',
    /width=\{1\}[\s\S]*hovered \? \(isExpanded \? '▴' : '▾'\) : ' '/.test(src)
      || src.includes("hovered ? (isExpanded ? '▴' : '▾') : ' '"),
  )
  check('no mount-on-hover disclose', !src.includes('{hovered && (\n            <Box flexShrink={0}>\n              <Text dimColor>{isExpanded ? \'▴\' : \'▾\'}</Text>'))

  const React = (await import('react')).default
  const { render } = await import('../src/ui.js')
  const { AssistantToolUseMessage } = await import('../src/components/messages/AssistantToolUseMessage.js')

  const tool = {
    callId: 'c1',
    argsText: '{}',
    status: 'ok' as const,
    startedAt: 0,
    durationMs: 12,
    name: 'bash',
    callView: { card: 'terminal', title: 'echo hello-from-toolcard-hover' },
    resultView: { card: 'terminal', output: 'hello', exitCode: 0 },
    resultFull: 'hello',
  }

  const term = new XTerm({ cols: 80, rows: 16, scrollback: 10, allowProposedApi: true })
  class FakeStdout extends Writable {
    columns = 80
    rows = 16
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
  const inst = await render(
    React.createElement(AssistantToolUseMessage as any, {
      tool,
      addMargin: false,
      onClick: () => {},
    }),
    {
      stdout: new FakeStdout() as any,
      stdin: new FakeStdin() as any,
      stderr: new FakeStderr() as any,
      exitOnCtrlC: false,
      patchConsole: false,
    },
  )
  await sleep(100)
  const header = viewportLines(term, 16).find(l => /Bash|bash|hello-from-toolcard/.test(l)) ?? ''
  check('header renders', header.length > 0, header.slice(0, 80))
  check('title column', header.search(/Bash/i) === 2, `at=${header.search(/Bash/i)}`)

  await inst.unmount()
  term.dispose()
  if (failed > 0) process.exit(1)
  console.log('verify-toolcard-hover-stable: all checks passed')
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
