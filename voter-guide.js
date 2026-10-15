/* voter-guide.js — App.voterGuide: the county's endorsement guide as a homepage teaser,
   a slim newsroom bar, and a full-screen guide (Candidates / Measures / Printed card) with search and print.
   Data: window.VOTER_GUIDES (voter-guide-data.js), keyed by tenant slug.
   Any element with data-vg="open" (optional data-vg-tab, data-vg-focus) or data-vg="print" opens it. */
(function () {
  'use strict';
  if (!window.App) return;

  const U = App.util;
  const esc = U.esc;
  const I = (d, s) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC_X = I('<path d="M5 5l10 10M15 5L5 15"/>', 20);
  const IC_PRINT = I('<path d="M5.5 7.5V3h9v4.5M5.5 14H3.5V8.5a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1V14h-2"/><rect x="5.5" y="11.5" width="9" height="6" rx=".5"/>', 18);
  const IC_SHARE = I('<path d="M10 12.5V3M6.5 6.5L10 3l3.5 3.5M4 10.5v5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-5"/>', 18);
  const IC_SEARCH = I('<circle cx="9" cy="9" r="5.5"/><path d="M13.2 13.2L17 17"/>', 18);
  const IC_ARROW = I('<path d="M4 10h11M11 6l4 4-4 4"/>', 18);
  const IC_OUT = I('<path d="M11 4h5v5M16 4l-7 7M14 12v3.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5H8"/>', 15);
  const STAR = (s, fill) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const r = i % 2 ? 4 : 9.5;
      pts.push((10 + r * Math.cos(a)).toFixed(1) + ',' + (10.6 + r * Math.sin(a)).toFixed(1));
    }
    return `<svg width="${s}" height="${s}" viewBox="0 0 20 20" aria-hidden="true"><polygon points="${pts.join(' ')}" fill="${fill || 'currentColor'}"/></svg>`;
  };

  const CSS = `
:root { --vg-yes:#1B7A43; --vg-no:#C42B1C; }

/* ---------- homepage teaser ---------- */
.vg-teaser { position:relative; overflow:hidden; height:100%; display:flex; flex-direction:column; gap:16px; padding:24px 22px 20px;
  border-radius:var(--r); color:#fff; background:linear-gradient(140deg, var(--brand) 0%, color-mix(in srgb, var(--brand) 72%, black) 100%); }
.vg-teaser::before { content:''; position:absolute; left:0; right:0; top:0; height:6px;
  background:repeating-linear-gradient(90deg, var(--accent) 0 34px, #fff 34px 40px); opacity:.95; }
.vg-teaser > * { position:relative; }
.vg-teaser > .vg-teaser-star { position:absolute; right:-46px; bottom:-60px; width:260px; height:260px; opacity:.07; color:#fff; pointer-events:none; }
.vg-teaser-star svg { display:block; }
.vg-t-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
.vg-eyebrow { display:inline-flex; align-items:center; gap:7px; font:800 12.5px/1.2 var(--font-body); letter-spacing:.09em; text-transform:uppercase; color:rgba(255,255,255,.86); }
.vg-eyebrow svg { color:var(--accent); flex:none; }
.vg-teaser h2 { margin:8px 0 0; color:#fff; font-family:var(--font-head); font-stretch:78%; font-weight:800; line-height:.98; letter-spacing:-.01em;
  font-size:clamp(2rem, 1.3rem + 2.4cqw, 2.85rem); }
.vg-t-lede { margin:0; font-size:1.06rem; line-height:1.45; color:rgba(255,255,255,.9); max-width:46ch; }
.vg-count { flex:none; display:flex; align-items:center; gap:8px; padding:8px 12px 8px 10px; border-radius:12px;
  background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.2); }
.vg-count b { font:800 2.3rem/1 var(--font-head); font-stretch:80%; color:#fff; }
.vg-count span { font:700 12.5px/1.15 var(--font-body); text-transform:uppercase; letter-spacing:.05em; color:rgba(255,255,255,.85); }
.vg-count.is-today b { font-size:1.35rem; }

.vg-t-ticket { display:grid; grid-template-columns:repeat(auto-fit, minmax(178px, 1fr)); gap:8px; }
.vg-person { display:flex; align-items:center; gap:10px; min-width:0; padding:9px 12px 9px 9px; border-radius:12px; cursor:pointer; text-align:left; font:inherit; color:#fff;
  background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.16); transition:background-color .15s, border-color .15s, transform .15s; }
.vg-person:hover { background:rgba(255,255,255,.15); border-color:rgba(255,255,255,.32); transform:translateY(-1px); }
.vg-person:focus-visible { outline:3px solid #fff; outline-offset:2px; }
.vg-person img, .vg-person svg.avatar { border:2px solid rgba(255,255,255,.75); border-radius:50%; }
.vg-person-office { display:block; font:700 11.5px/1.2 var(--font-body); text-transform:uppercase; letter-spacing:.06em; color:rgba(255,255,255,.75); }
.vg-person-name { display:block; font:800 1.06rem/1.15 var(--font-head); font-stretch:88%; color:#fff; }

.vg-t-props-label { display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:4px 10px; margin-bottom:8px;
  font:800 12.5px/1.2 var(--font-body); letter-spacing:.08em; text-transform:uppercase; color:rgba(255,255,255,.8); }
.vg-t-props-label span { text-transform:none; letter-spacing:0; font-weight:600; font-size:13px; color:rgba(255,255,255,.72); }
.vg-pills { display:flex; flex-wrap:wrap; gap:6px; }
.vg-pill { display:inline-flex; align-items:stretch; border-radius:8px; overflow:hidden; cursor:pointer; padding:0; font:inherit;
  border:1px solid rgba(255,255,255,.22); background:rgba(255,255,255,.07); color:#fff; transition:transform .15s, border-color .15s; }
.vg-pill:hover { transform:translateY(-1px); border-color:rgba(255,255,255,.5); }
.vg-pill:focus-visible { outline:3px solid #fff; outline-offset:2px; }
.vg-pill span { padding:5px 8px; font:700 13.5px/1.2 var(--font-body); font-variant-numeric:tabular-nums; }
.vg-pill b { padding:5px 7px; font:800 11.5px/1.45 var(--font-body); letter-spacing:.04em; }
.vg-pill.is-yes b { background:var(--vg-yes); }
.vg-pill.is-no b { background:var(--vg-no); }

.vg-t-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:auto; padding-top:2px; }
.vg-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:46px; padding:11px 18px; border-radius:10px; cursor:pointer;
  font:700 15.5px/1.2 var(--font-body); text-decoration:none; transition:background-color .15s, transform .15s, border-color .15s; }
.vg-btn:focus-visible { outline:3px solid #fff; outline-offset:2px; }
.vg-btn-primary { background:#fff; color:var(--brand); border:0; box-shadow:0 8px 20px -10px rgba(0,0,0,.55); }
.vg-btn-primary:hover { transform:translateY(-1px); background:color-mix(in srgb, #fff 90%, var(--accent)); }
.vg-btn-ghost { background:transparent; color:#fff; border:1.5px solid rgba(255,255,255,.45); }
.vg-btn-ghost:hover { background:rgba(255,255,255,.1); border-color:#fff; }
@container (max-width: 560px) {
  .vg-teaser { padding:22px 16px 16px; gap:14px; }
  .vg-count b { font-size:1.9rem; }
  .vg-t-ticket { grid-template-columns:repeat(2, minmax(0,1fr)); }
  .vg-person:last-child:nth-child(odd) { grid-column:1 / -1; }
  .vg-t-actions .vg-btn { flex:1 1 100%; }
}

/* ---------- newsroom bar ---------- */
.vg-bar { display:flex; align-items:center; flex-wrap:wrap; gap:10px 16px; padding:12px 20px; color:#fff;
  background:linear-gradient(90deg, var(--brand), color-mix(in srgb, var(--brand) 78%, black)); border-bottom:3px solid var(--accent); }
.vg-bar-tag { display:inline-flex; align-items:center; gap:7px; flex:none; font:800 12.5px/1 var(--font-body); letter-spacing:.1em;
  padding:7px 11px; border-radius:999px; background:rgba(255,255,255,.12); }
.vg-bar-tag svg { color:var(--accent); }
.vg-bar-text { flex:1 1 320px; min-width:0; font-size:15px; line-height:1.4; }
.vg-bar-text b { font-weight:800; }
.vg-bar-yes { color:#8EE3B0; font-weight:700; }
.vg-bar-no { color:#FFB4AB; font-weight:700; }
.vg-bar .vg-btn { min-height:40px; padding:8px 14px; font-size:14.5px; }

/* ---------- full-screen guide ---------- */
body.vg-open { overflow:hidden; }
.vg-overlay { position:fixed; inset:0; z-index:1200; display:flex; justify-content:center; align-items:stretch; padding:24px;
  background:rgba(9,14,22,.6); opacity:0; transition:opacity .2s ease; }
.vg-overlay.in { opacity:1; }
.vg-sheet { width:min(1080px, 100%); display:flex; flex-direction:column; min-height:0; background:var(--bg); border-radius:18px; overflow:hidden;
  box-shadow:0 30px 80px -20px rgba(0,0,0,.55); transform:translateY(18px) scale(.985); transition:transform .25s cubic-bezier(.2,.8,.2,1); }
.vg-overlay.in .vg-sheet { transform:none; }
.vg-head { position:relative; flex:none; color:#fff; padding:24px 26px 0;
  background:linear-gradient(140deg, var(--brand), color-mix(in srgb, var(--brand) 72%, black)); }
.vg-head::before { content:''; position:absolute; left:0; right:0; top:0; height:6px; background:repeating-linear-gradient(90deg, var(--accent) 0 34px, #fff 34px 40px); }
.vg-head-row { display:flex; align-items:flex-start; gap:16px; }
.vg-head-title { flex:1; min-width:0; }
.vg-head h2 { margin:6px 0 4px; color:#fff; font-family:var(--font-head); font-stretch:78%; font-weight:800; font-size:clamp(1.8rem, 1.2rem + 2vw, 2.6rem); line-height:1; }
.vg-head-sub { display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; font-size:15px; color:rgba(255,255,255,.88); }
.vg-head-sub .vg-days { display:inline-flex; align-items:center; padding:3px 10px; border-radius:999px; background:var(--accent); color:#fff; font-weight:800; font-size:13.5px; }
.vg-head-actions { display:flex; gap:8px; flex:none; }
.vg-icon-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; height:42px; min-width:42px; padding:0 12px; border-radius:10px; cursor:pointer;
  border:1px solid rgba(255,255,255,.3); background:rgba(255,255,255,.08); color:#fff; font:700 14.5px/1 var(--font-body); }
.vg-icon-btn:hover { background:rgba(255,255,255,.18); }
.vg-icon-btn:focus-visible { outline:3px solid #fff; outline-offset:2px; }
.vg-tabs { display:flex; gap:4px; margin-top:20px; overflow-x:auto; scrollbar-width:none; }
.vg-tab { flex:none; padding:12px 18px; border:0; border-radius:12px 12px 0 0; cursor:pointer; background:transparent; color:rgba(255,255,255,.86);
  font:700 15.5px/1.2 var(--font-body); display:inline-flex; align-items:center; gap:8px; }
.vg-tab:hover { background:rgba(255,255,255,.1); color:#fff; }
.vg-tab[aria-selected="true"] { background:var(--bg); color:var(--brand); }
.vg-tab:focus-visible { outline:3px solid #fff; outline-offset:-3px; }
.vg-tab-n { min-width:24px; padding:2px 7px; border-radius:999px; font-size:12.5px; text-align:center; background:rgba(255,255,255,.18); }
.vg-tab[aria-selected="true"] .vg-tab-n { background:color-mix(in srgb, var(--brand) 12%, white); }

.vg-body { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; }
.vg-search-row { position:sticky; top:0; z-index:2; padding:16px 26px 12px; background:var(--bg); border-bottom:1px solid transparent; }
.vg-search { display:flex; align-items:center; gap:10px; max-width:560px; padding:0 14px; border-radius:12px; background:#fff; border:1.5px solid var(--line-strong); color:var(--ink-3); }
.vg-search:focus-within { border-color:var(--brand); box-shadow:var(--focus); }
.vg-search input { flex:1; min-width:0; border:0; outline:0; background:transparent; padding:12px 0; font:500 16px var(--font-body); color:var(--ink); }
.vg-panel { padding:6px 26px 26px; }
.vg-empty { padding:28px; text-align:center; border:1.5px dashed var(--line-strong); border-radius:14px; color:var(--ink-3); font-size:15.5px; }
.vg-note { margin:0 0 16px; padding:12px 14px; border-radius:12px; background:var(--info-soft); color:var(--info); font-size:14.5px; font-weight:600; }

.vg-group { margin-bottom:24px; }
.vg-group-head { display:flex; align-items:baseline; flex-wrap:wrap; gap:4px 12px; margin:0 0 10px; }
.vg-group-head h3 { margin:0; font-size:1.3rem; }
.vg-group-head span { font-size:14px; color:var(--ink-3); }
.vg-cards { display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:10px; }
.vg-card { display:flex; align-items:center; gap:13px; min-width:0; padding:12px 14px; border-radius:14px; background:#fff; border:1px solid var(--line);
  transition:box-shadow .2s, border-color .2s; }
.vg-card-office { display:block; font:700 12px/1.25 var(--font-body); letter-spacing:.05em; text-transform:uppercase; color:var(--ink-3); }
.vg-card-name { display:block; margin-top:2px; font:800 1.2rem/1.15 var(--font-head); font-stretch:86%; color:var(--ink); }
.vg-card .vg-check { margin-left:auto; flex:none; width:26px; height:26px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center;
  background:color-mix(in srgb, var(--brand) 10%, white); color:var(--brand); }

.vg-summary { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; margin-bottom:18px; }
.vg-sum { padding:14px 16px; border-radius:14px; border:1px solid; }
.vg-sum.is-yes { background:var(--ok-soft); border-color:color-mix(in srgb, var(--vg-yes) 30%, white); }
.vg-sum.is-no { background:var(--danger-soft); border-color:color-mix(in srgb, var(--vg-no) 25%, white); }
.vg-sum h4 { margin:0 0 8px; font:800 1.1rem/1.2 var(--font-head); font-stretch:88%; }
.vg-sum.is-yes h4 { color:var(--vg-yes); } .vg-sum.is-no h4 { color:var(--vg-no); }
.vg-sum-list { display:flex; flex-wrap:wrap; gap:6px; }
.vg-sum-list button { padding:5px 10px; border-radius:8px; border:0; cursor:pointer; font:700 14px/1.2 var(--font-body); color:#fff; }
.vg-sum.is-yes button { background:var(--vg-yes); } .vg-sum.is-no button { background:var(--vg-no); }
.vg-sum-list button:hover { filter:brightness(1.1); }

.vg-measures { display:flex; flex-direction:column; gap:8px; }
.vg-measure { display:grid; grid-template-columns:128px 82px minmax(0,1fr); align-items:center; gap:14px; padding:12px 16px; border-radius:14px;
  background:#fff; border:1px solid var(--line); transition:box-shadow .2s, border-color .2s; }
.vg-measure-id { font:800 1.35rem/1.1 var(--font-head); font-stretch:84%; color:var(--ink); }
.vg-measure-id small { display:block; font:600 12px/1.3 var(--font-body); color:var(--ink-3); letter-spacing:.02em; }
.vg-vote { display:inline-flex; align-items:center; justify-content:center; height:38px; border-radius:10px; color:#fff; font:800 1.05rem/1 var(--font-body); letter-spacing:.06em; }
.vg-vote.is-yes { background:var(--vg-yes); } .vg-vote.is-no { background:var(--vg-no); }
.vg-measure-why { margin:0; font-size:16px; line-height:1.4; color:var(--ink-2); }
.vg-card.is-focus, .vg-measure.is-focus { border-color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent); }

.vg-print-card { display:flex; flex-direction:column; align-items:center; gap:14px; }
.vg-print-card img { width:100%; max-width:760px; height:auto; border-radius:14px; border:1px solid var(--line); box-shadow:var(--shadow-2); background:#fff; }
.vg-print-card .row { justify-content:center; }

.vg-foot { padding:16px 26px 22px; border-top:1px solid var(--line); background:var(--surface-2); display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px 18px; }
.vg-paid { display:inline-block; border:1.5px solid var(--ink-3); padding:6px 10px; font-size:13px; font-weight:600; color:var(--ink-2); max-width:62ch; }
.vg-source { font-size:14px; font-weight:600; color:var(--brand); display:inline-flex; align-items:center; gap:6px; }

@media (max-width: 760px) {
  .vg-overlay { padding:0; }
  .vg-sheet { border-radius:0; }
  .vg-head { padding:18px 16px 0; }
  .vg-head .vg-eyebrow { display:none; }
  .vg-head h2 { font-size:1.65rem; margin-top:2px; }
  .vg-head-sub { font-size:14px; }
  .vg-head-actions { gap:6px; }
  .vg-icon-btn { height:38px; min-width:38px; padding:0 9px; }
  .vg-head-actions .vg-lbl { display:none; }
  .vg-tabs { margin-top:14px; }
  .vg-search-row { padding-top:12px; padding-bottom:10px; }
  .vg-search-row, .vg-panel { padding-left:16px; padding-right:16px; }
  .vg-foot { padding:14px 16px 20px; }
  .vg-summary { grid-template-columns:minmax(0,1fr); }
  .vg-measure { grid-template-columns:auto 70px; gap:6px 12px; }
  .vg-measure-why { grid-column:1 / -1; font-size:15px; }
  .vg-tab { padding:11px 14px; font-size:15px; }
}
@media (prefers-reduced-motion: reduce) {
  .vg-overlay, .vg-sheet, .vg-person, .vg-pill, .vg-btn { transition:none; }
}
@media print {
  body.vg-open > *:not(.vg-overlay) { display:none !important; }
  body.vg-open { overflow:visible; }
  .vg-overlay { position:static; padding:0; background:none; opacity:1; display:block; }
  .vg-sheet { width:100%; border-radius:0; box-shadow:none; transform:none; display:block; }
  .vg-body { overflow:visible; }
  .vg-head, .vg-vote, .vg-sum button { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .vg-head-actions, .vg-tabs, .vg-search-row, .vg-sheet .vg-panel[data-panel="card"] { display:none !important; }
  .vg-sheet .vg-panel[hidden] { display:block !important; }
  .vg-head { padding-bottom:18px; }
  .vg-card, .vg-measure, .vg-sum { break-inside:avoid; }
}
`;

  function injectStyle() {
    if (document.getElementById('vg-style')) return;
    const s = document.createElement('style');
    s.id = 'vg-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------------- data helpers ---------------- */
  function get(t) {
    const all = window.VOTER_GUIDES || {};
    return (t && all[t.slug]) || null;
  }
  function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function daysLeft(g) {
    const e = new Date(g.electionDate + 'T12:00:00');
    return Math.round((dayStart(e) - dayStart(new Date())) / 86400000);
  }
  function longDate(g) {
    return new Date(g.electionDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }
  function countyName(t) {
    const c = String(t.county || '').trim();
    return !c ? t.shortName : /county$/i.test(c) ? c : c + ' County';
  }
  function races(g) { return g.groups.reduce((a, x) => a.concat(x.races), []); }
  function shortId(id) { return String(id).replace(/^Prop\s+/i, '').replace(/^Measure\s+/i, ''); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
  function photo(r, size) { return U.candidatePhoto({ name: r.name, photo: r.photo, photoPos: '50% 30%' }, size, { shape: 'circle' }); }
  function yesNo(g) {
    return { yes: g.measures.filter((m) => m.vote === 'YES'), no: g.measures.filter((m) => m.vote !== 'YES') };
  }
  function countdown(g) {
    const d = daysLeft(g);
    if (d > 1) return { n: d, label: 'days to<br>vote', today: false };
    if (d === 1) return { n: 1, label: 'day to<br>vote', today: false };
    if (d === 0) return { n: 'Today', label: 'is Election<br>Day', today: true };
    return null;
  }

  /* ---------------- homepage teaser ---------------- */
  function teaser(t) {
    const g = get(t);
    if (!g) return '';
    injectStyle();
    const all = races(g);
    const top = all.filter((r) => r.top).slice(0, 3);
    const cd = countdown(g);
    const yn = yesNo(g);
    const pills = g.measures.map((m) => `<button class="vg-pill is-${m.vote === 'YES' ? 'yes' : 'no'}" data-vg="open" data-vg-tab="measures" data-vg-focus="${esc(m.id)}" aria-label="${esc(m.id)}: vote ${esc(m.vote)}"><span>${esc(shortId(m.id))}</span><b>${esc(m.vote)}</b></button>`).join('');
    return `<section class="vg-teaser" aria-labelledby="vg-teaser-h" data-tour="hub-voter-guide">
      <span class="vg-teaser-star">${STAR('100%')}</span>
      <div class="vg-t-head">
        <div>
          <span class="vg-eyebrow">${STAR(14)} ${esc(g.election)}</span>
          <h2 id="vg-teaser-h">Your ${esc(t.shortName)} Voter Guide</h2>
        </div>
        ${cd ? `<div class="vg-count${cd.today ? ' is-today' : ''}"><b>${cd.n}</b><span>${cd.label}</span></div>` : ''}
      </div>
      <p class="vg-t-lede">Every candidate we endorse and how to vote on all ${g.measures.length} measures, on one page. ${daysLeft(g) >= 0 ? `Vote by ${esc(longDate(g))}.` : ''}</p>
      ${top.length ? `<div class="vg-t-ticket">${top.map((r) => `<button class="vg-person" data-vg="open" data-vg-tab="candidates" data-vg-focus="${esc(r.name)}">
          ${photo(r, 44)}<span style="min-width:0"><span class="vg-person-office">${esc(r.office)}</span><span class="vg-person-name">${esc(r.name)}</span></span></button>`).join('')}</div>` : ''}
      <div class="vg-t-props">
        <div class="vg-t-props-label">Measures at a glance <span>YES on ${yn.yes.length} · NO on ${yn.no.length}</span></div>
        <div class="vg-pills">${pills}</div>
      </div>
      <div class="vg-t-actions">
        <button class="vg-btn vg-btn-primary" data-vg="open">Open the full guide ${IC_ARROW}</button>
        <button class="vg-btn vg-btn-ghost" data-vg="print">${IC_PRINT} Print or save</button>
      </div>
    </section>`;
  }

  /* ---------------- newsroom bar ---------------- */
  function bar(t) {
    const g = get(t);
    if (!g) return '';
    injectStyle();
    const d = daysLeft(g);
    const yn = yesNo(g);
    const lead = d > 1 ? `${d} days to vote.` : d === 1 ? '1 day to vote.' : d === 0 ? 'Today is Election Day.' : `${esc(g.election)} guide.`;
    const yes = yn.yes.map((m) => esc(shortId(m.id))).join(', ');
    return `<div class="vg-bar" role="region" aria-label="Voter guide">
      <span class="vg-bar-tag">${STAR(13)} VOTER GUIDE</span>
      <span class="vg-bar-text"><b>${lead}</b> ${esc(t.shortName)} says <span class="vg-bar-yes">YES on ${yes}</span> · <span class="vg-bar-no">NO on the other ${yn.no.length}</span> · ${races(g).length} endorsed candidates</span>
      <button class="vg-btn vg-btn-primary" data-vg="open">Open the guide ${IC_ARROW}</button>
    </div>`;
  }

  /* ---------------- full-screen guide ---------------- */
  let openApi = null;

  function open(t, opts) {
    t = t || App.ctx.tenant;
    const g = get(t);
    if (!g) { App.toast(`${t.shortName}’s voter guide is published after the committee’s endorsement vote.`, 'info'); return; }
    injectStyle();
    if (openApi) openApi.close(true);
    opts = opts || {};
    const prevFocus = document.activeElement;
    const all = races(g);
    const cd = daysLeft(g);
    const yn = yesNo(g);
    const tabs = [
      { id: 'candidates', label: 'Candidates', n: all.length },
      { id: 'measures', label: 'Measures', n: g.measures.length },
    ];
    if (g.printImage) tabs.push({ id: 'card', label: 'Printed card' });
    let tab = tabs.some((x) => x.id === opts.tab) ? opts.tab : 'candidates';

    const groupsHtml = g.groups.map((grp) => `<section class="vg-group" data-group="${esc(grp.id)}">
        <div class="vg-group-head"><h3>${esc(grp.label)}</h3><span>${grp.scope === 'state' ? 'Same on every California ballot' : `${esc(countyName(t))} races`}</span></div>
        <div class="vg-cards">${grp.races.map((r) => `<div class="vg-card" data-q="${esc((r.office + ' ' + r.name).toLowerCase())}" data-key="${esc(slug(r.name))}">
            ${photo(r, 56)}
            <span style="min-width:0"><span class="vg-card-office">${esc(r.office)}</span><span class="vg-card-name">${esc(r.name)}</span></span>
            <span class="vg-check" title="Endorsed">${I('<path d="M4.5 10.5l3.5 3.5 7.5-8"/>', 15)}</span>
          </div>`).join('')}</div>
      </section>`).join('') + (g.localPending ? `<p class="vg-note">${esc(g.localPending)}</p>` : '');

    const measuresHtml = `<div class="vg-summary">
        <div class="vg-sum is-yes"><h4>Vote YES on</h4><div class="vg-sum-list">${yn.yes.map((m) => `<button data-jump="${esc(slug(m.id))}">${esc(m.id)}</button>`).join('')}</div></div>
        <div class="vg-sum is-no"><h4>Vote NO on</h4><div class="vg-sum-list">${yn.no.map((m) => `<button data-jump="${esc(slug(m.id))}">${esc(m.id)}</button>`).join('')}</div></div>
      </div>
      <div class="vg-measures">${g.measures.map((m) => `<div class="vg-measure" data-q="${esc((m.id + ' ' + m.vote + ' ' + m.why).toLowerCase())}" data-key="${esc(slug(m.id))}">
          <div class="vg-measure-id">${esc(m.id)}<small>${m.scope === 'state' ? 'Statewide' : esc(countyName(t))}</small></div>
          <span class="vg-vote is-${m.vote === 'YES' ? 'yes' : 'no'}">${esc(m.vote)}</span>
          <p class="vg-measure-why">${esc(m.why)}</p>
        </div>`).join('')}</div>`;

    const cardHtml = g.printImage ? `<div class="vg-print-card">
        <img src="${esc(g.printImage)}" alt="${esc(t.shortName)} ${esc(g.election)} printed voter guide: endorsed candidates and measure recommendations" loading="lazy">
        <div class="row">
          <a class="btn btn-primary" href="${esc(g.printImage)}" download>Download the card</a>
          ${g.sheetImage ? `<a class="btn btn-ghost" href="${esc(g.sheetImage)}" target="_blank" rel="noopener">Open full-size sheet</a>` : ''}
        </div>
      </div>` : '';

    const back = document.createElement('div');
    back.className = 'vg-overlay';
    back.innerHTML = `<div class="vg-sheet" role="dialog" aria-modal="true" aria-labelledby="vg-title">
      <header class="vg-head">
        <div class="vg-head-row">
          <div class="vg-head-title">
            <span class="vg-eyebrow">${STAR(14)} ${esc(t.name)}</span>
            <h2 id="vg-title">${esc(g.election)} Voter Guide</h2>
            <div class="vg-head-sub">${cd >= 0 ? `<span>Vote by ${esc(longDate(g))}</span>` : ''}${cd > 0 ? `<span class="vg-days">${cd} ${cd === 1 ? 'day' : 'days'} left</span>` : cd === 0 ? '<span class="vg-days">Election Day</span>' : ''}</div>
          </div>
          <div class="vg-head-actions">
            <button class="vg-icon-btn" data-g="print" aria-label="Print or save as PDF">${IC_PRINT}<span class="vg-lbl">Print</span></button>
            <button class="vg-icon-btn" data-g="share" aria-label="Copy link to this guide">${IC_SHARE}<span class="vg-lbl">Share</span></button>
            <button class="vg-icon-btn" data-g="close" aria-label="Close voter guide">${IC_X}</button>
          </div>
        </div>
        <div class="vg-tabs" role="tablist" aria-label="Guide sections">
          ${tabs.map((x) => `<button class="vg-tab" role="tab" id="vg-tab-${x.id}" aria-controls="vg-panel-${x.id}" data-tab="${x.id}">${esc(x.label)}${x.n != null ? ` <span class="vg-tab-n" data-n="${x.id}">${x.n}</span>` : ''}</button>`).join('')}
        </div>
      </header>
      <div class="vg-body">
        <div class="vg-search-row"><label class="vg-search">${IC_SEARCH}<input type="search" placeholder="Search a race, name or measure" aria-label="Search the voter guide" data-g="search"></label></div>
        <div class="vg-panel" role="tabpanel" id="vg-panel-candidates" aria-labelledby="vg-tab-candidates" data-panel="candidates">${groupsHtml}<div class="vg-empty" data-empty hidden></div></div>
        <div class="vg-panel" role="tabpanel" id="vg-panel-measures" aria-labelledby="vg-tab-measures" data-panel="measures">${measuresHtml}<div class="vg-empty" data-empty hidden></div></div>
        ${cardHtml ? `<div class="vg-panel" role="tabpanel" id="vg-panel-card" aria-labelledby="vg-tab-card" data-panel="card">${cardHtml}</div>` : ''}
        <footer class="vg-foot">
          <span class="vg-paid">${esc(g.paidFor)}</span>
          ${g.source ? `<a class="vg-source" href="${esc(g.source)}" target="_blank" rel="noopener">${esc(g.source.replace(/^https?:\/\//, ''))} ${IC_OUT}</a>` : ''}
        </footer>
      </div>
    </div>`;

    const $ = (s) => back.querySelector(s);
    const body = $('.vg-body');
    const search = $('[data-g="search"]');

    function setTab(id, focusTab) {
      tab = id;
      back.querySelectorAll('.vg-tab').forEach((b) => {
        const on = b.dataset.tab === id;
        b.setAttribute('aria-selected', on);
        b.tabIndex = on ? 0 : -1;
        if (on && focusTab) b.focus();
      });
      back.querySelectorAll('.vg-panel').forEach((p) => { p.hidden = p.dataset.panel !== id; });
      $('.vg-search-row').hidden = id === 'card';
      body.scrollTop = 0;
    }

    function applySearch() {
      const q = search.value.trim().toLowerCase();
      ['candidates', 'measures'].forEach((pid) => {
        const panel = back.querySelector(`[data-panel="${pid}"]`);
        let shown = 0;
        panel.querySelectorAll('[data-q]').forEach((n) => {
          const hit = !q || n.dataset.q.includes(q);
          n.hidden = !hit;
          if (hit) shown++;
        });
        panel.querySelectorAll('.vg-group').forEach((grp) => { grp.hidden = !grp.querySelector('[data-q]:not([hidden])'); });
        const sum = panel.querySelector('.vg-summary');
        if (sum) sum.hidden = !!q;
        const empty = panel.querySelector('[data-empty]');
        empty.hidden = shown > 0;
        if (!shown) empty.textContent = `Nothing in ${pid} matches “${search.value.trim()}”.`;
        const n = back.querySelector(`[data-n="${pid}"]`);
        if (n) n.textContent = shown;
      });
    }

    function focusItem(key) {
      const node = back.querySelector(`.vg-panel:not([hidden]) [data-key="${slug(key)}"]`);
      if (!node) return;
      back.querySelectorAll('.is-focus').forEach((n) => n.classList.remove('is-focus'));
      node.classList.add('is-focus');
      const top = node.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - $('.vg-search-row').offsetHeight - 12;
      body.scrollTo({ top: Math.max(0, top), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      setTimeout(() => node.classList.remove('is-focus'), 2600);
    }

    function share() {
      const url = location.origin + location.pathname + location.search + '#/public-hub/voter-guide';
      const done = () => App.toast('Link to the voter guide copied. Paste it in a text or email.', 'ok');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
      else done();
    }

    function focusables() {
      return Array.from(back.querySelectorAll('a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])')).filter((n) => n.offsetParent !== null);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.target.classList.contains('vg-tab')) {
        const i = tabs.findIndex((x) => x.id === tab);
        const n = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
        setTab(tabs[n].id, true);
      }
    }

    function close(instant) {
      document.removeEventListener('keydown', onKey, true);
      document.body.classList.remove('vg-open');
      openApi = null;
      if (instant) back.remove();
      else { back.classList.remove('in'); setTimeout(() => back.remove(), 200); }
      if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
    }

    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    back.addEventListener('click', (e) => {
      const tb = e.target.closest('.vg-tab');
      if (tb) { setTab(tb.dataset.tab); return; }
      const j = e.target.closest('[data-jump]');
      if (j) { focusItem(j.dataset.jump); return; }
      const a = e.target.closest('[data-g]');
      if (!a) return;
      if (a.dataset.g === 'close') close();
      else if (a.dataset.g === 'print') window.print();
      else if (a.dataset.g === 'share') share();
    });
    search.addEventListener('input', applySearch);

    document.body.appendChild(back);
    document.body.classList.add('vg-open');
    document.addEventListener('keydown', onKey, true);
    openApi = { close };
    setTab(tab);
    requestAnimationFrame(() => {
      back.classList.add('in');
      const sel = back.querySelector('.vg-tab[aria-selected="true"]');
      if (sel) sel.focus({ preventScroll: true });
      if (opts.focus) setTimeout(() => focusItem(opts.focus), 220);
      if (opts.print) setTimeout(() => window.print(), 350);
    });
    return openApi;
  }

  /* Any [data-vg] control on any screen opens the guide for the current committee. */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-vg]');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    const t = App.ctx.tenant;
    if (a.dataset.vg === 'print') open(t, { tab: 'candidates', print: true });
    else open(t, { tab: a.dataset.vgTab, focus: a.dataset.vgFocus });
  }, true);

  App.voterGuide = { get, teaser, bar, open, daysLeft };
})();
