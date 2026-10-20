/* HAC Lab site v3 — renders everything from data/*.json.
   Content changes go in data/*.json; this file only controls presentation. */
'use strict';
const $ = id => document.getElementById(id);
const setText = (id, t) => { const e = $(id); if (e) e.textContent = t; };   // optional elements may be removed from index.html
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = n => (window.__DATA && window.__DATA[n]) ? Promise.resolve(window.__DATA[n]) : fetch('data/' + n + '.json').then(r => { if (!r.ok) throw new Error(n); return r.json(); });
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function copyText(text, btn, label) {
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
  catch (e) { btn.textContent = 'Select & copy'; }
  setTimeout(() => btn.textContent = label, 1600);
}

/* ---------------- nav ---------------- */
(function nav() {
  const nav = $('nav'), btn = $('menuBtn'), links = $('links');
  const hero = document.querySelector('.hero');
  // transparent over the dark hero, solid once the hero has scrolled under the bar
  const upd = () => nav.classList.toggle('solid', hero.getBoundingClientRect().bottom < 72);
  addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
  btn.onclick = () => { const o = links.classList.toggle('open'); btn.setAttribute('aria-expanded', o); };
  links.addEventListener('click', e => { if (e.target.closest('a')) { links.classList.remove('open'); btn.setAttribute('aria-expanded', false); } });
})();

/* ---------------- hero scene: HashEye pipeline, re-enacted in the browser ----------------
   Follows Hong et al., "HashEye", Sci. Rep. 16:20918 (2026):
   1) split the frame into small patches and SimHash each one (sign of random-hyperplane projections of raw RGB),
   2) sort bucket frequencies and cut at the knee (Kneedle-style) -> dominant buckets are background,
   3) copy each salient patch with surrounding context (dilated copy) into a dense mosaic,
   4) detect on the mosaic, map boxes back to the frame and fuse split boxes (WBF).
   The sea scene mimics the paper's maritime (SeaDroneSee) setting. Patch size is enlarged for display. */
