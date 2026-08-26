import React from 'react'
import { Box, Text, useInput, useTerminalSize } from '../ui.js'
import type { WheelEvent } from '../ink/events/wheel-event.js'
import { Divider } from '../components/design-system/Divider.js'
import { HintLine } from '../components/design-system/HintLine.js'
import { ListItem } from '../components/design-system/ListItem.js'
import { Select } from '../components/Select.js'
import { isMod, isPlainReturn } from '../utils/modifiers.js'
import { truncateWidth } from '../sessions/format.js'
import { stringWidth } from '../ink/stringWidth.js'
import { getLang, t } from '../i18n.js'
import { SettingsForm } from '../dsh-adapter/settingsEditor.js'
import type { TuiSettingsField, TuiSettingsSection } from '../dsh-adapter/settings-sections.js'
import type { LocalizedDescriptions } from '../commands.js'
import type { Channel } from '../dsh-adapter/channel.js'
import {
  claimSettingsSession,
  clearSettingsSession,
  type SettingsMode,
} from './settingsSession.js'

interface EditingState {
  ns: string
  field: TuiSettingsField
  draft: string
  /** Caret offset into `draft` (Unicode code points). */
  cursor: number
}

/** One category tab: a flat field list owned by a single section namespace. */
interface Category {
  id: string
  title: string
  descriptions?: LocalizedDescriptions
  ns: string
  fields: readonly TuiSettingsField[]
}

/** Mandatory chrome rows that never yield: title, status, field hint, nav hint. */
const MANDATORY_LINES = 4

/** Pick the provider-owned translation for the active language. */
function pick(text: string, descriptions: LocalizedDescriptions | undefined): string {
  return descriptions?.[getLang()] ?? text
}

/** Compact one-line preview of a read-only namespace's resolved value. */
function valuePreview(value: unknown, budget: number): string {
  let raw: string
  try {
    raw = JSON.stringify(value) ?? 'undefined'
  } catch {
    raw = String(value)
  }
  return truncateWidth(raw, Math.max(8, budget))
}

/** Rendered width of a hint: `HintLine` strips the `**` emphasis markers. */
function hintWidth(text: string): number {
  return stringWidth(text.replace(/\*\*/gu, ''))
}

/**
 * The widest hint that fits, cut only when even the shortest will not.
 * Matches SessionBrowser: a wrapped footer is worse than a truncated one.
 */
function fitHint(candidates: readonly string[], budget: number): string {
  for (const candidate of candidates) {
    if (hintWidth(candidate) <= budget) return candidate
  }
  return truncateWidth((candidates[candidates.length - 1] ?? '').replace(/\*\*/gu, ''), budget)
}

/**
 * Build calm category tabs from plugin sections.
 *
 * Empty groups are skipped (the former dead "Session" door). Ungrouped fields
 * land in a General tab when the section also has non-empty groups; otherwise
 * the section title itself is the category.
 */
function buildCategories(sections: readonly TuiSettingsSection[]): Category[] {
  const categories: Category[] = []
  for (const section of sections) {
    const ungrouped = section.fields.filter(field => field.group === undefined)
    const groups = (section.groups ?? [])
      .map(group => ({
        group,
        fields: section.fields.filter(field => field.group === group.id),
      }))
      .filter(entry => entry.fields.length > 0)

    if (groups.length === 0) {
      if (ungrouped.length > 0) {
        categories.push({
          id: section.ns,
          title: section.title,
          descriptions: section.descriptions,
          ns: section.ns,
          fields: ungrouped,
        })
      }
      continue
    }

    if (ungrouped.length > 0) {
      categories.push({
        id: `${section.ns}:general`,
        title: 'General',
        descriptions: { zh: '常规', en: 'General' },
        ns: section.ns,
        fields: ungrouped,
      })
    }
    for (const entry of groups) {
      categories.push({
        id: `${section.ns}:${entry.group.id}`,
        title: entry.group.title,
        descriptions: entry.group.descriptions,
        ns: section.ns,
        fields: entry.fields,
      })
    }
  }
  return categories
}

