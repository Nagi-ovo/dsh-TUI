import React from 'react'
import { t } from '../i18n.js'
import { Box } from '../ui.js'
import { Pane } from './design-system/Pane.js'
import { Select } from './Select.js'
import { PickerHint, PickerTitle } from './design-system/PickerChrome.js'
import { FRAME_PRESETS, PRESET_NAMES } from './activityFrames.js'

/**
 * Working-activity indicator picker in the CC ModelPicker style (ported
 * from the pi extension's `/activity` interactive select): a
 * permission-colored Pane listing every preset (random first) with its
 * frame preview, `❯` focus pointer and `✓` on the active preset. Enter
 * applies through `channel.setActivityFrames`, Esc cancels.
 */
export function ActivityPicker({
  focusIndex,
  currentPreset,
  onPick,
}: {
  focusIndex: number
  currentPreset: string | undefined
  /** Mouse pick (fullscreen): clicked row's absolute index (Chat applies
   *  the same code path as the keyboard Enter). */
  onPick?: (index: number) => void
}): React.ReactNode {
  return (
    <Pane color="permission">
      <Box flexDirection="column">
        <PickerTitle>{t('picker-title-activity')}</PickerTitle>
        <Select
          options={PRESET_NAMES.map(name => ({
            value: name,
            label: name,
            description: name === 'random'
              ? t('activity-random-each-preset')
              : FRAME_PRESETS[name].frames.slice(0, 5).join(' '),
          }))}
          focusIndex={focusIndex}
          selectedValue={currentPreset}
          onPick={onPick ? index => onPick(index) : undefined}
        />
        <PickerHint text={t('hint-confirm-exit')} />
      </Box>
    </Pane>
  )
}
