import React from 'react'
import { Box } from '../ui.js'
import { t } from '../i18n.js'
import type { TuiWorkspaceTarget } from '../workspaces.js'
import { Pane } from './design-system/Pane.js'
import { ListItem } from './design-system/ListItem.js'
import { PickerHint, PickerTitle } from './design-system/PickerChrome.js'

const WINDOW = 8

/** `/workspace` target picker contributed by local and optional providers. */
export function WorkspacePicker({
  targets,
  focusIndex,
  currentCwd,
  onPick,
}: {
  targets: readonly TuiWorkspaceTarget[]
  focusIndex: number
  currentCwd: string
  /** Mouse pick (fullscreen): reports the clicked row's absolute index —
   *  Chat applies it with the same code path as the keyboard Enter. */
  onPick?: (index: number) => void
}): React.ReactNode {
  const start = Math.max(0, Math.min(focusIndex - Math.floor(WINDOW / 2), targets.length - WINDOW))
  const visible = targets.slice(start, start + WINDOW)
  const anyDesc = targets.some(target => (target.description ?? target.uri) !== '')
  return (
    <Pane color="permission">
      <Box flexDirection="column">
        <PickerTitle>{t('workspace-picker-title')}</PickerTitle>
        {visible.map((target, index) => (
          <ListItem
            key={target.uri}
            isFocused={start + index === focusIndex}
            isSelected={target.cwd === currentCwd}
            description={anyDesc ? ((target.description ?? target.uri) || ' ') : undefined}
            showScrollUp={index === 0 && start > 0}
            showScrollDown={index === visible.length - 1 && start + visible.length < targets.length}
            onClick={onPick === undefined ? undefined : () => onPick(start + index)}
          >
            {target.badge} · {target.label}
          </ListItem>
        ))}
      </Box>
      <PickerHint text={t('workspace-picker-hint')} />
    </Pane>
  )
}
