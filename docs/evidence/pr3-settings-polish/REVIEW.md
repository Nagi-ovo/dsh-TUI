# PR #3 visual review — Jesse frame order (source of truth)

Review order (80×24) and the defects each frame exposed. Evidence `.txt` is authoritative; PNG is regenerated with font-measured cell width (no right-edge crop).

| # | Review frame | Evidence file | Defects seen | Fix |
| --- | --- | --- | --- | --- |
| 1 | Settings open | `after_80x24_open` | Value `Engl`; footer hint clipped | Fixed value col; label truncates first; PNG renderer uses measured cell width |
| 2 | Focus move | `after_80x24_focus_move` | Value clip; chrome must stay pinned | Same value col; `titleY=0` / `navY=rows-1` |
| 3 | Dirty toggle | `after_80x24_toggle_dirty` | `u *` mid-row; `*On` glue; `unsaved` in list well | Title `Settings · unsaved`; pinned `* On` / `  Off`; footer `· user ·` |
| 4 | Shortcuts tab | `after_80x24_category_shortcuts` | `ctr`; floating `unsaved` | Full `ctrl+p`; dirty suffix in title |
| 5 | Plan picker | `after_80x24_plan_picker` | Descriptions must stay height=1 | Select + ListItem fixed desc row |
| 6 | Skills loading | `after_80x24_skills_loading` | Sparse OK; chrome height match | `listSlots` + `PickerHint` reserved |
| 7 | Skills loaded | `after_80x24_skills_loaded` | Sparse OK; chrome height match | `minHeight=listSlots` on loaded list |

**Also:** edit-mode value cell uses `truncate-start` so the caret stays visible; invalid drafts show `invalid` in the footer hint (not `!`). P2: ThemePicker uses terminal-height `listSlots`; ExtensionDialog input windows the caret like SearchBox.

Regenerate: `node --import tsx/esm scripts/capture-pr3-evidence.tsx` then `python3 scripts/txt-frames-to-png.py --dir docs/evidence/pr3-settings-polish`.
