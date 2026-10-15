/* screens/candidate.js — Campaign-in-a-Box (Agent 6)
   Sub-routes: '' pipeline · builder · microsite/<id> · print · social
   All AI and payment behavior is simulated and deterministic. */
(function () {
  'use strict';
  if (!window.App) return;

  const U = App.util;
  const esc = U.esc;
  const TODAY = '2026-10-14';

  const I = (d, s) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = I('<path d="M3 7.5l7-4 7 4v7l-7 4-7-4z"/><path d="M3 7.5l7 4 7-4M10 11.5v7"/>');
  const IC_CHECK = I('<path d="M4.5 10.5l3.5 3.5 7.5-8"/>', 16);
  const IC_X = I('<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>', 16);
  const IC_LOCK = I('<rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.8a3 3 0 0 1 6 0V9"/>', 14);
  const IC_ARROW = I('<path d="M4 10h11M11 6l4 4-4 4"/>', 16);

  const STAGES = [
    ['RECRUITED', 'Recruited', 'Said yes to running'],
    ['FILED', 'Filed', 'Papers filed with the county'],
    ['ENDORSED', 'Endorsed', 'Endorsed by the committee'],
    ['ACTIVE_CAMPAIGN', 'Active campaign', 'Site, print and posts running'],
  ];
  const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s[0], s[1]]));

  /* ---------------- shared state ---------------- */
  function st() {
    const s = App.state;
    s.disclaimers = s.disclaimers || {};
    s.newCandidates = s.newCandidates || [];
    s.cand_stage = s.cand_stage || {};
    s.cand_sel = s.cand_sel || {};
    s.cand_wiz = s.cand_wiz || {};
    s.cand_social = s.cand_social || {};
    s.cand_print = s.cand_print || {};
    s.cand_vol = s.cand_vol || {};
    return s;
  }

  /* Disclaimer rule (contract): read as App.state.disclaimers?.[c.id] || App.util.disclaimer(c).
     App.util.disclaimer(c) FALLS BACK to composing "Paid for by <committeeName>, FPPC #<fppcId>"
     when c.disclaimer is '' — so it never returns empty. We therefore treat a candidate as
     MISSING its disclaimer when c.disclaimer is empty AND no App.state.disclaimers entry exists. */
  function discInfo(c) {
    const typed = App.state.disclaimers?.[c.id];
    const read = typed || App.util.disclaimer(c);
    const missing = !(typed && String(typed).trim()) && !(c.disclaimer && String(c.disclaimer).trim());
    return { text: missing ? '' : read, missing };
  }

  function candidates(ctx) {
    const s = st();
    const base = (ctx.tenant && ctx.tenant.candidates) || [];
    const extra = s.newCandidates.filter((c) => c.tenantSlug === ctx.tenantSlug);
    return base.concat(extra).map((c) => (s.cand_stage[c.id] ? Object.assign({}, c, { status: s.cand_stage[c.id] }) : c));
  }
  const isEndorsed = (c) => c.status === 'ENDORSED' || c.status === 'ACTIVE_CAMPAIGN';
  /* Bare candidate/microsite defaults to the first ENDORSED candidate, else the first candidate. */
  function defaultMicrosite(list) { return list.find((c) => c.status === 'ENDORSED') || list[0]; }
  function selected(ctx, list) {
    const id = st().cand_sel[ctx.tenantSlug];
    return list.find((c) => c.id === id) || list[0];
  }
  function colors(c, ctx) {
    const tc = (ctx.tenant && ctx.tenant.colors) || {};
    return { b: c.brand || tc.brand || '#0B2A4A', a: c.accent || tc.accent || '#C8102E' };
  }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function fmtDate(iso, opt) {
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-US', opt || { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
  function wrap(text, n) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = []; let cur = '';
    words.forEach((w) => {
      if ((cur + ' ' + w).trim().length > n && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    });
    if (cur) lines.push(cur);
    return lines;
  }
  /* ---------- Photos ----------
     Face-aware crops. FACES holds the focal point (fx, fy as fractions of the image) and the face
     height (fh, fraction of image height) for the supplied photos; anything else falls back to
     c.photoPos with a typical face size. cropBox() returns where to place the full image inside a
     W x H box so the face lands at (ax, ay) and takes up k of the box height. */
  const FACES = {
    'images/photo-1.jpg': { ar: 600 / 900, fx: 0.51, fy: 0.22, fh: 0.17 },
    'images/photo-2.jpg': { ar: 600 / 900, fx: 0.43, fy: 0.26, fh: 0.17 },
    'images/photo-3.jpg': { ar: 601 / 900, fx: 0.53, fy: 0.21, fh: 0.20 },
    'images/photo-4.jpg': { ar: 600 / 900, fx: 0.55, fy: 0.34, fh: 0.12 },
    'images/photo-5.jpg': { ar: 900 / 600, fx: 0.56, fy: 0.31, fh: 0.50 },
  };
  const SAMPLE_PHOTOS = [
    ['images/photo-1.jpg', '50% 22%'], ['images/photo-3.jpg', '50% 24%'], ['images/photo-5.jpg', '56% 30%'],
    ['images/photo-2.jpg', '50% 22%'], ['images/photo-4.jpg', '56% 36%'],
  ];
  function faceInfo(c) {
    if (FACES[c.photo]) return FACES[c.photo];
    const m = String(c.photoPos || '50% 25%').match(/([\d.]+)%\s+([\d.]+)%/);
    return { ar: 2 / 3, fx: m ? +m[1] / 100 : 0.5, fy: m ? +m[2] / 100 : 0.25, fh: 0.18 };
  }
  function cropBox(c, W, H, k, ay, ax) {
    const f = faceInfo(c);
    const IW = 1, IH = 1 / f.ar;
    const sc = Math.max((k * H) / (f.fh * IH), W / IW, H / IH);
    const dw = IW * sc, dh = IH * sc;
    const x = Math.min(0, Math.max(W - dw, W * (ax == null ? 0.5 : ax) - f.fx * dw));
    const y = Math.min(0, Math.max(H - dh, H * ay - f.fy * dh));
    return { x, y, w: dw, h: dh };
  }
  /* HTML face crop. w/h set the aspect; opts.px gives a fixed pixel width, otherwise it fills its parent's width. */
  function face(c, w, h, opts) {
    const o = opts || {};
    const r = o.radius == null ? '50%' : o.radius;
    const size = o.px ? `width:${o.px}px;` : 'width:100%;';
    const box = `class="cb-face ${o.cls || ''}" style="${size}aspect-ratio:${w}/${h};border-radius:${r};${o.style || ''}"`;
    if (!c || !c.photo) return `<span ${box}>${U.avatar(c ? c.name : '', 120).replace('<svg ', '<svg style="width:100%;height:100%" preserveAspectRatio="xMidYMid slice" ')}</span>`;
    const W = 100, H = (100 * h) / w;
    const b = cropBox(c, W, H, o.k || 0.45, o.ay == null ? 0.42 : o.ay, o.ax);
    return `<span ${box}><img src="${esc(c.photo)}" alt="${esc(o.alt != null ? o.alt : c.name)}" loading="lazy" decoding="async" ` +
      `style="width:${(b.w / W * 100).toFixed(2)}%;left:${(b.x / W * 100).toFixed(2)}%;top:${(b.y / H * 100).toFixed(2)}%"></span>`;
  }
  let svgUid = 0;
  /* SVG face crop: clipped <image> placed by cropBox (box matches the photo's aspect, so slice never distorts). */
  function svgFace(c, x, y, W, H, k, ay, shape) {
    if (!c.photo) {
      return `<rect x="${x}" y="${y}" width="${W}" height="${H}" fill="rgba(255,255,255,.15)"/>` +
        svgT(x + W / 2, y + H / 2 + H * 0.1, U.initials(c.name), `text-anchor="middle" font-size="${H * 0.3}" font-weight="800" fill="#fff" font-family="Archivo, sans-serif"`);
    }
    const id = 'cbclip' + (++svgUid);
    const b = cropBox(c, W, H, k, ay);
    const clip = shape === 'circle' ? `<circle cx="${x + W / 2}" cy="${y + H / 2}" r="${Math.min(W, H) / 2}"/>` : `<rect x="${x}" y="${y}" width="${W}" height="${H}"/>`;
    return `<clipPath id="${id}">${clip}</clipPath><image href="${esc(c.photo)}" x="${(x + b.x).toFixed(1)}" y="${(y + b.y).toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`;
  }
  function svgT(x, y, txt, attrs) { return `<text x="${x}" y="${y}" ${attrs || ''}>${esc(txt)}</text>`; }

  /* Branded social graphic: photo + name + short line + brand color band. */
  function socialGraphic(c, cl, g) {
    return `<div class="cs-gfx" style="--cb:${esc(cl.b)};--ca:${esc(cl.a)}">
      <div class="cs-gfx-txt"><span class="cs-gfx-kick">${esc(g.kicker)}</span><span class="cs-gfx-head">${esc(g.head)}</span><span class="cs-gfx-name">${esc(c.name)}</span></div>
      <div class="cs-gfx-photo">${face(c, 4, 5, { radius: '0', k: g.k || 0.3, ay: 0.36, alt: '' })}${g.play ? '<span class="cs-gfx-play" aria-hidden="true"><svg viewBox="0 0 20 20" width="22" height="22"><path d="M7 5l8 5-8 5z" fill="currentColor"/></svg></span>' : ''}</div>
      <div class="cs-gfx-band">${esc(g.band || c.office)}</div>
    </div>`;
  }

  function rerenderIf(sub) {
    const r = App.route;
    if (r.id === 'candidate' && (sub == null || r.sub.split('/')[0] === sub)) App.rerender();
  }

  /* ---------------- scoped styles ---------------- */
  function injectStyle() {
    if (document.getElementById('scr-cand-style')) return;
    const css = `
.scr-cand .cb-tabs { margin-bottom: 22px; }
.scr-cand .cb-face { position: relative; overflow: hidden; display: inline-block; flex: none; background: #DDE2E8; vertical-align: middle; }
.scr-cand .cb-face img { position: absolute; max-width: none; height: auto; display: block; }
.scr-cand .cs-gfx { container-type: inline-size; position: relative; display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; aspect-ratio: 16 / 10; background: var(--cb); color: #fff; overflow: hidden; border-radius: 8px; }
.scr-cand .cs-gfx-txt { display: flex; flex-direction: column; justify-content: center; gap: 1.6cqi; padding: 4cqi 3cqi 3cqi 5cqi; min-width: 0; min-height: 0; overflow: hidden; }
.scr-cand .cs-gfx-kick { font: 700 3.3cqi/1.2 var(--font-body); letter-spacing: .06em; text-transform: uppercase; color: color-mix(in srgb, var(--ca) 55%, white); }
.scr-cand .cs-gfx-head { font-family: var(--font-head); font-stretch: 80%; font-weight: 800; font-size: 6.6cqi; line-height: 1.05; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.scr-cand .cs-gfx-name { font-size: 3.4cqi; font-weight: 600; opacity: .9; line-height: 1.25; }
.scr-cand .cs-gfx-photo { position: relative; grid-row: 1 / 3; grid-column: 2; display: flex; min-height: 0; }
.scr-cand .cs-gfx-photo .cb-face { width: 100% !important; height: 100%; aspect-ratio: auto !important; }
.scr-cand .cs-gfx-photo::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 1.8cqi; background: var(--ca); z-index: 1; }
.scr-cand .cs-gfx-play { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); width: 14cqi; height: 14cqi; border-radius: 50%; background: rgba(0,0,0,.55); color: #fff; display: flex; align-items: center; justify-content: center; z-index: 2; }
.scr-cand .cs-gfx-band { grid-column: 1; background: var(--ca); font: 700 3.1cqi/1.2 var(--font-body); padding: 2cqi 5cqi; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scr-cand .cm-list { display: flex; flex-direction: column; }
.scr-cand .cm-row { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--line); }
.scr-cand .cm-row:first-child { border-top: 0; padding-top: 0; }
.scr-cand .cm-thumb { width: 64px; height: 64px; flex: none; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.scr-cand .cm-thumb svg { height: 58px; width: auto; }
.scr-cand .cm-thumb.wide svg { width: 58px; height: auto; }
.scr-cand .cm-thumb .cs-gfx { width: 240px; transform: scale(.26); transform-origin: center; flex: none; border-radius: 4px; }
.scr-cand .cm-txt { flex: 1; min-width: 0; }
.scr-cand .cm-txt b { display: block; }
.scr-cand .cb-picker { display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; min-width: 0; max-width: 100%; }
.scr-cand .cb-picker .select { width: auto; min-width: min(260px, 100%); max-width: 100%; flex: 1 1 220px; }
.scr-cand .cb-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin-bottom: 18px; }
.scr-cand .cb-mt { margin-top: 22px; }

/* pipeline */
.scr-cand .cb-pipe { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; align-items: start; }
.scr-cand .cb-col { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 12px; min-width: 0; }
.scr-cand .cb-col-head { display: flex; align-items: baseline; gap: 8px; padding: 2px 4px 10px; }
.scr-cand .cb-col-head h3 { margin: 0; font-size: 1.05rem; }
.scr-cand .cb-col-head .cb-count { margin-left: auto; font: 700 13px/1 var(--font-body); color: var(--ink-3); background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 4px 9px; }
.scr-cand .cb-col-note { font-size: 13px; color: var(--ink-3); padding: 0 4px 10px; margin-top: -6px; }
.scr-cand .cb-cards { display: flex; flex-direction: column; gap: 10px; }
.scr-cand .cb-card { all: unset; box-sizing: border-box; display: block; width: 100%; cursor: pointer; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 12px 13px; box-shadow: var(--shadow-1); transition: border-color .15s, box-shadow .15s; }
.scr-cand .cb-card:hover { border-color: var(--brand); box-shadow: var(--shadow-2); }
.scr-cand .cb-card:focus-visible { box-shadow: var(--focus); }
.scr-cand .cb-card-top { display: flex; gap: 10px; align-items: center; }
.scr-cand .cb-card-name { font-family: var(--font-head); font-stretch: 85%; font-weight: 750; font-size: 1.05rem; line-height: 1.15; color: var(--ink); }
.scr-cand .cb-card-office { font-size: 13.5px; color: var(--ink-2); line-height: 1.35; }
.scr-cand .cb-bar { height: 8px; background: var(--line); border-radius: 999px; overflow: hidden; margin: 10px 0 4px; }
.scr-cand .cb-bar > span { display: block; height: 100%; background: var(--brand); border-radius: 999px; }
.scr-cand .cb-money { display: flex; justify-content: space-between; font-size: 13px; color: var(--ink-3); gap: 6px; }
.scr-cand .cb-money b { color: var(--ink); }
.scr-cand .cb-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.scr-cand .cb-empty { font-size: 13.5px; color: var(--ink-3); border: 1px dashed var(--line-strong); border-radius: var(--r); padding: 14px; text-align: center; }
@media (max-width: 1000px) { .scr-cand .cb-pipe { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 620px) { .scr-cand .cb-pipe { grid-template-columns: minmax(0, 1fr); } }

/* drawer */
.scr-cand .cb-drawer-back { position: fixed; inset: 0; background: rgba(15,22,32,.42); z-index: 790; }
.scr-cand .cb-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(460px, 100vw); background: var(--surface); z-index: 800; box-shadow: var(--shadow-2); display: flex; flex-direction: column; animation: cbSlide .2s ease; }
@keyframes cbSlide { from { transform: translateX(30px); opacity: .4; } to { transform: none; opacity: 1; } }
.scr-cand .cb-drawer-head { display: flex; gap: 14px; align-items: center; padding: 20px 20px 16px; border-bottom: 1px solid var(--line); }
.scr-cand .cb-drawer-head h2 { margin: 0; font-size: 1.4rem; }
.scr-cand .cb-drawer-body { padding: 18px 20px 28px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 16px; }
.scr-cand .cb-dl { display: grid; grid-template-columns: minmax(0, 11em) minmax(0, 1fr); gap: 6px 14px; font-size: 14.5px; margin: 0; }
.scr-cand .cb-dl dt { color: var(--ink-3); }
.scr-cand .cb-dl dd { margin: 0; font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.scr-cand .cb-links { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.scr-cand .cb-links .btn { flex-direction: column; gap: 4px; min-height: 72px; white-space: normal; text-align: center; font-size: 14px; }
.scr-cand .cb-slogan { font-family: var(--font-head); font-stretch: 85%; font-weight: 700; font-size: 1.1rem; color: var(--brand); }
.scr-cand .cb-issues { margin: 0; padding-left: 20px; font-size: 14.5px; }

/* wizard */
.scr-cand .cb-wiz { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; align-items: start; }
@media (max-width: 1100px) { .scr-cand .cb-wiz { grid-template-columns: minmax(0, 1fr); } }
.scr-cand .cb-steps { list-style: none; margin: 0 0 18px; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.scr-cand .cb-step { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 9px; width: 100%; padding: 10px 10px; border-radius: var(--r); border: 1px solid var(--line); background: var(--surface); font-weight: 600; font-size: 14.5px; color: var(--ink-2); }
.scr-cand .cb-step:focus-visible { box-shadow: var(--focus); }
.scr-cand .cb-step-n { width: 26px; height: 26px; border-radius: 50%; flex: none; display: inline-flex; align-items: center; justify-content: center; font: 700 13px/1 var(--font-body); background: var(--surface-2); border: 1px solid var(--line-strong); color: var(--ink-2); }
.scr-cand .cb-step.done .cb-step-n { background: var(--ok-soft); border-color: var(--ok); color: var(--ok); }
.scr-cand .cb-step.current { border-color: var(--brand); background: color-mix(in srgb, var(--brand) 7%, white); color: var(--brand); }
.scr-cand .cb-step.current .cb-step-n { background: var(--brand); border-color: var(--brand); color: var(--brand-ink); }
.scr-cand .cb-step-l { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 760px) { .scr-cand .cb-step-l { display: none; } .scr-cand .cb-step { justify-content: center; padding: 8px 4px; } .scr-cand .cb-step.current .cb-step-l { display: none; } }
.scr-cand .cb-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; }
.scr-cand .cb-form .full { grid-column: 1 / -1; }
@media (max-width: 640px) { .scr-cand .cb-form { grid-template-columns: minmax(0, 1fr); } }
.scr-cand .cb-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.scr-cand .cb-field > span:first-child { font-weight: 600; font-size: 14.5px; color: var(--ink-2); }
.scr-cand .cb-hint { font-size: 13px; color: var(--ink-3); }
.scr-cand .cb-wiz-foot { display: flex; gap: 10px; align-items: center; padding: 14px 20px; border-top: 1px solid var(--line); flex-wrap: wrap; }
.scr-cand .cb-head-row { display: flex; gap: 10px; align-items: stretch; flex-wrap: wrap; }
.scr-cand .cb-head-drop { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 16px; padding: 14px; border: 2px dashed var(--line-strong); border-radius: var(--r); background: var(--surface-2); flex: 1 1 280px; min-width: 0; }
.scr-cand .cb-head-row > .btn { flex: 0 0 auto; align-self: center; }
.scr-cand .cb-head-drop:hover { border-color: var(--brand); }
.scr-cand .cb-head-drop:focus-visible { box-shadow: var(--focus); }
.scr-cand .cb-typing::after { content: '▍'; color: var(--brand); animation: cbBlink 1s steps(1) infinite; }
@keyframes cbBlink { 50% { opacity: 0; } }
.scr-cand .cb-tpls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.scr-cand .cb-tpl { all: unset; box-sizing: border-box; cursor: pointer; border: 2px solid var(--line); border-radius: var(--r); padding: 8px; background: var(--surface); text-align: center; font-weight: 600; font-size: 14px; }
.scr-cand .cb-tpl svg { display: block; width: 100%; height: auto; border-radius: 6px; margin-bottom: 6px; }
.scr-cand .cb-tpl.on { border-color: var(--brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 20%, transparent); }
.scr-cand .cb-tpl:focus-visible { box-shadow: var(--focus); }
.scr-cand .cb-sw { display: flex; flex-wrap: wrap; gap: 10px; }
.scr-cand .cb-swatch { all: unset; cursor: pointer; display: inline-flex; border-radius: 999px; padding: 3px; border: 2px solid transparent; }
.scr-cand .cb-swatch.on { border-color: var(--ink); }
.scr-cand .cb-swatch:focus-visible { box-shadow: var(--focus); }
.scr-cand .cb-swatch i { width: 22px; height: 30px; display: block; }
.scr-cand .cb-swatch i:first-child { border-radius: 999px 0 0 999px; }
.scr-cand .cb-swatch i:last-child { border-radius: 0 999px 999px 0; }
.scr-cand .cb-previews { display: flex; gap: 16px; align-items: flex-start; }
.scr-cand .cb-prev-phone { width: 200px; flex: none; border: 8px solid #1B222C; border-radius: 26px; overflow: hidden; background: #fff; height: 360px; }
.scr-cand .cb-prev-desk { flex: 1; min-width: 0; border: 1px solid var(--line-strong); border-radius: 10px; overflow: hidden; background: #fff; }
.scr-cand .cb-prev-desk .cb-dots { display: flex; gap: 5px; padding: 7px 10px; background: var(--surface-2); border-bottom: 1px solid var(--line); }
.scr-cand .cb-prev-desk .cb-dots i { width: 9px; height: 9px; border-radius: 50%; background: var(--line-strong); }
@media (max-width: 640px) { .scr-cand .cb-previews { flex-direction: column; align-items: center; } .scr-cand .cb-prev-desk { width: 100%; } }
.scr-cand .cb-prov { display: flex; align-items: center; gap: 14px; padding: 14px; border: 1px solid var(--line); border-radius: var(--r); flex-wrap: wrap; }
.scr-cand .cb-prov-mark { width: 42px; height: 42px; border-radius: 10px; flex: none; display: inline-flex; align-items: center; justify-content: center; font: 800 15px/1 var(--font-head); color: #fff; }
.scr-cand .cb-prov-txt { flex: 1 1 180px; min-width: 0; }
.scr-cand .cb-opt { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--r); cursor: pointer; }
.scr-cand .cb-opt:has(input:checked) { border-color: var(--brand); background: color-mix(in srgb, var(--brand) 5%, white); }
.scr-cand .cb-opt input[type=radio], .scr-cand .cb-opt input[type=checkbox]:not(.toggle) { margin-top: 4px; accent-color: var(--brand); width: 18px; height: 18px; flex: none; }
.scr-cand .cb-side h3 { font-size: 1.1rem; }
.scr-cand .cb-check { list-style: none; margin: 0 0 16px; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 14.5px; }
.scr-cand .cb-check li { display: flex; gap: 8px; align-items: flex-start; }
.scr-cand .cb-ok { color: var(--ok); display: inline-flex; flex: none; margin-top: 2px; }
.scr-cand .cb-bad { color: var(--danger); display: inline-flex; flex: none; margin-top: 2px; }
.scr-cand .cb-pend { color: var(--ink-3); display: inline-flex; flex: none; margin-top: 2px; }
.scr-cand .cb-launch { width: 100%; min-height: 56px; font-size: 17px; background: var(--accent); border-color: var(--accent); color: #fff; }
.scr-cand .cb-launch:hover { background: color-mix(in srgb, var(--accent) 85%, black); border-color: color-mix(in srgb, var(--accent) 85%, black); color: #fff; }

/* mini site preview */
.scr-cand .mini { font-family: var(--font-body); color: #1d2733; font-size: 9px; line-height: 1.35; }
.scr-cand .mini-hero { padding: 16px 12px 14px; background: var(--cb); color: #fff; border-bottom: 4px solid var(--ca); display: flex; gap: 10px; align-items: center; }
.scr-cand .mini-hero-txt { flex: 1; min-width: 0; }
.scr-cand .mini-hero .cb-face { width: 54px !important; border: 2px solid #fff; }
.scr-cand .mini.wide .mini-hero .cb-face { width: 96px !important; }
.scr-cand .mini.t-banner .mini-hero { flex-direction: column-reverse; }
.scr-cand .mini.t-banner .mini-hero { background: #fff; color: var(--cb); border-bottom: 0; border-top: 10px solid var(--ca); text-align: center; }
.scr-cand .mini.t-hometown .mini-hero { background: color-mix(in srgb, var(--cb) 10%, white); color: var(--cb); border-bottom: 2px solid var(--cb); }
.scr-cand .mini-name { font-family: var(--font-head); font-weight: 800; font-size: 17px; line-height: 1.05; }
.scr-cand .mini-off { opacity: .85; margin: 2px 0 6px; }
.scr-cand .mini-slogan { font-weight: 700; font-size: 10px; }
.scr-cand .mini.t-hometown .mini-slogan { color: var(--ca); }
.scr-cand .mini-btn { display: inline-block; margin-top: 8px; background: var(--ca); color: #fff; padding: 3px 10px; border-radius: 4px; font-weight: 700; }
.scr-cand .mini-body { padding: 10px 12px; }
.scr-cand .mini-issues { display: grid; gap: 6px; grid-template-columns: 1fr; margin-top: 6px; }
.scr-cand .mini.wide .mini-issues { grid-template-columns: repeat(3, 1fr); }
.scr-cand .mini.wide .mini-name { font-size: 24px; }
.scr-cand .mini.wide .mini-hero { padding: 22px 18px; }
.scr-cand .mini-issue { border: 1px solid #dfe3ea; border-top: 3px solid var(--cb); border-radius: 4px; padding: 5px 6px; font-weight: 600; }
.scr-cand .mini-foot { margin: 6px 12px 12px; border: 1px solid #dfe3ea; padding: 4px 6px; font-size: 8px; color: #555; border-radius: 3px; }
.scr-cand .mini-foot.missing { border: 1px dashed var(--danger); color: var(--danger); background: var(--danger-soft); }

/* microsite */
.scr-cand .cms-frame { border: 1px solid var(--line-strong); border-radius: 14px; overflow: hidden; background: #fff; box-shadow: var(--shadow-2); }
.scr-cand .cms-chrome { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #E9ECF1; border-bottom: 1px solid var(--line-strong); }
.scr-cand .cms-dots { display: flex; gap: 6px; flex: none; }
.scr-cand .cms-dots i { width: 11px; height: 11px; border-radius: 50%; display: block; background: #C3CAD4; }
.scr-cand .cms-dots i:nth-child(1) { background: #E5736A; } .scr-cand .cms-dots i:nth-child(2) { background: #E8B84A; } .scr-cand .cms-dots i:nth-child(3) { background: #69B86E; }
.scr-cand .cms-addr { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; background: #fff; border-radius: 999px; padding: 5px 14px; font-size: 14px; color: var(--ink-2); border: 1px solid var(--line); }
.scr-cand .cms-addr span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scr-cand .cms-addr .cb-ok { margin: 0; }
.scr-cand .cms { --cb: #0B2A4A; --ca: #C8102E; color: #1d2733; }
.scr-cand .cms-nav { display: flex; align-items: center; gap: 14px; padding: 12px 28px; border-bottom: 1px solid #E5E8EE; font-size: 14px; flex-wrap: wrap; }
.scr-cand .cms-nav b { font-family: var(--font-head); font-stretch: 85%; font-size: 1.05rem; color: var(--cb); margin-right: auto; }
.scr-cand .cms-nav a { color: #3C4858; text-decoration: none; cursor: pointer; }
.scr-cand .cms-hero { position: relative; overflow: hidden; padding: 56px 28px 50px; background: var(--cb); color: #fff; border-bottom: 8px solid var(--ca); display: flex; gap: 28px; align-items: center; }
.scr-cand .cms.t-banner .cms-hero { background: #fff; color: var(--cb); border-bottom: 1px solid #E5E8EE; border-top: 14px solid var(--ca); }
.scr-cand .cms.t-hometown .cms-hero { background: color-mix(in srgb, var(--cb) 9%, white); color: var(--cb); border-bottom: 4px solid var(--cb); }
.scr-cand .cms-hero-txt { flex: 1; min-width: 0; }
.scr-cand .cms-office { font-weight: 700; letter-spacing: .06em; text-transform: uppercase; font-size: 14px; opacity: .9; }
.scr-cand .cms-hero h2 { color: inherit; font-stretch: 75%; font-weight: 800; font-size: clamp(2.2rem, 1.5rem + 3vw, 3.6rem); line-height: 1; margin: 6px 0 12px; }
.scr-cand .cms-slogan { font-size: 1.25rem; font-weight: 600; max-width: 34ch; margin-bottom: 22px; }
.scr-cand .cms.t-hometown .cms-slogan { color: var(--ca); }
.scr-cand .cms-cta { display: flex; gap: 10px; flex-wrap: wrap; }
.scr-cand .cms-btn { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 10px 22px; border-radius: 8px; font-weight: 700; font-size: 16px; }
.scr-cand .cms-btn:focus-visible { box-shadow: 0 0 0 3px rgba(255,255,255,.6), 0 0 0 6px var(--ca); }
.scr-cand .cms-btn.give { background: var(--ca); color: #fff; }
.scr-cand .cms-btn.give:hover { filter: brightness(.92); }
.scr-cand .cms-btn.ghost { border: 2px solid currentColor; color: inherit; }
.scr-cand .cms-photo { flex: none; width: 300px; position: relative; }
.scr-cand .cms-photo .cb-face { box-shadow: 0 18px 40px -16px rgba(0,0,0,.55); border: 5px solid #fff; }
.scr-cand .cms-photo::after { content: ''; position: absolute; left: -12px; bottom: -12px; width: 70%; height: 10px; background: var(--ca); border-radius: 2px; }
.scr-cand .cms-photo-m { display: none; }
.scr-cand .cms-about { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 28px; align-items: start; }
.scr-cand .cms-side { border: 1px solid #E1E5EB; border-radius: 12px; padding: 16px; text-align: center; background: #FAFBFC; }
.scr-cand .cms-side > .cb-face { max-width: 150px; }
.scr-cand .cms-side b { display: block; margin-top: 10px; color: var(--cb); font-family: var(--font-head); font-size: 1.1rem; }
.scr-cand .cms-sec { padding: 34px 28px; border-bottom: 1px solid #EEF0F4; }
.scr-cand .cms-sec h3 { color: var(--cb); font-size: 1.45rem; margin-bottom: 12px; }
.scr-cand .cms-bio { font-size: 1.05rem; max-width: 70ch; }
.scr-cand .cms-endorse { display: inline-flex; align-items: center; gap: 10px; margin-top: 14px; padding: 8px 14px; border-radius: 999px; background: color-mix(in srgb, var(--cb) 8%, white); color: var(--cb); font-weight: 700; font-size: 15px; }
.scr-cand .cms-issues { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.scr-cand .cms-issue { border: 1px solid #E1E5EB; border-top: 5px solid var(--cb); border-radius: 10px; padding: 16px; }
.scr-cand .cms-issue .n { font-family: var(--font-head); font-weight: 800; color: var(--ca); font-size: 1.5rem; line-height: 1; }
.scr-cand .cms-issue h4 { margin: 8px 0 0; font-size: 1.08rem; }
.scr-cand .cms-ev { display: flex; gap: 14px; align-items: center; padding: 12px 0; border-top: 1px solid #EEF0F4; }
.scr-cand .cms-ev:first-of-type { border-top: 0; }
.scr-cand .cms-date { width: 58px; flex: none; text-align: center; border-radius: 8px; background: var(--cb); color: #fff; padding: 6px 0; line-height: 1.1; }
.scr-cand .cms-date b { display: block; font-family: var(--font-head); font-size: 1.4rem; }
.scr-cand .cms-date small { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
.scr-cand .cms-vol { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; gap: 10px; align-items: end; }
.scr-cand .cms-vol-opts { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 12px; font-size: 15px; }
.scr-cand .cms-vol-opts label { display: inline-flex; gap: 7px; align-items: center; cursor: pointer; }
.scr-cand .cms-vol-opts input { accent-color: var(--cb); width: 17px; height: 17px; }
.scr-cand .cms .cms-submit { background: var(--cb); color: #fff; }
.scr-cand .cms-thanks { padding: 16px; border-radius: 10px; background: var(--ok-soft); color: var(--ok); font-weight: 600; }
.scr-cand .cms-foot { padding: 22px 28px 28px; background: #F6F7F9; }
.scr-cand .cms-disc { border: 2px solid #1d2733; padding: 10px 14px; display: inline-block; font-weight: 600; font-size: 15px; border-radius: 4px; background: #fff; }
.scr-cand .cms-disc.missing { display: block; border: 2px dashed var(--danger); background: var(--danger-soft); color: #7A1A12; font-weight: 500; }
.scr-cand .cms-disc.missing strong { display: flex; gap: 8px; align-items: center; color: var(--danger); margin-bottom: 8px; }
.scr-cand .cms-fix { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.scr-cand .cms-fix .input { flex: 1 1 260px; width: auto; }
@media (max-width: 760px) {
  .scr-cand .cms-hero { padding: 0 0 28px; align-items: stretch; gap: 20px; }
  .scr-cand .cms-hero-txt { padding: 0 18px; }
  .scr-cand .cms-photo-m .cb-face { border: 0; box-shadow: none; }
  .scr-cand .cms-photo-d { display: none; }
  .scr-cand .cms-photo-m { display: block; width: 100%; }
  .scr-cand .cms-photo::after { display: none; }
  .scr-cand .cms-hero { flex-direction: column; }
  .scr-cand .cms-about { grid-template-columns: minmax(0, 1fr); }
  .scr-cand .cms-side { display: flex; align-items: center; gap: 14px; text-align: left; }
  .scr-cand .cms-side b { margin-top: 0; }
  .scr-cand .cms-side .cb-face { width: 72px !important; }
  .scr-cand .cms-sec, .scr-cand .cms-foot { padding: 24px 18px; }
  .scr-cand .cms-nav { padding: 10px 18px; }
  .scr-cand .cms-nav a { display: none; }
  .scr-cand .cms-issues { grid-template-columns: minmax(0, 1fr); }
  .scr-cand .cms-vol { grid-template-columns: minmax(0, 1fr); }
}
.cb-amts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 6px 0 14px; }
.cb-amts .chip { justify-content: center; min-height: 44px; font-weight: 700; font-size: 16px; }
.cb-secure { display: flex; gap: 10px; align-items: center; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--r); background: var(--surface-2); font-weight: 600; }
.cb-demo-note { margin-top: 12px; padding: 10px 14px; border-radius: var(--r); background: var(--warn-soft); color: var(--warn); font-weight: 700; font-size: 14.5px; }

/* print studio */
.scr-cand .cp-row { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 0; }
.scr-cand .cp-mat { background: repeating-linear-gradient(45deg, #EEF1F5 0 10px, #F5F7FA 10px 20px); display: flex; align-items: center; justify-content: center; padding: 26px; border-right: 1px solid var(--line); border-radius: var(--r-lg) 0 0 var(--r-lg); min-width: 0; }
.scr-cand .cp-mat svg { display: block; height: auto; filter: drop-shadow(0 6px 14px rgba(21,32,46,.18)); }
.scr-cand .cp-mat .cp-tall { width: 230px; }
.scr-cand .cp-mat .cp-wide { width: 100%; max-width: 560px; }
.scr-cand .cp-mat .cp-card { width: 100%; max-width: 400px; }
.scr-cand .cp-panel { padding: 20px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.scr-cand .cp-panel h3 { margin: 0; }
.scr-cand .cp-checks { border: 1px solid var(--line); border-radius: var(--r); padding: 12px 14px; }
.scr-cand .cp-checks h4 { margin: 0 0 8px; font-size: 1rem; }
.scr-cand .cp-checks ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 14.5px; }
.scr-cand .cp-checks li { display: flex; gap: 8px; align-items: flex-start; }
.scr-cand .cp-checks li .cb-ok, .scr-cand .cp-checks li .cb-bad { width: 22px; height: 22px; border-radius: 50%; align-items: center; justify-content: center; margin: 0; }
.scr-cand .cp-checks li .cb-ok { background: var(--ok-soft); }
.scr-cand .cp-checks li .cb-bad { background: var(--danger-soft); }
.scr-cand .cp-checks.bad { border-color: color-mix(in srgb, var(--danger) 40%, white); }
.scr-cand .cp-reason { font-size: 14px; color: var(--danger); font-weight: 600; }
.scr-cand .cp-fix { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: var(--r); background: var(--danger-soft); }
.scr-cand .cp-fix .row .input { flex: 1 1 200px; width: auto; }
.scr-cand .cp-specs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; font-size: 13.5px; }
.scr-cand .cp-specs div { background: var(--surface-2); border-radius: var(--r-sm); padding: 8px 10px; }
.scr-cand .cp-specs b { display: block; font-size: 15px; }
@media (max-width: 900px) {
  .scr-cand .cp-row { grid-template-columns: minmax(0, 1fr); }
  .scr-cand .cp-mat { border-right: 0; border-bottom: 1px solid var(--line); border-radius: var(--r-lg) var(--r-lg) 0 0; padding: 18px; }
}

/* social */
.scr-cand .cs-week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; margin-bottom: 18px; }
.scr-cand .cs-day { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 8px; min-height: 112px; min-width: 0; }
.scr-cand .cs-day.today { border-color: var(--brand); }
.scr-cand .cs-day-h { font-size: 13px; color: var(--ink-3); font-weight: 600; }
.scr-cand .cs-day-h b { display: block; font-family: var(--font-head); font-size: 1.35rem; color: var(--ink); line-height: 1.1; }
.scr-cand .cs-pill { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 6px; width: 100%; margin-top: 6px; padding: 4px 6px; border-radius: 6px; font-size: 12.5px; font-weight: 600; background: var(--warn-soft); color: var(--warn); }
.scr-cand .cs-pill.ok { background: var(--ok-soft); color: var(--ok); }
.scr-cand .cs-pill:focus-visible { box-shadow: var(--focus); }
.scr-cand .cs-pill span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scr-cand .cs-free { font-size: 12.5px; color: var(--ink-3); margin-top: 8px; }
@media (max-width: 760px) {
  .scr-cand .cs-week { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .scr-cand .cs-day { min-height: 0; }
}
.scr-cand .cs-post { display: flex; flex-direction: column; height: 100%; }
.scr-cand .cs-post.flash { animation: csFlash 1.2s ease; }
@keyframes csFlash { 0% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand) 45%, transparent); } 100% { box-shadow: var(--shadow-1); } }
.scr-cand .cs-post-head { display: flex; gap: 10px; align-items: center; padding: 14px 16px 10px; }
.scr-cand .cs-post-head { flex-wrap: wrap; }
.scr-cand .cs-post-head .t { line-height: 1.25; min-width: 0; flex: 1 1 120px; }
.scr-cand .cs-post-head .t .small { white-space: nowrap; }
.scr-cand .cs-post-head .t b { display: block; }
.scr-cand .cs-post-body { padding: 0 16px 12px; font-size: 15px; flex: 1; white-space: pre-line; overflow-wrap: anywhere; }
.scr-cand .cs-media { margin: 0 16px 12px; }
.scr-cand .cs-post-foot { display: flex; gap: 8px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--line); flex-wrap: wrap; }
.scr-cand .cs-glyph { width: 36px; height: 36px; flex: none; }
`;
    const s = document.createElement('style');
    s.id = 'scr-cand-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ---------------- small UI pieces ---------------- */
  function siteChip(c) {
    const d = discInfo(c);
    if (d.missing) return '<span class="badge badge-danger">Needs disclaimer</span>';
    if (c.siteStatus === 'LIVE') return '<span class="badge badge-ok">Site live</span>';
    if (c.siteStatus === 'BUILDING') return '<span class="badge badge-warn">Site building</span>';
    return '<span class="badge">Site queued</span>';
  }
  function bar(c) {
    const pct = c.goalUsd ? Math.min(100, Math.round((c.raisedUsd / c.goalUsd) * 100)) : 0;
    return `<div class="cb-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Raised ${pct}% of goal"><span style="width:${pct}%"></span></div>
      <div class="cb-money"><span><b>${U.fmtUsd(c.raisedUsd)}</b> raised</span><span>${pct}% of ${U.fmtUsd(c.goalUsd)}</span></div>`;
  }
  function picker(list, cur, label) {
    return `<label class="cb-picker"><span class="small" style="font-weight:600;color:var(--ink-2)">${esc(label || 'Candidate')}</span>
      <select class="select" data-pick aria-label="Choose candidate">${list.map((c) =>
        `<option value="${esc(c.id)}"${c.id === cur.id ? ' selected' : ''}>${esc(c.name)} — ${esc(c.office)}</option>`).join('')}</select></label>`;
  }

  /* ======================================================================
     1. Candidates pipeline
     ====================================================================== */
  function renderPipeline(root, ctx) {
    const list = candidates(ctx);
    const total = list.reduce((s, c) => s + (c.raisedUsd || 0), 0);
    const live = list.filter((c) => c.siteStatus === 'LIVE' && !discInfo(c).missing).length;
    const attention = list.filter((c) => discInfo(c).missing).length;
    root.innerHTML += `
      <div class="grid-4" style="margin-bottom:22px">
        <div class="kpi"><div class="kpi-value">${list.length}</div><div class="kpi-label">Candidates in the pipeline</div></div>
        <div class="kpi"><div class="kpi-value">${U.fmtUsd(total)}</div><div class="kpi-label">Raised across all campaigns</div></div>
        <div class="kpi"><div class="kpi-value">${live}</div><div class="kpi-label">Campaign sites live</div></div>
        <div class="kpi"><div class="kpi-value">${attention}</div><div class="kpi-label">${attention === 1 ? 'Campaign needs' : 'Campaigns need'} a disclaimer</div>${attention ? '<div class="kpi-delta down">Fix in one click</div>' : '<div class="kpi-delta up">All compliant</div>'}</div>
      </div>
      <div class="cb-pipe" data-tour="cand-pipeline">
        ${STAGES.map(([key, label, note]) => {
          const col = list.filter((c) => c.status === key);
          return `<section class="cb-col" aria-label="${esc(label)}">
            <div class="cb-col-head"><h3>${esc(label)}</h3><span class="cb-count">${col.length}</span></div>
            <div class="cb-col-note">${esc(note)}</div>
            <div class="cb-cards">${col.length ? col.map((c) => `
              <button class="cb-card" data-open="${esc(c.id)}" aria-label="Open ${esc(c.name)}">
                <div class="cb-card-top">${face(c, 1, 1, { px: 46, k: 0.5, alt: '' })}<div style="min-width:0"><div class="cb-card-name">${esc(c.name)}</div><div class="cb-card-office">${esc(c.office)} · ${esc(c.district)}</div></div></div>
                ${bar(c)}
                <div class="cb-chips">${siteChip(c)}${c.isNew ? '<span class="badge badge-local">New</span>' : ''}</div>
              </button>`).join('') : '<div class="cb-empty">No one at this stage yet</div>'}</div>
          </section>`;
        }).join('')}
      </div>
      <div class="explain cb-mt"><strong>Why this matters for your committee.</strong> Every candidate gets a website, print pieces and a week of social posts from one short form. Volunteers spend minutes instead of weekends, and the committee reviews everything before it goes public.</div>`;

    const openId = st().cand_drawer;
    if (openId) {
      const c = list.find((x) => x.id === openId);
      if (c) drawer(root, ctx, c); else st().cand_drawer = null;
    }
  }

  function drawer(root, ctx, c) {
    const d = discInfo(c);
    const idx = STAGES.findIndex((s) => s[0] === c.status);
    const next = STAGES[idx + 1];
    const wrapEl = document.createElement('div');
    wrapEl.innerHTML = `
      <div class="cb-drawer-back" data-close></div>
      <aside class="cb-drawer" role="dialog" aria-modal="true" aria-label="${esc(c.name)} details">
        <div class="cb-drawer-head">${face(c, 1, 1, { px: 76, k: 0.5 })}<div style="flex:1;min-width:0"><h2>${esc(c.name)}</h2><div class="muted small">${esc(c.office)} · ${esc(c.district)}</div></div>
          <button class="btn btn-ghost btn-sm" data-close aria-label="Close">${IC_X}</button></div>
        <div class="cb-drawer-body">
          <div class="row"><span class="badge badge-local">${esc(STAGE_LABEL[c.status] || c.status)}</span>${siteChip(c)}</div>
          <div class="cb-slogan">“${esc(c.slogan)}”</div>
          <div>${bar(c)}</div>
          <dl class="cb-dl">
            <dt>Election</dt><dd>${esc(fmtDate(c.electionDate, { month: 'long', day: 'numeric', year: 'numeric' }))}</dd>
            <dt>Committee</dt><dd>${esc(c.committeeName)}</dd>
            <dt>FPPC (Fair Political Practices Commission) ID</dt><dd>${esc(c.fppcId)}</dd>
            <dt>Website</dt><dd>${esc(c.subdomain)}</dd>
            <dt>Disclaimer</dt><dd>${d.missing ? '<span class="badge badge-danger">Missing — add it on the campaign site or print studio</span>' : esc(d.text)}</dd>
          </dl>
          <div><h4>Quick links</h4>
            <div class="cb-links">
              <button class="btn" data-go="microsite">${I('<rect x="2.5" y="3.5" width="15" height="13" rx="2"/><path d="M2.5 7h15"/>', 22)}Campaign site</button>
              <button class="btn" data-go="print">${I('<path d="M5.5 7V3h9v4M5.5 14h-2v-6h13v6h-2"/><rect x="5.5" y="11" width="9" height="6"/>', 22)}Print</button>
              <button class="btn" data-go="social">${I('<path d="M3.5 4.5h13v9h-7l-4 3v-3h-2z"/>', 22)}Social</button>
            </div></div>
          <div><h4>Top issues</h4><ul class="cb-issues">${(c.issues || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>
          <div class="small muted">${esc(c.bio || '')}</div>
          ${next ? `<button class="btn btn-primary" data-advance="${next[0]}">Move to “${esc(next[1])}” ${IC_ARROW}</button>` : '<div class="badge badge-ok" style="align-self:flex-start">Full campaign running</div>'}
        </div>
      </aside>`;
    root.appendChild(wrapEl);
    const close = () => { st().cand_drawer = null; wrapEl.remove(); document.removeEventListener('keydown', onKey); };
    function onKey(e) {
      if (!wrapEl.isConnected) { document.removeEventListener('keydown', onKey); return; }
      if (e.key === 'Escape' && !document.querySelector('.modal-backdrop')) close();
    }
    document.addEventListener('keydown', onKey);
    wrapEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) { close(); return; }
      const g = e.target.closest('[data-go]');
      if (g) {
        close();
        st().cand_sel[ctx.tenantSlug] = c.id;
        ctx.navigate('candidate/' + g.dataset.go + (g.dataset.go === 'microsite' ? '/' + c.id : ''));
        return;
      }
      const a = e.target.closest('[data-advance]');
      if (a) {
        st().cand_stage[c.id] = a.dataset.advance;
        ctx.toast(`${c.name} moved to ${STAGE_LABEL[a.dataset.advance]}.`, 'ok');
        App.rerender();
      }
    });
    setTimeout(() => { const b = wrapEl.querySelector('.cb-drawer [data-close]'); if (b) b.focus(); }, 30);
  }

  /* ======================================================================
     2. Builder wizard
     ====================================================================== */
  const STEPS = ['Basics', 'Story', 'Look', 'Money', 'Launch'];
  const TEMPLATES = [['classic', 'Classic'], ['banner', 'Bold banner'], ['hometown', 'Hometown']];
  const PROVIDERS = [
    { id: 'winred', name: 'WinRed', mark: 'W', color: '#B4232A', note: 'The donation platform most Republican campaigns use.' },
    { id: 'anedot', name: 'Anedot', mark: 'A', color: '#2B5C8A', note: 'Popular with local committees and nonprofits.' },
    { id: 'stripe', name: 'Stripe Connect', mark: 'S', color: '#5146B5', note: 'Card and bank payments sent straight to the campaign account.' },
  ];

  function compose(d) { return `Paid for by ${d.committeeName}, FPPC #${d.fppcId}`; }
  function slugify(n) { return String(n || '').toLowerCase().replace(/[^a-z]/g, '') || 'candidate'; }

  function wiz(ctx) {
    const s = st();
    if (!s.cand_wiz[ctx.tenantSlug]) {
      const tc = ctx.tenant.colors || {};
      const d = {
        step: 1,
        name: 'Hannah Okafor', office: 'City Council', district: ctx.tenantSlug === 'demo' ? 'District 2' : 'District 9',
        electionDate: '2026-11-03', committeeName: 'Hannah Okafor for City Council 2026', fppcId: '1512408',
        slogan: 'Open budgets, safe parks, a city that works for families.',
        issues: ['Line-by-line budget transparency', 'Safe, clean neighborhood parks', 'Faster permits for family businesses'],
        bio: '', photo: null, photoPos: '', photoIdx: -1, template: 'classic', brand: tc.brand || '#0B2A4A', accent: tc.accent || '#C8102E',
        conn: {}, primary: '', domainMode: 'sub', ownDomain: 'okaforforcouncil.com',
        print: { door: true, yard: true, palm: true }, social: true, discDirty: false, comDirty: false,
      };
      d.disclaimer = compose(d);
      s.cand_wiz[ctx.tenantSlug] = d;
    }
    return s.cand_wiz[ctx.tenantSlug];
  }
  function bioText(d, ctx) {
    const f = firstName(d.name);
    return `${d.name} is a certified public accountant and mother of two who has lived in ${ctx.tenant.county || 'the county'} for 14 years. ` +
      `She volunteers as treasurer of her neighborhood Little League and has reviewed city budgets for the local taxpayers association since 2019. ` +
      `${f} is running for ${d.office} in ${d.district} to bring a bookkeeper’s discipline to city hall: ${String(d.issues[0] || 'open budgets').toLowerCase()}, every dollar posted online, and every promise tracked in public.`;
  }
  function wizDomain(d, ctx) { return d.domainMode === 'own' ? (d.ownDomain || 'yourdomain.com') : `${slugify(d.name)}.${ctx.tenant.domain}`; }

  function miniSite(d, wide) {
    const dis = (d.disclaimer || '').trim();
    return `<div class="mini t-${esc(d.template)}${wide ? ' wide' : ''}" style="--cb:${esc(d.brand)};--ca:${esc(d.accent)}">
      <div class="mini-hero"><div class="mini-hero-txt"><div class="mini-off">${esc(d.office)} · ${esc(d.district)}</div><div class="mini-name">${esc(d.name || 'Your name')}</div>
        <div class="mini-slogan">${esc(d.slogan)}</div><span class="mini-btn">Donate</span></div>${d.photo ? face(d, 1, 1, { k: 0.5, alt: '' }) : ''}</div>
      <div class="mini-body"><b>Priorities</b><div class="mini-issues">${d.issues.map((i) => `<div class="mini-issue">${esc(i)}</div>`).join('')}</div></div>
      <div class="mini-foot${dis ? '' : ' missing'}">${dis ? esc(dis) : 'Disclaimer missing'}</div>
    </div>`;
  }
  function tplThumb(id, d) {
    const b = d.brand, a = d.accent;
    const hero = id === 'classic' ? `<rect width="120" height="38" fill="${b}"/><rect y="38" width="120" height="4" fill="${a}"/><rect x="10" y="12" width="50" height="7" rx="2" fill="#fff"/><rect x="10" y="23" width="34" height="4" rx="2" fill="#fff" opacity=".7"/>`
      : id === 'banner' ? `<rect width="120" height="8" fill="${a}"/><rect x="35" y="16" width="50" height="7" rx="2" fill="${b}"/><rect x="43" y="27" width="34" height="4" rx="2" fill="${b}" opacity=".6"/><rect y="41" width="120" height="1" fill="#ddd"/>`
        : `<rect width="120" height="42" fill="${b}" opacity=".12"/><rect y="40" width="120" height="2" fill="${b}"/><rect x="10" y="12" width="50" height="7" rx="2" fill="${b}"/><rect x="10" y="23" width="34" height="4" rx="2" fill="${a}"/>`;
    return `<svg viewBox="0 0 120 80" aria-hidden="true"><rect width="120" height="80" fill="#fff"/>${hero}
      <rect x="8" y="50" width="31" height="20" rx="2" fill="none" stroke="#ccd"/><rect x="44" y="50" width="31" height="20" rx="2" fill="none" stroke="#ccd"/><rect x="80" y="50" width="31" height="20" rx="2" fill="none" stroke="#ccd"/>
      <rect x="8" y="50" width="31" height="2" fill="${b}"/><rect x="44" y="50" width="31" height="2" fill="${b}"/><rect x="80" y="50" width="31" height="2" fill="${b}"/></svg>`;
  }

  function stepBody(d, ctx) {
    const f = (key, label, extra, hint) => `<label class="cb-field${extra && extra.full ? ' full' : ''}"><span>${label}</span>
      <input class="input" data-f="${key}" value="${esc(d[key])}" ${extra && extra.type ? `type="${extra.type}"` : ''}>${hint ? `<span class="cb-hint">${hint}</span>` : ''}</label>`;
    if (d.step === 1) {
      return `<h3>Basics</h3><p class="muted small">Prefilled with a sample candidate so you can click Next. Every field stays editable.</p>
        <div class="cb-form">
          ${f('name', 'Candidate name')}
          ${f('office', 'Office')}
          ${f('district', 'District')}
          ${f('electionDate', 'Election date', { type: 'date' })}
          ${f('committeeName', 'Committee name', { full: true }, 'The name registered with the county elections office.')}
          ${f('fppcId', 'FPPC (Fair Political Practices Commission) ID')}
          <div></div>
          <label class="cb-field full"><span>“Paid for by” disclaimer</span>
            <input class="input" data-f="disclaimer" value="${esc(d.disclaimer)}">
            <span class="cb-hint" data-disc-hint>${d.discDirty ? 'Edited by you. <button class="btn btn-ghost btn-sm" data-act="disc-auto" type="button">Rebuild from committee name and ID</button>' : 'Written for you from the committee name and FPPC ID. It appears on the site, every print piece and paid posts.'}</span></label>
        </div>`;
    }
    if (d.step === 2) {
      return `<h3>Story</h3>
        <div class="cb-form">
          <div class="full cb-head-row"><button class="cb-head-drop" data-act="photo" type="button">${face(d, 1, 1, { px: 76, k: 0.5, alt: d.photo ? d.name : '' })}
            <span><b style="display:block">${d.photo ? 'Headshot added' : 'Add a headshot'}</b><span class="cb-hint">${d.photo ? 'It now appears on the site, print proofs and social graphics. Click to swap.' : 'Drop a photo here or click to choose. Initials show until a photo is added.'}</span></span></button>
            <button class="btn" type="button" data-act="sample-photo">${I('<rect x="3" y="4" width="14" height="12" rx="2"/><circle cx="8" cy="9" r="1.6"/><path d="M3 14l4-3.5 3 2.5 3-3 4 4"/>', 18)} ${d.photo ? 'Try another sample' : 'Use sample headshot'}</button></div>
          ${f('slogan', 'Slogan', { full: true })}
          ${[0, 1, 2].map((i) => `<label class="cb-field${i === 2 ? ' full' : ''}"><span>Issue ${i + 1}</span><input class="input" data-f="issue${i}" value="${esc(d.issues[i])}"></label>`).join('')}
          <label class="cb-field full"><span class="row" style="justify-content:space-between"><span>Biography</span>
            <button class="btn btn-sm btn-primary" type="button" data-act="bio"${d.typing ? ' disabled' : ''}>${I('<path d="M10 2.5l1.6 3.9 3.9 1.6-3.9 1.6L10 13.5 8.4 9.6 4.5 8l3.9-1.6z"/><path d="M15.5 13l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>', 16)}${d.typing ? 'Drafting…' : d.bio ? 'Redraft bio' : 'Draft my bio'}</button></span>
            <textarea class="textarea" data-f="bio" rows="5" placeholder="Click “Draft my bio” and the AI (Artificial Intelligence) assistant writes a first draft from the details above.">${esc(d.bio)}</textarea>
            <span class="cb-hint">The draft is a starting point. The candidate edits and approves it.</span></label>
        </div>`;
    }
    if (d.step === 3) {
      const tc = ctx.tenant.colors || {};
      const pal = [[tc.brand, tc.accent, 'County colors'], ['#7A1F2B', '#C9A227', 'Burgundy and gold'], ['#1F3A5F', '#E07A1F', 'Navy and orange'], ['#2F4F4F', '#B23A48', 'Slate and red'], ['#3B2E5A', '#D4A017', 'Plum and gold']];
      return `<h3>Look</h3>
        <div class="stack">
          <div><div class="cb-field"><span>Template</span></div>
            <div class="cb-tpls" role="radiogroup" aria-label="Template">${TEMPLATES.map(([id, label]) => `<button class="cb-tpl${d.template === id ? ' on' : ''}" type="button" role="radio" aria-checked="${d.template === id}" data-tpl="${id}">${tplThumb(id, d)}${esc(label)}</button>`).join('')}</div></div>
          <div><div class="cb-field"><span>Colors</span></div>
            <div class="cb-sw">${pal.map(([b, a, l]) => `<button class="cb-swatch${d.brand === b && d.accent === a ? ' on' : ''}" type="button" data-sw="${b}|${a}" title="${esc(l)}" aria-label="${esc(l)}"><i style="background:${b}"></i><i style="background:${a}"></i></button>`).join('')}</div></div>
          <div><div class="cb-field"><span>Live preview · phone and desktop</span></div>
            <div class="cb-previews">
              <div class="cb-prev-phone">${miniSite(d, false)}</div>
              <div class="cb-prev-desk"><div class="cb-dots"><i></i><i></i><i></i></div>${miniSite(d, true)}</div>
            </div></div>
        </div>`;
    }
    if (d.step === 4) {
      const connected = PROVIDERS.filter((p) => d.conn[p.id] === 'connected');
      return `<h3>Money</h3><p class="muted small">Connect where donations go. Money flows straight to the campaign’s own account. Connections here are simulated.</p>
        <div class="stack">${PROVIDERS.map((p) => {
          const s = d.conn[p.id];
          return `<div class="cb-prov"><span class="cb-prov-mark" style="background:${p.color}">${p.mark}</span>
            <div class="cb-prov-txt"><b>${esc(p.name)}</b><div class="small muted">${esc(p.note)}</div></div>
            ${s === 'connected'
              ? `<span class="badge badge-ok">${IC_CHECK} Connected</span><label class="row small" style="gap:6px;cursor:pointer"><input type="radio" name="cb-primary" data-primary="${p.id}" ${d.primary === p.id ? 'checked' : ''} style="accent-color:var(--brand);width:18px;height:18px"> Primary</label>`
              : s === 'connecting' ? '<button class="btn btn-sm" disabled>Connecting…</button>'
                : `<button class="btn btn-sm btn-primary" type="button" data-connect="${p.id}">Connect</button>`}
          </div>`;
        }).join('')}
        <div class="small ${connected.length ? '' : 'muted'}">${connected.length ? `Primary checkout: <b>${esc((PROVIDERS.find((p) => p.id === d.primary) || connected[0]).name)}</b>. The Donate button on the site uses it.` : 'Connect at least one so the Donate button can take gifts. You can also launch now and connect later.'}</div>
        </div>`;
    }
    return `<h3>Launch</h3>
      <div class="stack">
        <div><div class="cb-field"><span>Web address</span></div>
          <div class="stack" style="gap:8px">
            <label class="cb-opt"><input type="radio" name="cb-dom" data-dom="sub" ${d.domainMode === 'sub' ? 'checked' : ''}><span><b>${esc(slugify(d.name))}.${esc(ctx.tenant.domain)}</b><span class="cb-hint" style="display:block">Free address under the county site. Ready in minutes.</span></span></label>
            <label class="cb-opt"><input type="radio" name="cb-dom" data-dom="own" ${d.domainMode === 'own' ? 'checked' : ''}><span style="flex:1;min-width:0"><b>Use the campaign’s own domain</b>
              <input class="input" data-f="ownDomain" value="${esc(d.ownDomain)}" style="margin-top:6px" aria-label="Own domain"></span></label>
          </div></div>
        <div><div class="cb-field"><span>Print pack</span></div>
          <div class="grid-3" style="gap:8px">
            ${[['door', 'Door hangers', '2,000'], ['yard', 'Yard signs', '150'], ['palm', 'Palm cards', '5,000']].map(([k, l, q]) => `<label class="cb-opt"><input type="checkbox" data-print="${k}" ${d.print[k] ? 'checked' : ''}><span><b>${l}</b><span class="cb-hint" style="display:block">${q} proofs ready</span></span></label>`).join('')}
          </div></div>
        <label class="toggle"><input type="checkbox" data-social ${d.social ? 'checked' : ''}> Draft a first week of social posts for approval</label>
        <button class="btn cb-launch" type="button" data-act="launch">${I('<path d="M11.5 3.5c3 0 5 2 5 5-1.5 2.5-4 4.5-6.5 5.5L7 10.5C8 8 10 5 11.5 3.5z"/><path d="M7 10.5L4 11l-1 3 3-.5M9.5 13l-.5 3 3-1 .5-3"/><circle cx="12.5" cy="7.5" r="1.2"/>', 22)} Launch campaign</button>
      </div>`;
  }

  function sideCard(d, ctx) {
    const items = [
      [!!(d.name && d.office && d.committeeName && d.fppcId), 'Basics', d.name ? `${d.name}, ${d.office}` : 'Add a name'],
      [!!(d.disclaimer || '').trim(), '“Paid for by” disclaimer', (d.disclaimer || '').trim() ? 'Ready' : 'Missing — site stays unpublished'],
      [!!d.photo, 'Headshot', d.photo ? 'Added' : 'Add one on step 2'],
      [!!d.bio, 'Biography', d.bio ? 'Drafted' : 'Click “Draft my bio” on step 2'],
      [true, 'Look', `${(TEMPLATES.find((t) => t[0] === d.template) || [])[1]} template`],
      [Object.values(d.conn).includes('connected'), 'Donations', Object.values(d.conn).includes('connected') ? 'Connected' : 'Connect on step 4'],
    ];
    return `<div class="card-body cb-side">
      <h3>Launch checklist</h3>
      <ul class="cb-check">${items.map(([ok, l, s]) => `<li><span class="${ok ? 'cb-ok' : 'cb-pend'}">${ok ? IC_CHECK : I('<circle cx="10" cy="10" r="6"/>', 16)}</span><span><b>${esc(l)}</b><br><span class="small muted">${esc(s)}</span></span></li>`).join('')}</ul>
      <div class="small muted" style="margin-bottom:10px">Address: <b>${esc(wizDomain(d, ctx))}</b></div>
      <button class="btn cb-launch" type="button" data-act="launch" data-tour="wizard-launch">${I('<path d="M11.5 3.5c3 0 5 2 5 5-1.5 2.5-4 4.5-6.5 5.5L7 10.5C8 8 10 5 11.5 3.5z"/><path d="M7 10.5L4 11l-1 3 3-.5M9.5 13l-.5 3 3-1 .5-3"/>', 22)} Launch campaign</button>
      <p class="small muted" style="margin-top:10px">Launching hands off to the AI Campaign Director, which builds the site, print proofs and posts for review.</p>
    </div>`;
  }

  function renderBuilder(root, ctx) {
    const d = wiz(ctx);
    root.innerHTML += `
      <div class="cb-wiz">
        <div>
          <ol class="cb-steps" data-tour="wizard-steps" aria-label="Steps">
            ${STEPS.map((s, i) => `<li><button class="cb-step${d.step === i + 1 ? ' current' : ''}${d.step > i + 1 ? ' done' : ''}" data-step="${i + 1}" aria-label="Step ${i + 1}: ${s}"${d.step === i + 1 ? ' aria-current="step"' : ''}><span class="cb-step-n">${d.step > i + 1 ? IC_CHECK : i + 1}</span><span class="cb-step-l">${s}</span></button></li>`).join('')}
          </ol>
          <div class="card">
            <div class="card-body">${stepBody(d, ctx)}</div>
            <div class="cb-wiz-foot">
              <span class="small muted">Step ${d.step} of 5</span><span class="spacer"></span>
              ${d.step > 1 ? '<button class="btn btn-ghost" data-act="back">Back</button>' : ''}
              ${d.step < 5 ? `<button class="btn btn-primary" data-act="next">Next: ${STEPS[d.step]} ${IC_ARROW}</button>` : ''}
            </div>
          </div>
          <div class="explain cb-mt"><strong>Why this matters for your committee.</strong> A new candidate goes from “yes, I’ll run” to a working website, print proofs and draft posts in one sitting. The committee keeps the final say on everything that goes public.</div>
        </div>
        <div class="card" data-side>${sideCard(d, ctx)}</div>
      </div>`;

    const side = root.querySelector('[data-side]');
    const setVal = (k, v) => { const i = root.querySelector(`[data-f="${k}"]`); if (i) i.value = v; };
    root.addEventListener('input', (e) => {
      const k = e.target.dataset.f;
      if (!k) return;
      const v = e.target.value;
      if (k.startsWith('issue')) d.issues[+k.slice(5)] = v; else d[k] = v;
      if (k === 'disclaimer') d.discDirty = true;
      if (k === 'committeeName') d.comDirty = true;
      if ((k === 'name' || k === 'office') && !d.comDirty) {
        d.committeeName = `${d.name} for ${d.office} 2026`;
        setVal('committeeName', d.committeeName);
      }
      if (!d.discDirty && ['name', 'office', 'committeeName', 'fppcId'].includes(k)) {
        d.disclaimer = compose(d);
        setVal('disclaimer', d.disclaimer);
      }
      side.innerHTML = sideCard(d, ctx);
    });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.primary) { d.primary = t.dataset.primary; App.rerender(); }
      else if (t.dataset.dom) { d.domainMode = t.dataset.dom; side.innerHTML = sideCard(d, ctx); }
      else if (t.dataset.print) { d.print[t.dataset.print] = t.checked; }
      else if ('social' in t.dataset) { d.social = t.checked; ctx.toast(t.checked ? 'A week of posts will wait for approval.' : 'Social drafts turned off for now.', 'info'); }
    });
    root.addEventListener('click', (e) => {
      const stp = e.target.closest('[data-step]');
      if (stp) { d.step = +stp.dataset.step; App.rerender(); return; }
      const tpl = e.target.closest('[data-tpl]');
      if (tpl) { d.template = tpl.dataset.tpl; App.rerender(); return; }
      const sw = e.target.closest('[data-sw]');
      if (sw) { [d.brand, d.accent] = sw.dataset.sw.split('|'); App.rerender(); return; }
      const cn = e.target.closest('[data-connect]');
      if (cn) {
        const id = cn.dataset.connect;
        const p = PROVIDERS.find((x) => x.id === id);
        d.conn[id] = 'connecting';
        App.rerender();
        setTimeout(() => {
          d.conn[id] = 'connected';
          if (!d.primary) d.primary = id;
          App.toast(`${p.name} connected (simulated).`, 'ok');
          rerenderIf('builder');
        }, 900);
        return;
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const a = act.dataset.act;
      if (a === 'next') {
        if (d.step === 1 && !String(d.name).trim()) { ctx.toast('Add the candidate’s name to continue.', 'warn'); return; }
        d.step = Math.min(5, d.step + 1); App.rerender();
      } else if (a === 'back') { d.step = Math.max(1, d.step - 1); App.rerender(); }
      else if (a === 'disc-auto') { d.discDirty = false; d.disclaimer = compose(d); App.rerender(); }
      else if (a === 'photo' || a === 'sample-photo') {
        d.photoIdx = (d.photoIdx + 1) % SAMPLE_PHOTOS.length;
        [d.photo, d.photoPos] = SAMPLE_PHOTOS[d.photoIdx];
        ctx.toast(a === 'photo' ? 'Headshot added (sample photo for this demo).' : 'Sample headshot added. Check the preview on step 3.', 'ok');
        App.rerender();
      }
      else if (a === 'bio') typeBio(d, ctx);
      else if (a === 'launch') launch(d, ctx);
    });
  }

  function typeBio(d, ctx) {
    if (d.typing) return;
    const full = bioText(d, ctx);
    d.bio = ''; d.typing = true;
    App.rerender();
    let i = 0;
    const tick = () => {
      i = Math.min(full.length, i + 3);
      d.bio = full.slice(0, i);
      const ta = document.querySelector('.scr-cand [data-f="bio"]');
      if (ta) { ta.value = d.bio; ta.classList.add('cb-typing'); }
      if (i < full.length) { setTimeout(tick, 18); return; }
      d.typing = false;
      App.toast('Bio drafted. Edit anything you like.', 'ok');
      rerenderIf('builder');
    };
    setTimeout(tick, 250);
  }

  function launch(d, ctx) {
    const s = st();
    if (!String(d.name).trim()) { ctx.toast('Add the candidate’s name first.', 'warn'); d.step = 1; App.rerender(); return; }
    const n = s.newCandidates.filter((c) => c.tenantSlug === ctx.tenantSlug).length + 1;
    const id = `new-${ctx.tenantSlug}-${n}`;
    const disc = String(d.disclaimer || '').trim();
    const prim = PROVIDERS.find((p) => p.id === d.primary);
    const cand = {
      id, tenantSlug: ctx.tenantSlug, isNew: true,
      name: d.name.trim(), office: d.office, district: d.district, electionDate: d.electionDate || '2026-11-03',
      status: 'RECRUITED', slogan: d.slogan, bio: d.bio || bioText(d, ctx), issues: d.issues.slice(),
      committeeName: d.committeeName, fppcId: d.fppcId, disclaimer: disc,
      raisedUsd: 0, goalUsd: 25000, subdomain: wizDomain(d, ctx), siteStatus: 'BUILDING',
      brand: d.brand, accent: d.accent, template: d.template, processor: prim ? prim.name : '',
      photo: d.photo || null, photoPos: d.photoPos || '50% 25%',
    };
    s.newCandidates.push(cand);
    s.directorRequest = { candidateId: 'new', tenantSlug: ctx.tenantSlug, name: cand.name, office: cand.office, disclaimer: disc, newCandidateId: id };
    delete s.cand_wiz[ctx.tenantSlug];
    ctx.toast('The Campaign Director is taking it from here', 'ok');
    App.go('director');
  }

  /* ======================================================================
     3. Campaign microsite
     ====================================================================== */
  function renderMicrosite(root, ctx, idFromRoute) {
    const list = candidates(ctx);
    if (!list.length) { root.innerHTML += '<div class="card"><div class="card-body">No candidates yet.</div></div>'; return; }
    const c = list.find((x) => x.id === idFromRoute) || defaultMicrosite(list);
    const { b, a } = colors(c, ctx);
    const di = discInfo(c);
    const t = ctx.tenant;
    const evs = (t.events || []).filter((e) => e.date <= c.electionDate).slice(0, 3);
    const vol = st().cand_vol[c.id];
    const proc = c.processor || 'WinRed';

    root.innerHTML += `
      <div class="cb-toolbar">${picker(list, c, 'Campaign site for')}<span class="spacer"></span>
        ${di.missing ? '<span class="badge badge-danger">Unpublished · needs disclaimer</span>' : c.siteStatus === 'LIVE' ? '<span class="badge badge-ok">Live to the public</span>' : '<span class="badge badge-warn">Preview · publishing soon</span>'}
        <button class="btn btn-sm" data-act="copy">Copy link</button></div>
      <div class="cms-frame">
        <div class="cms-chrome"><span class="cms-dots"><i></i><i></i><i></i></span>
          <div class="cms-addr"><span class="cb-ok">${IC_LOCK}</span><span>https://${esc(c.subdomain)}</span></div></div>
        <div class="cms t-${esc(c.template || 'classic')}" style="--cb:${esc(b)};--ca:${esc(a)}">
          <div class="cms-nav"><b>${esc(c.name)}</b><a data-scroll="about">About</a><a data-scroll="issues">Priorities</a><a data-scroll="events">Events</a><a data-scroll="vol">Volunteer</a></div>
          <header class="cms-hero">
            <div class="cms-photo cms-photo-m">${face(c, 4, 3, { radius: '0', k: 0.36, ay: 0.4 })}</div>
            <div class="cms-hero-txt">
              <div class="cms-office">${esc(c.office)} · ${esc(c.district)}</div>
              <h2>${esc(c.name)}</h2>
              <div class="cms-slogan">${esc(c.slogan)}</div>
              <div class="cms-cta">
                <button class="cms-btn give" data-act="donate" data-tour="microsite-donate">Donate</button>
                <button class="cms-btn ghost" data-scroll="vol">Volunteer</button>
              </div>
            </div>
            <div class="cms-photo cms-photo-d">${face(c, 4, 5, { radius: '14px', k: 0.3, ay: 0.36 })}</div>
          </header>
          <section class="cms-sec" data-sec="about">
            <div class="cms-about"><div>
            <h3>Meet ${esc(firstName(c.name))}</h3>
            <p class="cms-bio">${esc(c.bio)}</p>
            ${isEndorsed(c) ? `<div class="cms-endorse">${I('<path d="M10 2.8l2 4.2 4.6.6-3.3 3.2.8 4.6L10 13.2l-4.1 2.2.8-4.6L3.4 7.6 8 7z"/>', 18)} Endorsed by ${esc(t.name)}</div>` : ''}
            </div>
            <aside class="cms-side">${face(c, 1, 1, { k: 0.5, alt: '' })}<div><b>${esc(c.name)}</b><span class="small muted">${esc(c.office)}<br>${esc(c.district)}</span></div></aside></div>
          </section>
          <section class="cms-sec" data-sec="issues">
            <h3>Priorities</h3>
            <div class="cms-issues">${(c.issues || []).map((iss, i) => `<div class="cms-issue"><div class="n">0${i + 1}</div><h4>${esc(iss)}</h4></div>`).join('')}</div>
          </section>
          <section class="cms-sec" data-sec="events">
            <h3>Meet ${esc(firstName(c.name))} in person</h3>
            ${evs.length ? evs.map((e) => `<div class="cms-ev"><div class="cms-date"><small>${esc(fmtDate(e.date, { month: 'short' }))}</small><b>${esc(fmtDate(e.date, { day: 'numeric' }))}</b></div>
              <div style="flex:1;min-width:0"><b>${esc(e.title)}</b><div class="small muted">${esc(e.time)} · ${esc(e.location)}</div></div>
              <button class="btn btn-sm" data-rsvp="${esc(e.title)}">RSVP</button></div>`).join('') : '<p class="muted">Events coming soon.</p>'}
          </section>
          <section class="cms-sec" data-sec="vol">
            <h3>Join the team</h3>
            ${vol ? `<div class="cms-thanks">Thank you! The campaign will reach out within a day with a first shift.</div>` : `
            <form data-vol>
              <div class="cms-vol">
                <label class="cb-field"><span>Name</span><input class="input" placeholder="Your name"></label>
                <label class="cb-field"><span>Email</span><input class="input" type="email" placeholder="you@example.com"></label>
                <label class="cb-field"><span>ZIP code</span><input class="input" inputmode="numeric" placeholder="95120"></label>
                <button class="cms-btn cms-submit" type="submit">Sign me up</button>
              </div>
              <div class="cms-vol-opts"><label><input type="checkbox" checked> Knock on doors</label><label><input type="checkbox"> Make phone calls</label><label><input type="checkbox" checked> Host a yard sign</label></div>
            </form>`}
          </section>
          <footer class="cms-foot">
            ${di.missing ? `
              <div class="cms-disc missing" data-tour="microsite-disclaimer">
                <strong>${IC_X} Disclaimer missing — this site stays unpublished until the committee adds it.</strong>
                California requires a “Paid for by” line on campaign websites.
                <div class="cms-fix"><input class="input" data-disc-input aria-label="Disclaimer text" value="${esc(App.util.disclaimer(c))}">
                  <button class="btn btn-primary" data-act="add-disc">Add disclaimer</button></div>
              </div>`
              : `<div class="cms-disc" data-tour="microsite-disclaimer">${esc(di.text)}</div>`}
            <div class="small muted" style="margin-top:12px">Site built on the ${esc(t.shortName || t.name)} network · ${esc(c.subdomain)}</div>
          </footer>
        </div>
      </div>
      <div class="explain cb-mt"><strong>Why this matters for your committee.</strong> Every candidate site carries the required “Paid for by” disclaimer, or it waits unpublished until someone adds it. The Donate button sends gifts straight to the campaign through ${esc(proc)}.</div>`;

    root.querySelector('[data-pick]').addEventListener('change', (e) => {
      st().cand_sel[ctx.tenantSlug] = e.target.value;
      ctx.navigate('candidate/microsite/' + e.target.value);
    });
    const form = root.querySelector('[data-vol]');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      st().cand_vol[c.id] = true;
      ctx.toast('Volunteer signed up (sample). The campaign gets a notice.', 'ok');
      App.rerender();
    });
    root.addEventListener('click', (e) => {
      const sc = e.target.closest('[data-scroll]');
      if (sc) { const s = root.querySelector(`[data-sec="${sc.dataset.scroll}"]`); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      const r = e.target.closest('[data-rsvp]');
      if (r) { r.textContent = 'Going ✓'; r.disabled = true; ctx.toast(`RSVP saved for ${r.dataset.rsvp} (sample).`, 'ok'); return; }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'donate') donateModal(ctx, c, proc);
      else if (act.dataset.act === 'copy') ctx.toast(`Link ready to share: https://${c.subdomain}`, 'info');
      else if (act.dataset.act === 'add-disc') {
        const v = root.querySelector('[data-disc-input]').value.trim();
        if (!v) { ctx.toast('Type the “Paid for by” line first.', 'warn'); return; }
        st().disclaimers[c.id] = v;
        ctx.toast('Disclaimer added. The site can publish now.', 'ok');
        App.rerender();
      }
    });
  }

  function donateModal(ctx, c, proc) {
    let amt = 50;
    const m = ctx.modal({
      title: `Support ${c.name}`,
      html: `<p class="muted">Choose an amount.</p>
        <div class="cb-amts">${[25, 50, 100, 250, 500, 1000].map((v) => `<button class="chip${v === amt ? ' active' : ''}" data-amt="${v}">${U.fmtUsd(v)}</button>`).join('')}</div>
        <div class="cb-secure">${IC_LOCK} Secure checkout by ${esc(proc)}</div>
        <div class="cb-demo-note">Demo — no payment taken</div>`,
      actions: [
        { label: 'Cancel' },
        { label: `Give ${U.fmtUsd(amt)}`, primary: true, onClick: () => { ctx.toast(`Demo — no payment taken. A real donor would finish a ${U.fmtUsd(amt)} gift on ${proc}.`, 'info'); } },
      ],
    });
    m.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-amt]');
      if (!b) return;
      amt = +b.dataset.amt;
      m.body.querySelectorAll('[data-amt]').forEach((x) => x.classList.toggle('active', x === b));
      const p = m.el.querySelector('.modal-foot .btn-primary');
      if (p) p.textContent = `Give ${U.fmtUsd(amt)}`;
    });
  }

  /* ======================================================================
     4. Print studio
     ====================================================================== */
  const PRODUCTS = [
    { id: 'door', name: 'Door hanger', plural: 'door hangers', qty: 2000, cost: 420, size: '4.25 × 11 in' },
    { id: 'yard', name: 'Yard sign', plural: 'yard signs', qty: 150, cost: 1125, size: '24 × 18 in' },
    { id: 'palm', name: 'Palm card', plural: 'palm cards', qty: 5000, cost: 290, size: '3.5 × 2 in' },
  ];
  function discBlock(x, y, w, di, fs, chars, ink, onDark) {
    if (di.missing) {
      return `<rect x="${x}" y="${y}" width="${w}" height="${fs * 2.6}" fill="${onDark ? 'rgba(255,255,255,.12)' : '#FDE7E5'}" stroke="#E04B3C" stroke-dasharray="4 3" stroke-width="1.4"/>` +
        svgT(x + w / 2, y + fs * 1.65, 'Disclaimer missing', `text-anchor="middle" font-size="${fs}" font-weight="700" fill="${onDark ? '#FFD2CC' : '#B42318'}" font-family="Public Sans, sans-serif"`);
    }
    const lines = wrap(di.text, chars);
    return lines.map((l, i) => svgT(x + w / 2, y + fs * (1.2 + i * 1.25), l, `text-anchor="middle" font-size="${fs}" fill="${ink}" font-family="Public Sans, sans-serif"`)).join('');
  }
  /* Fit text to a max width: shrink the glyphs with textLength when the estimate runs long. */
  function fitT(x, y, txt, size, maxW, factor, attrs) {
    const est = String(txt).length * size * factor;
    const fit = est > maxW ? ` textLength="${maxW}" lengthAdjust="spacingAndGlyphs"` : '';
    return `<text x="${x}" y="${y}" font-size="${size}"${fit} ${attrs || ''}>${esc(txt)}</text>`;
  }
  function bleed(w, h) { return `<rect x="5" y="5" width="${w - 10}" height="${h - 10}" fill="none" stroke="#18A0C8" stroke-dasharray="5 4" stroke-width="1" opacity=".55"/>`; }
  function voteLine(c) { return 'VOTE ' + fmtDate(c.electionDate, { month: 'long', day: 'numeric' }).toUpperCase(); }

  function doorHanger(c, b, a, di) {
    const W = 240, H = 676;
    const parts = c.name.split(/\s+/);
    const first = parts.slice(0, -1).join(' ') || parts[0];
    const last = parts.length > 1 ? parts[parts.length - 1] : '';
    const fsL = Math.min(40, 220 / (Math.max(last.length, first.length, 4) * 0.62));
    let y = 452;
    const slogan = wrap(c.slogan, 28).slice(0, 3).map((l, i) => svgT(W / 2, y + i * 17, l, `text-anchor="middle" font-size="14" font-weight="700" fill="${b}" font-family="Archivo, sans-serif"`)).join('');
    y += wrap(c.slogan, 28).slice(0, 3).length * 17 + 14;
    const issues = (c.issues || []).map((iss) => {
      const ls = wrap(iss, 34).slice(0, 2);
      const out = `<rect x="22" y="${y - 8}" width="7" height="7" fill="${a}"/>` + ls.map((l, i) => svgT(36, y + i * 13, l, 'font-size="11" fill="#1d2733" font-family="Public Sans, sans-serif"')).join('');
      y += ls.length * 13 + 7;
      return out;
    }).join('');
    const nameTop = 286;
    return `<svg class="cp-tall" viewBox="0 0 ${W} ${H}" role="img" aria-label="Door hanger proof for ${esc(c.name)}">
      <rect width="${W}" height="${H}" rx="8" fill="#fff" stroke="#C3CAD4"/>
      ${svgFace(c, 0, 96, W, 172, 0.4, 0.42, 'rect')}
      <rect x="0" y="268" width="${W}" height="128" fill="${b}"/>
      <rect x="0" y="264" width="${W}" height="4" fill="${a}"/>
      ${svgT(W / 2, nameTop, c.office.toUpperCase(), `text-anchor="middle" font-size="11" letter-spacing="1.5" font-weight="700" fill="#fff" opacity=".85" font-family="Public Sans, sans-serif"`)}
      ${fitT(W / 2, nameTop + 4 + fsL * 0.8, first, fsL * 0.8, 200, 0.58, `text-anchor="middle" font-weight="800" fill="#fff" font-family="Archivo, sans-serif"`)}
      ${last ? fitT(W / 2, nameTop + 4 + fsL * 1.75, last.toUpperCase(), fsL, 200, 0.7, `text-anchor="middle" font-weight="800" fill="#fff" font-family="Archivo, sans-serif"`) : ''}
      ${svgT(W / 2, 386, c.district, `text-anchor="middle" font-size="12" fill="#fff" opacity=".9" font-family="Public Sans, sans-serif"`)}
      <rect x="0" y="396" width="${W}" height="32" fill="${a}"/>
      ${svgT(W / 2, 417, voteLine(c), `text-anchor="middle" font-size="14" font-weight="800" letter-spacing="1" fill="#fff" font-family="Archivo, sans-serif"`)}
      <line x1="${W / 2}" y1="0" x2="${W / 2}" y2="26" stroke="#9AA4B2" stroke-width="1.5"/>
      <circle cx="${W / 2}" cy="54" r="28" fill="#fff" stroke="#9AA4B2" stroke-width="1.5"/>
      ${slogan}${issues}
      <line x1="20" y1="${H - 62}" x2="${W - 20}" y2="${H - 62}" stroke="#DCE1E8"/>
      ${discBlock(16, H - 54, W - 32, di, 8.5, 46, '#3C4858', false)}
      ${bleed(W, H)}
    </svg>`;
  }
  function yardSign(c, b, a, di) {
    const W = 600, H = 330;
    const fs = Math.min(96, 530 / (c.name.length * 0.66));
    return `<svg class="cp-wide" viewBox="0 0 ${W} ${H}" role="img" aria-label="Yard sign proof for ${esc(c.name)}">
      <rect width="${W}" height="${H}" fill="${b}"/>
      <rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="#fff" stroke-width="3" opacity=".9"/>
      ${svgT(W / 2, 64, c.district.toUpperCase(), `text-anchor="middle" font-size="18" letter-spacing="3" font-weight="700" fill="#fff" opacity=".85" font-family="Public Sans, sans-serif"`)}
      ${fitT(W / 2, 64 + fs * 0.98, c.name.toUpperCase(), fs, 530, 0.7, `text-anchor="middle" font-weight="800" fill="#fff" font-family="Archivo, sans-serif" font-stretch="75%"`)}
      <rect x="14" y="196" width="${W - 28}" height="58" fill="${a}"/>
      ${fitT(W / 2, 236, c.office.toUpperCase(), 30, 520, 0.78, `text-anchor="middle" font-weight="800" letter-spacing="2" fill="#fff" font-family="Archivo, sans-serif"`)}
      ${discBlock(60, 268, W - 120, di, 12, 80, '#fff', true)}
      ${bleed(W, H)}
    </svg>`;
  }
  function palmCard(c, b, a, di) {
    const W = 350, H = 200;
    const sl = wrap(c.slogan, 30).slice(0, 2);
    return `<svg class="cp-card" viewBox="0 0 ${W} ${H}" role="img" aria-label="Palm card proof for ${esc(c.name)}">
      <rect width="${W}" height="${H}" rx="6" fill="#fff" stroke="#C3CAD4"/>
      <rect width="112" height="${H}" fill="${b}"/>
      ${svgFace(c, 0, 0, 112, 118, 0.42, 0.42, 'rect')}
      <rect x="0" y="118" width="112" height="28" fill="${a}"/>
      ${svgT(56, 137, 'VOTE ' + fmtDate(c.electionDate, { month: 'short', day: 'numeric' }).toUpperCase(), `text-anchor="middle" font-size="12" font-weight="800" fill="#fff" font-family="Archivo, sans-serif"`)}
      ${fitT(124, 34, c.name, Math.min(20, 216 / (c.name.length * 0.55)), 214, 0.62, `font-weight="800" fill="${b}" font-family="Archivo, sans-serif"`)}
      ${svgT(124, 50, `${c.office} · ${c.district}`, 'font-size="9.5" fill="#3C4858" font-family="Public Sans, sans-serif"')}
      ${sl.map((l, i) => svgT(124, 70 + i * 12, l, `font-size="10" font-weight="700" fill="${a}" font-family="Public Sans, sans-serif"`)).join('')}
      ${(c.issues || []).map((iss, i) => `<rect x="124" y="${100 + i * 15}" width="5" height="5" fill="${b}"/>` + fitT(134, 106 + i * 15, iss, 9, 206, 0.5, 'fill="#1d2733" font-family="Public Sans, sans-serif"')).join('')}
      <rect x="112" y="${H - 28}" width="${W - 112}" height="28" fill="#F3F5F8"/>
      ${discBlock(118, H - 25, W - 124, di, 6.6, 58, '#3C4858', false)}
      ${bleed(W, H)}
    </svg>`;
  }

  function mediaPanel(c, ctx, b, a, di) {
    const slug = slugify(c.name);
    const cl = { b, a };
    const row = (key, thumb, title, sub, file, wide) => `<div class="cm-row"><span class="cm-thumb${wide ? ' wide' : ''}">${thumb}</span>
      <div class="cm-txt"><b>${esc(title)}</b><span class="small muted">${esc(sub)}</span></div>
      <button class="btn btn-sm" data-media="${esc(file)}"${key === 'locked' ? ' disabled title="Add the disclaimer first"' : ''}>Download</button></div>`;
    const locked = di.missing ? 'locked' : '';
    return `<div class="card" style="margin-bottom:18px"><div class="card-head"><h3>Campaign media</h3><span class="small muted">Everything ${esc(firstName(c.name))}’s team needs, in one place</span></div>
      <div class="card-body"><div class="cm-list">
        ${row('', face(c, 1, 1, { radius: '0', k: 0.45, alt: '' }), 'Headshot', c.photo ? 'High-resolution photo · JPG' : 'Initials placeholder until a photo is added', `${slug}-headshot.jpg`)}
        ${row(locked, doorHanger(c, b, a, di).replace('class="cp-tall"', ''), 'Door hanger', '4.25 × 11 in · print-ready PDF (Portable Document Format)', `${slug}-door-hanger.pdf`)}
        ${row(locked, palmCard(c, b, a, di).replace('class="cp-card"', ''), 'Palm card', '3.5 × 2 in · print-ready PDF', `${slug}-palm-card.pdf`, true)}
        ${row('', socialGraphic(c, cl, { kicker: 'Meet your candidate', head: `Meet ${firstName(c.name)}` }), 'Social graphics', '6 branded images · 1200 × 675 PNG (Portable Network Graphics)', `${slug}-social-pack.zip`, true)}
      </div></div></div>`;
  }

  function renderPrint(root, ctx) {
    const list = candidates(ctx);
    if (!list.length) { root.innerHTML += '<div class="card"><div class="card-body">No candidates yet.</div></div>'; return; }
    const c = selected(ctx, list);
    const { b, a } = colors(c, ctx);
    const di = discInfo(c);
    const sent = st().cand_print;
    root.innerHTML += `
      <div class="cb-toolbar">${picker(list, c, 'Proofs for')}<span class="spacer"></span>
        <span class="small muted">Blue dashed line = trim edge with bleed margin</span></div>
      ${mediaPanel(c, ctx, b, a, di)}
      <div class="explain" style="margin-bottom:18px"><strong>Why this matters for your committee.</strong> Every proof is checked before it reaches a printer. A piece without its “Paid for by” line stays on hold, so the committee never pays for a reprint.</div>
      <div class="stack">
      ${PRODUCTS.map((p, i) => {
        const key = c.id + ':' + p.id;
        const svg = p.id === 'door' ? doorHanger(c, b, a, di) : p.id === 'yard' ? yardSign(c, b, a, di) : palmCard(c, b, a, di);
        return `<div class="card"><div class="cp-row">
          <div class="cp-mat">${svg}</div>
          <div class="cp-panel">
            <div class="row"><h3>${esc(p.name)}</h3><span class="spacer"></span>${sent[key] ? '<span class="badge badge-ok">Order sent</span>' : di.missing ? '<span class="badge badge-danger">On hold</span>' : '<span class="badge badge-local">Proof ready</span>'}</div>
            <div class="cp-specs"><div>Size<b>${esc(p.size)}</b></div><div>Quantity<b>${U.fmtNum(p.qty)}</b></div><div>Estimate<b>${U.fmtUsd(p.cost)}</b></div></div>
            <div class="cp-checks${di.missing ? ' bad' : ''}"${i === 0 ? ' data-tour="print-check"' : ''}>
              <h4>Compliance check</h4>
              <ul>
                <li><span class="${di.missing ? 'cb-bad' : 'cb-ok'}">${di.missing ? IC_X : IC_CHECK}</span><span>“Paid for by” disclaimer ${di.missing ? '<b>missing</b>' : 'present'}</span></li>
                <li><span class="cb-ok">${IC_CHECK}</span><span>300 DPI (dots per inch) print resolution</span></li>
                <li><span class="cb-ok">${IC_CHECK}</span><span>Bleed margin of ⅛ inch on every edge</span></li>
              </ul>
            </div>
            ${di.missing ? `<div class="cp-fix"><b class="small">Add the disclaimer to unlock printing</b>
              <div class="row"><input class="input" data-fix="${p.id}" value="${esc(App.util.disclaimer(c))}" aria-label="Disclaimer text"><button class="btn btn-primary btn-sm" data-act="fix" data-p="${p.id}">Add disclaimer</button></div></div>` : ''}
            <div class="row">
              <button class="btn btn-primary" data-send="${p.id}"${di.missing ? ' disabled aria-disabled="true"' : ''}>Send to printer</button>
              <button class="btn btn-ghost" data-dl="${p.id}">Download proof</button>
            </div>
            ${di.missing ? '<div class="cp-reason">Printing is on hold: the “Paid for by” disclaimer is missing.</div>' : ''}
          </div></div></div>`;
      }).join('')}
      </div>`;

    root.querySelector('[data-pick]').addEventListener('change', (e) => { st().cand_sel[ctx.tenantSlug] = e.target.value; App.rerender(); });
    root.addEventListener('click', (e) => {
      const fx = e.target.closest('[data-act="fix"]');
      if (fx) {
        const v = root.querySelector(`[data-fix="${fx.dataset.p}"]`).value.trim();
        if (!v) { ctx.toast('Type the “Paid for by” line first.', 'warn'); return; }
        st().disclaimers[c.id] = v;
        ctx.toast('Disclaimer added to every proof, the site and posts.', 'ok');
        App.rerender();
        return;
      }
      const md = e.target.closest('[data-media]');
      if (md) { ctx.toast(`${md.dataset.media} is ready (simulated — downloads are switched off in this prototype).`, 'info'); return; }
      const dl = e.target.closest('[data-dl]');
      if (dl) { ctx.toast('Print-ready PDF (Portable Document Format) proof prepared (simulated).', 'info'); return; }
      const sd = e.target.closest('[data-send]');
      if (sd && !sd.disabled) {
        const p = PRODUCTS.find((x) => x.id === sd.dataset.send);
        ctx.modal({
          title: 'Board approval required',
          html: `<p style="font-size:1.1rem"><b>${U.fmtNum(p.qty)} ${esc(p.plural)}, est. ${U.fmtUsd(p.cost)}</b></p>
            <p class="muted">For ${esc(c.name)} · ${esc(p.size)} · proof passed all compliance checks. Spending over the committee’s limit needs an Executive Board approval, recorded with your name and the time.</p>`,
          actions: [
            { label: 'Cancel' },
            { label: 'Approve', primary: true, onClick: () => { st().cand_print[c.id + ':' + p.id] = true; ctx.toast('Order sent to print vendor (simulated)', 'ok'); rerenderIf('print'); } },
          ],
        });
      }
    });
  }

  /* ======================================================================
     5. Social posts
     ====================================================================== */
  const WEEK = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'];
  const PLATFORMS = {
    facebook: { name: 'Facebook', color: '#3B5B9A' },
    x: { name: 'X', color: '#1d2733' },
    instagram: { name: 'Instagram', color: '#A0407A' },
    youtube: { name: 'YouTube', color: '#B4232A' },
  };
  function glyph(p) {
    const c = PLATFORMS[p].color;
    const inner = p === 'facebook' ? `<text x="18" y="25" text-anchor="middle" font-size="19" font-weight="800" fill="#fff" font-family="Archivo, sans-serif">f</text>`
      : p === 'x' ? `<path d="M12 11l12 14M24 11L12 25" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`
        : p === 'instagram' ? `<rect x="10" y="10" width="16" height="16" rx="5" fill="none" stroke="#fff" stroke-width="2.2"/><circle cx="18" cy="18" r="3.6" fill="none" stroke="#fff" stroke-width="2.2"/><circle cx="22.6" cy="13.4" r="1.2" fill="#fff"/>`
          : `<rect x="8" y="11" width="20" height="14" rx="4" fill="none" stroke="#fff" stroke-width="2.2"/><path d="M16 14.5v7l5.5-3.5z" fill="#fff"/>`;
    return `<svg class="cs-glyph" viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" rx="9" fill="${c}"/>${inner}</svg>`;
  }
  function posts(c, ctx) {
    const f = firstName(c.name);
    const ev = (ctx.tenant.events || []).find((e) => e.kind === 'Forum') || (ctx.tenant.events || [])[0] || { title: 'a neighborhood meet-and-greet', date: '2026-10-22' };
    const days = (iso) => daysBetween(iso, c.electionDate);
    return [
      { id: 'p1', day: 0, time: '9:00 AM', platform: 'facebook', gfx: { kicker: 'Meet your candidate', head: c.slogan.length > 40 ? `Meet ${f}` : c.slogan }, text: `Meet ${c.name}, running for ${c.office} in ${c.district}.\n“${c.slogan}”\nRead the plan: ${c.subdomain}` },
      { id: 'p2', day: 1, time: '12:15 PM', platform: 'x', gfx: { kicker: 'Priority #1', head: c.issues[0] || '' }, text: `Priority #1 for ${c.district}: ${String(c.issues[0] || '').toLowerCase()}. ${f} has a plan, and it starts on day one.` },
      { id: 'p3', day: 2, time: '5:30 PM', platform: 'instagram', gfx: { kicker: 'On the trail', head: `Thank you, ${c.district}!`, k: 0.36 }, text: `Out knocking doors in ${c.district} tonight. Thank you to every neighbor who stopped to talk with ${f}!` },
      { id: 'p4', day: 3, time: '10:00 AM', platform: 'youtube', gfx: { kicker: 'New video · 1:00', head: `60 seconds with ${f}`, play: true }, text: `New video: 60 seconds with ${f} on ${String(c.issues[1] || '').toLowerCase()}.` },
      { id: 'p5', day: 4, time: '8:00 AM', platform: 'facebook', gfx: { kicker: fmtDate(ev.date, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + (ev.time || ''), head: `Meet ${f} in person`, band: ev.kind || 'Event' }, text: `Join ${f} at “${ev.title}” on ${fmtDate(ev.date, { weekday: 'long', month: 'short', day: 'numeric' })}. Bring a neighbor and your questions.` },
      { id: 'p6', day: 5, time: '11:00 AM', platform: 'x', gfx: { kicker: 'Countdown', head: `${days(WEEK[5])} days to go`, band: 'Chip in today' }, text: `${days(WEEK[5])} days to Election Day. ${c.issues[2] || ''}. Chip in to keep the campaign moving: ${c.subdomain}/donate` },
    ];
  }

  function renderSocial(root, ctx) {
    const list = candidates(ctx);
    if (!list.length) { root.innerHTML += '<div class="card"><div class="card-body">No candidates yet.</div></div>'; return; }
    const c = selected(ctx, list);
    const cl = colors(c, ctx);
    const S = st().cand_social;
    const ps = posts(c, ctx).map((p) => Object.assign({}, p, S[c.id + ':' + p.id] || {}, { status: (S[c.id + ':' + p.id] || {}).status || 'awaiting' }));
    const waiting = ps.filter((p) => p.status === 'awaiting').length;
    let firstApproveTagged = false;

    root.innerHTML += `
      <div class="cb-toolbar">${picker(list, c, 'Posts for')}<span class="spacer"></span>
        <span class="badge badge-warn">${waiting} awaiting approval</span><span class="badge badge-ok">${ps.length - waiting} scheduled</span>
        ${waiting ? '<button class="btn btn-sm" data-act="all">Approve all</button>' : ''}</div>
      <div class="explain" style="margin-bottom:18px"><strong>Nothing posts without a person approving it.</strong> The AI (Artificial Intelligence) assistant drafts a week of posts from the candidate’s own words. A campaign volunteer reads each one, edits if needed, and approves it before it is scheduled.</div>
      <h3 style="margin-bottom:10px">Week of ${esc(fmtDate(WEEK[0], { month: 'long', day: 'numeric' }))}</h3>
      <div class="cs-week">${WEEK.map((iso, di) => {
        const dayPosts = ps.filter((p) => p.day === di);
        return `<div class="cs-day"><div class="cs-day-h">${esc(fmtDate(iso, { weekday: 'short' }))}<b>${esc(fmtDate(iso, { day: 'numeric' }))}</b></div>
          ${dayPosts.length ? dayPosts.map((p) => `<button class="cs-pill${p.status === 'scheduled' ? ' ok' : ''}" data-jump="${p.id}" title="${esc(PLATFORMS[p.platform].name)} · ${esc(p.time)}">${p.status === 'scheduled' ? IC_CHECK : I('<circle cx="10" cy="10" r="6"/>', 14)}<span>${esc(PLATFORMS[p.platform].name)}</span></button>`).join('') : '<div class="cs-free">Rest day</div>'}</div>`;
      }).join('')}</div>
      <div class="grid-3">${ps.map((p) => {
        const tag = p.status === 'awaiting' && !firstApproveTagged ? (firstApproveTagged = true, ' data-tour="social-approve"') : '';
        return `<article class="card cs-post" data-post="${p.id}">
          <div class="cs-post-head">${glyph(p.platform)}<div class="t"><b>${esc(PLATFORMS[p.platform].name)}</b><span class="small muted">${esc(fmtDate(WEEK[p.day]))} · ${esc(p.time)}</span></div>
            ${p.status === 'scheduled' ? '<span class="badge badge-ok">Scheduled</span>' : '<span class="badge badge-warn">Awaiting approval</span>'}</div>
          ${p.gfx ? `<div class="cs-media">${socialGraphic(c, cl, p.gfx)}</div>` : ''}
          <div class="cs-post-body">${esc(p.text)}</div>
          <div class="cs-post-foot">
            ${p.status === 'scheduled'
              ? `<span class="small muted">Approved by you · posts ${esc(fmtDate(WEEK[p.day]))} at ${esc(p.time)}</span><span class="spacer"></span><button class="btn btn-ghost btn-sm" data-undo="${p.id}">Unschedule</button>`
              : `<button class="btn btn-primary btn-sm" data-approve="${p.id}"${tag}>Approve</button><button class="btn btn-sm" data-edit="${p.id}">Edit</button><span class="spacer"></span><span class="small muted">AI draft</span>`}
          </div>
        </article>`;
      }).join('')}</div>`;

    const setP = (id, patch) => { const k = c.id + ':' + id; S[k] = Object.assign({}, S[k] || {}, patch); };
    root.querySelector('[data-pick]').addEventListener('change', (e) => { st().cand_sel[ctx.tenantSlug] = e.target.value; App.rerender(); });
    root.addEventListener('click', (e) => {
      const ap = e.target.closest('[data-approve]');
      if (ap) {
        const p = ps.find((x) => x.id === ap.dataset.approve);
        setP(p.id, { status: 'scheduled' });
        ctx.toast(`Approved. Scheduled for ${fmtDate(WEEK[p.day])} at ${p.time}.`, 'ok');
        App.rerender();
        return;
      }
      const un = e.target.closest('[data-undo]');
      if (un) { setP(un.dataset.undo, { status: 'awaiting' }); ctx.toast('Moved back to awaiting approval.', 'info'); App.rerender(); return; }
      const ed = e.target.closest('[data-edit]');
      if (ed) {
        const p = ps.find((x) => x.id === ed.dataset.edit);
        const m = ctx.modal({
          title: `Edit ${PLATFORMS[p.platform].name} post`,
          html: `<label class="cb-field" style="display:flex;flex-direction:column;gap:6px"><span class="small muted">${esc(fmtDate(WEEK[p.day]))} · ${esc(p.time)}</span><textarea class="textarea" rows="6" data-edit-text>${esc(p.text)}</textarea></label>`,
          actions: [
            { label: 'Cancel' },
            { label: 'Save draft', primary: true, onClick: (api) => { setP(p.id, { text: api.body.querySelector('[data-edit-text]').value }); ctx.toast('Draft updated. It still waits for approval.', 'info'); rerenderIf('social'); } },
          ],
        });
        void m;
        return;
      }
      const jp = e.target.closest('[data-jump]');
      if (jp) {
        const card = root.querySelector(`[data-post="${jp.dataset.jump}"]`);
        if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
        return;
      }
      const all = e.target.closest('[data-act="all"]');
      if (all) {
        ps.forEach((p) => setP(p.id, { status: 'scheduled' }));
        ctx.toast(`All ${ps.length} posts approved and scheduled.`, 'ok');
        App.rerender();
      }
    });
  }

  /* ======================================================================
     Register
     ====================================================================== */
  const SUBS = [
    ['', 'Candidates', 'Track every candidate from recruitment to election day.'],
    ['builder', 'Launch a candidate', 'Five short steps from “yes, I’ll run” to a working campaign.'],
    ['microsite', 'Campaign site', 'The candidate’s own website, built and hosted by the network.'],
    ['print', 'Print studio', 'Ready-to-print proofs, checked for compliance before they ship.'],
    ['social', 'Social posts', 'A week of drafted posts, each one approved by a person.'],
  ];

  App.register({
    id: 'candidate',
    title: 'Campaign-in-a-Box',
    group: 'Candidate Tools',
    icon: ICON,
    blurb: 'Recruit a candidate and launch their website, print pieces and social posts in one sitting.',
    render(el, ctx) {
      injectStyle();
      st();
      const parts = String(ctx.sub || '').split('/');
      const sub = SUBS.some((s) => s[0] === parts[0]) ? parts[0] : '';
      if (sub !== '') st().cand_drawer = null;
      const meta = SUBS.find((s) => s[0] === sub);
      const root = document.createElement('div');
      root.className = 'page scr-cand';
      root.innerHTML = `
        <div class="page-head"><div><h1>Campaign-in-a-Box</h1><p>${esc(meta[2])}</p></div>
          ${sub === '' ? `<div class="row"><button class="btn btn-primary" data-recruit>${I('<path d="M10 4v12M4 10h12"/>', 18)} Recruit a candidate</button></div>` : ''}</div>
        <nav class="tabs cb-tabs" aria-label="Campaign-in-a-Box sections">
          ${SUBS.map(([id, label]) => `<a class="tab${id === sub ? ' active' : ''}" href="#/candidate${id ? '/' + id : ''}"${id === sub ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('')}
        </nav>`;
      el.appendChild(root);

      if (sub === '') {
        renderPipeline(root, ctx);
        root.querySelector('[data-recruit]').addEventListener('click', () => ctx.navigate('candidate/builder'));
        root.querySelector('.cb-pipe').addEventListener('click', (e) => {
          const card = e.target.closest('[data-open]');
          if (!card) return;
          st().cand_drawer = card.dataset.open;
          App.rerender();
        });
      } else if (sub === 'builder') renderBuilder(root, ctx);
      else if (sub === 'microsite') renderMicrosite(root, ctx, parts[1]);
      else if (sub === 'print') renderPrint(root, ctx);
      else if (sub === 'social') renderSocial(root, ctx);
    },
  });
})();
