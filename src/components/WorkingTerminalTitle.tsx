import React from 'react'
import { useTerminalTitle } from '../ink/hooks/use-terminal-title.js'
import { useTerminalFocus } from '../ink/hooks/use-terminal-focus.js'

/** Terminal-title spinner frames (CC's TITLE_ANIMATION_FRAMES). */
const TITLE_ANIMATION_FRAMES = ['⠂', '⠐']
const TITLE_FRAME_MS = 960

/**
 * Side-effect-only leaf: owns the working-tab title animation clock so
 * 960ms ticks do not re-render {@link Chat}.
 *
 * Session title when set, else the host supplies "dsh-TUI"; a `⠂/⠐` spinner
 * prefix while working (960ms cadence, only while the terminal is focused),
 * a static `✦` otherwise. dsh-TUI brands the idle prefix with the whale.
 */
export function WorkingTerminalTitle({
  working,
  sessionTitle,
}: {
  working: boolean
  sessionTitle: string
}): null {
  const [titleFrame, setTitleFrame] = React.useState(0)
  const terminalFocused = useTerminalFocus()

  React.useEffect(() => {
    if (!working || !terminalFocused) return
    const interval = setInterval(() => {
      setTitleFrame(f => (f + 1) % TITLE_ANIMATION_FRAMES.length)
    }, TITLE_FRAME_MS)
    return () => { clearInterval(interval) }
  }, [working, terminalFocused])

  const titlePrefix = working
    ? (TITLE_ANIMATION_FRAMES[titleFrame] ?? '✦')
    : '✦'
  useTerminalTitle(`${titlePrefix} 🐋 ${sessionTitle}`)
  return null
}
