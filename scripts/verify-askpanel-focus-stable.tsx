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

  async function frame(opts: {
    focusInput: boolean
    multiSelect?: boolean
    withBack?: boolean
    cols?: number
  }): Promise<{ customY: number; hintY: number; alphaY: number; hintSpan: number; plain: string }> {
    const cols = opts.cols ?? 80
    const term = new XTerm({ cols, rows: 24, scrollback: 20, allowProposedApi: true })
    class FakeStdout extends Writable {
      columns = cols
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
        multiSelect: opts.multiSelect === true,
        onAnswer: () => {},
        onCancel: () => {},
        onBack: opts.withBack === true ? () => {} : undefined,
      }),
      { stdout: new FakeStdout() as any, stdin: stdin as any, stderr: new FakeStderr() as any, exitOnCtrlC: false, patchConsole: false },
    )
    await sleep(100)
    if (opts.focusInput) {
      stdin.write('\x1b[B')
      await sleep(40)
      stdin.write('\x1b[B')
      await sleep(80)
    }
    const lines = viewportLines(term, 24)
    const plain = lines.join('\n')
    const alphaY = lines.findIndex(l => /Alpha/.test(l))
    const customY = lines.findIndex(l => /自定义回答|Custom answer/.test(l))
    // Footer hint only — do not match the custom-input placeholder「直接输入…」.
    const hintY = lines.findIndex(l => /Esc/.test(l) && (/Enter/.test(l) || /↑/.test(l) || /↓/.test(l)))
    const hintSpan = hintY < 0 ? -1 : 1
    await inst.unmount()
    term.dispose()
    return { customY, hintY, alphaY, hintSpan, plain }
  }

  const a = await frame({ focusInput: false })
  const b = await frame({ focusInput: true })
  check('custom row present', a.customY >= 0 && b.customY >= 0, `a=${a.customY} b=${b.customY}`)
  check('hint present', a.hintY >= 0 && b.hintY >= 0)
  check('custom row does not jump on focus', a.customY === b.customY, `${a.customY}→${b.customY}`)
  check('hint row does not jump on focus', a.hintY === b.hintY, `${a.hintY}→${b.hintY}`)
  check('option row does not jump on focus', a.alphaY === b.alphaY, `${a.alphaY}→${b.alphaY}`)

  // Multi + back + narrower width: option hint is longer than input hint —
  // without height={1} truncate this used to drop a line on Tab to input.
  const m0 = await frame({ focusInput: false, multiSelect: true, withBack: true, cols: 64 })
  const m1 = await frame({ focusInput: true, multiSelect: true, withBack: true, cols: 64 })
  check('multi hint row stable on focus', m0.hintY === m1.hintY && m0.hintY >= 0, `${m0.hintY}→${m1.hintY}`)
  check('multi option row stable on focus', m0.alphaY === m1.alphaY, `${m0.alphaY}→${m1.alphaY}`)
  check('multi custom row stable on focus', m0.customY === m1.customY, `${m0.customY}→${m1.customY}`)

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