(function scene() {
  const c = $('scene'), x = c.getContext('2d');
  const hud = $('hud'), steps = $('steps');
  if (!c) return;
  const S = 4;                         // samples per patch side in the offscreen frame (vector = S*S*3 values)
  const L = 5;                         // hash length -> 2^L buckets
  const PHASES = [['scan', 2200], ['prune', 1500], ['pack', 1900], ['detect', 2600]];
  const CYCLE = PHASES.reduce((a, p) => a + p[1], 0);
  let W = 0, H = 0, dpr = 1, PS = 14, cols = 0, rows = 0, wide = true;
  let sea, sx, grid, R, t0 = performance.now(), running = false, raf = 0, snap = null, lastPhase = '';
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

  /* --- world: waves, sun glints, boats and swimmers (sample coordinates) --- */
  let waves = [], glints = [], objs = [];
  function world() {
    const sw = cols * S, sh = rows * S, x0 = wide ? .5 : .08;
    waves = Array.from({ length: Math.round(sw * sh / 260) }, () => ({ x: rnd() * sw, y: rnd() * sh, l: 3 + rnd() * 9, a: .05 + rnd() * .12, v: .02 + rnd() * .05 }));
    glints = Array.from({ length: 6 }, () => ({ x: (x0 + rnd() * (.96 - x0)) * sw, y: (.18 + rnd() * .7) * sh, p: rnd() * 6 }));
    objs = Array.from({ length: wide ? 9 : 6 }, (_, i) => ({
      boat: i % 3 === 0, x: (x0 + rnd() * (.94 - x0)) * sw, y: (.16 + rnd() * .76) * sh,
      vx: (rnd() - .5) * .03, vy: (rnd() - .5) * .02, conf: .78 + rnd() * .2,
    }));
  }
  // The pipeline processes one captured frame per cycle; the world moves on between cycles.
  function advance(steps) {
    const sw = cols * S, sh = rows * S, x0 = (wide ? .5 : .08) * sw;
    for (const o of objs) {
      o.x += o.vx * steps; o.y += o.vy * steps;
      if (o.x < x0 || o.x > .95 * sw) { o.vx *= -1; o.x = Math.min(.95 * sw, Math.max(x0, o.x)); }
      if (o.y < .12 * sh || o.y > .94 * sh) { o.vy *= -1; o.y = Math.min(.94 * sh, Math.max(.12 * sh, o.y)); }
    }
  }
  function drawSea(t) {
    const g = sx, sw = sea.width, sh = sea.height;
    const bg = g.createLinearGradient(0, 0, sw, sh); bg.addColorStop(0, '#0d2c3d'); bg.addColorStop(1, '#14445a');
    g.fillStyle = bg; g.fillRect(0, 0, sw, sh);
    g.lineWidth = 1;
    for (const w of waves) {
      const xx = (w.x + t * w.v) % sw;
      g.strokeStyle = `rgba(70,135,165,${w.a * 1.6})`; g.beginPath(); g.moveTo(xx, w.y); g.lineTo(xx + w.l, w.y + .6); g.stroke();
    }
    for (const s of glints) {
      const a = .55 + .45 * Math.sin(t / 300 + s.p);
      g.fillStyle = `rgba(238,242,230,${a})`; g.fillRect(s.x, s.y, 2, 2);
    }
    for (const o of objs) {
      if (o.boat) {
        g.fillStyle = 'rgba(190,215,225,.28)'; g.fillRect(o.x - 5, o.y + .5, 5, 1);          // wake
        g.fillStyle = '#e6e9ea'; g.fillRect(o.x, o.y, 4, 2); g.fillStyle = '#2a2f36'; g.fillRect(o.x + 3, o.y, 1, 2);
      } else {
        g.fillStyle = '#ef7b2a'; g.fillRect(o.x, o.y, 2, 2); g.fillStyle = '#f2c9a0'; g.fillRect(o.x + 2, o.y, 1, 1);
      }
    }
  }

  /* --- SimHash over raw RGB patch vectors --- */
  const D = S * S * 3;
  const hashVec = v => { let h = 0; for (let l = 0; l < L; l++) { let s = 0; const r = R[l]; for (let i = 0; i < D; i++) s += r[i] * v[i]; if (s >= 0) h |= 1 << l; } return h; };
  const uni = (rgb, k = 0, obj = null) => { const v = new Float32Array(D); for (let i = 0; i < S * S; i++) { const c3 = i < k ? obj : rgb; v.set(c3, i * 3); } return v; };
  function makeR() {
    // Like the paper, the projection matrix is generated once (from the first frame's statistics) and then fixed.
    for (let tries = 0; tries < 400; tries++) {
      R = Array.from({ length: L }, () => Float32Array.from({ length: D }, gauss));
      const bgB = new Set([hashVec(uni([11, 36, 51])), hashVec(uni([15, 51, 70])), hashVec(uni([40, 85, 105]))]);
      if (bgB.size > 2) continue;
      const probes = [uni([11, 36, 51], 4, [239, 123, 42]), uni([15, 51, 70], 6, [230, 233, 234]), uni([15, 51, 70], 3, [238, 242, 230])];
      if (probes.every(p => !bgB.has(hashVec(p)))) return;
    }
  }
  function snapshot() {
    const img = sx.getImageData(0, 0, sea.width, sea.height).data, sw = sea.width;
    const buckets = new Int32Array(cols * rows), freq = new Int32Array(1 << L), v = new Float32Array(D);
    for (let py = 0; py < rows; py++) for (let px = 0; px < cols; px++) {
      let k = 0;
      for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
        const o = ((py * S + yy) * sw + px * S + xx) * 4; v[k++] = img[o]; v[k++] = img[o + 1]; v[k++] = img[o + 2];
      }
      const b = hashVec(v); buckets[py * cols + px] = b; freq[b]++;
    }
    // knee of the cumulative, frequency-sorted bucket histogram
    const order = [...freq.keys()].filter(b => freq[b] > 0).sort((a, b) => freq[b] - freq[a]);
    const total = cols * rows; let cum = 0, best = -1, knee = 0;
    order.forEach((b, i) => { cum += freq[b]; const d = cum / total - (i + 1) / order.length; if (d > best) { best = d; knee = i; } });
    const bg = new Set(order.slice(0, knee + 1));
    const sal = []; for (let i = 0; i < total; i++) if (!bg.has(buckets[i])) sal.push(i);
    // objects: which salient patches contain one (true positives) vs. not (false alarms such as glints/wakes)
    const objAt = new Map();
    objs.forEach((o, k) => { const i = Math.floor((o.y + 1) / S) * cols + Math.floor((o.x + 1) / S); objAt.set(i, k); });
    const cells = sal.map((i, n) => {
      // object must lie inside this patch's dilated copy (the patch plus one patch of context)
      const ox0 = ((i % cols) - 1) * S, oy0 = (Math.floor(i / cols) - 1) * S;
      let hit = -1;
      objs.forEach((o, k) => { if (o.x >= ox0 && o.x < ox0 + 3 * S && o.y >= oy0 && o.y < oy0 + 3 * S) hit = k; });
      const gx = i % cols, gy = Math.floor(i / cols);
      const nearGlint = glints.some(g => Math.abs(Math.floor(g.x / S) - gx) <= 1 && Math.abs(Math.floor(g.y / S) - gy) <= 1);
      return { i, n, hit, fp: hit < 0 && nearGlint && n % 2 === 0 };
    })
      // the mosaic holds every salient patch; the panel shows an excerpt, objects and glints first
      .sort((a, b) => (b.hit >= 0) - (a.hit >= 0) || (b.fp - a.fp)).slice(0, wide ? 36 : 0).map((cl, n) => ({ ...cl, n }));
    snap = { buckets, bg, sal, cells, objAt, objs: objs.map(o => ({ ...o })), pruned: 1 - sal.length / total, order, freq };
    setText('hudPruned', (100 * snap.pruned).toFixed(1) + ' %');
  }

  /* --- layout --- */
  function size() {
    const r = c.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    wide = W >= 900; PS = wide ? 18 : 12; cols = Math.ceil(W / PS); rows = Math.ceil(H / PS);
    sea = document.createElement('canvas'); sea.width = cols * S; sea.height = rows * S; sx = sea.getContext('2d', { willReadFrequently: true });
    grid = document.createElement('canvas'); grid.width = c.width; grid.height = c.height;
    const gg = grid.getContext('2d'); gg.scale(dpr, dpr); gg.strokeStyle = 'rgba(160,200,230,.06)'; gg.lineWidth = 1; gg.beginPath();
    for (let i = 0; i <= cols; i++) { gg.moveTo(i * PS + .5, 0); gg.lineTo(i * PS + .5, H); }
    for (let j = 0; j <= rows; j++) { gg.moveTo(0, j * PS + .5); gg.lineTo(W, j * PS + .5); }
    gg.stroke();
    seed = 11; world(); makeR(); drawSea(0); snapshot(); t0 = performance.now();
  }
  function mosaicBox() {
    if (!hud) return null;
    const hr = hud.getBoundingClientRect(), cr = c.getBoundingClientRect();
    const top = 96, bottom = hr.top - cr.top - 18, w = Math.min(hr.width, bottom - top);
    return w > 140 ? { x: hr.left - cr.left + hr.width - w, y: top + (bottom - top - w) / 2, w } : null;
  }

  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const hue = b => (b * 137.5) % 360;
  const pxy = i => [(i % cols) * PS, Math.floor(i / cols) * PS];

  function frame(now) {
    const el = reduced ? CYCLE - 1 : (now - t0) % CYCLE;
    if (!reduced && now - t0 >= CYCLE) { t0 = now - el; advance(480); drawSea(now); snapshot(); }
    let ph = 'scan', pt = 0, acc = 0;
    for (const [n, d] of PHASES) { if (el < acc + d) { ph = n; pt = (el - acc) / d; break; } acc += d; }
    if (reduced) { ph = 'detect'; pt = 1; }
    if (!wide && ph === 'pack') { ph = 'detect'; pt = 0; }
    if (ph !== lastPhase && steps) { lastPhase = ph; [...steps.children].forEach(li => li.classList.toggle('on', li.dataset.s === ph)); }

    x.imageSmoothingEnabled = true; x.drawImage(sea, 0, 0, cols * PS, rows * PS);
    x.drawImage(grid, 0, 0, W, H);
    const sn = snap; if (!sn) return;
    const salSet = new Set(sn.sal);
    const cr = c.getBoundingClientRect(), hr = hud ? hud.getBoundingClientRect() : null;
    const keepOut = rects => {   // clip everything drawn next so it never covers the HUD card (or the mosaic)
      x.save(); x.beginPath(); x.rect(0, 0, W, H);
      for (const r of rects) if (r && r.w > 0) x.rect(r.x, r.y, r.w, r.h);
      x.clip('evenodd');
    };
    const hudR = hr && hr.width ? { x: hr.left - cr.left - 6, y: hr.top - cr.top - 6, w: hr.width + 12, h: hr.height + 12 } : null;
    if (ph !== 'scan') { const f = ph === 'prune' ? ease(pt) : 1; x.fillStyle = `rgba(4,9,18,${.5 * f})`; x.fillRect(0, 0, W, H); }
    keepOut([hudR]);

    if (ph === 'scan') {
      const sweep = ease(pt) * (W + PS);
      for (let i = 0; i < cols * rows; i++) {
        const [X, Y] = pxy(i); if (X > sweep) continue;
        x.fillStyle = `hsla(${hue(sn.buckets[i])},70%,55%,.16)`; x.fillRect(X, Y, PS, PS);
      }
      x.fillStyle = 'rgba(70,214,207,.9)'; x.fillRect(sweep, 0, 2, H);
      x.fillStyle = 'rgba(70,214,207,.12)'; x.fillRect(sweep - 40, 0, 40, H);
    } else {
      const fade = ph === 'prune' ? ease(pt) : 1;
      for (const i of sn.sal) {
        const [X, Y] = pxy(i);
        x.drawImage(sea, (i % cols) * S, Math.floor(i / cols) * S, S, S, X, Y, PS, PS);
        const calm = wide ? Math.min(1, Math.max(.15, (X / W - .38) / .2)) : .5;   // quieter behind the headline
        x.strokeStyle = `rgba(70,214,207,${(.35 + .55 * fade) * calm})`; x.lineWidth = 1; x.strokeRect(X + .5, Y + .5, PS - 1, PS - 1);
      }
      if (ph === 'prune' && fade < 1) {
        for (let i = 0; i < cols * rows; i++) if (!salSet.has(i)) { const [X, Y] = pxy(i); x.fillStyle = `hsla(${hue(sn.buckets[i])},70%,55%,${.16 * (1 - fade)})`; x.fillRect(X, Y, PS, PS); }
      }
    }
    x.restore();

    const box = wide ? mosaicBox() : null;
    if (box && (ph === 'pack' || ph === 'detect') && sn.cells.length) {
      const m = Math.ceil(Math.sqrt(sn.cells.length)), cs = box.w / m;
      const k = ph === 'pack' ? pt : 1;
      x.fillStyle = `rgba(6,12,24,${.85 * Math.min(1, k * 3)})`; x.fillRect(box.x - 8, box.y - 26, box.w + 16, box.w + 34);
      x.strokeStyle = 'rgba(255,255,255,.14)'; x.strokeRect(box.x - 7.5, box.y - 25.5, box.w + 15, box.w + 33);
      x.font = '500 10px "JetBrains Mono", monospace'; x.fillStyle = 'rgba(200,215,235,.8)';
      x.fillText('MOSAIC (EXCERPT) → YOLOv8', box.x, box.y - 10);
      for (const cl of sn.cells) {
        const d = Math.min(1, Math.max(0, (k * 1.6 - cl.n / sn.cells.length * .6)));
        const e = ease(d);
        const [X0, Y0] = pxy(cl.i), tx = box.x + (cl.n % m) * cs, ty = box.y + Math.floor(cl.n / m) * cs;
        const sz = PS * 3 + (cs - PS * 3) * e, cx = (X0 - PS) + (tx - (X0 - PS)) * e, cy = (Y0 - PS) + (ty - (Y0 - PS)) * e;
        // dilated copy: the patch plus one patch of context on each side
        const sx0 = ((cl.i % cols) - 1) * S, sy0 = (Math.floor(cl.i / cols) - 1) * S;
        x.drawImage(sea, sx0, sy0, S * 3, S * 3, cx, cy, sz, sz);
        x.strokeStyle = 'rgba(10,16,32,.9)'; x.strokeRect(cx + .5, cy + .5, sz - 1, sz - 1);
        if (ph === 'detect' && (cl.hit >= 0 || cl.fp)) {
          const a = Math.min(1, pt * 4);
          x.strokeStyle = cl.hit >= 0 ? `rgba(242,180,65,${a})` : `rgba(255,95,95,${a * .9})`;
          x.setLineDash(cl.hit >= 0 ? [] : [3, 2]); x.lineWidth = 1.5;
          // box where the object (or the false-alarm glint) sits inside the dilated copy
          const tgt = cl.hit >= 0 ? sn.objs[cl.hit] : { x: sx0 + 1.5 * S, y: sy0 + 1.5 * S, boat: false };
          const bw = (tgt.boat ? 5 : 3) / (3 * S) * sz + 6, bh = 2 / (3 * S) * sz + 6;
          x.strokeRect(cx + (tgt.x - sx0) / (3 * S) * sz - 3, cy + (tgt.y - sy0) / (3 * S) * sz - 3, bw, bh); x.setLineDash([]); x.lineWidth = 1;
        }
      }
    }

    if (ph === 'detect') {
      const avoid = [hudR, box && { x: box.x - 10, y: box.y - 28, w: box.w + 20, h: box.w + 38 }].filter(Boolean);
      const hits = (l, t, w, h) => avoid.some(r => l < r.x + r.w && l + w > r.x && t < r.y + r.h && t + h > r.y);
      const a = wide ? Math.max(0, Math.min(1, (pt - .3) * 3)) : Math.min(1, pt * 3);
      const fused = new Map(); // WBF: several mosaic boxes of one object become one box on the frame
      for (const cl of sn.cells.length ? sn.cells : sn.sal.map(i => ({ i, hit: [...sn.objAt].find(([j]) => j === i)?.[1] ?? -1 })))
        if (cl.hit >= 0) fused.set(cl.hit, true);
      x.font = '500 10px "JetBrains Mono", monospace';
      for (const k of fused.keys()) {
        const o = sn.objs[k], X = o.x / S * PS, Y = o.y / S * PS, s = o.boat ? 13 : 10;
        if (wide && X < W * .45) continue;
        if (hits(X - s / 2 - 2, Y - s / 2 - (wide ? 17 : 2), (wide ? 110 : s + 8), s + (wide ? 19 : 4))) continue;
        x.strokeStyle = `rgba(242,180,65,${a})`; x.lineWidth = 1.5; x.strokeRect(X - s / 2, Y - s / 2, s + 4, s); x.lineWidth = 1;
        if (wide && a > .5) {
          const label = (o.boat ? 'boat ' : 'person ') + o.conf.toFixed(2), lw = x.measureText(label).width + 8;
          x.fillStyle = `rgba(242,180,65,${a})`; x.fillRect(X - s / 2, Y - s / 2 - 15, lw, 14);
          x.fillStyle = '#1b1204'; x.fillText(label, X - s / 2 + 4, Y - s / 2 - 4);
        }
      }
    }
    if (running && !reduced) raf = requestAnimationFrame(frame);
  }
  const start = () => { if (running || reduced) return; running = true; raf = requestAnimationFrame(frame); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  size(); frame(performance.now());
  let rt; new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { size(); frame(performance.now()); }, 120); }).observe(c);
  new IntersectionObserver(([e]) => e.isIntersecting && !document.hidden ? start() : stop()).observe(c);
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
})();

