/**
 * Capture EffortSlider description-slot stability (before/after metric).
 * Run: node --import tsx/esm scripts/capture-effort-slider-stable.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'
process.env.DSH_TUI_THEME = 'dark'

import { mkdirSync, writeFileSync } from 'node:fs'
import { Writable, PassThrough } from 'node:stream'
import React from 'react'
import xtermPkg from '@xterm/headless'
import { render } from '../src/ui.js'
import { EffortSlider } from '../src/components/EffortSlider.js'
import { sleep, viewportLines } from './lib/term-test.mjs'

const XTerm = xtermPkg.Terminal
const OUT = '/opt/cursor/artifacts'
mkdirSync(OUT, { recursive: true })

const options = [
  { id: 'low', name: 'low', description: 'Faster, lighter reasoning' },
  { id: 'medium', name: 'medium' }, // no description — used to collapse the pane
  { id: 'high', name: 'high', description: 'Deeper reasoning, slower' },
  { id: 'max', name: 'max', description: 'Maximum effort' },
]

async function spanAt(focusIndex: number): Promise<{ span: number; lines: string[] }> {
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
  const titleAt = lines.findIndex(l => /effort|Effort|推理|档位/i.test(l) || /low|medium|high/.test(l))
  const footerAt = lines.findIndex(l => /Enter|Esc|done|完成|调整/i.test(l))
  const span = titleAt >= 0 && footerAt > titleAt ? footerAt - titleAt + 1 : -1
  await inst.unmount()
  return { span, lines }
}

const spans: number[] = []
const dumps: string[] = []
for (let i = 0; i < options.length; i++) {
  const { span, lines } = await spanAt(i)
  spans.push(span)
  dumps.push(`--- focus ${i} (${options[i]!.id}) span=${span} ---\n` + lines.filter(l => l.trim()).join('\n'))
  writeFileSync(`${OUT}/effort_focus_${i}.txt`, lines.join('\n') + '\n')
}
writeFileSync(`${OUT}/effort_slider_metrics.json`, JSON.stringify({
  spans,
  unique: [...new Set(spans)],
  stable: new Set(spans).size === 1,
}, null, 2) + '\n')
writeFileSync(`${OUT}/effort_slider_dump.txt`, dumps.join('\n\n') + '\n')
console.log(JSON.stringify({ spans, unique: [...new Set(spans)], stable: new Set(spans).size === 1 }, null, 2))
