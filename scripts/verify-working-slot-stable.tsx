/**
 * Working chrome slot: ActivityLine ↔ WorkingSpinner swap must not change
 * bottom-chrome height (prompt Y stays put).
 *
 * Run: node --import tsx/esm scripts/verify-working-slot-stable.tsx
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

async function main(): Promise<void> {
  const React = (await import('react')).default
  const { render, AlternateScreen, Box, Text } = await import('../src/ui.js')
  const { ActivityLine } = await import('../src/components/ActivityLine.js')
  const { WorkingSpinner } = await import('../src/components/WorkingSpinner.js')

  async function frame(kind: 'spinner' | 'activity'): Promise<{ promptY: number; plain: string }> {
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
    const responseLengthRef = { current: 0 }
    const uploadTokensRef = { current: 0 }
    const loadingStartTimeRef = { current: Date.now() }
    const totalPausedMsRef = { current: 0 }
    const pauseStartTimeRef = { current: null as number | null }
    const working = (
      <Box marginTop={1} height={1} overflow="hidden" flexShrink={0} width="100%">
        {kind === 'activity' ? (
          <ActivityLine
            activity={{ line: 'Reading files in the workspace', phase: 'tool', tone: 'info' } as never}
            activityFrames="claude"
            suffix=" · ↓ 12 tokens"
          />
        ) : (
          <WorkingSpinner
            mode="thinking"
            hasActiveTools={false}
            responseLengthRef={responseLengthRef as never}
            uploadTokensRef={uploadTokensRef as never}
            loadingStartTimeRef={loadingStartTimeRef as never}
            totalPausedMsRef={totalPausedMsRef as never}
            pauseStartTimeRef={pauseStartTimeRef as never}
            thinkingStatus="thinking"
          />
        )}
      </Box>
    )
    const tree = (
      <AlternateScreen>
        <Box flexDirection="column" height={16} width={80}>
          <Box flexGrow={1}><Text>transcript</Text></Box>
          {working}
          <Text>❯ prompt-anchor</Text>
          <Text dimColor>status-line</Text>
        </Box>
      </AlternateScreen>
    )
    const inst = await render(tree, {
      stdout: new FakeStdout() as any,
      stdin: new FakeStdin() as any,
      stderr: new FakeStderr() as any,
      exitOnCtrlC: false,
      patchConsole: false,
    })
    await sleep(120)
    const lines = viewportLines(term, 16)
    const promptY = lines.findIndex(l => /prompt-anchor/.test(l))
    await inst.unmount()
    term.dispose()
    return { promptY, plain: lines.join('\n') }
  }

  const a = await frame('spinner')
  const b = await frame('activity')
  check('spinner prompt present', a.promptY >= 0, `y=${a.promptY}`)
  check('activity prompt present', b.promptY >= 0, `y=${b.promptY}`)
  check('prompt Y stable across spinner↔activity', a.promptY === b.promptY, `${a.promptY}→${b.promptY}`)

  if (failed > 0) {
    console.log('--- spinner ---\n' + a.plain)
    console.log('--- activity ---\n' + b.plain)
    process.exit(1)
  }
  console.log('verify-working-slot-stable: all checks passed')
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