/* ---------------- data ---------------- */
Promise.all(['site', 'research', 'news', 'publications', 'members', 'lectures', 'photos'].map(load))
  .then(([site, research, news, pubs, members, lectures, photos]) => {
    renderSite(site); renderResearch(research); renderNews(news);
    renderPubs(pubs, site); renderMembers(members, site); renderLectures(lectures); renderPhotos(photos);
  })
  .catch(e => { console.error(e); document.querySelector('main').insertAdjacentHTML('afterbegin', '<p class="wrap" style="padding:24px 0;color:#c0392b">Could not load site data. Serve this folder over HTTP (file:// does not work).</p>'); });

function renderSite(s) {
  setText('affil', s.affiliation);
  setText('intro', s.intro);
  setText('recruitText', s.recruiting);
  setText('joinMail', s.email);
  if ($('copyMail')) $('copyMail').onclick = e => copyText(s.email, e.currentTarget, 'Copy email');
  if ($('faddr')) $('faddr').innerHTML = esc(s.fullName) + '<br>' + esc(s.affiliation) + '<br>' + s.address.map(esc).join('<br>');
  setText('fmail', s.email);
  setText('year', new Date().getFullYear());
}

/* ---------------- research explorer ---------------- */
function renderResearch(r) {
  const tabs = $('rxTabs'), panel = $('rxPanel');
  tabs.innerHTML = r.map((a, i) => `<button class="rx-tab" role="tab" id="rxt${i}" aria-selected="${i === 0}" aria-controls="rxPanel" data-i="${i}">
      <b>${esc(a.area)}</b><small>${esc(a.topic)}</small></button>`).join('');
  const show = i => {
    const a = r[i];
    [...tabs.children].forEach((t, k) => t.setAttribute('aria-selected', k === i));
    panel.setAttribute('aria-labelledby', 'rxt' + i);
    panel.innerHTML = `<p class="eyebrow">${esc(a.sub || 'Research area')}</p><h3>${esc(a.area)}</h3><p class="topic">${esc(a.topic)}</p>
      <ul class="proj">${a.projects.map(p => `<li>
        <span class="t">${p.ongoing ? '<span class="badge">Ongoing</span>' : ''}${esc(p.title)}</span>
        <span class="m">${esc(p.sponsor)}${p.role ? `<span class="role">${esc(p.role)}</span>` : ''}</span>
        <span class="p">${esc(p.period)}</span></li>`).join('')}</ul>`;
    panel.classList.remove('swap'); void panel.offsetWidth; panel.classList.add('swap');
  };
  tabs.addEventListener('click', e => { const b = e.target.closest('.rx-tab'); if (b) show(+b.dataset.i); });
  tabs.addEventListener('keydown', e => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const cur = [...tabs.children].findIndex(t => t.getAttribute('aria-selected') === 'true');
    const nx = (cur + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + r.length) % r.length;
    show(nx); tabs.children[nx].focus(); e.preventDefault();
  });
  show(0);
}

