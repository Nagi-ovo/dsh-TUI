# PR #3 Settings TUI polish — headless evidence

Captured by `node --import tsx/esm scripts/capture-pr3-evidence.tsx`.

## Metrics

- `before_metrics.json` — pre-polish jitter summary (hint in list row, title drift)
- `after_metrics.json` — post-polish chrome pins (`titleY=0`, `navY=rows-1`, stable across focus/category/edit/discard)

## Key frames (80×24)

| Before | After open | Focus move | Category switch | Discard |
| --- | --- | --- | --- | --- |
| `before_80x24_open.png` | `after_80x24_open.png` | `after_80x24_focus_move.png` | `after_80x24_category_status.png` | `after_80x24_discard.png` |

120×40 variants use the `after_120x40_*` prefix.
