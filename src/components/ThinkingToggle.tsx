import React from 'react'
import { t } from '../i18n.js'
import { Box, Text } from '../ui.js'
import { Pane } from './design-system/Pane.js'
import { Select } from './Select.js'
import { PickerHint, PickerTitle } from './design-system/PickerChrome.js'

/**
 * The `/thinking` display dialog: a permission-colored Pane with a bold
 * title, the Shown/Hidden select, and the Enter/Esc hint line.
 */
export function ThinkingToggle({
  currentValue,
  focusIndex,
  onPick,
}: {
  currentValue: boolean
  focusIndex: number
  /** Mouse pick (fullscreen): reports the clicked row's index — Chat
   *  applies it with the same code path as the keyboard Enter. */
  onPick?: (index: number) => void
}): React.ReactNode {
  const options = [
    {
      value: 'true',
      label: t('thinking-enabled'),
      description: t('thinking-enabled-desc'),
    },
    {
      value: 'false',
      label: t('thinking-disabled'),
      description: t('thinking-disabled-desc'),
    },
  ]

  return (
    <Pane color="permission">
      <Box flexDirection="column">
        {/* Single-line title (subtitle lives in option descriptions) so
            /thinking chrome matches theme/lang/plan overlays when switching. */}
        <PickerTitle>{t('thinking-title')}</PickerTitle>
        <Select
          options={options}
          focusIndex={focusIndex}
          selectedValue={currentValue ? 'true' : 'false'}
          visibleOptionCount={2}
          onPick={onPick === undefined ? undefined : (index) => onPick(index)}
        />
        <PickerHint text={t('hint-confirm-exit')} />
      </Box>
    </Pane>
  )
}
