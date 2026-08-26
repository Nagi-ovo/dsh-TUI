import React from 'react'
import { t } from '../i18n.js'
import { Box, Text, useTerminalSize } from '../ui.js'
import { Pane } from './design-system/Pane.js'
import { Select, type SelectOption } from './Select.js'
import { PickerHint, PickerTitle } from './design-system/PickerChrome.js'
import { getTheme, THEME_NAMES, AUTO_THEME_NAME, type Theme } from '../theme.js'
import { buildTheme, listCustomThemes } from '../customTheme.js'
import type { Color } from '../ink/styles.js'

/** One double-block swatch character per preview key, in a row. */
const SWATCH = '██'

/** Theme keys previewed in the picker, chosen for visual contrast. */
const SWATCH_KEYS = ['claude', 'text', 'success'] as const

function swatches(theme: Theme): React.ReactNode {
  return (
    <>
      {SWATCH_KEYS.map(key => (
        <Text key={key} color={theme[key] as Color}>
          {SWATCH}
        </Text>
      ))}
    </>
  )
}

/** A picker row: display name + color swatches. */
function optionFor(name: string, displayName: string, theme: Theme, description: string): SelectOption {
  return {
    value: name,
    label: (
      <>
        {displayName}
        {'  '}
        {swatches(theme)}
      </>
    ),
    description,
  }
}

/**
 * The full selectable theme list: the `auto` pseudo-theme (follows the
 * terminal background via OSC 11, light/dark) first, then the three
 * built-in palettes (display order), then discovered user themes from
 * ~/.dsh-tui/themes (sorted by file name). A user theme named `auto` is
 * shadowed by the built-in pseudo-theme (getTheme resolves `auto` first),
 * so it is filtered out to keep the list truthful. Shared by ThemePicker
 * (render) and the /theme command (focus index), so both always see the
 * same ordering.
 */
export function getThemeOptions(): SelectOption[] {
  const auto = optionFor(
    AUTO_THEME_NAME,
    AUTO_THEME_NAME,
    getTheme(AUTO_THEME_NAME),
    t('theme-auto-base'),
  )
  const builtins = THEME_NAMES.map(name => {
    const theme = getTheme(name)
    return optionFor(name, name, theme, t('theme-builtin-base', { name }))
  })
  const custom = listCustomThemes()
    .filter(spec => spec.name !== AUTO_THEME_NAME)
    .map(spec =>
      optionFor(
        spec.name,
        spec.displayName,
        buildTheme(spec),
        t('theme-user-base', { base: spec.base, name: spec.name }),
      ),
    )
  return [auto, ...builtins, ...custom]
}

/**
 * Color-theme picker in the ActivityPicker style: a permission-colored Pane
 * listing the `auto` pseudo-theme and the built-in palettes first, then
 * every user theme found in ~/.dsh-tui/themes — each row shows the display
 * name, its base and three key color swatches; `❯` marks focus, `✓` the
 * active theme. Enter applies through the ThemeProvider setter (persists to
 * ~/.dsh-tui/theme.json and hot swaps), Esc cancels.
 */
export function ThemePicker({
  focusIndex,
  currentTheme,
  onPick,
}: {
  focusIndex: number
  currentTheme: string | undefined
  /** Mouse pick (fullscreen): clicked row's absolute index (Chat applies
   *  the same code path as the keyboard Enter). */
  onPick?: (index: number) => void
}): React.ReactNode {
  const options = React.useMemo(() => getThemeOptions(), [])
  const { rows: terminalRows } = useTerminalSize()
  // Same chrome budget as ModelPicker/SkillsPicker: every option has a
  // description row → 2 screen lines per item; cap the window so a short
  // inline terminal never pushes Enter/Esc off-screen.
  const listSlots = Math.max(terminalRows - 14, 2)
  const visibleOptionCount = Math.max(1, Math.floor(listSlots / 2))
  return (
    <Pane color="permission">
      <Box flexDirection="column">
        <PickerTitle>{t('picker-title-theme')}</PickerTitle>
        <Box flexDirection="column" minHeight={listSlots} flexShrink={0}>
          <Select
            options={options}
            focusIndex={focusIndex}
            selectedValue={currentTheme}
            visibleOptionCount={visibleOptionCount}
            onPick={onPick ? index => onPick(index) : undefined}
          />
        </Box>
      </Box>
      <PickerHint text={t('hint-confirm-exit')} />
    </Pane>
  )
}
