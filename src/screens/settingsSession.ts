/**
 * Settings screen session bag: survives Chat remounts while `/settings` stays
 * logically open (approval / ask_user_question interrupt unmounts the screen
 * but keeps `settingsOpen`). Cleared only when the user closes Settings.
 *
 * Holds navigation + staged `SettingsForm` instances so dirty edits and focus
 * do not vanish across the interrupt lifecycle (Chat early-return remount).
 */
import type { SettingsForm } from '../dsh-adapter/settingsEditor.js'

export type SettingsMode = 'list' | 'edit' | 'select'

export interface SettingsEditingState {
  ns: string
  fieldPath: readonly string[]
  draft: string
  cursor: number
}

export interface SettingsSessionBag {
  categoryIndex: number
  focusIndex: number
  listTop: number
  mode: SettingsMode
  editing: SettingsEditingState | null
  selectFocus: number
  readonlyOpen: boolean
  notice: { text: string; tone: 'error' | 'success' } | undefined
  forms: Map<string, SettingsForm>
}

let bag: SettingsSessionBag | null = null

/** Empty bag used when Settings mounts for a fresh open. */
export function createSettingsSessionBag(): SettingsSessionBag {
  return {
    categoryIndex: 0,
    focusIndex: 0,
    listTop: 0,
    mode: 'list',
    editing: null,
    selectFocus: 0,
    readonlyOpen: false,
    notice: undefined,
    forms: new Map(),
  }
}

/** Active session while Settings is logically open; null after close. */
export function getSettingsSession(): SettingsSessionBag | null {
  return bag
}

/** Claim or create the bag for the current Settings mount. */
export function claimSettingsSession(): SettingsSessionBag {
  if (bag === null) bag = createSettingsSessionBag()
  return bag
}

/** Drop the bag when the user closes Settings (not on interrupt remount). */
export function clearSettingsSession(): void {
  bag = null
}