/** Human label for a stored field value (On/Off, option labels, secrets…). */
function displayValue(
  field: TuiSettingsField,
  text: string,
  opts: { editing?: boolean; draft?: string; cursor?: number; secretConfigured?: boolean },
): string {
  if (field.secret !== undefined) {
    if (opts.editing) {
      const draft = opts.draft ?? ''
      const cursor = opts.cursor ?? draft.length
      const masked = '•'.repeat(draft.length)
      return `${masked.slice(0, cursor)}▌${masked.slice(cursor)}`
    }
    if (text !== '') return `${'•'.repeat(text.length)} ${t('settings-secret-staged')}`
    return opts.secretConfigured ? t('settings-secret-set') : t('settings-secret-unset')
  }
  if (opts.editing) {
    const draft = opts.draft ?? ''
    const cursor = Math.max(0, Math.min(opts.cursor ?? draft.length, draft.length))
    return `${draft.slice(0, cursor)}▌${draft.slice(cursor)}`
  }
  if (field.kind === 'boolean') {
    if (text === '') return t('settings-field-empty')
    return text === 'true' ? t('settings-on') : t('settings-off')
  }
  if (field.kind === 'select') {
    if (text === '') return t('settings-field-empty')
    const option = field.options?.find(entry => entry.value === text)
    return option !== undefined ? pick(option.label, option.descriptions) : text
  }
  return text === '' ? t('settings-field-empty') : text
}

/**
 * The settings screen — `/settings` as a screen of its own (issue #165).
 *
 * Presentation only: plugin-declared sections from `tuiSettingsSections`
 * render as editable forms; writes go through the dsh settings service or
 * the credentials seam. Edits are staged until an explicit save.
 *
 * Layout follows SessionBrowser chrome math: every region is accounted so
 * the frame sums to exactly `rows`. List rows are always one line; field
 * hints live in a reserved footer slot so focus never expands the list.
 */
