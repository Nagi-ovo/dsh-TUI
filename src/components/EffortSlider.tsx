import React from 'react'
import { t } from '../i18n.js'
import { Box, Text } from '../ui.js'
import { Pane } from './design-system/Pane.js'
import { PickerHint, PickerTitle } from './design-system/PickerChrome.js'
import type { EffortOption } from '../dsh-adapter/channel.js'

/**
 * Reasoning-effort slider (`/effort`): a rheostat row of the live route's
 * adapter-owned levels in adapter order, ←/→ moving focus (each move applies
 * immediately through `channel.setEffort` — the slider IS the control; Enter
 * or Esc just closes it). The current level carries `✓`; the focused level's
 * description renders below the row.
 */
export function EffortSlider({
  options,
  focusIndex,
  currentId,
  onPick,
}: {
  options: readonly EffortOption[]
  focusIndex: number
  currentId: string | undefined
  /** Mouse pick (fullscreen): click a tier = move there and live-apply —
   *  the same semantics as the ←/→ keys (the slider IS the control). */
  onPick?: (index: number) => void
}): React.ReactNode {
  const focused = options[focusIndex]
  return (
    <Pane color="permission">
      <Box flexDirection="column">
        <PickerTitle>{t('picker-title-effort')}</PickerTitle>
        <Box flexDirection="row">
          {options.map((option, index) => (
            <React.Fragment key={option.id}>
              {index > 0 ? (
                <Text dimColor> ── </Text>
              ) : null}
              <Box
                onClick={onPick ? () => onPick(index) : undefined}
                backgroundColor={
                  onPick !== undefined && index !== focusIndex
                    ? 'userMessageBackgroundHover'
                    : undefined
                }
              >
                <Text
                  inverse={index === focusIndex}
                  bold={index === focusIndex}
                >
                  {option.name}
                </Text>
              </Box>
              {option.id === currentId ? <Text color="remember">✓</Text> : null}
            </React.Fragment>
          ))}
        </Box>
        {/* Always one description row so focus on a bare tier cannot collapse
            the pane (medium-without-desc used to drop a line and shove the hint). */}
        <Box height={1} overflow="hidden">
          <Text dimColor wrap="truncate-end">{focused?.description ?? ' '}</Text>
        </Box>
      </Box>
      <PickerHint text={t('hint-adjust-done')} />
    </Pane>
  )
}
