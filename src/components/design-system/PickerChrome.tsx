import React from 'react'
import { Box, Text } from '../../ui.js'
import { HintLine } from './HintLine.js'

/**
 * Shared picker title row — one line, remember-colored, with a blank gap
 * under it. Every slash-command Pane (theme/model/lang/…) should use this
 * so switching overlays does not reflow the title chrome.
 */
export function PickerTitle({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <Box marginBottom={1} height={1} overflow="hidden" flexShrink={0}>
      <Text color="remember" bold wrap="truncate-end">
        {children}
      </Text>
    </Box>
  )
}

/**
 * Shared picker footer hint — one reserved line so optional meta (cwd,
 * loading) can sit beside it without fighting the Enter/Esc row.
 */
export function PickerHint({ text }: { text: string }): React.ReactNode {
  return (
    <Box height={1} overflow="hidden" flexShrink={0}>
      <Text dimColor italic wrap="truncate-end">
        <HintLine text={text} />
      </Text>
    </Box>
  )
}
