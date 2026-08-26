# PR #3 visual review — Jesse frame order (source of truth)

Review order (80×24) and the defects each frame exposed. Fixes landed in `e088988`; evidence `.txt` is authoritative (PNG is regenerated from the same headless capture).

| # | Review frame | Evidence file | Defects seen | Fix (e088988+) |
| --- | --- | --- | --- | --- |
| 1 | Settings open | `after_80x24_open` | Value `Engl`; footer hint clipped mid-word | Fixed value col (~20 cols); label truncates first; footer `truncate-end` one line |
| 2 | Focus move | `after_80x24_focus_move` | Value clip; chrome must stay pinned | Same value col; `titleY=0` / `navY=rows-1` in metrics |
| 3 | Dirty toggle | `after_80x24_toggle_dirty` | `user *` glued to value; `unsaved` floating in list well | Title `Settings · unsaved`; badge slots `u`/`*`/value separate; status row blank |
| 4 | Shortcuts tab | `after_80x24_category_shortcuts` | `ctr`; floating `unsaved` | Full `ctrl+p`; dirty suffix stays in title |
| 5 | Plan picker | `after_80x24_plan_picker` | Descriptions must stay height=1 | Select + ListItem fixed desc row (prior commit) |
| 6 | Skills loading | `after_80x24_skills_loading` | Sparse OK; chrome height must match loaded | `listSlots` + `PickerHint` reserved (prior commit) |
| 7 | Skills loaded | `after_80x24_skills_loaded` | Sparse OK; chrome height match | `minHeight=listSlots` on loaded list |

**Not goals:** invent fake General rows; collapse reserved list height.

Regenerate: `node --import tsx/esm scripts/capture-pr3-evidence.tsx` then `python3 scripts/txt-frames-to-png.py --dir docs/evidence/pr3-settings-polish`.
