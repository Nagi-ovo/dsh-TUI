/**
 * Tool-card header chrome: elapsed clock is always painted (live while
 * running, final when settled) and the ▾/▴ disclose column is always
 * reserved so settle/hover cannot shove the title.
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

async function headerFor(status: 'running' | 'ok'): Promise<string> {
  const React = (await import('react')).default
  const { render } = await import('../src/ui.js')
  const { AssistantToolUseMessage } = await import('../src/components/messages/AssistantToolUseMessage.js')

  const term = new XTerm({ cols: 80, rows: 12, scrollback: 5, allowProposedApi: true })
  class FakeStdout extends Writable {
    columns = 80
    rows = 12
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
  const tool = {
    callId: 'c1',
    argsText: '{}',
    status,
    startedAt: Date.now() - 5000,
    durationMs: status === 'ok' ? 5000 : undefined,
    name: 'bash',
    callView: { card: 'terminal', title: 'echo hello-from-toolcard-hover' },
    resultView: status === 'ok' ? { card: 'terminal', output: 'hello', exitCode: 0 } : undefined,
    resultFull: status === 'ok' ? 'hello' : undefined,
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
  await sleep(80)
  const header = viewportLines(term, 12).find(l => /Bash|bash|hello-from-toolcard/.test(l)) ?? ''
  await inst.unmount()
  term.dispose()
  return header
}

async function main(): Promise<void> {
  const src = readFileSync(new URL('../src/components/messages/AssistantToolUseMessage.tsx', import.meta.url), 'utf8')
  check(
    'disclose column always rendered',
    src.includes("hovered ? (isExpanded ? '▴' : '▾') : ' '"),
  )
  check('elapsed not gated on !isRunning', !/\{!isRunning && \(/.test(src))

  const running = await headerFor('running')
  const settled = await headerFor('ok')
  check('running header present', /Bash/.test(running) && / · /.test(running), running.slice(0, 80))
  check('settled header present', /Bash/.test(settled) && / · /.test(settled), settled.slice(0, 80))
  const clockRun = running.search(/ · /)
  const clockOk = settled.search(/ · /)
  check('clock column stable on settle', clockRun === clockOk && clockRun >= 0, `${clockRun}→${clockOk}`)
  check('title column stable on settle', running.search(/Bash/i) === settled.search(/Bash/i), `${running.search(/Bash/i)}→${settled.search(/Bash/i)}`)

  if (failed > 0) process.exit(1)
  console.log('verify-toolcard-hover-stable: all checks passed')
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