/* ---------------- news ---------------- */
function renderNews(n) {
  const fmt = d => { const [y, m] = String(d).split('-'); return m ? MONTHS[+m - 1] + ' ' + y : y; };
  const [f, ...rest] = n;
  $('newsList').innerHTML = (f ? `<article class="feat"><span class="tag ${f.hl ? 'hl' : ''}">${esc(f.tag)}</span>
      <div class="date">${esc(fmt(f.date))}</div><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p></article>` : '') +
    `<div class="nlist">${rest.map(x => `<div class="ni"><time>${esc(fmt(x.date))}</time><div><b>${esc(x.title)}</b><span class="s">${esc(x.text)}</span></div><span class="tag ${x.hl ? 'hl' : ''}">${esc(x.tag)}</span></div>`).join('')}</div>`;
}

/* ---------------- publications ---------------- */
const clean = a => a.replace(/\*/g, '');
const short = n => { const t = n.trim(), st = t.endsWith('*') ? '*' : '', w = clean(t).split(/\s+/); return w[0][0] + '. ' + w.slice(1).join(' ') + st; };
let knum = 0;
function bibtex(p) {
  const names = clean(p.authors).split(/,\s*/);
  const authors = names.map(n => { const w = n.split(' '); return w.slice(-1) + ', ' + w.slice(0, -1).join(' '); }).join(' and ');
  const dom = p.type === 'domestic', type = dom ? 'inproceedings' : p.type;
  const key = (dom ? names[names.length - 1].split(' ').pop() : names[0].split(' ').pop()).toLowerCase() + p.year +
    (dom ? 'kr' + (++knum) : p.title.split(/[\s:]+/).find(w => w.length > 3).toLowerCase().replace(/[^a-z0-9]/g, ''));
  const f = [['author', authors], ['title', p.title], [type === 'article' ? 'journal' : 'booktitle', p.venueFull], ['year', p.year]];
  if (p.note) f.push(['note', p.note]);
  return `@${type}{${key},\n` + f.map(([k, v]) => `  ${k} = {${v}},`).join('\n') + '\n}';
}
function authorsHtml(p, pi) {
  if (p.authorsKo) return p.authorsKo.split(', ').map(n => pi.includes(n) ? `<u>${esc(n)}</u>` : esc(n)).join(', ');
  return p.authors.split(', ').map(n => pi.includes(clean(n).trim()) ? `<u>${esc(short(n))}</u>` : esc(short(n))).join(', ');
}
// "SCI · IF 4.9 · Q1" becomes three pills; each kind gets its own color
const splitTags = tags => (tags || []).flatMap(t => String(t).split(/\s*[·|]\s*/)).filter(Boolean);
const tagKind = t => /^SCIE?$/i.test(t) ? 't-sci' : /^IF\b/i.test(t) ? 't-if' : /^Q[1-4]$/i.test(t) ? 't-q' : /review/i.test(t) ? 't-rev' : '';
// a bare file name is looked up in pdfBase; anything with a slash (or a full URL) is used as written
const pdfHref = (f, base) => /\//.test(f) ? f : (base || '') + f;
let uid = 0;
function pubEntry(p, site) {
  const id = 'bib' + (uid++), bib = p.bibtex || bibtex(p), dom = p.type === 'domestic';
  const kind = dom ? 'Domestic' : p.type === 'article' ? 'Journal' : p.type === 'misc' ? 'Preprint' : 'Conference';
  const el = document.createElement('article'); el.className = 'pe';
  el.dataset.q = (p.title + ' ' + p.authors + ' ' + (p.authorsKo || '') + ' ' + p.venue).toLowerCase();
  el.innerHTML = `<div><h3>${esc(p.title)}</h3><div class="au">${authorsHtml(p, site.piNames)}</div>
      <div class="meta"><span class="kind">${kind}</span>${p.month ? `<span class="chip">${esc(p.month)} ${p.year}</span>` : ''}${splitTags(p.tags).map(t => `<span class="chip ${tagKind(t)}">${esc(t)}</span>`).join('')}</div>
      <div class="lk">${p.pdf ? `<a href="${esc(pdfHref(p.pdf, site.pdfBase))}" target="_blank" rel="noopener">PDF</a>` : ''}<button aria-expanded="false" aria-controls="${id}">BibTeX</button></div>
      <div class="bib" id="${id}" hidden><button>Copy</button><pre>${esc(bib)}</pre></div></div>
    <span class="ven ${dom ? 'dom' : ''} ${p.note ? 'rev' : ''}" title="${esc(p.venueFull)}">${esc(p.venue)}</span>`;
  const tg = el.querySelector('.lk button'), box = el.querySelector('.bib'), cp = box.querySelector('button');
  tg.onclick = () => { box.hidden = !box.hidden; tg.setAttribute('aria-expanded', !box.hidden); };
  cp.onclick = () => {
    const r = document.createRange(); r.selectNodeContents(box.querySelector('pre')); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    copyText(bib, cp, 'Copy');
  };
  return el;
}
function renderPubs(d, site) {
  // Selective = papers marked "selective": true; they stay in International as well
  const sets = { selective: d.international.filter(p => p.selective), international: d.international, domestic: d.domestic };
  if (!sets.selective.length) delete sets.selective;
  const els = Object.fromEntries(Object.entries(sets).map(([k, list]) => [k, list.map(p => [p, pubEntry(p, site)])]));
  const recent = Math.max(...d.international.map(p => p.year)) - 3;
  let tab = Object.keys(sets)[0], expanded = false, q = '';
  $('pubTabs').innerHTML = Object.keys(sets).map(k => `<button role="tab" data-k="${k}" aria-selected="${k === tab}">${k[0].toUpperCase() + k.slice(1)}<span>${sets[k].length}</span></button>`).join('');
  const render = () => {
    const list = $('pubList'); list.textContent = '';
    let rows = els[tab].filter(([, el]) => !q || el.dataset.q.includes(q));
    const hidden = (!q && !expanded && tab === 'international') ? rows.filter(([p]) => p.year < recent).length : 0;
    if (hidden) rows = rows.filter(([p]) => p.year >= recent);
    const years = [...new Set(rows.map(([p]) => p.year))];
    for (const y of years) {
      const g = document.createElement('div'); g.className = 'yg';
      g.innerHTML = `<div class="yr">${y}</div><div class="ys"></div>`;
      rows.filter(([p]) => p.year === y).forEach(([, el]) => g.lastChild.append(el));
      list.append(g);
    }
    $('pubMore').hidden = !hidden; $('pubMore').textContent = `Show ${hidden} earlier papers`;
    $('pubEmpty').hidden = rows.length > 0;
  };
  $('pubTabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; tab = b.dataset.k;
    [...$('pubTabs').children].forEach(x => x.setAttribute('aria-selected', x === b)); render();
  });
  $('pubSearch').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); render(); });
  $('pubMore').onclick = () => { expanded = true; render(); };
  render();
}

