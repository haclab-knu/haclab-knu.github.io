# HAC Lab website

Static, data-driven site. No build step, no database, no framework.
All content lives in `data/*.json`; `assets/app.js` renders it in the browser.

## Layout
```
index.html          page skeleton
assets/style.css    design
assets/app.js       renders data/*.json (do not edit for content changes)
data/site.json      lab name, intro, address, email, recruiting text, pdfBase
data/research.json  research areas and awarded projects
data/news.json      latest news
data/publications.json  international + domestic papers (BibTeX is generated)
data/members.json   PI, students, alumni
data/lectures.json  courses
data/photos.json    photo slideshow (Korean captions)
files/pdf/          paper PDFs      (path set by "pdfBase" in site.json)
photos/             slideshow images and member photos
```

## Where to edit what
| What | File |
|---|---|
| Intro text, address, email, recruiting text, PDF folder | `data/site.json` (`intro`, `address`, `email`, `recruiting`, `pdfBase`) |
| Research areas and projects | `data/research.json` |
| News | `data/news.json` (newest first; the first item becomes the large card) |
| Papers + BibTeX | `data/publications.json` |
| Members | `data/members.json` (PI photo: `pi.photo`) |
| Courses | `data/lectures.json` |
| Photo slideshow | `data/photos.json` + image files in `photos/` |
| Logo | `assets/logo.png` (transparent PNG) |
| Fixed headings and labels (hero title, section titles, Join text heading, menu) | `index.html` |
| Colors, fonts, layout | `assets/style.css` |
| Hero animation, rendering logic | `assets/app.js` (normally not needed) |

After changing `assets/style.css` or `assets/app.js`, bump `?v=N` on both links in `index.html`.

## Everyday edits
- **New paper**: add an object to `data/publications.json` (copy an existing one), put the PDF in `files/pdf/`, set `"pdf"` to its file name. Leave `"pdf": ""` to hide the PDF link. BibTeX appears automatically.
- **PDF location**: change `"pdfBase"` in `data/site.json` (e.g. `"/files/pdf/"`, or a full URL such as `"https://example.ac.kr/hac/pdf/"`).
- **News**: add an object at the top of `data/news.json`.
- **Photos**: put images in `photos/` and edit `data/photos.json` (`src`, Korean `title`, `caption`). Recommended 1600x800 JPG, under 400 KB each. Missing images fall back to a colored placeholder.
- **Members**: edit `data/members.json`; photos go in `photos/members/` (square or 4:5, 600 px).

## Publishing (GitHub Pages)
The site is served from this repository by GitHub Pages: https://haclab-knu.github.io
Edit files here, preview locally (below), then run:
```bash
tools/publish.sh "what changed"
```
It does four things in order:
1. **Checks every `data/*.json`.** If one has a syntax error it prints the file and line and stops; nothing is published.
2. **Shrinks large photos** in `photos/` (long side > 1600 px or file > 600 KB) to 1600 px, applies the phone's rotation and removes EXIF data (including GPS location). The untouched original is moved to `~/hac-lab-site-originals/` (outside the repository, never published). Already-small photos are left alone.
3. **Warns about missing files** referenced from `photos.json`, `members.json` and `publications.json`.
4. **Commits and pushes.** GitHub rebuilds the site in about a minute.

Preview what step 2 would change: `python3 tools/optimize_photos.py --dry-run`

Everything in this repository is public, including `README.md` and `tools/`. Never put originals, private notes or publisher-only PDFs here.
GitHub Pages caches files for up to 10 minutes; press `Ctrl+Shift+R` if you still see the old version. After changing `assets/style.css` or `assets/app.js`, bump `?v=N` in `index.html`.

### Paper PDFs
Open-access papers (e.g. Scientific Reports, MDPI) may be posted as published. For ACM, IEEE and Springer papers post the author's accepted manuscript, not the publisher's final PDF.

### Custom domain (later)
Repository Settings → Pages → Custom domain → enter the domain (e.g. `haclab.kongju.ac.kr`), and ask IT for a DNS `CNAME` record pointing that name to `haclab-knu.github.io`. GitHub issues the HTTPS certificate automatically; then tick "Enforce HTTPS".

## Publications: tags, PDF, BibTeX
- `"tags"`: each item becomes its own pill. `"SCI, IF 4.9, Q1"` or `["SCI", "IF 4.9", "Q1"]` both work. SCI, IF, Q1–Q4 and CS BK21+ get their own colors.
- `"pdf"`: a bare file name (`2026_hasheye.pdf`) is looked up in `pdfBase` from `site.json`; a path with a slash (`papers/x.pdf`) or a full URL is used as written. Leave `""` to hide the link.
- `"bibtex"`: the exact BibTeX shown when visitors click BibTeX (paste Google Scholar's version here). Without it, a minimal entry is generated from title/authors/venue/year.

## When the page says "Could not load site data"
1. Run the JSON check (step 1 above, or `tools/publish.sh`); fix the file and line it reports.
2. If all JSON is fine, open the browser console (F12) and look for the red error; usually a removed element or a missing file.
3. Opening `index.html` directly (`file://`) never works; use the server URL or `python3 -m http.server`.

## Preview locally
```bash
cd hac-lab-site
python3 -m http.server 8000      # open http://localhost:8000
```
(`file://` does not work because the page fetches JSON.)

`python3 tools/build_preview.py` writes a single-file `preview.html` for emailing; the real site does not need it.
