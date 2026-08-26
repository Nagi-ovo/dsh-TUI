/**
 * StatusLine TPS track width stability: sparkline / idle / short samples must
 * share a fixed glyph width so working↔idle cannot shove neighbors.
 *
 * Run: node --import tsx/esm scripts/verify-statusline-tps-stable.tsx
 */
process.env.FORCE_COLOR = '3'
process.env.DSH_TUI_LANG = 'en'

import { stripVTControlCharacters } from 'node:util'

let failed = 0
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? `  (${extra})` : ''}`)
  if (!ok) failed += 1
}

async function main(): Promise<void> {
  const {
    renderTpsSparkline,
    renderTpsTrackIdle,
    renderTpsGauge,
    TPS_TRACK_DISPLAY_LEN,
  } = await import('../src/screens/StatusMetrics.js')

  function visibleWidth(ansi: string): number {
    // Display units ≈ stripped length for these ASCII/block glyphs.
    return stripVTControlCharacters(ansi).length
  }

  const idle = renderTpsTrackIdle()
  const short = renderTpsSparkline([{ tps: 10 }, { tps: 20 }, { tps: 30 }])
  const full = renderTpsSparkline(Array.from({ length: 20 }, (_, i) => ({ tps: 10 + i })))
  const empty = renderTpsSparkline([])
  const gauge = renderTpsGauge(42, 80)

  const widths = [idle, short, full, empty, gauge].map(visibleWidth)
  check('idle track width', widths[0] === TPS_TRACK_DISPLAY_LEN, `w=${widths[0]}`)
  check('short sparkline padded', widths[1] === TPS_TRACK_DISPLAY_LEN, `w=${widths[1]}`)
  check('full sparkline width', widths[2] === TPS_TRACK_DISPLAY_LEN, `w=${widths[2]}`)
  check('empty sparkline width', widths[3] === TPS_TRACK_DISPLAY_LEN, `w=${widths[3]}`)
  check('gauge matches sparkline width', widths[4] === TPS_TRACK_DISPLAY_LEN, `w=${widths[4]}`)
  check('all tracks equal width', new Set(widths).size === 1, `widths=${widths}`)

  if (failed > 0) process.exit(1)
  console.log('verify-statusline-tps-stable: all checks passed')
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