export function Settings({
  channel,
  onClose,
}: {
  channel: Channel
  onClose: () => void
}): React.ReactNode {
  const { columns, rows } = useTerminalSize()
  const host = channel.settingsHost()
  // Survive Chat interrupt remounts: bag lives until the user closes Settings.
  const session = claimSettingsSession()
  const [namespaces, setNamespaces] = React.useState(() => host?.listNamespaces() ?? [])
  const [sections, setSections] = React.useState(() => channel.settingsSections())
  const [mode, setMode] = React.useState<SettingsMode>(() => session.mode)
  const [editing, setEditing] = React.useState<EditingState | null>(() => {
    if (session.editing === null) return null
    const section = channel.settingsSections().find(entry => entry.ns === session.editing!.ns)
    const field = section?.fields.find(entry => entry.path.join('.') === session.editing!.fieldPath.join('.'))
    if (field === undefined) return null
    return {
      ns: session.editing.ns,
      field,
      draft: session.editing.draft,
      cursor: session.editing.cursor,
    }
  })
  const [selectFocus, setSelectFocus] = React.useState(() => session.selectFocus)
  const [categoryIndex, setCategoryIndex] = React.useState(() => session.categoryIndex)
  const [focusIndex, setFocusIndex] = React.useState(() => session.focusIndex)
  const [notice, setNotice] = React.useState<{ text: string; tone: 'error' | 'success' } | undefined>(
    () => session.notice,
  )
  const [secrets, setSecrets] = React.useState<ReadonlyMap<string, boolean>>(new Map())
  const [readonlyOpen, setReadonlyOpen] = React.useState(() => session.readonlyOpen)
  /** Ignore hover-driven focus after a key move (lazygit: key nav wins briefly). */
  const hoverLockRef = React.useRef(0)
  const [, bump] = React.useReducer((count: number) => count + 1, 0)
  const mountedRef = React.useRef(true)
  React.useEffect(() => () => {
    mountedRef.current = false
  }, [])

  React.useEffect(() => channel.subscribeSettingsSections(() => {
    setSections(channel.settingsSections())
  }), [channel])

  const formsRef = React.useRef(session.forms)
  const forms = new Map<string, SettingsForm>()
  if (host !== undefined) {
    for (const section of sections) {
      const view = namespaces.find(entry => entry.ns === section.ns)
      const kept = formsRef.current.get(section.ns)
      const reuse = kept !== undefined && (kept.namespace === view || kept.shell().dirty)
      const form = reuse ? kept : new SettingsForm(host, view, section.fields)
      forms.set(section.ns, form)
    }
  }
  formsRef.current = forms
  session.forms = forms

  // Mirror navigation into the bag every render so an interrupt remount
  // reopens on the same category / focus / edit draft.
  session.categoryIndex = categoryIndex
  session.focusIndex = focusIndex
  session.mode = mode
  session.selectFocus = selectFocus
  session.readonlyOpen = readonlyOpen
  session.notice = notice
  session.editing = editing === null
    ? null
    : {
      ns: editing.ns,
      fieldPath: editing.field.path,
      draft: editing.draft,
      cursor: editing.cursor,
    }

  const closeSettings = (): void => {
    clearSettingsSession()
    onClose()
  }

  const refresh = (): void => {
    setNamespaces(host?.listNamespaces() ?? [])
  }

  const [secretProbe, setSecretProbe] = React.useState(0)
  React.useEffect(() => {
    if (host === undefined) return
    let stale = false
    const pending = sections.flatMap(section =>
      section.fields
        .filter((field): field is TuiSettingsField & { secret: { ref: string } } => field.secret !== undefined)
        .map(async field => [`${section.ns}:${field.path.join('.')}`, await host.credentialConfigured(field.secret.ref)] as const),
    )
    void Promise.all(pending).then(entries => {
      if (!stale && mountedRef.current) setSecrets(new Map(entries))
    })
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, sections, secretProbe])

  const categories = React.useMemo(() => buildCategories(sections), [sections])
  const registeredNs = React.useMemo(() => new Set(sections.map(section => section.ns)), [sections])
  const readonlyNamespaces = namespaces.filter(entry => !registeredNs.has(entry.ns))
  const hasReadonly = readonlyNamespaces.length > 0
  const categoryCount = categories.length + (hasReadonly ? 1 : 0)
  const effCategory = Math.min(categoryIndex, Math.max(0, categoryCount - 1))
  const activeCategory = effCategory < categories.length ? categories[effCategory] : undefined
  const onReadonlyTab = hasReadonly && effCategory === categories.length

  const focusable = activeCategory?.fields ?? []
  const effFocus = Math.min(focusIndex, Math.max(0, focusable.length - 1))
  const focused = focusable.length === 0 ? undefined : focusable[effFocus]
  const focusedForm = activeCategory === undefined ? undefined : forms.get(activeCategory.ns)

  // Only reset focus when the user changes category — not on remount restore.
  const prevCategoryRef = React.useRef(effCategory)
  React.useEffect(() => {
    if (prevCategoryRef.current === effCategory) return
    prevCategoryRef.current = effCategory
    setFocusIndex(0)
    session.listTop = 0
  }, [effCategory, session])

  const lockHover = (): void => {
    hoverLockRef.current = Date.now() + 400
  }

  const commitSave = (ns: string): void => {
    const form = forms.get(ns)
    if (form === undefined || form.saving || !form.shell().dirty) return
    void form.save().then(ok => {
      if (!mountedRef.current) return
      if (ok) {
        setNotice({ text: t('settings-saved', { ns }), tone: 'success' })
        refresh()
        setSecretProbe(count => count + 1)
      } else {
        setNotice({ text: t('settings-save-failed', { ns }), tone: 'error' })
      }
    })
  }

  const cycleField = (ns: string, field: TuiSettingsField): void => {
    const form = forms.get(ns)
    if (form === undefined || !form.available || form.saving) return
    const current = form.field(field).text
    if (field.kind === 'boolean') {
      form.edit(field, current === 'true' ? 'false' : 'true')
    } else {
      const options = field.options ?? []
      if (options.length === 0) return
      const index = options.findIndex(option => option.value === current)
      form.edit(field, options[(index + 1) % options.length]?.value ?? options[0]?.value ?? '')
    }
    setNotice(undefined)
    bump()
  }

  const openSelect = (ns: string, field: TuiSettingsField): void => {
    const form = forms.get(ns)
    if (form === undefined || !form.available || form.saving) return
    const options = field.options ?? []
    if (options.length === 0) return
    const current = form.field(field).text
    const index = Math.max(0, options.findIndex(option => option.value === current))
    setEditing({ ns, field, draft: current, cursor: current.length })
    setSelectFocus(index === -1 ? 0 : index)
    setMode('select')
  }

  const activateField = (ns: string, field: TuiSettingsField): void => {
    const form = forms.get(ns)
    if (form === undefined || !form.available || form.saving) return
    if (field.kind === 'boolean') {
      cycleField(ns, field)
      return
    }
    if (field.kind === 'select') {
      openSelect(ns, field)
      return
    }
    const text = form.field(field).text
    setEditing({ ns, field, draft: text, cursor: text.length })
    setMode('edit')
  }

  const handleWheel = (event: WheelEvent): void => {
    if (mode !== 'list') return
    if (onReadonlyTab) return
    const direction = event.deltaY >= 0 ? 1 : -1
    lockHover()
    setFocusIndex(previous =>
      Math.min(Math.max(0, focusable.length - 1), Math.max(0, previous + direction)),
    )
  }

  useInput((input, key) => {
    if (mode === 'select' && editing !== null) {
      const options = editing.field.options ?? []
      if (key.upArrow) {
        setSelectFocus(previous => Math.max(0, previous - 1))
      } else if (key.downArrow) {
        setSelectFocus(previous => Math.min(Math.max(0, options.length - 1), previous + 1))
      } else if (isPlainReturn(key)) {
        const chosen = options[selectFocus]
        if (chosen !== undefined) {
          forms.get(editing.ns)?.edit(editing.field, chosen.value)
          bump()
        }
        setMode('list')
        setEditing(null)
      } else if (key.escape) {
        setMode('list')
        setEditing(null)
      }
      return
    }

    if (mode === 'edit' && editing !== null) {
      if (isPlainReturn(key)) {
        forms.get(editing.ns)?.edit(editing.field, editing.draft)
        bump()
        setMode('list')
        setEditing(null)
      } else if (key.escape) {
        setMode('list')
        setEditing(null)
      } else if (key.leftArrow) {
        setEditing(state => state === null ? null : { ...state, cursor: Math.max(0, state.cursor - 1) })
      } else if (key.rightArrow) {
        setEditing(state => state === null ? null : {
          ...state,
          cursor: Math.min(state.draft.length, state.cursor + 1),
        })
      } else if (key.backspace || key.delete) {
        setEditing(state => {
          if (state === null) return null
          if (key.delete) {
            if (state.cursor >= state.draft.length) return state
            return {
              ...state,
              draft: state.draft.slice(0, state.cursor) + state.draft.slice(state.cursor + 1),
            }
          }
          if (state.cursor <= 0) return state
          return {
            ...state,
            draft: state.draft.slice(0, state.cursor - 1) + state.draft.slice(state.cursor),
            cursor: state.cursor - 1,
          }
        })
      } else if (!isMod(key) && !key.meta && !key.super && input && !key.return) {
        const typed = input.replace(/\p{Cc}/gu, '')
        if (typed.length > 0) {
          setEditing(state => {
            if (state === null) return null
            return {
              ...state,
              draft: state.draft.slice(0, state.cursor) + typed + state.draft.slice(state.cursor),
              cursor: state.cursor + typed.length,
            }
          })
        }
      }
      return
    }

    if (key.leftArrow && categoryCount > 1) {
      lockHover()
      setCategoryIndex(Math.max(0, effCategory - 1))
      return
    }
    if (key.rightArrow && categoryCount > 1) {
      lockHover()
      setCategoryIndex(Math.min(categoryCount - 1, effCategory + 1))
      return
    }

    if (key.upArrow) {
      if (onReadonlyTab) return
      lockHover()
      setFocusIndex(Math.max(0, effFocus - 1))
    } else if (key.downArrow) {
      if (onReadonlyTab) return
      lockHover()
      setFocusIndex(Math.min(Math.max(0, focusable.length - 1), effFocus + 1))
    } else if (isPlainReturn(key) && activeCategory !== undefined && focused !== undefined) {
      activateField(activeCategory.ns, focused)
    } else if (isPlainReturn(key) && onReadonlyTab) {
      setReadonlyOpen(open => !open)
    } else if (input === 's' && activeCategory !== undefined) {
      commitSave(activeCategory.ns)
    } else if (input === 'd' && activeCategory !== undefined) {
      const form = forms.get(activeCategory.ns)
      if (form?.saving) return
      form?.discard()
      setNotice(undefined)
      bump()
    } else if (key.escape) {
      const dirty = [...forms.values()].filter(form => form.shell().dirty)
      if (dirty.length > 0) {
        if (dirty.some(form => form.saving)) return
        for (const form of dirty) form.discard()
        setNotice({ text: t('settings-discarded'), tone: 'success' })
        bump()
      } else {
        closeSettings()
      }
    }
  })

  // ── Chrome accounting (SessionBrowser rule): regions sum to exactly `rows`. ─
  const showCategories = categoryCount > 1
  const extraLines = showCategories ? 1 : 0
  // Rules that actually render: top under title, optional category separator,
  // bottom above the footer. Never count a rule we will not paint.
  const renderRules = showCategories ? [0, 1, 2] as const : [0, 2] as const
  const ruleBudget = Math.max(0, Math.min(renderRules.length, rows - MANDATORY_LINES - extraLines))
  const rules = new Set<number>(renderRules.slice(0, ruleBudget))
  const listHeight = Math.max(0, rows - MANDATORY_LINES - extraLines - rules.size - 1)

  const listTopRef = React.useRef(session.listTop)
  if (effFocus < listTopRef.current) listTopRef.current = effFocus
  if (effFocus >= listTopRef.current + listHeight) listTopRef.current = Math.max(0, effFocus - listHeight + 1)
  if (listTopRef.current > 0 && focusable.length <= listHeight) listTopRef.current = 0
  session.listTop = listTopRef.current
  const windowStart = listTopRef.current
  const visibleFields = focusable.slice(windowStart, windowStart + listHeight)

  const anyDirty = [...forms.values()].some(form => form.shell().dirty)
  const anySaving = [...forms.values()].some(form => form.shell().saving)
  const anyFailed = [...forms.values()].some(form => form.shell().failed)
  const statusText = notice?.text
    ?? (anySaving ? t('settings-badge-saving')
      : anyFailed ? t('settings-badge-failed')
        : anyDirty ? t('settings-badge-dirty')
          : '')
  const statusTone = notice?.tone === 'error' || anyFailed ? 'error'
    : notice?.tone === 'success' ? 'success'
      : anyDirty ? 'suggestion'
        : undefined

  const focusedHint = focused !== undefined && focused.hint !== undefined
    ? pick(focused.hint, focused.hintDescriptions)
    : undefined
  const fieldHintLine = focusedHint !== undefined && focused !== undefined
    ? truncateWidth(`${pick(focused.label, focused.descriptions)} · ${focusedHint}`, columns)
    : ''

  const navHint = fitHint(
    mode === 'edit'
      ? [t('settings-hint-edit'), t('settings-hint-edit-short')]
      : mode === 'select'
        ? [t('settings-hint-select'), t('settings-hint-edit-short')]
        : showCategories
          ? [t('settings-hint-list'), t('settings-hint-list-short')]
          : [t('settings-hint-list-short'), t('settings-hint-list')],
    columns,
  )

  // Right-align values in a shared column so On/Off / labels don't dance
  // as focus moves between short and long values (CC /config taste).
  const valueColWidth = (() => {
    if (activeCategory === undefined || focusedForm === undefined) return 10
    let widest = 4
    for (const field of focusable) {
      const state = focusedForm.field(field)
      const isEditing = mode === 'edit' && editing !== null && editing.field === field
      const value = displayValue(field, state.text, {
        editing: isEditing,
        draft: editing?.draft,
        cursor: editing?.cursor,
        secretConfigured: secrets.get(`${activeCategory.ns}:${field.path.join('.')}`) === true,
      })
      const badges: string[] = []
      if (state.invalid) badges.push(t('settings-field-invalid'))
      if (state.overridden) badges.push(t('settings-badge-override'))
      if (focusedForm.isStaged(field) && !isEditing) badges.push('*')
      const badgeText = badges.length > 0 ? `${badges.join(' ')} ` : ''
      widest = Math.max(widest, stringWidth(badgeText) + stringWidth(value))
    }
    // Leave room for ❯ + label; never let the value column eat the name.
    return Math.max(8, Math.min(widest, Math.max(8, columns - 24)))
  })()

  const renderFieldRow = (field: TuiSettingsField, absoluteIndex: number): React.ReactNode => {
    if (activeCategory === undefined) return null
    const ns = activeCategory.ns
    const form = forms.get(ns)
    const state = form?.field(field) ?? { text: '', overridden: false, invalid: false }
    const isFocused = absoluteIndex === effFocus && mode === 'list'
    const isEditing = mode === 'edit' && editing !== null && editing.field === field && editing.ns === ns
    const label = pick(field.label, field.descriptions)
    const value = displayValue(field, state.text, {
      editing: isEditing,
      draft: editing?.draft,
      cursor: editing?.cursor,
      secretConfigured: secrets.get(`${ns}:${field.path.join('.')}`) === true,
    })
    const badges: string[] = []
    if (state.invalid) badges.push(t('settings-field-invalid'))
    if (state.overridden) badges.push(t('settings-badge-override'))
    if (form?.isStaged(field) === true && !isEditing) badges.push('*')
    const hoverable = mode === 'list'
    return (
      <ListItem
        key={`${ns}:${field.path.join('.')}`}
        isFocused={isFocused || isEditing}
        styled={false}
        onClick={hoverable ? () => {
          setFocusIndex(absoluteIndex)
          activateField(ns, field)
        } : undefined}
      >
        <Box
          flexGrow={1}
          height={1}
          overflow="hidden"
          onMouseEnter={hoverable ? () => {
            if (Date.now() < hoverLockRef.current) return
            setFocusIndex(absoluteIndex)
          } : undefined}
        >
          <Text bold={isFocused || isEditing} wrap="truncate-end">{label}</Text>
          <Box flexGrow={1} />
          <Box width={valueColWidth} flexShrink={0} height={1} overflow="hidden" justifyContent="flex-end">
            {badges.length > 0 && (
              <Text color={state.invalid ? 'error' : 'suggestion'} dimColor={!state.invalid}>
                {badges.join(' ')}{' '}
              </Text>
            )}
            <Text
              color={isEditing || isFocused ? 'suggestion' : undefined}
              dimColor={!isFocused && !isEditing && (state.text === '' || field.kind === 'boolean')}
              wrap="truncate-end"
            >
              {value}
            </Text>
          </Box>
        </Box>
      </ListItem>
    )
  }

  // Inline select replaces the list region without changing chrome heights.
  if (mode === 'select' && editing !== null) {
    const options = (editing.field.options ?? []).map(option => ({
      value: option.value,
      label: pick(option.label, option.descriptions),
    }))
    return (
      <Box flexDirection="column" width={columns} height={rows}>
        <Box height={1} overflow="hidden">
          <Text bold>{t('settings-title')}</Text>
          <Box flexGrow={1} />
          <Text dimColor>{pick(editing.field.label, editing.field.descriptions)}</Text>
        </Box>
        {rules.has(0) && <Divider />}
        <Box flexDirection="column" height={listHeight + extraLines + (rules.has(1) ? 1 : 0)} overflow="hidden">
          <Select
            options={options}
            focusIndex={selectFocus}
            selectedValue={editing.draft}
            visibleOptionCount={Math.max(3, listHeight + extraLines)}
            onPick={(index, value) => {
              forms.get(editing.ns)?.edit(editing.field, value)
              bump()
              setMode('list')
              setEditing(null)
              setSelectFocus(index)
            }}
          />
        </Box>
        <Box height={1} overflow="hidden">
          {statusText !== '' && <Text color={statusTone}>{statusText}</Text>}
        </Box>
        {rules.has(2) && <Divider />}
        <Box height={1} overflow="hidden">
          <Text dimColor>{fieldHintLine}</Text>
        </Box>
        <Box height={1} overflow="hidden">
          <Text dimColor italic><HintLine text={navHint} /></Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" width={columns} height={rows} overflow="hidden">
      <Box flexShrink={0} height={1} overflow="hidden">
        <Text bold>{t('settings-title')}</Text>
        <Box flexGrow={1} />
        {host === undefined && <Text color="warning">{t('settings-unavailable')}</Text>}
        {activeCategory !== undefined && forms.get(activeCategory.ns)?.namespace?.applies === 'restart' && (
          <Text color="warning"> {t('settings-badge-restart')}</Text>
        )}
      </Box>
      {rules.has(0) && (
        <Box flexShrink={0}>
          <Divider width={columns} />
        </Box>
      )}
      {showCategories && (
        <Box flexDirection="row" flexShrink={0} height={1} overflow="hidden" gap={2}>
          {categories.map((category, index) => {
            const selected = index === effCategory
            return (
              <Box
                key={category.id}
                flexShrink={0}
                onClick={() => {
                  lockHover()
                  setCategoryIndex(index)
                }}
              >
                <Text
                  bold={selected}
                  color={selected ? 'suggestion' : undefined}
                  dimColor={!selected}
                >
                  {selected ? '▸ ' : '  '}{pick(category.title, category.descriptions)}
                </Text>
              </Box>
            )
          })}
          {hasReadonly && (
            <Box
              flexShrink={0}
              onClick={() => {
                lockHover()
                setCategoryIndex(categories.length)
              }}
            >
              <Text
                bold={onReadonlyTab}
                color={onReadonlyTab ? 'suggestion' : undefined}
                dimColor={!onReadonlyTab}
              >
                {onReadonlyTab ? '▸ ' : '  '}{t('settings-readonly-tab')}
              </Text>
            </Box>
          )}
        </Box>
      )}
      {showCategories && rules.has(1) && (
        <Box flexShrink={0}>
          <Divider width={columns} />
        </Box>
      )}
      <Box flexDirection="column" height={listHeight} flexShrink={0} overflow="hidden">
        <ink-box
          style={{ flexDirection: 'column', height: listHeight, flexGrow: 0, flexShrink: 0, overflow: 'hidden' }}
          onWheel={handleWheel}
        >
          {onReadonlyTab ? (
            <Box flexDirection="column" height={listHeight} overflow="hidden">
              <ListItem
                isFocused
                styled={false}
                onClick={() => setReadonlyOpen(open => !open)}
              >
                <Text>
                  {readonlyOpen ? '▾ ' : '▸ '}{t('settings-readonly-heading')}
                  <Text dimColor> ({readonlyNamespaces.length})</Text>
                </Text>
              </ListItem>
              {readonlyOpen && readonlyNamespaces.slice(0, Math.max(0, listHeight - 2)).map(entry => (
                <Box key={entry.ns} height={1} flexShrink={0} overflow="hidden">
                  <Text>{'  '}{entry.ns}</Text>
                  {entry.applies === 'restart' && <Text color="warning"> [{t('settings-badge-restart')}]</Text>}
                  <Text dimColor>{'  '}{valuePreview(entry.value, Math.max(12, columns - stringWidth(entry.ns) - 12))}</Text>
                </Box>
              ))}
              {readonlyOpen && (
                <Text dimColor wrap="truncate-end">
                  {'  '}{t('settings-readonly-hint', { path: '~/.dsh/settings.yaml' })}
                </Text>
              )}
            </Box>
          ) : focusable.length === 0 ? (
            <Text dimColor>{sections.length === 0 ? t('settings-empty') : t('settings-group-empty')}</Text>
          ) : (
            visibleFields.map((field, index) => renderFieldRow(field, windowStart + index))
          )}
        </ink-box>
      </Box>
      <Box flexShrink={0} height={1} overflow="hidden">
        {statusText !== '' ? (
          <Text color={statusTone === 'error' ? 'error' : statusTone === 'success' ? 'success' : statusTone}>{statusText}</Text>
        ) : (
          <Text> </Text>
        )}
      </Box>
      {rules.has(2) && (
        <Box flexShrink={0}>
          <Divider width={columns} />
        </Box>
      )}
      <Box flexShrink={0} height={1} overflow="hidden">
        <Text dimColor>{fieldHintLine || ' '}</Text>
      </Box>
      <Box flexShrink={0} height={1} overflow="hidden">
        <Text dimColor italic><HintLine text={navHint} /></Text>
      </Box>
    </Box>
  )
}
