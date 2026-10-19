#!/usr/bin/env bash
# Publish the HAC Lab site to GitHub Pages:
#   tools/publish.sh "what changed"
# 1) checks every data/*.json, 2) shrinks large photos, 3) warns about missing photo/PDF files,
# 4) commits and pushes; GitHub Pages rebuilds the site in about a minute.
# Stops before step 4 if any JSON file is broken.
set -euo pipefail
cd "$(dirname "$0")/.."
MSG="${1:-Update site}"

echo "[1/4] Checking data files"
bad=0
for f in data/*.json; do
  if ! out=$(python3 -m json.tool "$f" 2>&1 >/dev/null); then echo "  BAD  $f: $out"; bad=1; fi
done
[ "$bad" = 0 ] || { echo "Fix the file(s) above, then run again. Nothing was published."; exit 1; }
echo "  all data files OK"

echo "[2/4] Shrinking large photos (originals go to ~/hac-lab-site-originals)"
python3 tools/optimize_photos.py

echo "[3/4] Checking referenced files"
python3 - <<'PY'
import json, os
s = json.load(open('data/site.json')); base = s.get('pdfBase', '')
refs = [p.get('src') for p in json.load(open('data/photos.json'))]
m = json.load(open('data/members.json')); refs.append(m['pi'].get('photo'))
refs += [x.get('photo') for x in m.get('students', [])]
pubs = json.load(open('data/publications.json'))
for p in pubs['international'] + pubs['domestic']:
    f = p.get('pdf')
    if f: refs.append(f if '/' in f else base + f)
missing = [r for r in refs if r and not r.startswith('http') and not os.path.exists(r.lstrip('/'))]
for r in missing: print('  missing (link will not work):', r)
print('  all referenced files exist' if not missing else f'  {len(missing)} missing file(s), publishing anyway')
PY

echo "[4/4] Commit and push"
git add -A
if git diff --cached --quiet; then echo "  nothing changed"; exit 0; fi
git commit -q -m "$MSG"
git push -q
echo "Pushed. The site updates in about a minute (browsers may cache files for up to 10 minutes)."
