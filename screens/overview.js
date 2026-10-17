/* screens/overview.js: the front door of app.html (Network agent).
   Signed out: what the RCCC Network is, who it's for, Sign in, and a link to the county's public site.
   Signed in: a greeting by name, the shortcuts for that person's role with live numbers from Store,
   the network diagram, and a module map that links only to areas the person can open. */
(function () {
  'use strict';
  if (!window.App) return;
  const U = App.util;
  const esc = U.esc;

  const I = (d, s) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON_HOME = I('<path d="M3 9.5L10 4l7 5.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M8 17v-5h4v5"/>');
  const LOCK = I('<rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>', 14);
  const ARROW = I('<path d="M4 10h11M11 6l4 4-4 4"/>', 16);
  const EXT = I('<path d="M8 4H4.5A1.5 1.5 0 0 0 3 5.5v10A1.5 1.5 0 0 0 4.5 17h10a1.5 1.5 0 0 0 1.5-1.5V12M11 3h6v6M17 3l-8 8"/>', 15);
  const IC = {
    news: I('<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M6 8h8M6 11h5"/>'),
    plan: I('<rect x="4" y="6" width="12" height="10" rx="2.5"/><path d="M10 3v3M7.5 11h.01M12.5 11h.01M8 14h4"/>'),
    walk: I('<path d="M10 17s5-4.4 5-8.5a5 5 0 0 0-10 0C5 12.6 10 17 10 17z"/><circle cx="10" cy="8.5" r="1.8"/>'),
    vote: I('<path d="M4 8h12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M7 8V5h6v3M8.5 12h3"/>'),
    star: I('<path d="M10 2.8l2 4.2 4.6.6-3.3 3.2.8 4.6L10 13.2l-4.1 2.2.8-4.6L3.4 7.6 8 7z"/>'),
    user: I('<circle cx="10" cy="7" r="3.2"/><path d="M3.8 17c.9-3.2 3.3-5 6.2-5s5.3 1.8 6.2 5"/>'),
    cal: I('<rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8h14M7 2.5v3M13 2.5v3"/>'),
    hand: I('<path d="M6 10V5.5a1.5 1.5 0 0 1 3 0V9M9 9V4.5a1.5 1.5 0 0 1 3 0V9M12 9V5.5a1.5 1.5 0 0 1 3 0V12a5 5 0 0 1-5 5H9a5 5 0 0 1-4-2l-2-3a1.5 1.5 0 0 1 2.4-1.8L6 11"/>'),
    guide: I('<path d="M4 4h5a2 2 0 0 1 2 2v10a2 2 0 0 0-2-2H4zM16 4h-5a2 2 0 0 0-2 2v10a2 2 0 0 1 2-2h5z"/>'),
    net: I('<circle cx="10" cy="4.5" r="2"/><circle cx="4.5" cy="15" r="2"/><circle cx="15.5" cy="15" r="2"/><path d="M10 6.5v3M10 9.5L5.5 13.3M10 9.5l4.5 3.8"/>'),
    ad: I('<rect x="3" y="5" width="14" height="10" rx="2"/><path d="M6 9h5M6 12h3"/>'),
    chart: I('<path d="M3 17h14M6 14V9M10 14V5M14 14v-3"/>'),
  };
  const ELECTION = '2026-11-03';
  const LOCK_LABEL = { supporter: 'Sign in', member: 'Members', board: 'Board and master', master: 'Network staff', candidate: 'Candidates and board' };
  const ALIAS = { 'Candidate Tools': 'Candidates', 'Field & Governance': 'Field & Meetings', 'AI Engine': 'AI tools' };
  const groupOf = (s) => ALIAS[s.group] || s.group || 'Overview';

  const STAR = (x, y, r, fill) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 ? r * 0.42 : r;
      pts.push((x + rr * Math.cos(a)).toFixed(1) + ',' + (y + rr * Math.sin(a)).toFixed(1));
    }
    return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
  };

  /* ---------------- styles ---------------- */
  function injectStyles() {
    if (document.getElementById('scr-ov-style')) return;
    const s = document.createElement('style');
    s.id = 'scr-ov-style';
    s.textContent = `
.scr-ov .ov2-hero { position:relative; overflow:hidden; border-radius: var(--r-lg); color: var(--brand-ink); background: var(--brand); padding: 44px 44px 0; margin-bottom: 28px; isolation:isolate; }
.scr-ov .ov2-hero::before { content:''; position:absolute; inset:0; z-index:-1; background:
  radial-gradient(60% 90% at 100% 0%, color-mix(in srgb, var(--accent) 30%, transparent) 0%, transparent 60%),
  radial-gradient(50% 80% at 0% 100%, rgba(255,255,255,.08) 0%, transparent 70%); }
.scr-ov .ov2-hero::after { content:''; position:absolute; left:0; right:0; bottom:0; height:6px; background: repeating-linear-gradient(90deg, var(--accent) 0 48px, rgba(255,255,255,.9) 48px 56px); }
.scr-ov .ov2-stars { position:absolute; right:-40px; top:-30px; width:320px; opacity:.1; pointer-events:none; color: var(--brand-ink); z-index:-1; animation: ov2-spin 60s linear infinite; }
@keyframes ov2-spin { to { transform: rotate(360deg); } }
.scr-ov .ov2-eyebrow { display:inline-flex; align-items:center; gap:8px; font-weight:700; font-size:14px; opacity:.9; margin-bottom:12px; }
.scr-ov .ov2-hero h1 { color: inherit; font-stretch:75%; font-weight:800; font-size: clamp(2.2rem, 1.3rem + 3vw, 3.5rem); line-height:1.02; max-width: 18ch; margin-bottom:.35em; letter-spacing:-.01em; }
.scr-ov .ov2-hero p.ov2-lede { font-size:1.12rem; max-width: 60ch; opacity:.92; margin: 0 0 22px; }
.scr-ov .ov2-hero .row { gap:10px; }
.scr-ov .ov2-hero .btn-primary { background: var(--brand-ink); color: var(--brand); border-color: var(--brand-ink); }
.scr-ov .ov2-hero .btn-primary:hover { background: color-mix(in srgb, var(--brand-ink) 88%, var(--brand)); color: var(--brand); }
.scr-ov .ov2-hero .btn-line { background: transparent; color: var(--brand-ink); border-color: color-mix(in srgb, var(--brand-ink) 55%, transparent); }
.scr-ov .ov2-hero .btn-line:hover { background: rgba(255,255,255,.1); color: var(--brand-ink); }
.scr-ov .ov2-hero .btn-quiet { background: transparent; border-color: transparent; color: var(--brand-ink); text-decoration: underline; text-underline-offset: 3px; }
.scr-ov .ov2-hero .btn-quiet:hover { background: rgba(255,255,255,.08); color: var(--brand-ink); }
.scr-ov .ov2-nums { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); margin: 34px -44px 0; border-top: 1px solid rgba(255,255,255,.16); }
.scr-ov .ov2-num { padding: 18px 22px 22px 44px; border-left: 1px solid rgba(255,255,255,.16); min-width:0; }
.scr-ov .ov2-num:first-child { border-left:0; }
.scr-ov .ov2-num b { display:block; font: 800 2.4rem/1 var(--font-head); font-stretch:75%; font-variant-numeric: tabular-nums; letter-spacing:-.01em; }
.scr-ov .ov2-num span { display:block; font-size:14px; opacity:.85; margin-top:6px; line-height:1.35; }
.scr-ov .ov2-sec { margin-top: 40px; }
.scr-ov .ov2-sec > h2 { margin-bottom:4px; }
.scr-ov .ov2-sec > .ov2-sub { color: var(--ink-2); margin: 0 0 18px; max-width: 70ch; }
.scr-ov .ov2-who { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:14px; }
.scr-ov .ov2-who > div { background: var(--surface); border:1px solid var(--line); border-radius: var(--r-lg); padding:18px; position:relative; animation: ov2-up .5s ease both; animation-delay: calc(var(--i) * 70ms); }
.scr-ov .ov2-who h3 { font-size:1.08rem; margin: 10px 0 6px; }
.scr-ov .ov2-who p { font-size:14.5px; color: var(--ink-2); margin:0; }
.scr-ov .ov2-who .ov2-tag { display:inline-flex; width:38px; height:38px; border-radius:10px; align-items:center; justify-content:center; background: color-mix(in srgb, var(--brand) 9%, white); color: var(--brand); }
.scr-ov .ov2-who .ov2-tag.is-master { background: var(--master-soft); color: var(--master); }
@keyframes ov2-up { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform:none; } }
.scr-ov .ov2-shortcuts { display:grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap:14px; }
.scr-ov .ov2-sc { display:flex; flex-direction:column; gap:10px; padding:18px; border-radius: var(--r-lg); border:1px solid var(--line); background: var(--surface); text-decoration:none; color: var(--ink);
  transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease; animation: ov2-up .45s ease both; animation-delay: calc(var(--i) * 60ms); min-width:0; }
.scr-ov .ov2-sc:hover { transform: translateY(-3px); box-shadow: var(--shadow-2); border-color: color-mix(in srgb, var(--brand) 35%, white); color: var(--ink); }
.scr-ov .ov2-sc:hover .ov2-go { transform: translateX(3px); }
.scr-ov .ov2-sc-top { display:flex; align-items:center; gap:10px; }
.scr-ov .ov2-sc-ic { width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; background: color-mix(in srgb, var(--brand) 9%, white); color: var(--brand); flex:none; }
.scr-ov .ov2-sc.is-master .ov2-sc-ic { background: var(--master-soft); color: var(--master); }
.scr-ov .ov2-sc strong { font-size:1.02rem; line-height:1.3; }
.scr-ov .ov2-sc-num { font: 800 1.9rem/1 var(--font-head); font-stretch:78%; font-variant-numeric: tabular-nums; color: var(--brand); }
.scr-ov .ov2-sc.is-master .ov2-sc-num { color: var(--master); }
.scr-ov .ov2-sc-note { font-size:14px; color: var(--ink-2); flex:1; }
.scr-ov .ov2-go { display:inline-flex; align-items:center; gap:6px; font-weight:700; font-size:14.5px; color: var(--brand); transition: transform .16s ease; }
.scr-ov .ov2-sc.is-master .ov2-go { color: var(--master); }
.scr-ov .ov-diagram { padding: 16px 12px 8px; background: var(--surface); border:1px solid var(--line); border-radius: var(--r-lg); }
.scr-ov .ov-diagram svg { display:block; width:100%; height:auto; }
.scr-ov .ov-diagram .ov-diagram-m { display:none; }
.scr-ov .ov2-map { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 18px 28px; }
.scr-ov .ov2-grp h3 { font-size:.95rem; letter-spacing:.04em; text-transform:uppercase; color: var(--ink-3); margin:0 0 4px; font-family: var(--font-body); font-weight:700; }
.scr-ov .ov2-grp > p { font-size:14px; color: var(--ink-2); margin: 0 0 8px; }
.scr-ov .ov2-mod { display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius: var(--r); border:1px solid var(--line); background: var(--surface); text-decoration:none; color: var(--ink); min-height:56px; margin-bottom:8px;
  transition: border-color .15s ease, background-color .15s ease; }
.scr-ov a.ov2-mod:hover { border-color: var(--brand); background: color-mix(in srgb, var(--brand) 4%, white); color: var(--ink); }
.scr-ov .ov2-mod .ov2-mi { width:34px; height:34px; border-radius:9px; display:flex; align-items:center; justify-content:center; background: color-mix(in srgb, var(--brand) 9%, white); color: var(--brand); flex:none; }
.scr-ov .ov2-mod.is-master .ov2-mi { background: var(--master-soft); color: var(--master); }
.scr-ov .ov2-mod .ov2-mt { flex:1; min-width:0; }
.scr-ov .ov2-mod .ov2-mt strong { display:block; font-size:15px; }
.scr-ov .ov2-mod .ov2-mt span { display:block; font-size:13px; color: var(--ink-3); line-height:1.35; }
.scr-ov .ov2-mod.is-locked { background: var(--surface-2); color: var(--ink-3); }
.scr-ov .ov2-mod.is-locked .ov2-mi { filter: grayscale(1); opacity:.6; }
.scr-ov .ov2-mod .ov2-lock { display:inline-flex; align-items:center; gap:5px; font-size:12.5px; font-weight:700; color: var(--ink-3); white-space:nowrap; }
.scr-ov .ov2-mod .ov2-arrow { color: var(--brand); }
@media (max-width: 1000px) {
  .scr-ov .ov2-who { grid-template-columns: repeat(2, minmax(0,1fr)); }
}
@media (max-width: 720px) {
  .scr-ov .ov2-hero { padding: 28px 20px 0; }
  .scr-ov .ov2-stars { width: 190px; }
  .scr-ov .ov2-nums { grid-template-columns: repeat(2, minmax(0,1fr)); margin: 26px -20px 0; }
  .scr-ov .ov2-num { padding: 14px 16px 16px 20px; border-top: 1px solid rgba(255,255,255,.16); }
  .scr-ov .ov2-num:nth-child(-n+2) { border-top:0; }
  .scr-ov .ov2-num:nth-child(odd) { border-left:0; }
  .scr-ov .ov2-num b { font-size: 2rem; }
  .scr-ov .ov2-hero .row .btn { flex: 1 1 100%; min-height:46px; }
  .scr-ov .ov2-who { grid-template-columns: minmax(0,1fr); }
  .scr-ov .ov2-map { grid-template-columns: minmax(0,1fr); }
  .scr-ov .ov2-mod.is-locked { flex-wrap: wrap; }
  .scr-ov .ov2-mod .ov2-lock { flex-basis: 100%; padding-left: 46px; }
  .scr-ov .ov-diagram .ov-diagram-d { display:none; }
  .scr-ov .ov-diagram .ov-diagram-m { display:block; }
}
@media (prefers-reduced-motion: reduce) { .scr-ov .ov2-stars { animation:none; } }`;
    document.head.appendChild(s);
  }

  /* ---------------- diagram (copy per audit) ---------------- */
  function diagramDesktop(t) {
    const brand = 'var(--brand)', master = 'var(--master)';
    const cur = t.slug;
    const county = (x, label, sub, active, dashed) => `
      <g>
        <rect x="${x}" y="300" width="200" height="74" rx="12" fill="${active ? brand : 'var(--surface)'}" stroke="${dashed ? 'var(--line-strong)' : brand}" stroke-width="2" ${dashed ? 'stroke-dasharray="6 5"' : ''}/>
        <text x="${x + 100}" y="332" text-anchor="middle" font-family="var(--font-head)" font-weight="800" font-size="19" fill="${active ? 'var(--brand-ink)' : dashed ? 'var(--ink-3)' : brand}">${label}</text>
        <text x="${x + 100}" y="355" text-anchor="middle" font-family="var(--font-body)" font-size="13.5" fill="${active ? 'var(--brand-ink)' : 'var(--ink-3)'}">${sub}</text>
      </g>`;
    const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${master}" stroke-width="2.2" marker-end="url(#ov-arrow-m)"/>`;
    return `
    <svg class="ov-diagram-d" viewBox="0 0 900 430" role="img" aria-labelledby="ov-dg-t">
      <title id="ov-dg-t">Master Network sends state and national news and ads to California, and on to each county committee. Each county decides what goes on its own pages and keeps its own member list.</title>
      <defs><marker id="ov-arrow-m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--master)"/></marker></defs>
      <rect x="300" y="14" width="300" height="78" rx="14" fill="var(--master)"/>
      ${STAR(336, 53, 15, '#fff')}
      <text x="362" y="49" font-family="var(--font-head)" font-weight="800" font-size="21" fill="#fff">Master Network</text>
      <text x="362" y="72" font-family="var(--font-body)" font-size="14" fill="#fff" opacity=".9">News and ads for every county</text>
      ${arrow(450, 94, 450, 150)}
      <text x="466" y="128" font-family="var(--font-body)" font-weight="600" font-size="14.5" fill="var(--master)">Network news and ads flow down</text>
      <rect x="340" y="156" width="220" height="62" rx="12" fill="var(--master-soft)" stroke="var(--master)" stroke-width="2"/>
      <text x="450" y="184" text-anchor="middle" font-family="var(--font-head)" font-weight="800" font-size="19" fill="var(--master)">California</text>
      <text x="450" y="205" text-anchor="middle" font-family="var(--font-body)" font-size="13.5" fill="var(--ink-2)">State and regional channels</text>
      <path d="M450 220 V252 M140 252 H760" stroke="var(--master)" stroke-width="2.2" fill="none"/>
      ${arrow(140, 252, 140, 294)}${arrow(450, 252, 450, 294)}${arrow(760, 252, 760, 294)}
      ${county(40, 'SVGOP', 'Santa Clara County', cur === 'svgop', false)}
      ${county(350, 'Demo County GOP', 'Demo County', cur === 'demo', false)}
      ${county(660, 'Other counties', 'Setting up now', false, true)}
      <rect x="40" y="392" width="820" height="32" rx="8" fill="color-mix(in srgb, var(--brand) 8%, white)"/>
      ${STAR(62, 408, 8, 'var(--accent)')}
      <text x="78" y="413" font-family="var(--font-body)" font-weight="600" font-size="14.5" fill="var(--brand)">Each county decides what goes on its own pages and keeps its own member list.</text>
    </svg>`;
  }
  function diagramMobile(t) {
    const cur = t.slug;
    const box = (y, label, sub, kind) => {
      const fill = kind === 'master' ? 'var(--master)' : kind === 'state' ? 'var(--master-soft)' : kind === 'active' ? 'var(--brand)' : 'var(--surface)';
      const stroke = kind === 'master' || kind === 'state' ? 'var(--master)' : kind === 'more' ? 'var(--line-strong)' : 'var(--brand)';
      const ink = kind === 'master' ? '#fff' : kind === 'state' ? 'var(--master)' : kind === 'active' ? 'var(--brand-ink)' : kind === 'more' ? 'var(--ink-3)' : 'var(--brand)';
      const subInk = kind === 'master' ? '#fff' : kind === 'active' ? 'var(--brand-ink)' : 'var(--ink-3)';
      return `<rect x="20" y="${y}" width="300" height="56" rx="11" fill="${fill}" stroke="${stroke}" stroke-width="2" ${kind === 'more' ? 'stroke-dasharray="6 5"' : ''}/>
        <text x="170" y="${y + 25}" text-anchor="middle" font-family="var(--font-head)" font-weight="800" font-size="18" fill="${ink}">${label}</text>
        <text x="170" y="${y + 44}" text-anchor="middle" font-family="var(--font-body)" font-size="13" fill="${subInk}">${sub}</text>`;
    };
    return `
    <svg class="ov-diagram-m" viewBox="0 0 340 520" role="img" aria-label="Master Network sends news and ads to California and on to each county committee. Each county decides what goes on its own pages and keeps its own member list.">
      <defs><marker id="ov-arrow-mm" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--master)"/></marker></defs>
      ${box(6, 'Master Network', 'News and ads for every county', 'master')}
      <line x1="170" y1="64" x2="170" y2="106" stroke="var(--master)" stroke-width="2.2" marker-end="url(#ov-arrow-mm)"/>
      <text x="182" y="90" font-family="var(--font-body)" font-weight="600" font-size="13" fill="var(--master)">News and ads flow down</text>
      ${box(112, 'California', 'State and regional channels', 'state')}
      <line x1="170" y1="170" x2="170" y2="204" stroke="var(--master)" stroke-width="2.2" marker-end="url(#ov-arrow-mm)"/>
      ${box(210, 'SVGOP', 'Santa Clara County', cur === 'svgop' ? 'active' : 'county')}
      ${box(276, 'Demo County GOP', 'Demo County', cur === 'demo' ? 'active' : 'county')}
      ${box(342, 'Other counties', 'Setting up now', 'more')}
      <rect x="20" y="414" width="300" height="96" rx="10" fill="color-mix(in srgb, var(--brand) 8%, white)"/>
      ${STAR(44, 440, 9, 'var(--accent)')}
      <text font-family="var(--font-body)" font-weight="600" font-size="14" fill="var(--brand)">
        <tspan x="60" y="445">Each county decides what</tspan>
        <tspan x="60" y="466">goes on its own pages and</tspan>
        <tspan x="60" y="487">keeps its own member list.</tspan>
      </text>
    </svg>`;
  }

  /* ---------------- live numbers ---------------- */
  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function daysLeft() { return Math.max(0, Math.round((new Date(ELECTION + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 86400000)); }
  function numbers(ctx) {
    const t = ctx.tenant || {};
    const L = (c) => { try { return Store.list(c); } catch (e) { return []; } };
    const walks = L('walkResults');
    const tf = (t.turfs || []).map((x) => { const extra = walks.filter((w) => w.turfId === x.id).reduce((a, w) => a + (Number(w.doors) || 1), 0); return { doors: x.doors, done: Math.min(x.doors, x.done + extra) }; });
    const seedEv = t.events || [];
    const saved = L('events').filter((e) => e && e.status !== 'draft' && !seedEv.some((s) => s.id === e.id));
    const upcoming = seedEv.concat(saved).filter((e) => e.date >= today()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const rs = L('rsvps');
    const uid = ctx.user && ctx.user.id;
    const mine = uid ? ['rsvps', 'volunteers', 'donations', 'memberships', 'votes', 'walkResults', 'posts'].reduce((a, c) => a + L(c).filter((d) => d.createdBy === uid).length, 0) : 0;
    const ballots = (t.ballots || []).filter((b) => b.status === 'open');
    const plans = L('directorPlans');
    const waiting = plans.reduce((a, p) => a + (p.steps || []).filter((s) => s.status === 'draft').length, 0);
    const posts = L('posts').filter((p) => p.status === 'published').length;
    const G = Store.global;
    return {
      visitors: (t.stats || {}).visitors7d || 0,
      volunteers: ((t.stats || {}).volunteers || 0) + L('volunteers').length,
      rsvps: seedEv.reduce((a, e) => a + (Number(e.rsvps) || 0), 0) + rs.reduce((a, r) => a + 1 + (Number(r.guests) || 0), 0),
      doorsLeft: tf.reduce((a, x) => a + x.doors - x.done, 0),
      doorsDone: tf.reduce((a, x) => a + x.done, 0),
      upcoming, next: upcoming[0], mine, ballots, waiting, plans: plans.length, posts,
      candidates: (t.candidates || []).length,
      endorsed: (t.candidates || []).filter((c) => c.status === 'ENDORSED' || c.status === 'ACTIVE_CAMPAIGN').length,
      pushes: G.list('networkPushes').length,
      alerts: G.list('networkPushes').filter((p) => p.locked && Number(p.priority) >= 100).length,
      ads: G.list('networkAds').filter((a) => a.active).length,
      meeting: t.meeting,
    };
  }
  function fmtDay(s) { const d = new Date(String(s) + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }

  /* Live CRM numbers for the shortcuts (the person's own county; aggregates and their own follow-ups only). */
  function crmNums(ctx) {
    const C = App.crm;
    if (!C || !C.stats) return null;
    try {
      const st = C.stats(ctx.tenantSlug) || {};
      const me = C.me ? C.me('committee') : null;
      const today = new Date(); today.setDate(today.getDate() + 7);
      const lim = today.toISOString().slice(0, 10);
      const due = me ? C.tasks('committee', { done: false, assigneeId: me.id }).filter((x) => !x.due || x.due <= lim).length : 0;
      return { people: st.people || 0, newThisMonth: st.newThisMonth || 0, due };
    } catch (e) { return null; }
  }
  function campaignNums(ctx) {
    const out = { people: 0, todo: 0, slug: '' };
    const c = App.auth && App.auth.campaign ? App.auth.campaign() : null;
    const slug = (c && c.slug) || (ctx.user && ctx.user.campaignSlug);
    out.slug = slug || '';
    try { if (slug && App.crm) out.people = App.crm.people('campaign:' + slug).length; } catch (e) { /* ignore */ }
    try { out.todo = Store.list('siteSuggestions').filter((x) => (x.slug === slug || x.campaignSlug === slug) && (!x.status || x.status === 'pending')).length; } catch (e) { /* ignore */ }
    return out;
  }

  function shortcuts(ctx, n) {
    const t = ctx.tenant || {};
    const site = `index.html?county=${encodeURIComponent(ctx.tenantSlug)}`;
    const sc = (o) => o;
    const role = ctx.role;
    if (role === 'master') return [
      sc({ ic: IC.news, title: 'Push news', num: n.pushes, note: n.alerts ? `${n.alerts} statewide ${n.alerts === 1 ? 'alert is' : 'alerts are'} showing on county homepages.` : 'Network pushes live on county sites. No statewide alert is showing.', href: '#/master/push', go: 'Write a push', master: true }),
      sc({ ic: IC.ad, title: 'Network ads', num: n.ads, note: n.ads ? 'Network ads running. Samples fill any slot you haven’t claimed.' : 'Samples fill the three network slots until you add your own.', href: '#/master/ads', go: 'Manage ads', master: true }),
      sc({ ic: IC.chart, title: 'Compare the counties', num: null, note: 'RSVPs, volunteers, doors and donations, side by side for every live county.', href: '#/master/analytics', go: 'Open analytics', master: true }),
      sc({ ic: IC.plan, title: 'AI Campaign Director', num: n.waiting || null, note: n.waiting ? `Plan items in ${t.shortName} waiting for approval.` : `Plan a campaign for an endorsed ${t.shortName} candidate.`, href: '#/director', go: 'Open the Director', master: true }),
    ];
    const crm = crmNums(ctx);
    const peopleSc = crm ? sc({ ic: IC.user, title: 'People', num: crm.people, note: `People on the ${t.shortName} list${crm.newThisMonth ? `, ${crm.newThisMonth} added this month` : ''}. Open a profile to see every RSVP, shift and call.`, href: '#/people', go: 'Open People' }) : null;
    const outreachSc = crm ? sc({ ic: IC.news, title: 'Outreach', num: crm.due || null, note: crm.due ? `${crm.due === 1 ? 'follow-up is' : 'follow-ups are'} due for you this week. Email a list or start the phone bank.` : 'No follow-ups due for you. Email a saved list or start the phone bank.', href: crm.due ? '#/people/tasks' : '#/outreach', go: crm.due ? 'See your follow-ups' : 'Open Outreach' }) : null;
    if (role === 'candidate') {
      const cm = campaignNums(ctx);
      return [
        sc({ ic: IC.star, title: 'My Campaign', num: cm.todo || null, note: cm.todo ? 'Things need you today, including suggestions from the committee.' : 'Your campaign is caught up. See this week’s plan.', href: '#/mycampaign', go: 'Open My Campaign' }),
        sc({ ic: IC.user, title: 'Your supporters', num: cm.people, note: 'People on your campaign’s own list. The committee’s list stays separate.', href: '#/mycampaign/people', go: 'Open your people' }),
        sc({ ic: IC.news, title: 'Reach your supporters', num: null, note: 'Email or text your list, or call through your phone bank.', href: '#/mycampaign/outreach', go: 'Open outreach' }),
        sc({ ic: IC.cal, title: 'Next county event', num: null, note: n.next ? `${n.next.title}, ${fmtDay(n.next.date)}${n.next.time ? ' at ' + n.next.time : ''}.` : 'No events are scheduled yet.', href: n.next ? `${site}#/events/${encodeURIComponent(n.next.id)}` : `${site}#/events`, go: 'See it on the public site', ext: true }),
      ];
    }
    if (role === 'board') return [
      sc({ ic: IC.plan, title: 'Plan a campaign', num: n.waiting || n.endorsed, note: n.waiting ? 'Plan items are waiting for a board member to approve them.' : `Endorsed candidates are ready for a campaign plan to Nov 3.`, href: '#/director', go: n.waiting ? 'Review the plan' : 'Draft a plan' }),
      sc({ ic: IC.walk, title: 'Build a walk list', num: n.doorsLeft, note: `Doors are left across ${(t.turfs || []).length} turfs. ${U.fmtNum(n.doorsDone)} are done.`, href: '#/field/list', go: 'Open Field Organizer' }),
      sc({ ic: IC.news, title: 'Post county news', num: n.posts || null, note: n.posts ? 'County posts are on your public site.' : 'Your public site has network news. Add a county post of your own.', href: '#/portal', go: 'Open Committee Portal' }),
      peopleSc, outreachSc,
      sc({ ic: IC.vote, title: `Run the ${n.meeting ? n.meeting.title : 'next meeting'}`, num: n.ballots.length, note: `Open ${n.ballots.length === 1 ? 'ballot' : 'ballots'}${n.meeting ? ` for ${fmtDay(n.meeting.date)} at ${n.meeting.time}` : ''}.`, href: '#/governance', go: 'Open Meetings & Voting' }),
    ];
    if (role === 'member') return [
      outreachSc, peopleSc,
      sc({ ic: IC.walk, title: 'Walk your list', num: n.doorsLeft, note: 'Doors are left in the county’s turfs. Record each one from your phone.', href: '#/field/canvass', go: 'Start canvassing' }),
      sc({ ic: IC.vote, title: 'Vote in the meeting', num: n.ballots.length, note: `Open ${n.ballots.length === 1 ? 'ballot' : 'ballots'}${n.meeting ? ` at the ${n.meeting.title}, ${fmtDay(n.meeting.date)}` : ''}.`, href: '#/governance/ballots', go: 'See the ballots' }),
      sc({ ic: IC.user, title: 'Your activity', num: n.mine || null, note: n.mine ? 'Things you saved: RSVPs, sign-ups, votes and doors.' : 'Your RSVPs, sign-ups and votes will show up here.', href: '#/account', go: 'Open your profile' }),
      sc({ ic: IC.cal, title: 'Next county event', num: null, note: n.next ? `${n.next.title}, ${fmtDay(n.next.date)}${n.next.time ? ' at ' + n.next.time : ''}.` : 'No events are scheduled yet.', href: n.next ? `${site}#/events/${encodeURIComponent(n.next.id)}` : `${site}#/events`, go: 'See it on the public site', ext: true }),
    ];
    return [
      sc({ ic: IC.user, title: 'Your RSVPs and sign-ups', num: n.mine || null, note: n.mine ? 'Everything you signed up for, in your profile.' : 'When you RSVP or volunteer, it shows up in your profile.', href: '#/account', go: 'Open your profile' }),
      sc({ ic: IC.cal, title: 'Next county event', num: null, note: n.next ? `${n.next.title}, ${fmtDay(n.next.date)}${n.next.time ? ' at ' + n.next.time : ''}.` : 'No events are scheduled yet.', href: n.next ? `${site}#/events/${encodeURIComponent(n.next.id)}` : `${site}#/events`, go: 'RSVP', ext: true }),
      sc({ ic: IC.hand, title: 'Volunteer', num: n.doorsLeft, note: 'Doors are left to knock before Election Day. Pick a shift that fits.', href: `${site}#/volunteer`, go: 'Sign up to help', ext: true }),
      sc({ ic: IC.guide, title: 'Read the voter guide', num: null, note: `${t.shortName}’s recommendations for every race on your ballot.`, href: `${site}#/guide`, go: 'Open the guide', ext: true }),
    ];
  }

  function moduleMap(ctx) {
    const order = (App.groups || []).filter((g) => g !== 'Overview').concat(['Account']);
    const seen = new Set();
    const groups = order.filter((g) => { if (seen.has(g)) return false; seen.add(g); return true; })
      .map((g) => ({ g, items: App.registry.filter((s) => s.id !== 'overview' && groupOf(s) === g) }))
      .filter((x) => x.items.length);
    return `<div class="ov2-map">${groups.map(({ g, items }) => `<div class="ov2-grp"><h3>${esc(g)}</h3>
      ${items.map((s) => {
        const need = App.requiredRole(s);
        const open = App.atLeast(ctx.role, need);
        const isM = s.group === 'Master Network';
        const aud = (App.roleAudience && App.roleAudience[need]) || {};
        const inner = `<span class="ov2-mi">${s.icon || ICON_HOME}</span><span class="ov2-mt"><strong>${esc(s.title)}</strong>${s.blurb ? `<span>${esc(s.blurb)}</span>` : ''}</span>`;
        return open
          ? `<a class="ov2-mod${isM ? ' is-master' : ''}" href="#/${esc(s.id)}">${inner}<span class="ov2-arrow">${ARROW}</span></a>`
          : `<div class="ov2-mod is-locked${isM ? ' is-master' : ''}">${inner}<span class="ov2-lock" title="For ${esc(aud.who || App.roleLabel(need))}">${LOCK}<span>${esc(LOCK_LABEL[need] || App.roleLabel(need))}</span></span></div>`;
      }).join('')}</div>`).join('')}</div>`;
  }

  function animateCounts(root) {
    const rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.querySelectorAll('[data-count]').forEach((el) => {
      const end = Number(el.dataset.count) || 0;
      if (rm || !end) { el.textContent = U.fmtNum(end); return; }
      const t0 = performance.now();
      const tick = (t) => { if (!el.isConnected) return; const k = Math.min(1, (t - t0) / 900); el.textContent = U.fmtNum(end * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
      el.textContent = '0';
      requestAnimationFrame(tick);
    });
  }

  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }

  App.register({
    id: 'overview',
    title: 'Platform overview',
    group: 'Overview',
    icon: ICON_HOME,
    blurb: 'What the RCCC Network is, and the shortcuts for your account.',
    render(el, ctx) {
      injectStyles();
      el.classList.add('scr-ov');
      const t = ctx.tenant || {};
      const u = ctx.user;
      const n = numbers(ctx);
      const site = `index.html?county=${encodeURIComponent(ctx.tenantSlug)}`;
      const short = t.shortName || t.name || '';
      const stars = `<svg class="ov2-stars" viewBox="0 0 100 100" aria-hidden="true">${STAR(50, 52, 48, 'currentColor')}</svg>`;
      const num = (v, label) => `<div class="ov2-num"><b data-count="${v}">${U.fmtNum(v)}</b><span>${label}</span></div>`;
      const cNums = ctx.role === 'candidate' ? (() => { const cm = campaignNums(ctx); const sl = cm.slug; let vv = 0; try { vv = Store.list('volunteers').filter((v) => v.campaign === sl).length; } catch (e) { /* ignore */ } return { people: cm.people, vols: vv }; })() : null;
      const strip = cNums ? `<div class="ov2-nums">
          ${num(daysLeft(), 'days to Election Day, Nov 3')}
          ${num(cNums.people, 'supporters on your campaign list')}
          ${num(cNums.vols, 'volunteers from your campaign site')}
        </div>` : `<div class="ov2-nums">
          ${num(daysLeft(), 'days to Election Day, Nov 3')}
          ${num(n.rsvps, `RSVPs to ${short} events`)}
          ${num(n.volunteers, `${short} volunteers`)}
          ${num(n.doorsDone, `doors knocked, ${U.fmtNum(n.doorsLeft)} to go`)}
        </div>`;

      let hero, body;
      if (!u) {
        hero = `<section class="ov2-hero" data-tour="overview-hero">${stars}
          <span class="ov2-eyebrow">${esc(t.name || '')} · RCCC Network</span>
          <h1>Your county party’s website and member tools</h1>
          <p class="ov2-lede">The RCCC Network gives each Republican County Central Committee in California a public website for voters and a committee platform for its members: campaign sites, walk lists, meetings and votes. ${esc(short)} runs on it today.</p>
          <div class="row">
            <button class="btn btn-primary" data-act="signin">Sign in</button>
            <a class="btn btn-line" href="${esc(site)}">Open ${esc(short)}’s public site ${EXT}</a>
            <button class="btn btn-quiet" data-act="tour">Take the tour</button>
          </div>
          ${strip}</section>`;
        const who = [
          { ic: IC.hand, h: 'Supporters', p: `RSVP to ${short} events, sign up to volunteer and give online. Your profile keeps track of what you signed up for.` },
          { ic: IC.walk, h: 'Committee members', p: 'Get a walk list on your phone, record each door, and vote in central committee meetings with a receipt for every ballot.' },
          { ic: IC.star, h: 'Executive Board', p: 'Post county news, recruit candidates and launch their campaign sites, plan campaigns with the AI assistant and run meetings.' },
          { ic: IC.net, h: 'Master Network staff', p: 'Send state and national news and statewide alerts to county sites, run network ads and compare how every county is doing.', m: true },
        ];
        body = `<section class="ov2-sec"><h2>Who it’s for</h2><p class="ov2-sub">Everyone signs in with ${App.auth && App.auth.backend === 'supabase' && App.auth.phoneMode !== 'twilio' ? 'their email' : 'an email or phone number'} and a 6-digit code. Your account decides what you can open.</p>
          <div class="ov2-who">${who.map((w, i) => `<div style="--i:${i}"><span class="ov2-tag${w.m ? ' is-master' : ''}">${w.ic}</span><h3>${w.h}</h3><p>${w.p}</p></div>`).join('')}</div></section>`;
      } else {
        const first = String(u.name || '').split(/\s+/)[0];
        const roleLine = App.auth.roleLine ? App.auth.roleLine(u) : App.roleLabel(ctx.role);
        hero = `<section class="ov2-hero" data-tour="overview-hero">${stars}
          <span class="ov2-eyebrow">${esc(roleLine)}${u.title && u.role !== 'master' ? ' · ' + esc(u.title) : ''}</span>
          <h1>${esc(greeting())}, ${esc(first)}</h1>
          <p class="ov2-lede">${ctx.role === 'master' ? `You’re looking at ${esc(short)}. Master Network tools work for every county, and the committee switcher above moves between them.`
            : ctx.role === 'board' ? `${n.waiting ? `${n.waiting} campaign plan ${n.waiting === 1 ? 'item is' : 'items are'} waiting for a board member. ` : ''}Here’s where ${esc(short)} stands ${daysLeft()} days before Election Day.`
            : ctx.role === 'member' ? `${n.ballots.length ? `${n.ballots.length} ${n.ballots.length === 1 ? 'ballot is' : 'ballots are'} open for the ${esc(n.meeting ? n.meeting.title : 'next meeting')}. ` : ''}Here’s where ${esc(short)} stands.`
            : ctx.role === 'candidate' ? `Your campaign home has your site, your supporters and this week’s plan. ${daysLeft()} days to Election Day.`
            : `Thanks for standing with ${esc(short)}. Here’s what’s coming up and how to help before Election Day.`}</p>
          <div class="row"><a class="btn btn-line" href="${esc(site)}">Open ${esc(short)}’s public site ${EXT}</a><button class="btn btn-quiet" data-act="tour">Take the tour</button></div>
          ${strip}</section>`;
        const sc = shortcuts(ctx, n).filter(Boolean);
        body = `<section class="ov2-sec" style="margin-top:0" data-tour="overview-shortcuts"><h2>Your shortcuts</h2><p class="ov2-sub">Picked for your ${esc(App.roleLabel(ctx.role).toLowerCase())} account, with today’s numbers.</p>
          <div class="ov2-shortcuts">${sc.map((s, i) => `<a class="ov2-sc${s.master ? ' is-master' : ''}" href="${esc(s.href)}" style="--i:${i}">
            <span class="ov2-sc-top"><span class="ov2-sc-ic">${s.ic}</span><strong>${esc(s.title)}</strong></span>
            ${s.num != null ? `<span class="ov2-sc-num" data-count="${Number(s.num) || 0}">${U.fmtNum(s.num)}</span>` : ''}
            <span class="ov2-sc-note">${esc(s.note)}</span>
            <span class="ov2-go">${esc(s.go)} ${s.ext ? EXT : ARROW}</span></a>`).join('')}</div></section>`;
      }

      el.innerHTML = `<div class="page">
        ${hero}
        ${body}
        <section class="ov2-sec">
          <h2>How the network works</h2>
          <p class="ov2-sub">Master Network shares what every county needs. Local zones are the parts of the page your county controls, and your board decides what goes in them.</p>
          <div class="ov-diagram">${diagramDesktop(t)}${diagramMobile(t)}</div>
        </section>
        <section class="ov2-sec" id="ov-modules" data-tour="module-map">
          <h2>What’s inside</h2>
          <p class="ov2-sub">${u ? 'Open any area your account can use. A lock shows the account an area needs.' : 'Sign in to open these areas. A lock shows the account each one needs.'}</p>
          ${moduleMap(ctx)}
        </section>
      </div>`;
      animateCounts(el);

      el.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'tour') App.startTour();
        else if (act.dataset.act === 'signin') App.auth.open('signin');
      });
    },
  });
})();