/* ---------------- members ---------------- */
const GRADS = ['#0b7f83,#0c1322', '#1d4f7a,#0b7f83', '#3c3a72,#0c1322', '#8a5a14,#0c1322', '#145a46,#0c1322', '#6a2f45,#0c1322'];
const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const initials = n => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('');
function avatar(name, photo) {
  const g = GRADS[hash(name) % GRADS.length];
  const d = document.createElement('div'); d.className = 'avatar'; d.style.setProperty('--g', `linear-gradient(135deg,${g})`);
  d.textContent = initials(name);
  if (photo) { const i = new Image(); i.alt = name; i.onload = () => d.append(i); i.src = photo; }
  return d;
}
function renderMembers(m) {
  const p = m.pi, card = document.createElement('div'); card.className = 'pi-card';
  card.append(avatar(p.name, p.photo));
  const info = document.createElement('div');
  info.innerHTML = `<span class="who">Principal Investigator</span><h3>${esc(p.name)}<span>${esc(p.nameKo)}</span></h3>
    <p class="pos">${esc(p.role.replace(/^Principal Investigator\s*·\s*/, ''))} · ${esc(p.dept)}</p>
    <div class="interests">${p.research.split(/,\s*/).map(t => `<span>${esc(t)}</span>`).join('')}</div>
    <span class="mail">${esc(p.email)} <button>Copy</button></span>`;
  info.querySelector('.mail button').onclick = e => copyText(p.email, e.currentTarget, 'Copy');
  card.append(info); $('pi').replaceChildren(card);
  $('people').replaceChildren(...m.students.map(s => {
    const c = document.createElement('div'); c.className = 'person';
    c.insertAdjacentHTML('beforeend', `<b>${esc(s.name)}</b><span class="r">${esc(s.role)}</span><span class="e">${esc(s.email)}</span>`);
    return c;
  }));
}

