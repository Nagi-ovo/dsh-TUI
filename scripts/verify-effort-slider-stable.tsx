/**
 * EffortSlider chrome stability: focusing a tier without a description must
 * not collapse the pane (hint row stays put).
 *
 * Run: node --import tsx/esm scripts/verify-effort-slider-stable.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'
process.env.DSH_TUI_THEME = 'dark'

import { Writable, PassThrough } from 'node:stream'
import React from 'react'
import xtermPkg from '@xterm/headless'
import { render } from '../src/ui.js'
import { EffortSlider } from '../src/components/EffortSlider.js'
import { sleep, viewportLines } from './lib/term-test.mjs'

const XTerm = xtermPkg.Terminal
let failed = 0
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failed += 1
}

const options = [
  { id: 'low', name: 'low', description: 'Faster, lighter reasoning' },
  { id: 'medium', name: 'medium' },
  { id: 'high', name: 'high', description: 'Deeper reasoning, slower' },
]

async function spanAt(focusIndex: number): Promise<number> {
  const term = new XTerm({ cols: 80, rows: 20, scrollback: 10, allowProposedApi: true })
  class FakeStdout extends Writable {
    columns = 80
    rows = 20
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
    <EffortSlider options={options} focusIndex={focusIndex} currentId="medium" />,
    { stdout: new FakeStdout(), stdin: new FakeStdin(), stderr: new FakeStderr(), exitOnCtrlC: false, patchConsole: false },
  )
  await sleep(80)
  const lines = viewportLines(term, 20)
  const titleAt = lines.findIndex(l => /effort|Effort|low|medium|high/i.test(l))
  const footerAt = lines.findIndex(l => /Enter|Esc|done|完成|调整/i.test(l))
  await inst.unmount()
  return titleAt >= 0 && footerAt > titleAt ? footerAt - titleAt + 1 : -1
}

const spans: number[] = []
for (let i = 0; i < options.length; i++) spans.push(await spanAt(i))
check('pane span defined', spans.every(s => s > 0), `spans=${spans}`)
check('pane span stable across focus', new Set(spans).size === 1, `spans=${spans}`)

if (failed > 0) process.exit(1)
console.log('verify-effort-slider-stable: all checks passed')
process.exit(0)
