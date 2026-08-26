/**
 * AskUserQuestionPanel focus chrome: Tab/↓ onto the custom-input row must not
 * open a margin gap that shoves options or the hint (constant marginTop).
 *
 * Env lang pinned before src import. Run:
 *   node --import tsx/esm scripts/verify-askpanel-focus-stable.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'zh'

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
  const { AskUserQuestionPanel } = await import('../src/components/questions/AskUserQuestionPanel.js')

  const question = {
    header: 'probe',
    id: 'q',
    question: 'Pick one?',
    options: [
      { label: 'Alpha', description: 'first' },
      { label: 'Beta', description: 'second' },
    ],
  }

  async function frame(focusInput: boolean): Promise<{ customY: number; hintY: number; alphaY: number; plain: string }> {
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
      React.createElement(AskUserQuestionPanel as any, {
        question,
        multiSelect: false,
        onAnswer: () => {},
        onCancel: () => {},
      }),
      { stdout: new FakeStdout() as any, stdin: stdin as any, stderr: new FakeStderr() as any, exitOnCtrlC: false, patchConsole: false },
    )
    await sleep(100)
    if (focusInput) {
      stdin.write('\x1b[B') // Alpha → Beta
      await sleep(40)
      stdin.write('\x1b[B') // Beta → custom input
      await sleep(80)
    }
    const lines = viewportLines(term, 24)
    const plain = lines.join('\n')
    const alphaY = lines.findIndex(l => /Alpha/.test(l))
    const customY = lines.findIndex(l => /自定义回答|Custom answer/.test(l))
    const hintY = lines.findIndex(l => /↑\/↓/.test(l) || /Esc/.test(l))
    await inst.unmount()
    term.dispose()
    return { customY, hintY, alphaY, plain }
  }

  const a = await frame(false)
  const b = await frame(true)
  check('custom row present', a.customY >= 0 && b.customY >= 0, `a=${a.customY} b=${b.customY}`)
  check('hint present', a.hintY >= 0 && b.hintY >= 0)
  check('custom row does not jump on focus', a.customY === b.customY, `${a.customY}→${b.customY}`)
  check('hint row does not jump on focus', a.hintY === b.hintY, `${a.hintY}→${b.hintY}`)
  check('option row does not jump on focus', a.alphaY === b.alphaY, `${a.alphaY}→${b.alphaY}`)

  if (failed > 0) {
    console.log('--- focus option ---\n' + a.plain)
    console.log('--- focus input ---\n' + b.plain)
    process.exit(1)
  }
  console.log('verify-askpanel-focus-stable: all checks passed')
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
