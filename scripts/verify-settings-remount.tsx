/**
 * Settings remount smoke: interrupt unmount/remount must not crash; auto-saved
 * values remain in the host document (upstream #575 uses component-local state,
 * so focus is not guaranteed to survive remount).
 *
 * Run: node --import tsx/esm scripts/verify-settings-remount.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'

import { Writable, PassThrough } from 'node:stream'
import xtermPkg from '@xterm/headless'
import { sleep, viewportLines, settled } from './lib/term-test.mjs'

const XTerm = xtermPkg.Terminal
const COLS = 80
const ROWS = 24

let failed = 0
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failed += 1
}

async function main(): Promise<void> {
  const React = (await import('react')).default
  const { render, AlternateScreen } = await import('../src/ui.js')
  const { Settings } = await import('../src/screens/Settings.js')

  function makeTerm() {
    const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 40, allowProposedApi: true })
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
    return { term, stdout: new FakeStdout(), stdin: new FakeStdin(), stderr: new FakeStderr() }
  }

  function frame(term: InstanceType<typeof XTerm>): string {
    return viewportLines(term, ROWS).join('\n')
  }

  const docs: Record<string, { revision: number; value: Record<string, unknown>; user: Record<string, unknown> }> = {
    'dsh-tui': { revision: 1, value: { lang: 'en', fullscreen: false }, user: {} },
  }
  const host = {
    listNamespaces: () => Object.entries(docs).map(([ns, doc]) => ({
      ns, revision: doc.revision, applies: 'live' as const, value: { ...doc.value }, user: { ...doc.user },
    })),
    write: (ns: string, ops: readonly { op: string; path: readonly string[]; value?: unknown }[], expected?: number) => {
      const doc = docs[ns]
      if (doc === undefined) return Promise.reject(new Error(`unknown namespace ${ns}`))
      if (expected !== undefined && expected !== doc.revision) {
        return Promise.reject(Object.assign(new Error('stale'), { code: 'SETTINGS_CONFLICT' }))
      }
      for (const op of ops) {
        let parent = doc.value
        for (const segment of op.path.slice(0, -1)) {
          const child = parent[segment]
          if (typeof child === 'object' && child !== null && !Array.isArray(child)) parent = child as Record<string, unknown>
          else {
            const created: Record<string, unknown> = {}
            parent[segment] = created
            parent = created
          }
        }
        const leaf = op.path.at(-1)
        if (leaf === undefined) continue
        if (op.op === 'set') parent[leaf] = op.value
        else delete parent[leaf]
      }
      doc.revision += 1
      return Promise.resolve()
    },
    credentialConfigured: async () => false,
    writeCredential: async () => {},
  }
  const section = {
    ns: 'dsh-tui',
    title: 'dsh-tui',
    fields: [
      {
        path: ['lang'], label: 'Language',
        kind: 'select' as const,
        options: [{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }],
      },
      {
        path: ['fullscreen'], label: 'Fullscreen mode',
        kind: 'boolean' as const,
      },
    ],
  }
  const channel: any = {
    settingsHost: () => host,
    settingsSections: () => [section],
    subscribeSettingsSections: () => () => {},
  }

  const first = makeTerm()
  let closed = false
  const instance1 = await render(
    React.createElement(
      AlternateScreen,
      null,
      React.createElement(Settings as any, {
        channel,
        onClose: () => { closed = true },
      }),
    ),
    {
      stdout: first.stdout as any,
      stdin: first.stdin as any,
      stderr: first.stderr as any,
      patchConsole: false,
      exitOnCtrlC: false,
    },
  )
  await sleep(200)
  first.stdin.write('\x1b[B')
  await sleep(120)
  first.stdin.write('\r')
  check(await settled(() => docs['dsh-tui']?.value.fullscreen === true), 'toggle auto-saved before remount')
  await instance1.unmount()
  check('interrupt unmount without close', closed === false)

  const second = makeTerm()
  const instance2 = await render(
    React.createElement(
      AlternateScreen,
      null,
      React.createElement(Settings as any, {
        channel,
        onClose: () => { closed = true },
      }),
    ),
    {
      stdout: second.stdout as any,
      stdin: second.stdin as any,
      stderr: second.stderr as any,
      patchConsole: false,
      exitOnCtrlC: false,
    },
  )
  await sleep(250)
  const afterRemount = frame(second.term)
  check('remount renders settings', /^Settings/.test(afterRemount.split('\n')[0] ?? ''))
  check('saved value survives remount', docs['dsh-tui']?.value.fullscreen === true)
  check('remount shows checked chip', /\[\s*✓\s*\]/.test(afterRemount) || /\[\s*✓\]/.test(afterRemount), afterRemount.slice(0, 240))

  second.stdin.write('\x1b')
  await sleep(150)
  await instance2.unmount()
  check('close callback reachable', closed === true)

  first.term.dispose()
  second.term.dispose()
  process.exit(failed ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
