/**
 * PR #3 picker polish evidence: loading→loaded + hover-stable frames.
 *
 * Run: node --import tsx/esm scripts/capture-pr3-picker-evidence.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'

import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { Writable, PassThrough } from 'node:stream'
import xtermPkg from '@xterm/headless'
import { sleep, viewportLines } from './lib/term-test.mjs'

const XTerm = xtermPkg.Terminal
const REPO_OUT = join(process.cwd(), 'docs/evidence/pr3-settings-polish')
const ART = '/opt/cursor/artifacts'
mkdirSync(REPO_OUT, { recursive: true })
mkdirSync(ART, { recursive: true })

async function capture(name: string, node: React.ReactNode, stdinEvents?: (stdin: PassThrough) => Promise<void>): Promise<void> {
  const React = (await import('react')).default
  const { render, useTerminalSize } = await import('../src/ui.js')
  const COLS = 80
  const ROWS = 20
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
  const app = await render(node, {
    stdout: new FakeStdout() as any,
    stdin: stdin as any,
    stderr: new FakeStderr() as any,
    exitOnCtrlC: false,
    patchConsole: false,
  })
  await sleep(120)
  if (stdinEvents) await stdinEvents(stdin)
  const plain = viewportLines(term, ROWS).join('\n')
  writeFileSync(join(REPO_OUT, `${name}.txt`), plain + '\n')
  writeFileSync(join(ART, `${name}.txt`), plain + '\n')
  await app.unmount()
  term.dispose()
}

async function main(): Promise<void> {
  const React = (await import('react')).default
  const { PlanPicker } = await import('../src/components/PlanPicker.js')
  const { SkillsPicker, SkillsPickerLoading } = await import('../src/components/SkillsPicker.js')
  const { Pane } = await import('../src/components/design-system/Pane.js')
  const { Box, useTerminalSize } = await import('../src/ui.js')
  const { PickerHint, PickerTitle } = await import('../src/components/design-system/PickerChrome.js')
  const { LoadingState } = await import('../src/components/design-system/LoadingState.js')
  const { t } = await import('../src/i18n.js')

  function ModelPickerLoadingFrame(): React.ReactNode {
    const { rows: terminalRows } = useTerminalSize()
    const listSlots = Math.max(terminalRows - 14, 2)
    return React.createElement(Pane, { color: 'permission' }, [
      React.createElement(Box, { flexDirection: 'column', key: 'b' }, [
        React.createElement(PickerTitle, { key: 't' }, t('picker-title-model')),
        React.createElement(Box, { height: listSlots, flexShrink: 0, key: 'l' }, [
          React.createElement(LoadingState, { key: 's', message: t('model-loading'), bold: true, subtitle: t('model-loading-subtitle') }),
        ]),
      ]),
      React.createElement(PickerHint, { key: 'h', text: t('hint-model-groups') }),
    ])
  }

  await capture('after_80x24_model_loading', React.createElement(ModelPickerLoadingFrame))
  await capture('after_80x24_plan_picker', React.createElement(PlanPicker, { focusIndex: 0, currentOn: true, onPick: () => {} }))
  await capture('after_80x24_plan_hover', React.createElement(PlanPicker, { focusIndex: 0, currentOn: true, onPick: () => {} }), async stdin => {
    stdin.write('\x1b[<35;12;7M')
    await sleep(80)
  })
  await capture('after_80x24_skills_loading', React.createElement(SkillsPickerLoading))
  const skills = [
    { name: 'audit', description: 'Audit', userInvocable: true, source: 'bundled' },
    { name: 'helper', description: 'Helper', userInvocable: true, source: 'user-dsh' },
  ]
  await capture('after_80x24_skills_loaded', React.createElement(SkillsPicker, { skills, focusIndex: 0, onPick: () => {} }))

  const png = spawnSync('python3', ['scripts/txt-frames-to-png.py', '--dir', REPO_OUT], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  if (png.status !== 0) {
    console.error(png.stderr || png.stdout)
    process.exit(1)
  }
  console.log(png.stdout)
  console.log('picker evidence captured')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
