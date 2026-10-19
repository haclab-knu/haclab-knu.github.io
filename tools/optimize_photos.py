#!/usr/bin/env python3
"""Shrink large photos under photos/ for the web, keeping the originals elsewhere.

- Only touches images whose long side is > MAX_SIDE px or whose file is > MAX_KB.
- Applies the camera's EXIF rotation, then strips EXIF (including GPS location).
- The untouched original is moved to ~/hac-lab-site-originals/<same relative path>
  (outside the site folder, so it is never published).
- Safe to run repeatedly: already-small images are skipped.

Usage:  python3 tools/optimize_photos.py            # do it
        python3 tools/optimize_photos.py --dry-run  # only list what would change
"""
import os, shutil, sys
from pathlib import Path
from PIL import Image, ImageOps

MAX_SIDE = 1600
MAX_KB = 600
QUALITY = 82
ROOT = Path(__file__).resolve().parent.parent
PHOTOS = ROOT / 'photos'
ORIG = Path.home() / 'hac-lab-site-originals'
EXTS = {'.jpg', '.jpeg', '.png', '.webp'}

def main(dry):
    changed = 0
    for f in sorted(PHOTOS.rglob('*')):
        if f.suffix.lower() not in EXTS or not f.is_file():
            continue
        kb = f.stat().st_size // 1024
        with Image.open(f) as im:
            w, h = im.size
        if max(w, h) <= MAX_SIDE and kb <= MAX_KB:
            continue
        rel = f.relative_to(ROOT)
        print(f'{"would shrink" if dry else "shrink"} {rel}: {w}x{h}, {kb} KB', end='')
        if dry:
            print(); continue
        keep = ORIG / rel
        keep.parent.mkdir(parents=True, exist_ok=True)
        if keep.exists():                      # never overwrite a kept original
            keep = keep.with_name(f'{keep.stem}.{int(f.stat().st_mtime)}{keep.suffix}')
        shutil.copy2(f, keep)
        with Image.open(keep) as im:
            im = ImageOps.exif_transpose(im)   # honour phone rotation before EXIF is dropped
            im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
            tmp = f.with_name(f.name + '.tmp')
            if f.suffix.lower() in ('.jpg', '.jpeg'):
                im.convert('RGB').save(tmp, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
            elif f.suffix.lower() == '.png':
                im.save(tmp, 'PNG', optimize=True)
            else:
                im.save(tmp, 'WEBP', quality=QUALITY)
            nw, nh = im.size
        os.replace(tmp, f)
        print(f' -> {nw}x{nh}, {f.stat().st_size // 1024} KB (original kept in {keep})')
        changed += 1
    print(f'{changed} photo(s) shrunk.' if not dry else 'dry run finished.')

if __name__ == '__main__':
    main('--dry-run' in sys.argv)
