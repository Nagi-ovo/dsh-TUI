/**
 * ApprovalPanel focus chrome: focused rows must not gain margin that shoves
 * neighbors (marginTop={focused?1:0} was a layout shift on ↑/↓).
 *
 * Run: node --import tsx/esm scripts/verify-approval-focus-stable.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'
process.env.DSH_TUI_THEME = 'dark'

import { Writable, PassThrough } from 'node:stream'
import React from 'react'
import xtermPkg from '@xterm/headless'
import { render } from '../src/ui.js'
import { ApprovalPanel } from '../src/components/approvals/ApprovalPanel.js'
import { sleep, viewportLines } from './lib/term-test.mjs'

const XTerm = xtermPkg.Terminal
let failed = 0
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failed += 1
}

const approval = {
  key: 'a1',
  toolName: 'Bash',
  command: 'ls -la',
  reason: 'list files',
}

async function frame(focusViaDown: boolean): Promise<{ yesY: number; noY: number; plain: string }> {
  const term = new XTerm({ cols: 80, rows: 24, scrollback: 20, allowProposedApi: true })
  class FakeStdout extends Writable {
    columns = 80
    rows = 24
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
    <ApprovalPanel approval={approval as never} onDecide={() => {}} />,
    { stdout: new FakeStdout(), stdin, stderr: new FakeStderr(), exitOnCtrlC: false, patchConsole: false },
  )
  await sleep(120)
  if (focusViaDown) {
    stdin.write('\x1b[B')
    await sleep(100)
  }
  const lines = viewportLines(term, 24)
  const yesY = lines.findIndex(l => /1\.\s/.test(l))
  const noY = lines.findIndex(l => /2\.\s/.test(l))
  await inst.unmount()
  return { yesY, noY, plain: lines.join('\n') }
}

const a = await frame(false)
const b = await frame(true)
check('yes row present', a.yesY >= 0 && b.yesY >= 0)
check('no row present', a.noY >= 0 && b.noY >= 0)
check('yes/no gap stable on focus move', (a.noY - a.yesY) === (b.noY - b.yesY), `gap ${a.noY - a.yesY} → ${b.noY - b.yesY}`)
check('yes row does not jump', a.yesY === b.yesY, `yesY ${a.yesY} → ${b.yesY}`)

if (failed > 0) {
  console.log('--- focus 0 ---\n' + a.plain)
  console.log('--- focus 1 ---\n' + b.plain)
  process.exit(1)
}
console.log('verify-approval-focus-stable: all checks passed')
process.exit(0)
