/**
 * Picker loading→loaded chrome: title/hint rows must not move when the
 * catalog list replaces LoadingState (ModelPicker + SkillsPicker).
 *
 * Run: node --import tsx/esm scripts/verify-picker-loading-stable.tsx
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

function pins(lines: string[]): { titleY: number; hintY: number } {
  const titleY = lines.findIndex(l => /Model|Skills/i.test(l))
  const hintY = lines.findIndex(l => /Enter|Esc/i.test(l))
  return { titleY, hintY }
}

async function main(): Promise<void> {
  const React = (await import('react')).default
  const { render, useTerminalSize } = await import('../src/ui.js')
  const { ModelPicker } = await import('../src/components/ModelPicker.js')
  const { SkillsPicker, SkillsPickerLoading } = await import('../src/components/SkillsPicker.js')

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

  // Model loading shell (mirrors Chat.ModelPickerLoading)
  const { Pane } = await import('../src/components/design-system/Pane.js')
  const { Box } = await import('../src/ui.js')
  const { PickerHint, PickerTitle } = await import('../src/components/design-system/PickerChrome.js')
  const { LoadingState } = await import('../src/components/design-system/LoadingState.js')
  const { t } = await import('../src/i18n.js')

  function ModelPickerLoadingProbe(): React.ReactNode {
    const { rows: terminalRows } = useTerminalSize()
    const listSlots = Math.max(terminalRows - 14, 2)
    return React.createElement(Pane, { color: 'permission' }, [
      React.createElement(Box, { flexDirection: 'column', key: 'body' }, [
        React.createElement(PickerTitle, { key: 't' }, t('picker-title-model')),
        React.createElement(Box, { height: listSlots, flexShrink: 0, key: 'list' }, [
          React.createElement(LoadingState, {
            key: 'ls',
            message: t('model-loading'),
            bold: true,
            subtitle: t('model-loading-subtitle'),
          }),
        ]),
      ]),
      React.createElement(PickerHint, { key: 'h', text: t('hint-model-groups') }),
    ])
  }

  const stdin = new FakeStdin()
  const app = await render(
    React.createElement(ModelPickerLoadingProbe),
    { stdout: new FakeStdout() as any, stdin: stdin as any, stderr: new FakeStderr() as any, exitOnCtrlC: false, patchConsole: false },
  )
  await sleep(120)
  const loadingPins = pins(viewportLines(term, ROWS))

  const groups = [{ provider: 'p', label: 'Provider', count: 3 }]
  app.rerender(React.createElement(ModelPicker, {
    groups,
    focusIndex: 0,
    currentProvider: 'p',
    onPick: () => {},
  }))
  await sleep(120)
  const loadedPins = pins(viewportLines(term, ROWS))
  check('model titleY stable loading→loaded', loadingPins.titleY === loadedPins.titleY, `${loadingPins.titleY}→${loadedPins.titleY}`)
  check('model hintY stable loading→loaded', loadingPins.hintY === loadedPins.hintY, `${loadingPins.hintY}→${loadedPins.hintY}`)

  const skills = [
    { name: 'audit', description: 'Audit skill', userInvocable: true, source: 'bundled' },
    { name: 'helper', description: 'Helper skill', userInvocable: true, source: 'user-dsh' },
  ]
  app.rerender(React.createElement(SkillsPickerLoading))
  await sleep(120)
  const skillsLoadPins = pins(viewportLines(term, ROWS))
  app.rerender(React.createElement(SkillsPicker, { skills, focusIndex: 0, onPick: () => {} }))
  await sleep(120)
  const skillsLoadedPins = pins(viewportLines(term, ROWS))
  check('skills titleY stable loading→loaded', skillsLoadPins.titleY === skillsLoadedPins.titleY, `${skillsLoadPins.titleY}→${skillsLoadedPins.titleY}`)
  check('skills hintY stable loading→loaded', skillsLoadPins.hintY === skillsLoadedPins.hintY, `${skillsLoadPins.hintY}→${skillsLoadedPins.hintY}`)

  await app.unmount()
  term.dispose()
  if (failed > 0) process.exit(1)
  console.log('verify-picker-loading-stable: all checks passed')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
