#!/usr/bin/env python3
"""Render plain terminal .txt frames to PNG for PR evidence.

Usage:
  python3 scripts/txt-frames-to-png.py path/to/frame.txt [more.txt ...]
  python3 scripts/txt-frames-to-png.py --dir /opt/cursor/artifacts

Strips ANSI escapes, uses a dark terminal palette, pads to a fixed cell grid.
Cell width/height are measured from the chosen monospace font so an 80-column
frame is never cropped on the right (DejaVu 14px is ~9–10px/cell, not 8).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ANSI_RE = re.compile(r'\x1b\[[0-9;]*[A-Za-z]')
PAD = 8
BG = (12, 12, 12)
FG = (204, 204, 204)


def strip_ansi(text: str) -> str:
    return ANSI_RE.sub('', text)


def load_font() -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in (
        '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf',
    ):
        p = Path(path)
        if p.exists():
            return ImageFont.truetype(str(p), 14)
    return ImageFont.load_default()


def cell_metrics(font: ImageFont.FreeTypeFont | ImageFont.ImageFont) -> tuple[int, int]:
    """Monospace cell size from the font, not a hard-coded 8×16 guess."""
    sample = 'M' * 80
    bbox = font.getbbox(sample)
    cell_w = max(1, (bbox[2] - bbox[0] + 79) // 80)
    ascent, descent = font.getmetrics()
    cell_h = max(1, ascent + descent + 2)
    return cell_w, cell_h


def render_txt(txt_path: Path, font: ImageFont.FreeTypeFont | ImageFont.ImageFont) -> Path:
    lines = strip_ansi(txt_path.read_text(encoding='utf-8')).splitlines()
    cols = max((len(line) for line in lines), default=1)
    rows = max(len(lines), 1)
    cell_w, cell_h = cell_metrics(font)
    width = PAD * 2 + cols * cell_w
    height = PAD * 2 + rows * cell_h
    img = Image.new('RGB', (width, height), BG)
    draw = ImageDraw.Draw(img)
    for y, line in enumerate(lines):
        draw.text((PAD, PAD + y * cell_h), line, font=font, fill=FG)
    out = txt_path.with_suffix('.png')
    img.save(out)
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('paths', nargs='*', help='.txt frame files')
    parser.add_argument('--dir', help='convert every .txt in a directory')
    args = parser.parse_args()
    targets: list[Path] = []
    if args.dir:
        targets.extend(sorted(Path(args.dir).glob('*.txt')))
    targets.extend(Path(p) for p in args.paths)
    if not targets:
        parser.error('no input files')
    font = load_font()
    for path in targets:
        out = render_txt(path, font)
        print(out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
