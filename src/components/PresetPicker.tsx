import React from 'react'
import { t } from '../i18n.js'
import { Box } from '../ui.js'
import { Pane } from './design-system/Pane.js'
import { Select } from './Select.js'
import { PickerHint, PickerTitle } from './design-system/PickerChrome.js'
import type { PresetOption } from '../dsh-adapter/channel.js'

/**
 * Agent-preset picker (issue #8) in the CC ModelPicker style — same chrome
 * as the ActivityPicker: a permission-colored Pane listing every roster
 * preset with its display name and description, `❯` focus pointer and `✓`
 * on the preset the current session runs. Enter applies through
 * `channel.switchPreset`, Esc cancels. Broken presets are listed (the
 * roster's discovery contract) but marked with their reason; the roster
 * default is tagged.
 */
export function PresetPicker({
  presets,
  focusIndex,
  currentPreset,
  onPick,
}: {
  presets: readonly PresetOption[]
  focusIndex: number
  currentPreset: string | undefined
  /** Mouse pick (fullscreen): clicked row's absolute index (Chat applies
   *  the same code path as the keyboard Enter). */
  onPick?: (index: number) => void
}): React.ReactNode {
  return (
    <Pane color="permission">
      <Box flexDirection="column">
        <PickerTitle>{t('picker-title-preset')}</PickerTitle>
        <Select
          options={presets.map(preset => ({
            value: preset.id,
            label:
              (preset.name ?? preset.id) +
              (preset.isDefault ? t('preset-default-tag') : '') +
              (preset.broken !== undefined ? t('preset-broken-tag') : ''),
            description: preset.broken ?? preset.description ?? preset.id,
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
