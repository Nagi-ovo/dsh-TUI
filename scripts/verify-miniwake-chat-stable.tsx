/**
 * Working-idle Chat render regression: animation clocks must live in leaf
 * components so channel.working does not commit the full transcript tree.
 *
 * Before MiniWake fix: Chat useAnimationFrame(120) → ~20 renders/2.4s.
 * After MiniWake: title setInterval(960) in Chat → ~6 renders/2.4s.
 * After title leaf: idle working window → ≤2 renders/2.4s (stream bumps only).
 *
 * Run: node --import tsx/esm scripts/verify-miniwake-chat-stable.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.TERM_PROGRAM = 'kitty'
process.env.DSH_TUI_THEME = 'dark'
process.env.DSH_TUI_CHAT_RENDER_PROBE = '1'

const [{ PassThrough, Writable }, React, { Terminal: XTerm }, { render, AlternateScreen }, { Chat, readChatRenderProbe, resetChatRenderProbe }, { QuestionStore }, { sleep }] = await Promise.all([
  import('node:stream'),
  import('react'),
  import('@xterm/headless'),
  import('../src/ui.js'),
  import('../src/screens/Chat.js'),
  import('../src/dsh-adapter/questions.js'),
  import('./lib/term-test.mjs'),
])

const COLS = 100
const ROWS = 32
let failed = 0
function check(name: string, ok: boolean, extra = '') {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  (' + extra + ')' : ''))
  if (!ok) failed += 1
}

const term = new XTerm({ cols: COLS, rows: ROWS, scrollback: 0, allowProposedApi: true })
class FakeStdout extends Writable {
  columns = COLS
  rows = ROWS
  isTTY = true
  _write(chunk: unknown, _e: BufferEncoding, cb: () => void) { term.write(String(chunk), cb) }
}
class FakeStderr extends Writable { isTTY = true; _write(_c: unknown, _e: BufferEncoding, cb: () => void) { cb() } }
class FakeStdin extends PassThrough { isTTY = true; setRawMode() { return this }; ref() { return this }; unref() { return this } }
const stdout = new FakeStdout() as any
const stderr = new FakeStderr() as any
const stdin = new FakeStdin() as any

let frameCount = 0

const listeners = new Set<() => void>()
const rows: any[] = []
let id = 0
for (let t = 0; t < 40; t++) {
  rows.push({ id: id++, kind: 'user', text: 'task ' + t })
  rows.push({
    id: id++, kind: 'tool', text: '',
    tool: {
      callId: 'c' + t, name: 'Read', argsText: '{}', argsFull: '{}',
      status: 'ok', startedAt: 0, durationMs: 10, resultText: 'ok',
    },
  })
  rows.push({ id: id++, kind: 'assistant', text: 'done ' + t, streaming: false })
}
const channel: any = {
  version: 0, rows, status: 'working', sessionTitle: 'miniwake', agentId: 'x',
  model: 'deepseek-v4-flash', reasoningEffort: 'max',
  tokens: { input: 100, output: 40 }, cwd: '/tmp/demo', displayCwd: '/tmp/demo',
  gitBranch: 'main', working: true, spinnerMode: 'requesting', responseChars: 0,
  activeToolCount: 1, turnStart: Date.now(), lastUserText: 'task 39',
  pending: [], commandList: [], notifications: [],
  mode: { plan: false }, effortLevels: undefined,
  subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb) },
  submit: () => {}, cancel: () => {}, clear: () => {}, notify: () => {},
  listModels: () => Promise.resolve([]), listSessions: () => [],
  setResumeTarget: () => {}, loadOlder: () => {}, mcpStatus: () => [],
}

await render(
  <AlternateScreen>
    <Chat channel={channel} questionStore={new QuestionStore()} trajectorySeen />
  </AlternateScreen>,
  { stdout, stdin, stderr, exitOnCtrlC: false, patchConsole: false, onFrame: () => { frameCount++ } },
)

// rows.length > 30 skips Logo intro; longer settle absorbs layout/timeline reports.
await sleep(1800)

const chatRendersBefore = readChatRenderProbe()
resetChatRenderProbe()
const framesBefore = frameCount
await sleep(2400)
const chatRendersDuring = readChatRenderProbe()
const paintFramesDuring = frameCount - framesBefore

// 修复前：wake tick ~20/2.4s；仅隔离 wake 后标题 tick ~6/2.4s；
// 标题时钟也移出 Chat 后应 ≤2/2.4s（无 channel.version bump）。
check('working 空闲窗口 Chat 不因动画时钟重渲染', chatRendersDuring <= 2, 'chatRenders=' + chatRendersDuring + ' (wake-only ~6/2.4s, pre-wake ~20/2.4s)')
check('MiniWake 动画仍产生 paint 帧', paintFramesDuring >= 8, 'paintFrames=' + paintFramesDuring)
check('初始 mount 后 probe 有计数', chatRendersBefore >= 1, 'before=' + chatRendersBefore)

console.log(failed === 0 ? '\nALL PASS' : '\n' + failed + ' 项失败')
process.exit(failed === 0 ? 0 : 1)
