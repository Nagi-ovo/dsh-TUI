/**
 * The approval panel — Claude Code style permission prompt for the DSH
 * approval seam (`ctx.approval`). One ask per panel: a permission-colored
 * divider header naming the tool, the gated command recovered from the
 * paired tool call (CC verbose full-command semantics), the asker's reason,
 * "Do you want to proceed?", and a numbered Yes/No list.
 *
 * The protocol's outcome set is closed (allowed-once / rejected /
 * cancelled / unavailable) with no allow-always or feedback channel, so
 * the panel deliberately offers exactly two rows; Esc and Ctrl+C reject
 * (fail closed, CC's "Esc to cancel" semantics).
 */

import React from 'react'
import { t } from '../../i18n.js'
import { Box, Text, useInput } from '../../ui.js'
import { isPlainReturnInput } from '../../utils/modifiers.js'
import { Divider } from '../design-system/Divider.js'
import { ListItem } from '../design-system/ListItem.js'
import type { ApprovalSnapshot } from '../../dsh-adapter/approvals.js'

export type ApprovalPanelProps = {
  /** The approval to render (from the ApprovalStore snapshot). */
  readonly approval: ApprovalSnapshot
  readonly onDecide: (outcome: 'allowed-once' | 'rejected') => void
}

const OUTCOMES = ['allowed-once', 'rejected'] as const

export function ApprovalPanel({ approval, onDecide }: ApprovalPanelProps): React.ReactNode {
  const [focusIndex, setFocusIndex] = React.useState(0)

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      onDecide('rejected')
      return
    }
    if (key.upArrow) {
      setFocusIndex(index => (index + OUTCOMES.length - 1) % OUTCOMES.length)
      return
    }
    if (key.downArrow) {
      setFocusIndex(index => (index + 1) % OUTCOMES.length)
      return
    }
    if (input === '1' || input === '2') {
      onDecide(OUTCOMES[Number(input) - 1]!)
      return
    }
    if (isPlainReturnInput(input, key)) {
      onDecide(OUTCOMES[focusIndex]!)
    }
  }, { isActive: true })

  const optionLabels = [t('approval-yes'), t('approval-no')]

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={2} paddingRight={2} width="100%">
      <Divider color="permission" title={t('approval-waiting', { tool: approval.toolName })} padding={4} />
      <Box flexDirection="column" marginTop={1}>
        {approval.command !== undefined && (
          <Box flexDirection="column" paddingX={2}>
            <Text dimColor wrap="wrap">
              {approval.command}
            </Text>
          </Box>
        )}
        {approval.reason !== undefined && (
          <Text dimColor wrap="wrap">
            {approval.reason}
          </Text>
        )}
        <Text dimColor>{t('approval-proceed')}</Text>
      </Box>
      {/* ListItem rows are height-1; never use focus-dependent margin (that
          shoved Yes/No apart when the pointer moved). */}
      <Box flexDirection="column" marginTop={1}>
        {optionLabels.map((label, index) => (
          <ListItem
            key={label}
            isFocused={index === focusIndex}
            onClick={() => onDecide(OUTCOMES[index]!)}
          >
            {index + 1}. {label}
          </ListItem>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{t('approval-hint')}</Text>
      </Box>
    </Box>
  )
}