/* ---------------- lectures ---------------- */
function renderLectures(l) {
  $('lec').innerHTML = Object.entries(l).map(([sem, items]) => `<div class="lec-col"><h3>${esc(sem)}<span>${items.length} courses</span></h3><ul>` +
    items.map(x => `<li><span class="lvl ${x.level === 'Graduate' ? 'g' : ''}">${x.level === 'Graduate' ? 'GRAD' : 'UG'}</span><span>${esc(x.title)}</span><em>${esc(x.since)}</em></li>`).join('') + '</ul></div>').join('');
}

/* ---------------- photo showcase ---------------- */
function renderPhotos(PH) {
  const N = PH.length, DUR = 5000; if (!N) { $('photo').hidden = true; return; }
  let cur = 0, timer = null, auto = !reduced;
  const grads = ['#0b7f83,#0a1020', '#1d4f7a,#46a8a0', '#3c3a72,#0b7f83', '#8a5a14,#0b3f4a', '#145a46,#0a1020', '#6a2f45,#0b5a63'];
  PH.forEach((p, i) => {
    const g = `linear-gradient(135deg,${grads[i % grads.length]})`;
    const s = document.createElement('div'); s.className = 'sl'; s.setAttribute('aria-hidden', 'true');
    s.innerHTML = `<div class="bgimg" style="--g:${g}"></div><div class="cap"><span class="no">${String(i + 1).padStart(2, '0')} / ${String(N).padStart(2, '0')}</span><h3>${esc(p.title)}</h3><p>${esc(p.caption)}</p></div>`;
    if (p.src) { const im = new Image(); im.alt = p.title; im.onload = () => s.firstChild.append(im); im.src = p.src; }
    $('stage').append(s);
    const t = document.createElement('button'); t.style.setProperty('--g', g); t.setAttribute('aria-label', p.title); t.onclick = () => go(i);
    if (p.src) { const ti = new Image(); ti.alt = ''; ti.onload = () => t.append(ti); ti.src = p.src; }
    $('thumbs').append(t);
  });
  const bar = $('progress');
  const render = () => {
    [...$('stage').children].forEach((e, i) => { e.classList.toggle('on', i === cur); e.setAttribute('aria-hidden', i !== cur); });
    [...$('thumbs').children].forEach((e, i) => e.classList.toggle('on', i === cur));
    bar.classList.remove('run'); void bar.offsetWidth; if (auto) { bar.style.setProperty('--dur', DUR + 'ms'); bar.classList.add('run'); } else bar.style.width = ((cur + 1) / N * 100) + '%';
    if (auto) bar.style.width = '';
  };
  const restart = () => { clearInterval(timer); if (auto) timer = setInterval(() => { cur = (cur + 1) % N; render(); }, DUR); };
  const go = i => { cur = (i + N) % N; render(); restart(); };
  $('prev').onclick = () => go(cur - 1); $('next').onclick = () => go(cur + 1);
  $('play').onclick = () => { auto = !auto; $('play').setAttribute('aria-pressed', auto); $('play').textContent = auto ? 'Pause' : 'Play'; render(); restart(); };
  $('show').addEventListener('keydown', e => { if (e.key === 'ArrowLeft') go(cur - 1); if (e.key === 'ArrowRight') go(cur + 1); });
  let sx = null;
  $('stage').addEventListener('pointerdown', e => sx = e.clientX);
  $('stage').addEventListener('pointerup', e => { if (sx !== null && Math.abs(e.clientX - sx) > 50) go(cur + (e.clientX < sx ? 1 : -1)); sx = null; });
  // pause while off screen so the timer does not run in the background
  new IntersectionObserver(([e]) => { if (!auto) return; if (e.isIntersecting) { render(); restart(); } else clearInterval(timer); }).observe($('show'));
  if (!auto) $('play').textContent = 'Play';
  render(); restart();
}
