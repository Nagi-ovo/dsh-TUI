# PR #3 visual review — Jesse frame order (source of truth)

Review order (80×24) and the defects each frame exposed. Evidence `.txt` is authoritative (PNG regenerated from the same headless capture).

| # | Review frame | Evidence file | Defects seen | Fix |
| --- | --- | --- | --- | --- |
| 1 | Settings open | `after_80x24_open` | Value `Engl`; footer hint clipped mid-word | Fixed value col (~20 cols); label truncates first; footer `truncate-end` one line |
| 2 | Focus move | `after_80x24_focus_move` | Value clip; chrome must stay pinned | Same value col; `titleY=0` / `navY=rows-1` in metrics |
| 3 | Dirty toggle | `after_80x24_toggle_dirty` | `u *` mid-row badge; `unsaved` in list well | Title `Settings · unsaved`; 1-col `*` slot before value (`*On`); override `user` only in footer hint |
| 4 | Shortcuts tab | `after_80x24_category_shortcuts` | `ctr`; floating `unsaved` | Full `ctrl+p`; dirty suffix stays in title |
| 5 | Plan picker | `after_80x24_plan_picker` | Descriptions must stay height=1 | Select + ListItem fixed desc row (prior commit) |
| 6 | Skills loading | `after_80x24_skills_loading` | Sparse OK; chrome height must match loaded | `listSlots` + `PickerHint` reserved (prior commit) |
| 7 | Skills loaded | `after_80x24_skills_loaded` | Sparse OK; chrome height match | `minHeight=listSlots` on loaded list |

**Also on this branch (outside Settings chrome):** StatusLine footer fields use `truncate-end` so 80-col metrics no longer clip mid-word.

**Not goals:** invent fake General rows; collapse reserved list height.

Regenerate: `node --import tsx/esm scripts/capture-pr3-evidence.tsx` then `python3 scripts/txt-frames-to-png.py --dir docs/evidence/pr3-settings-polish`.
