#!/usr/bin/env python3
"""Build a single self-contained preview.html (CSS, JS and all data inlined) for quick sharing.
The real site does NOT need this: just serve this folder as-is."""
import base64, json, pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
html = (root/'index.html').read_text()
logo = 'data:image/png;base64,' + base64.b64encode((root/'assets/logo.png').read_bytes()).decode()
css = (root/'assets/style.css').read_text().replace('url("logo.png")', 'url("' + logo + '")')
data = {p.stem: json.loads(p.read_text()) for p in (root/'data').glob('*.json')}
js = 'window.__DATA=' + json.dumps(data, ensure_ascii=False) + ';\n' + (root/'assets/app.js').read_text()
html = re.sub(r'<link rel="stylesheet" href="assets/style.css[^"]*">', lambda m: '<style>'+css+'</style>', html)
html = re.sub(r'<script src="assets/app.js[^"]*"></script>', lambda m: '<script>'+js.replace('</script>','<\\/script>')+'</script>', html)
html = html.replace('src="assets/logo.png"', 'src="' + logo + '"')
(root/'preview.html').write_text(html)
print('wrote preview.html', len(html)//1024, 'KB')
