#!/usr/bin/env node
/**
 * verify-cli-subcommands.mjs — bin/dsh-tui.js 子命令回归。
 *
 * 覆盖：
 *   - `help` / `--help` / `-h`：零环境应答——PATH 上没有 dsh/pnpm、
 *     DSH_HOME 指向空目录时也退出 0 并打印用法，绝不触发自举或委托
 *     （求助命令自己先跑一轮安装是反目标）；
 *   - `version` / `--version` / `-v`：打印本副本版本与角色；profile
 *     未安装时打印双语缺失标记，已安装时打印 profile 版本；
 *   - 双语：DSH_TUI_LANG=en 输出英文，缺省中文（与 bin 的 MSG 契约一致）；
 *   - 只认第一个参数：`dsh-tui <path> --help` 不截获（透传语义不变，
 *     由 verify-launcher.mjs 覆盖透传本身）。
 *
 * 运行：node scripts/verify-cli-subcommands.mjs（不依赖 lib/ 构建产物）
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(root, 'bin', 'dsh-tui.js')
const ownVersion = JSON.parse(
  (await import('node:fs')).readFileSync(join(root, 'package.json'), 'utf8'),
).version

let failures = 0
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failures++
}

// 沙箱 stub 用 POSIX sh 脚本；Windows CI 只跑 compile + 入口 smoke import
// （ci.yml platform-smoke），本脚本不在其中——本地 Windows 直跑时明确跳
// 过，而不是伪装成红。
if (process.platform === 'win32') {
  console.log('SKIP: POSIX-only sandbox (Windows CI runs compile/import smoke only)')
  process.exit(0)
}

const tmp = mkdtempSync(join(tmpdir(), 'verify-cli-sub-'))
const emptyHome = join(tmp, 'dsh-home')
mkdirSync(emptyHome, { recursive: true })
const fakeUserHome = join(tmp, 'user-home')
mkdirSync(fakeUserHome, { recursive: true })

// PATH 指向一个空目录：dsh/pnpm 一定不可见（node 由 process.execPath 绝对
// 路径调用，不查 PATH——nvm 布局下 node 与全局 dsh 同目录，留 node 目录
// 会把真 dsh 漏进沙箱）。任何触发自举/预检的路径都会因找不到 dsh 失败
// 退出——反证子命令没走到那一步。HOME/USERPROFILE 一并指进沙箱，homedir()
// 不落真实账户目录。
const noBin = join(tmp, 'no-bin')
mkdirSync(noBin, { recursive: true })
const run = (args, env = {}) =>
  spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf8',
    env: {
      PATH: noBin,
      DSH_HOME: emptyHome,
      HOME: fakeUserHome,
      USERPROFILE: fakeUserHome,
      DSH_TUI_LANG: 'zh',
      ...env,
    },
  })

// --- help ---------------------------------------------------------------------
for (const alias of ['help', '--help', '-h']) {
  const r = run([alias])
  check(`${alias} 退出 0 且打印用法（无 dsh、空 profile）`, r.status === 0 && r.stdout.includes('用法'), `status=${r.status}`)
}
{
  const r = run(['--help'], { DSH_TUI_LANG: 'en' })
  check('--help 英文输出（DSH_TUI_LANG=en）', r.status === 0 && r.stdout.includes('Usage'))
}

// --- version ------------------------------------------------------------------
for (const alias of ['version', '--version', '-v']) {
  const r = run([alias])
  check(`${alias} 打印本副本版本`, r.status === 0 && r.stdout.includes(ownVersion), `status=${r.status}`)
}
{
  const r = run(['version'])
  check('profile 未安装时打印中文缺失标记', r.stdout.includes('（未安装）'))
}
{
  const r = run(['version'], { DSH_TUI_LANG: 'en' })
  check('profile 未安装时打印英文缺失标记', r.stdout.includes('(not installed)'))
}
{
  // 伪造已安装 profile：version 应打印 profile 版本而不是缺失标记。
  const pkgDir = join(emptyHome, 'profiles', 'dsh-tui', 'node_modules', '@deepseek-harness-tui', 'dsh-tui')
  mkdirSync(pkgDir, { recursive: true })
  writeFileSync(join(pkgDir, 'package.json'), '{"version":"1.2.3-stub"}')
  const r = run(['version'])
  check('profile 已安装时打印 profile 版本', r.status === 0 && r.stdout.includes('1.2.3-stub'))
}

// --- 只认第一个参数 ------------------------------------------------------------
{
  // 独立的全新 DSH_HOME：前面的用例已在 emptyHome 写入 profile 残骸，
  // 复用它会让失败原因变成「委托目标缺 bin」而不是「dsh 预检失败」——
  // 断言就空转了。这里必须验证的是：后位子命令词不截获，进程走正常
  // 启动路径，并在无 dsh 沙箱里以自举预检失败（noDsh 指引）告终。
  const freshHome = join(tmp, 'fresh-home')
  mkdirSync(freshHome, { recursive: true })
  for (const [label, args] of [
    ['后位 --help', ['/no/such/path', '--help']],
    ['后位 version', ['/no/such/path', 'version']],
    ['后位 help', ['--resume', 'help']],
  ]) {
    const r = run(args, { DSH_HOME: freshHome })
    check(
      `${label} 不截获（走启动路径，止于 dsh 预检）`,
      r.status !== 0 && !r.stdout.includes('用法') && !r.stdout.includes(ownVersion) && r.stderr.includes('dsh'),
      `status=${r.status}`,
    )
  }
}

rmSync(tmp, { recursive: true, force: true })
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
