/* screens/master.js: Master Network Console (Network agent)
   Routes: #/master (dashboard) · #/master/push · #/master/ads · #/master/analytics. Gated to `master`.
   Writes (Store.global, brief section 8):
     networkPushes      {id, title, summary, tag, source, tenants:[slugs], locked, priority:0-100, tab:'national'|'state', createdAt}
                        plus optional expiresAt (ISO) and editedAt/editedBy. priority >= 100 + locked = statewide alert.
     networkPushArchive pushes taken down (unpublished or expired), same shape plus endedAt, endedReason, endedBy.
     networkAds         {id, placement:'HEADER_BANNER'|'IN_FEED'|'SIDEBAR_BOTTOM', title, sponsor, cta, url, tenants:[slugs], active}
     networkOutreach    setup checklists and invitations sent to counties {county, kind, title}
   Reads: every county's saved actions through Store.forTenant(slug) for analytics and delivery status. */
(function () {
  'use strict';
  if (!window.App) return;
  const U = App.util;
  const esc = U.esc;

  const I = (d, s) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = I('<circle cx="10" cy="4.5" r="2"/><circle cx="4.5" cy="15" r="2"/><circle cx="15.5" cy="15" r="2"/><path d="M10 6.5v3M10 9.5L5.5 13.3M10 9.5l4.5 3.8"/>');
  const LOCK = I('<rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>', 14);
  const STAR = '<svg width="12" height="12" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5l2.5 5.3 5.8.7-4.3 4 1.1 5.7L10 14.4l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z" fill="currentColor"/></svg>';
  const ALERT = I('<path d="M10 3l8 14H2z"/><path d="M10 8v4M10 14.5h.01"/>', 16);
  const EXT = I('<path d="M8 4H4.5A1.5 1.5 0 0 0 3 5.5v10A1.5 1.5 0 0 0 4.5 17h10a1.5 1.5 0 0 0 1.5-1.5V12M11 3h6v6M17 3l-8 8"/>', 14);

  const TABS = [
    { sub: '', label: 'Dashboard' },
    { sub: 'push', label: 'Push news' },
    { sub: 'ads', label: 'Network ads' },
    { sub: 'analytics', label: 'Analytics' },
  ];
  const STATUS_LABEL = { live: 'Live', onboarding: 'Setting up', invited: 'Invited' };
  const PLACEMENTS = {
    HEADER_BANNER: { label: 'Header banner', where: 'Across the top of every page' },
    IN_FEED: { label: 'Between stories', where: 'Inside the news list on the homepage' },
    SIDEBAR_BOTTOM: { label: 'Sidebar, bottom', where: 'Under the local ads in the sidebar' },
  };
  const ELECTION = '2026-11-03';
  /* Categorical colors for the two county sites (validated: CVD dE 27, labels always shown). */
  const SERIES = { svgop: '#2a78d6', demo: '#eb6834' };

  /* Hand-placed tile positions, roughly north to south (col 0-5, row 0-8). */
  const TILE_POS = {
    'butte': [2, 0],
    'sonoma': [0, 1], 'solano': [1, 1], 'sacramento': [2, 1], 'placer': [3, 1],
    'marin': [0, 2], 'contra-costa': [1, 2], 'alameda': [2, 2], 'stanislaus': [3, 2],
    'san-francisco': [0, 3], 'san-mateo': [1, 3], 'svgop': [2, 3], 'demo': [3, 3], 'fresno': [4, 3],
    'monterey': [2, 4], 'kern': [4, 4],
    'san-luis-obispo': [2, 5],
    'santa-barbara': [2, 6], 'ventura': [3, 6], 'los-angeles': [4, 6], 'san-bernardino': [5, 6],
    'orange': [4, 7], 'riverside': [5, 7],
    'san-diego': [5, 8],
  };
  const SHORT = {
    'san-francisco': 'S.F.', 'san-mateo': 'S. Mateo', 'svgop': 'S. Clara', 'contra-costa': 'C. Costa',
    'santa-barbara': 'S. Barb.', 'los-angeles': 'L.A.', 'san-bernardino': 'S. Bern.',
    'san-diego': 'S. Diego', 'alameda': 'Alam.', 'monterey': 'Mont.', 'san-luis-obispo': 'S.L.O.', 'sacramento': 'Sac.', 'stanislaus': 'Stan.', 'riverside': 'River.',
  };

  /* ---------------- styles ---------------- */
  function injectStyles() {
    if (document.getElementById('scr-master-style')) return;
    const s = document.createElement('style');
    s.id = 'scr-master-style';
    s.textContent = `
.scr-master { --mn-svgop: ${SERIES.svgop}; --mn-demo: ${SERIES.demo}; }
.scr-master .mn-hero { position:relative; overflow:hidden; border-radius: var(--r-lg); padding: 28px 30px 0; margin-bottom: 22px;
  background: radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--master) 70%, #2a1d55) 0%, var(--master) 45%, #33236a 100%); color:#fff; }
.scr-master .mn-hero::after { content:''; position:absolute; right:-40px; top:-50px; width:260px; height:260px; border-radius:50%;
  background: radial-gradient(circle, rgba(255,255,255,.16), rgba(255,255,255,0) 70%); pointer-events:none; }
.scr-master .mn-eyebrow { display:inline-flex; align-items:center; gap:7px; font-weight:700; font-size:13.5px; letter-spacing:.06em; text-transform:uppercase; opacity:.9; margin-bottom:6px; }
.scr-master .mn-hero h1 { color:#fff; font-stretch:78%; margin-bottom:.2em; }
.scr-master .mn-hero p { color: rgba(255,255,255,.88); max-width: 66ch; margin:0 0 18px; font-size:1.02rem; }
.scr-master .mn-tabs { display:flex; gap:4px; overflow-x:auto; scrollbar-width:none; margin: 0 -6px; padding: 0 6px; }
.scr-master .mn-tabs::-webkit-scrollbar { display:none; }
.scr-master .mn-tab { position:relative; flex:none; padding: 12px 14px 14px; color: rgba(255,255,255,.78); font-weight:700; font-size:15px; text-decoration:none; border-radius: 10px 10px 0 0; min-height:44px; display:inline-flex; align-items:center; }
.scr-master .mn-tab:hover { color:#fff; background: rgba(255,255,255,.08); }
.scr-master .mn-tab.active { color: var(--master); background: var(--bg); }
.scr-master .mn-tab:focus-visible { box-shadow: 0 0 0 3px rgba(255,255,255,.6); }
.scr-master .mn-body { animation: mn-rise .35s ease both; }
@keyframes mn-rise { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform:none; } }
.scr-master .mn-section-title { display:flex; align-items:baseline; flex-wrap:wrap; gap:4px 12px; margin: 0 0 12px; }
.scr-master .mn-section-title h2 { margin:0; font-size:1.3rem; }
.scr-master .mn-block { margin-top: 30px; }
.scr-master .mn-kpis { display:grid; grid-template-columns: repeat(5, minmax(0,1fr)); background: var(--surface); border:1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--shadow-1); overflow:hidden; }
.scr-master .mn-kpis .kpi { border:0; border-radius:0; background:none; padding:18px 20px; border-left:1px solid var(--line); }
.scr-master .mn-kpis .kpi:first-child { border-left:0; }
.scr-master .mn-kpis .kpi::before { display:none; }
.scr-master .mn-kpis .kpi-value { font-size: 2.3rem; color: var(--master); letter-spacing:-.01em; }
.scr-master .mn-kpis .kpi-label { font-weight:700; color: var(--ink); }
.scr-master .kpi-value { font-variant-numeric: tabular-nums; }
.scr-master .mn-kpi-note { font-size:13px; color: var(--ink-3); margin-top:2px; }
.scr-master .mn-kpi-note b { color: var(--ok); }
.scr-master .mn-now { display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:14px; }
.scr-master .mn-now a { display:flex; gap:12px; align-items:flex-start; padding:16px; border-radius: var(--r-lg); border:1px solid var(--line); background: var(--surface);
  text-decoration:none; color: var(--ink); transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; min-width:0; }
.scr-master .mn-now a:hover { transform: translateY(-2px); box-shadow: var(--shadow-2); border-color: color-mix(in srgb, var(--master) 40%, white); color: var(--ink); }
.scr-master .mn-now .mn-now-ic { flex:none; width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; background: var(--master-soft); color: var(--master); }
.scr-master .mn-now .mn-now-ic.is-alert { background: var(--danger-soft); color: var(--danger); }
.scr-master .mn-now strong { display:block; font-size:15px; line-height:1.3; }
.scr-master .mn-now span.small { color: var(--ink-3); }

/* map */
.scr-master .mn-map-wrap { display:grid; grid-template-columns: minmax(0, 1.65fr) minmax(260px, 1fr); }
.scr-master .mn-map-col { padding:20px; border-right:1px solid var(--line); min-width:0; }
.scr-master .mn-map { display:grid; grid-template-columns: repeat(6, minmax(0, 1fr)); grid-auto-rows: 54px; gap:6px; }
.scr-master .mn-tile { appearance:none; position:relative; display:flex; align-items:center; justify-content:center; text-align:center;
  padding:3px; border-radius:8px; font: 600 12.5px/1.15 var(--font-body); cursor:pointer; min-width:0; overflow:hidden;
  border:1.5px solid var(--line-strong); background: var(--surface); color: var(--ink-2); transition: transform .14s ease, box-shadow .14s ease;
  animation: mn-pop .4s ease both; animation-delay: calc(var(--i, 0) * 18ms); }
@keyframes mn-pop { from { opacity:0; transform: scale(.85); } to { opacity:1; transform:none; } }
.scr-master .mn-tile:hover { transform: translateY(-1px); box-shadow: var(--shadow-2); }
.scr-master .mn-tile.st-live { background: var(--master); color: #fff; border-color: var(--master); }
.scr-master .mn-tile.st-onboarding { background: var(--warn-soft); color: var(--warn); border-color: #E2B45C; }
.scr-master .mn-tile.st-invited { background: var(--surface-2); border-color: var(--line); color: var(--ink-3); }
.scr-master .mn-tile.is-sel { box-shadow: 0 0 0 3px var(--surface), 0 0 0 5px var(--ink); z-index:1; }
.scr-master .mn-tile .mn-s { display:none; }
.scr-master .mn-legend { display:flex; flex-wrap:wrap; gap:8px 16px; margin-top:14px; font-size:13.5px; color: var(--ink-2); }
.scr-master .mn-legend span { display:inline-flex; align-items:center; gap:6px; }
.scr-master .mn-sw { width:16px; height:16px; border-radius:4px; border:1.5px solid var(--line-strong); display:inline-block; }
.scr-master .mn-sw.st-live { background: var(--master); border-color: var(--master); }
.scr-master .mn-sw.st-onboarding { background: var(--warn-soft); border-color:#E2B45C; }
.scr-master .mn-sw.st-invited { background: var(--surface-2); border-color: var(--line); }
.scr-master .mn-mini { list-style:none; margin:0; padding:0; border-top:1px solid var(--line); }
.scr-master .mn-mini li { display:flex; gap:8px; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line); font-size:13.5px; }
.scr-master .mn-mini li span:last-child { color: var(--ink-3); text-align:right; overflow-wrap:anywhere; }
.scr-master .mn-panel { padding:20px; display:flex; flex-direction:column; gap:12px; min-width:0; }
.scr-master .mn-panel h3 { margin:0; }
.scr-master .mn-stats { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
.scr-master .mn-stat { background: var(--surface-2); border:1px solid var(--line); border-radius: var(--r); padding:10px 12px; min-width:0; }
.scr-master .mn-stat b { display:block; font-family: var(--font-head); font-stretch:85%; font-size:1.35rem; line-height:1.1; font-variant-numeric: tabular-nums; }
.scr-master .mn-stat span { font-size:13px; color: var(--ink-3); }
.scr-master .mn-states { list-style:none; margin:0; padding:0; display:grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap:4px 16px; }
.scr-master .mn-states li { display:flex; align-items:center; gap:10px; padding:9px 4px; border-bottom:1px solid var(--line); }
.scr-master .mn-code { width:34px; height:28px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center;
  font: 700 13px/1 var(--font-head); background: var(--master-soft); color: var(--master); flex:none; }
.scr-master .mn-sname { flex:1; min-width:0; font-weight:600; }
.scr-master .mn-sname small { display:block; font-weight:400; color: var(--ink-3); font-size:13px; }

/* forms */
.scr-master .mn-field { display:flex; flex-direction:column; gap:6px; min-width:0; }
.scr-master .mn-field > label, .scr-master .mn-label { font-weight:600; font-size:14.5px; }
.scr-master .mn-help { font-size:13.5px; color: var(--ink-3); }
.scr-master .mn-two { display:grid; grid-template-columns: 1fr 1fr; gap:14px; }
.scr-master .mn-seg { display:inline-flex; border:1px solid var(--line-strong); border-radius: 999px; padding:3px; background: var(--surface); gap:2px; }
.scr-master .mn-seg label { position:relative; padding:7px 14px; border-radius:999px; cursor:pointer; font-weight:600; font-size:14.5px; color: var(--ink-2); min-height:36px; display:inline-flex; align-items:center; }
.scr-master .mn-seg input { position:absolute; opacity:0; inset:0; margin:0; cursor:pointer; }
.scr-master .mn-seg label:has(input:checked) { background: var(--master); color:#fff; }
.scr-master .mn-seg label:has(input:focus-visible) { box-shadow: var(--focus); }
.scr-master .mn-chips { display:flex; flex-wrap:wrap; gap:8px; }
.scr-master .mn-chip { display:inline-flex; align-items:center; gap:7px; min-height:40px; padding:6px 13px; border-radius:999px; border:1px solid var(--line-strong);
  background: var(--surface); font: 600 14px/1.2 var(--font-body); color: var(--ink-2); cursor:pointer; transition: background-color .15s ease, color .15s ease, border-color .15s ease; }
.scr-master .mn-chip:hover { border-color: var(--ink-3); color: var(--ink); }
.scr-master .mn-chip[aria-pressed="true"] { background: var(--master); border-color: var(--master); color:#fff; }
.scr-master .mn-chip .mn-dot { width:8px; height:8px; border-radius:50%; background: var(--ok); flex:none; }
.scr-master .mn-chip .mn-dot.is-setup { background: var(--warn); }
.scr-master .mn-chip[aria-pressed="true"] .mn-dot { background:#fff; }
.scr-master .mn-linkrow { display:flex; flex-wrap:wrap; gap:4px 14px; }
.scr-master .mn-range { width:100%; accent-color: var(--master); min-height:32px; }
.scr-master .mn-switch { display:flex; align-items:flex-start; gap:12px; padding:12px 14px; border:1px solid var(--line); border-radius: var(--r); background: var(--surface-2); cursor:pointer; }
.scr-master .mn-switch input { appearance:none; flex:none; width:44px; height:26px; border-radius:999px; background: var(--line-strong); position:relative; cursor:pointer; margin:1px 0 0; transition: background-color .2s ease; }
.scr-master .mn-switch input::after { content:''; position:absolute; top:3px; left:3px; width:20px; height:20px; border-radius:50%; background:#fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform .2s ease; }
.scr-master .mn-switch input:checked { background: var(--master); }
.scr-master .mn-switch input:checked::after { transform: translateX(18px); }
.scr-master .mn-switch input:focus-visible { box-shadow: var(--focus); }
.scr-master .mn-alertnote { display:flex; gap:10px; align-items:flex-start; padding:12px 14px; border-radius: var(--r); background: var(--danger-soft); color: var(--danger); font-weight:600; font-size:14.5px;
  animation: mn-rise .25s ease both; }
.scr-master .mn-alertnote svg { flex:none; margin-top:2px; }
.scr-master .mn-err { color: var(--danger); font-size:13.5px; font-weight:600; margin:0; }
.scr-master .mn-actions { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
.scr-master .btn-master { background: var(--master); border-color: var(--master); color:#fff; }
.scr-master .btn-master:hover { background: color-mix(in srgb, var(--master) 85%, black); border-color: color-mix(in srgb, var(--master) 85%, black); color:#fff; }

/* push */
.scr-master .mn-push-grid { display:grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap:20px; align-items:start; }
.scr-master .mn-sticky { position: sticky; top: calc(var(--topbar-h) + 16px); }
.scr-master .mn-editing { display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius: var(--r); background: var(--info-soft); color: var(--info); font-weight:600; font-size:14.5px; }
.scr-master .mn-pv { border:1px solid var(--line); border-radius: 12px; overflow:hidden; background: var(--bg); box-shadow: var(--shadow-1); }
.scr-master .mn-pv-chrome { display:flex; align-items:center; gap:6px; padding:8px 10px; background: var(--surface-2); border-bottom:1px solid var(--line); font-size:12.5px; color: var(--ink-3); }
.scr-master .mn-pv-chrome i { width:9px; height:9px; border-radius:50%; background: var(--line-strong); }
.scr-master .mn-pv-chrome span { margin-left:8px; background: var(--surface); border:1px solid var(--line); border-radius:999px; padding:2px 10px; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.scr-master .mn-pv-alert { display:flex; gap:10px; align-items:flex-start; padding:10px 14px; background: var(--danger); color:#fff; font-size:14px; line-height:1.35; animation: mn-drop .35s ease both; }
.scr-master .mn-pv-alert b { display:block; font-size:15px; }
.scr-master .mn-pv-alert .mn-pv-tag { flex:none; font: 800 11.5px/1 var(--font-body); letter-spacing:.08em; text-transform:uppercase; background: rgba(255,255,255,.18); border-radius:5px; padding:5px 7px; margin-top:1px; }
@keyframes mn-drop { from { opacity:0; transform: translateY(-10px); } to { opacity:1; transform:none; } }
.scr-master .mn-pv-bar { padding:10px 14px; display:flex; align-items:center; gap:8px; font-family: var(--font-head); font-weight:800; font-stretch:80%; font-size:1.05rem; }
.scr-master .mn-pv-bar small { font-family: var(--font-body); font-weight:500; font-size:12.5px; opacity:.85; margin-left:auto; }
.scr-master .mn-pv-body { padding:12px 14px 14px; display:flex; flex-direction:column; gap:8px; }
.scr-master .mn-pv-tabs { display:flex; gap:14px; font-size:13px; font-weight:700; color: var(--ink-3); border-bottom:1px solid var(--line); padding-bottom:6px; }
.scr-master .mn-pv-tabs .on { color: var(--ink); box-shadow: 0 8px 0 -6px var(--accent); }
.scr-master .mn-pv-item { background: var(--surface); border:1px solid var(--line); border-radius: 10px; padding:10px 12px; font-size:14px; }
.scr-master .mn-pv-item h4 { margin:4px 0 2px; font-size:1rem; overflow-wrap:anywhere; }
.scr-master .mn-pv-item p { margin:0; color: var(--ink-2); font-size:13.5px; overflow-wrap:anywhere; }
.scr-master .mn-pv-item.is-new { border-left:4px solid var(--master); animation: mn-rise .3s ease both; }
.scr-master .mn-pv-item.is-dim { opacity:.55; }
.scr-master .mn-pv-meta { display:flex; flex-wrap:wrap; gap:6px; align-items:center; font-size:12.5px; color: var(--ink-3); }
.scr-master .mn-hist { display:flex; flex-direction:column; gap:12px; }
.scr-master .mn-h { border:1px solid var(--line); border-radius: var(--r-lg); background: var(--surface); padding:16px 18px; display:grid; grid-template-columns: minmax(0,1fr) auto; gap:10px 16px; animation: mn-rise .3s ease both; }
.scr-master .mn-h.is-alert { border-left:4px solid var(--danger); }
.scr-master .mn-h.is-ended { background: var(--surface-2); }
.scr-master .mn-h h3 { font-size:1.08rem; margin:4px 0 4px; overflow-wrap:anywhere; }
.scr-master .mn-h p { margin:0; color: var(--ink-2); font-size:14.5px; overflow-wrap:anywhere; }
.scr-master .mn-h .mn-h-acts { display:flex; flex-wrap:wrap; gap:6px; align-items:flex-start; justify-content:flex-end; }
.scr-master .mn-deliv { grid-column: 1 / -1; display:flex; flex-wrap:wrap; gap:6px; }
.scr-master .mn-dpill { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:600; padding:4px 10px; border-radius:999px; border:1px solid var(--line); background: var(--surface-2); color: var(--ink-2); }
.scr-master .mn-dpill i { width:8px; height:8px; border-radius:50%; background: var(--ink-3); }
.scr-master .mn-dpill.is-showing i { background: var(--ok); }
.scr-master .mn-dpill.is-hidden { background: var(--warn-soft); color: var(--warn); border-color: color-mix(in srgb, var(--warn) 25%, white); }
.scr-master .mn-dpill.is-hidden i { background: var(--warn); }
.scr-master .mn-endform { grid-column: 1 / -1; display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; padding:12px; border-radius: var(--r); background: var(--surface-2); border:1px solid var(--line); }
.scr-master .mn-empty { text-align:center; padding:34px 20px; border:1.5px dashed var(--line-strong); border-radius: var(--r-lg); color: var(--ink-3); background: var(--surface); }
.scr-master .mn-empty strong { display:block; color: var(--ink); font-size:1.05rem; margin-bottom:4px; }

/* ads */
.scr-master .mn-places { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:14px; }
.scr-master .mn-place { display:flex; flex-direction:column; gap:10px; padding:16px; }
.scr-master .mn-place h3 { font-size:1.05rem; margin:0; }
.scr-master .mn-slotline { display:flex; flex-direction:column; gap:2px; padding:8px 10px; border-radius:8px; background: var(--surface-2); border:1px solid var(--line); font-size:13.5px; min-width:0; }
.scr-master .mn-slotline b { font-size:12.5px; color: var(--ink-3); font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
.scr-master .mn-slotline span { overflow-wrap:anywhere; }
.scr-master .mn-adv { border:2px dashed var(--master); border-radius:10px; background: color-mix(in srgb, var(--master) 5%, white); padding:12px 14px; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.scr-master .mn-adv .mn-adv-txt { flex:1 1 180px; min-width:0; }
.scr-master .mn-adv .mn-adv-k { font: 800 11px/1 var(--font-body); letter-spacing:.08em; text-transform:uppercase; color: var(--master); }
.scr-master .mn-adv strong { display:block; margin-top:4px; overflow-wrap:anywhere; }
.scr-master .mn-adv small { color: var(--ink-3); }
.scr-master .mn-adv .mn-adv-cta { flex:none; background: var(--master); color:#fff; border-radius:8px; padding:8px 12px; font-weight:700; font-size:14px; }
.scr-master .mn-adv.is-banner { border-radius:6px; }
.scr-master .mn-adv.is-side { flex-direction:column; align-items:stretch; max-width:260px; }
.scr-master .mn-adlist { display:flex; flex-direction:column; gap:10px; }
.scr-master .mn-ad { display:grid; grid-template-columns: minmax(0,1fr) auto; gap:8px 14px; align-items:center; padding:14px 16px; border:1px solid var(--line); border-radius: var(--r-lg); background: var(--surface); animation: mn-rise .3s ease both; }
.scr-master .mn-ad.is-paused { background: var(--surface-2); }
.scr-master .mn-ad h3 { font-size:1.02rem; margin:2px 0; overflow-wrap:anywhere; }

/* analytics */
.scr-master .mn-cmp { display:flex; flex-direction:column; gap:4px; }
.scr-master .mn-cmp-row { display:grid; grid-template-columns: minmax(150px, 220px) minmax(0,1fr); gap:6px 18px; padding:12px 0; border-bottom:1px solid var(--line); align-items:center; }
.scr-master .mn-cmp-row:last-child { border-bottom:0; }
.scr-master .mn-cmp-q { font-weight:700; font-size:14.5px; }
.scr-master .mn-cmp-empty { margin:0; padding:10px 12px; border-radius: var(--r); border:1px dashed var(--line-strong); color: var(--ink-3); font-size:13.5px; background: var(--surface-2); }
.scr-master .mn-cmp-q small { display:block; font-weight:400; color: var(--ink-3); font-size:13px; }
.scr-master .mn-bars { display:flex; flex-direction:column; gap:6px; min-width:0; }
.scr-master .mn-bar { display:grid; grid-template-columns: 92px minmax(0,1fr) auto; gap:10px; align-items:center; font-size:13.5px; min-height:24px; cursor:default; border-radius:6px; }
.scr-master .mn-bar:focus-visible { box-shadow: var(--focus); }
.scr-master .mn-bar-name { color: var(--ink-2); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.scr-master .mn-bar-track { height:14px; border-radius: 0 4px 4px 0; position:relative; }
.scr-master .mn-bar-fill { position:absolute; inset:0 auto 0 0; border-radius: 0 4px 4px 0; transform-origin: left; transform: scaleX(0); transition: transform .8s cubic-bezier(.2,.7,.2,1); display:flex; }
.scr-master .mn-bar-fill > i { height:100%; display:block; }
.scr-master .mn-bar-fill > i + i { border-left:2px solid var(--surface); }
.scr-master .is-drawn .mn-bar-fill { transform: scaleX(1); }
.scr-master .mn-bar-val { font-weight:700; color: var(--ink); font-variant-numeric: tabular-nums; white-space:nowrap; }
.scr-master .mn-bar-val small { font-weight:600; color: var(--ok); margin-left:4px; }
.scr-master .mn-key { display:flex; flex-wrap:wrap; gap:6px 16px; font-size:13.5px; color: var(--ink-2); }
.scr-master .mn-key span { display:inline-flex; align-items:center; gap:6px; }
.scr-master .mn-key i { width:12px; height:12px; border-radius:3px; display:inline-block; }
.scr-master .mn-turfs { display:grid; grid-template-columns: 1fr 1fr; gap:20px 28px; }
.scr-master .mn-turfs .mn-bar { grid-template-columns: 150px minmax(0,1fr) 44px; }
.scr-master .mn-turf-h { display:flex; align-items:baseline; gap:8px; margin-bottom:8px; }
.scr-master .mn-turf-h h3 { margin:0; font-size:1.05rem; }
.scr-master .mn-tip { position:fixed; pointer-events:none; background: var(--surface); border:1px solid var(--line); border-radius:8px;
  box-shadow: var(--shadow-2); padding:8px 10px; font-size:13.5px; line-height:1.4; z-index:60; max-width:260px; display:none; color: var(--ink-2); }
.scr-master .mn-tip b { display:block; color: var(--ink); font-size:15px; font-variant-numeric: tabular-nums; }
.scr-master .mn-chart { position:relative; min-height:240px; }
.scr-master .mn-chart svg { display:block; overflow:visible; }
.scr-master .mn-chart svg:focus-visible { outline:none; box-shadow: var(--focus); border-radius:6px; }
.scr-master .mn-line { stroke-dasharray: var(--len); stroke-dashoffset: var(--len); animation: mn-draw 1.1s cubic-bezier(.3,.6,.2,1) .1s forwards; }
.scr-master .mn-area { opacity:0; animation: mn-fade .6s ease .7s forwards; }
@keyframes mn-draw { to { stroke-dashoffset: 0; } }
@keyframes mn-fade { to { opacity:1; } }
.scr-master .mn-feed { list-style:none; margin:0; padding:0; }
.scr-master .mn-feed li { display:flex; gap:12px; align-items:flex-start; padding:10px 0; border-bottom:1px solid var(--line); }
.scr-master .mn-feed li:last-child { border-bottom:0; }
.scr-master .mn-feed .mn-feed-dot { flex:none; width:10px; height:10px; border-radius:50%; margin-top:7px; }
.scr-master .mn-feed .mn-feed-txt { flex:1; min-width:0; overflow-wrap:anywhere; }
.scr-master details.mn-tbl summary { cursor:pointer; font-weight:600; color: var(--master); margin-top:12px; min-height:32px; display:flex; align-items:center; }
.scr-master details.mn-tbl[open] summary { margin-bottom:10px; }
.scr-master .mn-sample { display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:700; color: var(--warn); background: var(--warn-soft); border-radius:999px; padding:2px 8px; }

@media (max-width: 1100px) and (min-width: 641px) {
  .scr-master .mn-kpis .kpi { padding:16px 14px; }
  .scr-master .mn-kpis .kpi-value { font-size:1.8rem; }
}
@media (max-width: 1000px) {
  .scr-master .mn-push-grid { grid-template-columns: minmax(0,1fr); }
  .scr-master .mn-sticky { position: static; }
  .scr-master .mn-places { grid-template-columns: minmax(0,1fr); }
}
@media (max-width: 900px) {
  .scr-master .mn-map-wrap { grid-template-columns: minmax(0,1fr); }
  .scr-master .mn-map-col { border-right:0; border-bottom:1px solid var(--line); }
  .scr-master .mn-now { grid-template-columns: minmax(0,1fr); }
  .scr-master .mn-turfs { grid-template-columns: minmax(0,1fr); }
}
@media (max-width: 640px) {
  .scr-master .mn-hero { padding: 22px 18px 0; }
  .scr-master .mn-kpis { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
  .scr-master .mn-kpis .kpi { border-left:0; border-top:1px solid var(--line); padding:14px 16px; }
  .scr-master .mn-kpis .kpi:nth-child(even) { border-left:1px solid var(--line); }
  .scr-master .mn-kpis .kpi:nth-child(-n+2) { border-top:0; }
  .scr-master .mn-kpis .kpi:first-child:nth-last-child(odd) { grid-column: 1 / -1; }
  .scr-master .mn-kpis .kpi:first-child:nth-last-child(odd) ~ .kpi:nth-child(2) { border-left:0; border-top:1px solid var(--line); }
  .scr-master .mn-kpis .kpi:first-child:nth-last-child(odd) ~ .kpi:nth-child(odd) { border-left:1px solid var(--line); }
  .scr-master .mn-kpis .kpi:first-child:nth-last-child(odd) ~ .kpi:nth-child(even) { border-left:0; }
  .scr-master .kpi-value { font-size: 1.7rem; }
  .scr-master .mn-map-col { padding:12px; }
  .scr-master .mn-map { grid-auto-rows: 46px; gap:4px; }
  .scr-master .mn-tile { font-size:12.5px; padding:2px; }
  .scr-master .mn-tile .mn-f { display:none; }
  .scr-master .mn-tile .mn-s { display:inline; }
  .scr-master .mn-two { grid-template-columns: minmax(0,1fr); }
  .scr-master .chip, .scr-master .btn-sm, .scr-master .mn-chip { min-height:44px; }
  .scr-master .mn-seg label { min-height:40px; }
  .scr-master .mn-h, .scr-master .mn-ad { grid-template-columns: minmax(0,1fr); }
  .scr-master .mn-h .mn-h-acts { justify-content:flex-start; }
  .scr-master .mn-cmp-row { grid-template-columns: minmax(0,1fr); }
  .scr-master .mn-bar { grid-template-columns: 74px minmax(0,1fr) auto; gap:8px; }
  .scr-master .mn-turfs .mn-bar { grid-template-columns: 118px minmax(0,1fr) 40px; }
  .scr-master .mn-tab { padding: 10px 10px 12px; font-size:14.5px; }
  .scr-master .mn-tabs { margin: 0 -18px; padding: 0 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .scr-master .mn-line { stroke-dasharray: none; stroke-dashoffset: 0; animation: none; }
  .scr-master .mn-area { opacity:1; animation:none; }
  .scr-master .mn-bar-fill { transition:none; transform: scaleX(1); }
}
@media (max-width: 640px), (pointer: coarse) {
.scr-master .mn-range { min-height: 44px; }
.scr-master .mn-switch { min-height: 44px; }
.scr-master .mn-switch input[type="checkbox"] { min-width: 24px; min-height: 24px; }
}
`;
    document.head.appendChild(s);
  }

  /* ---------------- shared helpers ---------------- */
  const G = () => window.Store.global;
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function net() { return (window.DATA && window.DATA.network) || {}; }
  function tenantsData() { return (window.DATA && window.DATA.tenants) || {}; }
  function counties() { return net().counties || []; }
  function siteCounties() { return counties().filter((c) => c.status !== 'invited'); }
  function liveSlugs() { return counties().filter((c) => c.status === 'live').map((c) => c.slug); }
  function countyLabel(slug) {
    if (slug === 'svgop') return 'SVGOP';
    if (slug === 'demo') return 'Demo County GOP';
    const c = counties().find((x) => x.slug === slug);
    return c ? c.name + ' County' : slug;
  }
  function shortLabel(slug) { return slug === 'svgop' ? 'SVGOP' : slug === 'demo' ? 'Demo County' : ((counties().find((x) => x.slug === slug) || {}).name || slug); }
  function isLive(slug) { const c = counties().find((x) => x.slug === slug); return !!(c && c.status === 'live'); }
  function minutesSince(iso) { const t = Date.parse(iso || ''); return isNaN(t) ? 0 : (Date.now() - t) / 60000; }
  function ago(iso) { return U.timeAgo(minutesSince(iso)); }
  function fmtDay(iso) {
    const d = new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso);
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function compact(n, usd) {
    const a = Math.abs(n);
    let s;
    if (a >= 1e6) s = (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    else if (a >= 1e3) s = (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
    else s = String(Math.round(n));
    return (usd ? '$' : '') + s;
  }
  function plural(n, one, many) { return `${U.fmtNum(n)} ${n === 1 ? one : (many || one + 's')}`; }
  function priorityLabel(p) { return p >= 100 ? 'Top' : p >= 70 ? 'High' : p >= 40 ? 'Normal' : 'Low'; }
  function isAlert(p) { return !!(p && p.locked && Number(p.priority) >= 100); }
  function userName() { const u = App.auth && App.auth.user; return u ? u.name : 'Master Network'; }

  /* Count-up for [data-count] elements. */
  function animateCounts(root) {
    root.querySelectorAll('[data-count]').forEach((el) => {
      const end = Number(el.dataset.count) || 0;
      const fmt = el.dataset.fmt || 'num';
      const out = (v) => fmt === 'usd' ? compact(v, true) : fmt === 'compact' ? compact(v) : U.fmtNum(v);
      if (reduced() || end === 0) { el.textContent = out(end); return; }
      const t0 = performance.now(), dur = 900;
      const tick = (t) => {
        if (!el.isConnected) return;
        const k = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        el.textContent = out(end * e);
        if (k < 1) requestAnimationFrame(tick); else el.textContent = out(end);
      };
      el.textContent = out(0);
      requestAnimationFrame(tick);
    });
  }

  /* ---------------- data: pushes ---------------- */
  function pushes() {
    return G().list('networkPushes').slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }
  function archive() {
    return G().list('networkPushArchive').slice().sort((a, b) => String(b.endedAt || '').localeCompare(String(a.endedAt || '')));
  }
  /* Takes down pushes whose end date has passed. Returns how many it moved. */
  function sweepExpired() {
    const now = Date.now();
    let n = 0;
    G().list('networkPushes').forEach((p) => {
      if (p.expiresAt && Date.parse(p.expiresAt) <= now) {
        endPush(p, 'expired', true);
        n++;
      }
    });
    return n;
  }
  function endPush(p, reason, quiet) {
    G().remove('networkPushes', p.id);
    const rec = Object.assign({}, p, { pushId: p.id, endedAt: new Date().toISOString(), endedReason: reason, endedBy: quiet ? 'End date' : userName() });
    delete rec.id;
    return G().add('networkPushArchive', rec);
  }

  /* Which pushes a county chose to hide. The Committee Portal owns this list; read every shape it might use. */
  function hiddenIds(slug) {
    const S = window.Store.forTenant(slug);
    const out = new Set();
    const take = (v) => {
      if (!v) return;
      if (Array.isArray(v)) v.forEach((x) => { if (typeof x === 'string') out.add(x); else if (x && (x.itemId || x.pushId || x.id)) out.add(x.itemId || x.pushId || x.id); });
      else if (typeof v === 'object') {
        if (Array.isArray(v.hidden)) take(v.hidden);
        else Object.keys(v).forEach((k) => { if (v[k] === true || v[k] === 'hidden' || (v[k] && v[k].hidden)) out.add(k); });
      }
    };
    ['networkHidden', 'hiddenNetwork', 'hiddenPushes', 'hiddenNetworkItems', 'networkPrefs'].forEach((k) => { try { take(S.get(k, null)); } catch (e) { /* ignore */ } });
    ['networkHides', 'hiddenNetworkItems'].forEach((k) => { try { take(S.list(k)); } catch (e) { /* ignore */ } });
    return out;
  }
  function delivery(p) {
    return (p.tenants || []).map((slug) => {
      if (!isLive(slug)) return { slug, state: 'setup', text: `${shortLabel(slug)}: shows when its site launches` };
      if (!p.locked && hiddenIds(slug).has(p.id)) return { slug, state: 'hidden', text: `${shortLabel(slug)}: hidden by the county` };
      return { slug, state: 'showing', text: `${shortLabel(slug)}: showing${p.locked ? ', locked' : ''}` };
    });
  }

  /* ---------------- data: ads ---------------- */
  function ads() { return G().list('networkAds').slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))); }
  /* What a county shows in a network placement: its newest active network ad, else the seed default. */
  function adFor(slug, placement) {
    const mine = ads().find((a) => a.active && a.placement === placement && (a.tenants || []).includes(slug));
    if (mine) return { ad: mine, seed: false };
    const seed = (net().masterAds || []).find((a) => a.placement === placement);
    return seed ? { ad: seed, seed: true } : null;
  }

  /* ---------------- data: county activity (analytics) ---------------- */
  const ACTIVITY = [
    { coll: 'rsvps', label: 'RSVP' },
    { coll: 'volunteers', label: 'Volunteer sign-up' },
    { coll: 'memberships', label: 'Membership' },
    { coll: 'donations', label: 'Donation' },
    { coll: 'walkResults', label: 'Door knocked' },
    { coll: 'votes', label: 'Meeting vote' },
  ];
  function countyStats(slug) {
    const t = tenantsData()[slug] || {};
    const S = window.Store.forTenant(slug);
    const L = (c) => { try { return S.list(c); } catch (e) { return []; } };
    const rsvps = L('rsvps'), vols = L('volunteers'), mems = L('memberships'), dons = L('donations'), walks = L('walkResults'), votes = L('votes');
    const seedEvents = (t.events || []);
    const savedEvents = L('events').filter((e) => e && e.status !== 'draft');
    const stats = t.stats || {};
    const turfs = (t.turfs || []).map((tf) => {
      const mine = walks.filter((w) => w.turfId === tf.id);
      const extra = mine.reduce((a, w) => a + (Number(w.doors) || 1), 0);
      return { id: tf.id, name: tf.name, doors: tf.doors, seedDone: tf.done, extra, done: Math.min(tf.doors, tf.done + extra) };
    });
    const looseDoors = walks.filter((w) => !turfs.some((tf) => tf.id === w.turfId)).reduce((a, w) => a + (Number(w.doors) || 1), 0);
    const donSum = dons.reduce((a, d) => a + (Number(d.amount) || 0), 0);
    return {
      slug,
      rsvps: { seed: seedEvents.reduce((a, e) => a + (Number(e.rsvps) || 0), 0), saved: rsvps.reduce((a, r) => a + 1 + (Number(r.guests) || 0), 0), docs: rsvps.length },
      volunteers: { seed: Number(stats.volunteers) || 0, saved: vols.length },
      memberships: { seed: 0, saved: mems.length },
      donations: { seed: Number(stats.donationsUsd) || 0, saved: donSum, docs: dons.length },
      doors: { seed: turfs.reduce((a, x) => a + x.seedDone, 0), saved: turfs.reduce((a, x) => a + x.extra, 0) + looseDoors },
      votes: { seed: 0, saved: votes.length },
      events: seedEvents.length + savedEvents.filter((e) => !seedEvents.some((s) => s.id === e.id)).length,
      turfs,
      visitors: Number(stats.visitors7d) || 0,
      newsletter: Number(stats.newsletter) || 0,
      recent: ACTIVITY.flatMap((a) => L(a.coll).map((d) => ({ slug, kind: a.label, coll: a.coll, doc: d }))),
    };
  }
  /* A plain sentence for one saved action, built from the doc's fields (no names). */
  function activitySentence(r) {
    const d = r.doc || {};
    const t = tenantsData()[r.slug] || {};
    const where = countyLabel(r.slug);
    if (r.coll === 'walkResults') {
      const turf = (t.turfs || []).find((x) => x.id === d.turfId);
      const place = turf ? turf.name : (d.address ? String(d.address) : '');
      const what = { talked: 'Talked with a voter', not_home: 'Nobody home', nothome: 'Nobody home', refused: 'Door closed', moved: 'Voter moved', yard_sign: 'Yard sign requested', lit: 'Left literature' }[d.result] || 'Door knocked';
      const n = Number(d.doors) > 1 ? ` (${d.doors} doors)` : '';
      return `${what}${place ? ' in ' + place : ''}${n} · ${where}`;
    }
    if (r.coll === 'rsvps') {
      const ev = (t.events || []).find((e) => e.id === d.eventId);
      const title = ev ? ev.title : String(d.title || '').replace(/^RSVP:?\s*/i, '') || 'a county event';
      const g = Number(d.guests) || 0;
      return `RSVP for ${title}${g ? `, ${1 + g} people` : ''} · ${where}`;
    }
    if (r.coll === 'volunteers') {
      const ints = Array.isArray(d.interests) && d.interests.length ? `: ${d.interests.join(', ')}` : '';
      return `New volunteer sign-up${ints} · ${where}`;
    }
    if (r.coll === 'donations') return `${d.amount ? U.fmtUsd(d.amount) + ' ' : ''}${d.recurring ? 'monthly ' : ''}donation · ${where}`.replace(/^d/, 'D');
    if (r.coll === 'memberships') return `New member joined · ${where}`;
    if (r.coll === 'votes') return `Ballot cast in a central committee meeting · ${where}`;
    return `${r.kind} · ${where}`;
  }

  /* Statewide CRM totals: aggregates only, from App.crm.stats(slug). Never individual records. */
  function crmStats() {
    if (!(App.crm && App.crm.stats)) return [];
    return liveSlugs().map((slug) => { let st = null; try { st = App.crm.stats(slug); } catch (e) { st = null; } return st ? Object.assign({ slug }, st) : null; }).filter(Boolean);
  }

  function savedTotals() {
    const live = liveSlugs().map(countyStats);
    const sum = (k) => live.reduce((a, s) => a + s[k].saved, 0);
    return { live, volunteers: sum('volunteers'), donations: sum('donations'), rsvps: sum('rsvps'), memberships: sum('memberships'), doors: sum('doors'), votes: sum('votes') };
  }

  /* ---------------- chrome ---------------- */
  function chrome(sub) {
    const tabs = TABS.map((t) => `<a class="mn-tab${t.sub === sub ? ' active' : ''}" href="#/master${t.sub ? '/' + t.sub : ''}"${t.sub === sub ? ' aria-current="page"' : ''}>${t.label}</a>`).join('');
    return `<section class="mn-hero">
        <div class="mn-eyebrow">${STAR} Master Network</div>
        <h1>Master Network Console</h1>
        <p>Send news and alerts to every county committee at once, and fill the network ad slots on their sites. Each county keeps control of its own local zones.</p>
        <nav class="mn-tabs" aria-label="Master Network sections">${tabs}</nav>
      </section>`;
  }

  /* ================= DASHBOARD ================= */
  let selCounty = 'svgop';
  function fresh(root) { const h = document.createElement('div'); root.replaceChildren(h); return h; }

  function renderDashboard(parent, ctx) {
    const root = fresh(parent);
    const N = net();
    const k = N.kpis || {};
    const tot = savedTotals();
    const live = pushes();
    const alerts = live.filter(isAlert);
    const running = ads().filter((a) => a.active);
    if (!TILE_POS[selCounty]) selCounty = ctx.tenantSlug;
    const kpi = (count, fmt, label, note) => `<div class="kpi"><div class="kpi-value" data-count="${count}" data-fmt="${fmt}">0</div><div class="kpi-label">${label}</div><div class="mn-kpi-note">${note}</div></div>`;
    const newNote = (n, what) => n ? `Includes <b>${U.fmtNum(n)}</b> ${what} saved here` : 'Sample figure';

    const tiles = counties().filter((c) => TILE_POS[c.slug]).map((c, i) => {
      const [col, row] = TILE_POS[c.slug];
      const full = c.slug === 'svgop' ? 'Santa Clara' : c.name;
      return `<button type="button" class="mn-tile st-${c.status}${c.slug === selCounty ? ' is-sel' : ''}" data-county="${esc(c.slug)}" style="grid-column:${col + 1};grid-row:${row + 1};--i:${i}"
        title="${esc(full)} County: ${STATUS_LABEL[c.status]}" aria-label="${esc(full)} County, ${STATUS_LABEL[c.status]}" aria-pressed="${c.slug === selCounty}">
        <span class="mn-f">${esc(full)}</span><span class="mn-s">${esc(SHORT[c.slug] || full)}</span></button>`;
    }).join('');

    const stateBadge = (s) => s.status === 'active' ? '<span class="badge badge-ok">Active</span>'
      : s.status === 'pilot' ? '<span class="badge badge-warn">Pilot</span>' : '<span class="badge">Waitlist</span>';
    const states = (N.states || []).map((s) => `<li><span class="mn-code" aria-hidden="true">${esc(s.code)}</span>
      <span class="mn-sname">${esc(s.name)}<small>${s.counties ? `${plural(s.counties, 'county', 'counties')} on the platform` : 'Ready to start when a county signs up'}</small></span>${stateBadge(s)}</li>`).join('');

    const lastPush = live[0];
    root.innerHTML = `
      <div class="mn-section-title"><h2>Network totals</h2><span class="mn-sample">Sample</span><span class="small muted">Sample figures across every state on the network, plus what people saved on these county sites</span></div>
      <div class="mn-kpis" data-tour="master-kpis">
        ${kpi(k.sites || 0, 'num', 'Committee websites', 'Live or setting up')}
        ${kpi(k.weeklyVisitors || 0, 'compact', 'Visitors this week', 'Across all county sites')}
        ${kpi(k.candidatesRecruited || 0, 'num', 'Candidates recruited', 'Through county pipelines')}
        ${kpi((k.volunteers || 0) + tot.volunteers, 'num', 'Volunteers', newNote(tot.volunteers, 'new sign-ups'))}
        ${kpi((k.donationsUsd || 0) + tot.donations, 'usd', 'Raised online', newNote(tot.donations ? Math.round(tot.donations) : 0, 'dollars given'))}
      </div>

      <div class="mn-block mn-now">
        <a href="#/master/push"><span class="mn-now-ic${alerts.length ? ' is-alert' : ''}">${alerts.length ? ALERT : ICON}</span><span>
          <strong>${alerts.length ? `${plural(alerts.length, 'statewide alert')} showing now` : 'No statewide alert is showing'}</strong>
          <span class="small">${alerts.length ? esc(alerts[0].title) : 'Push news with top priority and a lock to put a banner on county homepages.'}</span></span></a>
        <a href="#/master/push"><span class="mn-now-ic">${I('<path d="M3 10h10M9 6l4 4-4 4"/><path d="M16 4v12"/>')}</span><span>
          <strong>${live.length ? `${plural(live.length, 'network push', 'network pushes')} live` : 'Nothing pushed yet'}</strong>
          <span class="small">${lastPush ? `Last one ${esc(ago(lastPush.createdAt))}: ${esc(lastPush.title)}` : 'Write one update and send it to the counties you pick.'}</span></span></a>
        <a href="#/master/ads"><span class="mn-now-ic">${I('<rect x="3" y="5" width="14" height="10" rx="2"/><path d="M6 9h5M6 12h3"/>')}</span><span>
          <strong>${running.length ? `${plural(running.length, 'network ad')} running` : 'Sample ads fill the network slots'}</strong>
          <span class="small">${running.length ? esc(running.map((a) => a.title).slice(0, 2).join(' · ')) : 'Create a network ad to replace a sample in any slot.'}</span></span></a>
        ${(() => {
          const cs = crmStats();
          if (!cs.length) return '';
          const ppl = cs.reduce((a, x) => a + (x.people || 0), 0), nw = cs.reduce((a, x) => a + (x.newThisMonth || 0), 0);
          const calls = cs.reduce((a, x) => a + (x.callsMade || 0), 0);
          const talked = cs.reduce((a, x) => a + Math.round((x.responseRate || 0) / 100 * (x.callsMade || 0)), 0);
          return `<a href="#/master/analytics"><span class="mn-now-ic">${I('<circle cx="7" cy="7" r="2.5"/><circle cx="13.5" cy="8" r="2"/><path d="M2.5 16c.6-2.8 2.4-4.2 4.5-4.2s3.9 1.4 4.5 4.2M11.5 12.3c2.3-.4 4.2.8 5 3.7"/>')}</span><span>
            <strong>${plural(ppl, 'person', 'people')} on county lists</strong>
            <span class="small">${U.fmtNum(nw)} new this month${calls ? `, and ${Math.round(talked / calls * 100)}% of ${plural(calls, 'call')} reached someone` : ''}. Totals only.</span></span></a>`;
        })()}
      </div>

      <div class="mn-block">
        <div class="mn-section-title"><h2>California committees</h2><span class="small muted">Select a county to see its numbers</span></div>
        <div class="card" data-tour="master-map">
          <div class="mn-map-wrap">
            <div class="mn-map-col">
              <div class="mn-map" role="group" aria-label="California county committees, arranged north to south">${tiles}</div>
              <div class="mn-legend" aria-label="Legend">
                <span><i class="mn-sw st-live"></i>Live</span>
                <span><i class="mn-sw st-onboarding"></i>Setting up</span>
                <span><i class="mn-sw st-invited"></i>Invited</span>
              </div>
              <p class="small muted" style="margin-top:8px">North is at the top. Tiles show each county’s rough position, not its shape.</p>
            </div>
            <div class="mn-panel" id="mn-panel" aria-live="polite"></div>
          </div>
        </div>
      </div>


      <div class="mn-block">
        <div class="mn-section-title"><h2>States on the network</h2><span class="mn-sample">Sample</span><span class="small muted">Rollout status</span></div>
        <div class="card"><div class="card-body"><ul class="mn-states">${states}</ul></div></div>
      </div>`;
    animateCounts(root);

    const panel = root.querySelector('#mn-panel');
    function drawPanel() {
      const c = counties().find((x) => x.slug === selCounty) || counties()[0];
      if (!c) return;
      const region = (N.regions || []).find((r) => r.id === c.region);
      const full = c.slug === 'svgop' ? 'Santa Clara' : c.name;
      const badge = c.status === 'live' ? '<span class="badge badge-ok">Live</span>' : c.status === 'onboarding' ? '<span class="badge badge-warn">Setting up</span>' : '<span class="badge">Invited</span>';
      const sent = G().list('networkOutreach').filter((o) => o.county === c.slug).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
      const sentLine = sent ? `<p class="small muted">${esc(sent.title)} ${esc(ago(sent.createdAt))} by ${esc(sent.by || 'Master Network')}.</p>` : '';
      let body;
      if (c.status === 'live') {
        const s = countyStats(c.slug);
        body = `<div class="mn-stats">
          <div class="mn-stat"><b>${U.fmtNum(s.visitors)}</b><span>Visitors, last 7 days</span></div>
          <div class="mn-stat"><b>${U.fmtNum(s.volunteers.seed + s.volunteers.saved)}</b><span>Volunteers${s.volunteers.saved ? `, ${s.volunteers.saved} new` : ''}</span></div>
          <div class="mn-stat"><b>${U.fmtNum(s.rsvps.seed + s.rsvps.saved)}</b><span>Event RSVPs</span></div>
          <div class="mn-stat"><b>${U.fmtUsd(s.donations.seed + s.donations.saved)}</b><span>Raised online</span></div>
        </div>
        ${(() => {
          const ps = pushes().filter((p) => (p.tenants || []).includes(c.slug));
          const hid = hiddenIds(c.slug);
          const showing = ps.filter((p) => p.locked || !hid.has(p.id)).length;
          const rec = s.recent.slice().sort((a, b) => String(b.doc.createdAt || '').localeCompare(String(a.doc.createdAt || ''))).slice(0, 3);
          return `<ul class="mn-mini"><li><span>Network pushes showing</span><span>${showing} of ${ps.length}</span></li>
            ${Object.keys(PLACEMENTS).map((pl) => { const r = adFor(c.slug, pl); return `<li><span>${PLACEMENTS[pl].label}</span><span>${r ? (r.seed ? 'Sample ad' : esc(r.ad.title)) : 'Empty'}</span></li>`; }).join('')}
            ${rec.map((r) => `<li><span>${esc(activitySentence(r).replace(/ · [^·]+$/, ''))}</span><span>${esc(ago(r.doc.createdAt))}</span></li>`).join('')}</ul>`;
        })()}
        <div class="mn-actions"><a class="btn btn-sm btn-master" href="index.html?county=${esc(c.slug)}" target="_blank" rel="noopener">Open their public site ${EXT}</a>
          <a class="btn btn-sm" href="#/master/analytics">See analytics</a></div>`;
      } else if (c.status === 'onboarding') {
        body = `<p class="small">This committee is setting up its site. Its numbers appear here the day it goes live, and network pushes you send it now will be waiting.</p>
          ${sentLine}<div class="mn-actions"><button class="btn btn-sm" data-act="outreach" data-kind="checklist">Send setup checklist</button></div>`;
      } else {
        body = `<p class="small">This committee has an open invitation to join the network. Its site launches as soon as its board says yes.</p>
          ${sentLine}<div class="mn-actions"><button class="btn btn-sm" data-act="outreach" data-kind="invite">Resend invitation</button></div>`;
      }
      const label = c.slug === 'svgop' ? 'Santa Clara County Republican Party (SVGOP)' : c.slug === 'demo' ? 'Demo County Republican Party' : `${full} County`;
      panel.innerHTML = `<div class="row" style="gap:8px">${badge}<span class="small muted">${esc(region ? region.name : '')}</span></div><h3>${esc(label)}</h3>${body}`;
    }
    drawPanel();

    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-county]');
      if (t) {
        selCounty = t.dataset.county;
        root.querySelectorAll('.mn-tile').forEach((b) => { const on = b.dataset.county === selCounty; b.classList.toggle('is-sel', on); b.setAttribute('aria-pressed', on); });
        drawPanel();
        if (window.innerWidth < 900) panel.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
        return;
      }
      const a = e.target.closest('[data-act="outreach"]');
      if (a) {
        const c = counties().find((x) => x.slug === selCounty);
        const isList = a.dataset.kind === 'checklist';
        G().add('networkOutreach', { county: selCounty, kind: a.dataset.kind, by: userName(), title: isList ? 'Setup checklist sent' : 'Invitation resent' });
        ctx.toast(isList ? `Setup checklist sent to the ${c.name} County board.` : `Invitation resent to the ${c.name} County chair.`, 'ok');
        drawPanel();
      }
    });
  }

  /* ================= PUSH NEWS ================= */
  const TAGS = ['Election', 'Voting', 'Volunteer', 'Policy', 'Party', 'Video'];
  let draft = null;
  function blankDraft() {
    return { id: null, title: '', summary: '', tag: 'Election', source: 'Master Network', tab: 'state', tenants: liveSlugs(), priority: 60, locked: false, expires: '' };
  }

  let pushRefresh = null;
  function renderPush(parent, ctx) {
    const root = fresh(parent);
    if (!draft) draft = blankDraft();
    const d = draft;
    const sites = siteCounties();
    root.innerHTML = `
      <div class="mn-push-grid">
        <form class="card" id="mn-form" novalidate data-tour="push-targeting">
          <div class="card-head"><h3 id="mn-form-h">${d.id ? 'Edit this push' : 'Write a network push'}</h3></div>
          <div class="card-body stack">
            <div id="mn-editing"></div>
            <div class="mn-field"><label for="mn-title">Headline</label>
              <input class="input" id="mn-title" name="title" maxlength="120" required placeholder="For example: Vote centers open Saturday across California" value="${esc(d.title)}"></div>
            <div class="mn-field"><label for="mn-sum">Summary</label>
              <textarea class="textarea" id="mn-sum" name="summary" maxlength="300" rows="3" placeholder="Two sentences a voter can act on">${esc(d.summary)}</textarea>
              <span class="mn-help" id="mn-sum-count"></span></div>
            <div class="mn-two">
              <div class="mn-field"><span class="mn-label" id="mn-tab-l">News tab</span>
                <div class="mn-seg" role="radiogroup" aria-labelledby="mn-tab-l">
                  <label><input type="radio" name="tab" value="state"${d.tab === 'state' ? ' checked' : ''}>State</label>
                  <label><input type="radio" name="tab" value="national"${d.tab === 'national' ? ' checked' : ''}>National</label>
                </div></div>
              <div class="mn-field"><label for="mn-tag">Topic tag</label>
                <select class="select" id="mn-tag" name="tag">${TAGS.map((t) => `<option${t === d.tag ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
            </div>
            <div class="mn-field"><span class="mn-label" id="mn-ct-l">Counties that receive it</span>
              <div class="mn-chips" role="group" aria-labelledby="mn-ct-l">${sites.map((c) => `<button type="button" class="mn-chip" data-county-pick="${esc(c.slug)}" aria-pressed="${d.tenants.includes(c.slug)}"><i class="mn-dot${c.status === 'live' ? '' : ' is-setup'}" aria-hidden="true"></i>${esc(shortLabel(c.slug))}</button>`).join('')}</div>
              <div class="mn-linkrow"><button type="button" class="link-btn" data-pick="live">All live sites</button><button type="button" class="link-btn" data-pick="all">Every county site</button><button type="button" class="link-btn" data-pick="none">Clear</button></div>
              <span class="mn-help">Green dots are live sites. Counties still setting up get the push when their site launches.</span></div>
            <div class="mn-field">
              <label for="mn-prio" class="row" style="gap:8px">Priority <span class="badge" id="mn-prio-b"></span><span class="spacer"></span><b id="mn-prio-v" style="font-variant-numeric:tabular-nums"></b></label>
              <input type="range" class="mn-range" id="mn-prio" name="priority" min="0" max="100" step="5" value="${Number(d.priority)}">
              <span class="mn-help">Higher priority sits nearer the top of the county’s news. 100 is the top.</span></div>
            <label class="mn-switch" data-tour="push-lock"><input type="checkbox" id="mn-lock" name="locked"${d.locked ? ' checked' : ''}>
              <span><span class="mn-label">Lock on county sites</span><br><span class="mn-help">Counties can’t hide a locked item. Save locks for urgent alerts.</span></span></label>
            <div id="mn-alertnote"></div>
            <div class="mn-field" style="max-width:260px"><label for="mn-exp">Take down on (optional)</label>
              <input class="input" type="date" id="mn-exp" name="expires" min="${new Date().toISOString().slice(0, 10)}" value="${esc(d.expires)}"></div>
            <p class="mn-err" id="mn-err" role="alert"></p>
            <div class="mn-actions">
              <button type="submit" class="btn btn-master" id="mn-send" data-tour="push-publish"></button>
              <button type="button" class="btn btn-ghost" data-act="alert-preset">Make it a statewide alert</button>
              <button type="button" class="btn btn-ghost" data-act="cancel-edit" hidden>Cancel editing</button>
            </div>
          </div>
        </form>

        <div class="mn-sticky stack">
          <div class="card">
            <div class="card-head"><h3>How it lands</h3><span class="spacer"></span><label class="sr-only" for="mn-pvc">Preview county</label><select class="select" id="mn-pvc" style="width:auto;min-height:38px"></select></div>
            <div class="card-body"><div id="mn-preview" aria-live="polite"></div></div>
          </div>
        </div>
      </div>

      <div class="mn-block">
        <div class="mn-section-title"><h2>Pushes</h2><span class="small muted">The newest pushes are at the top. Each one shows whether a county is showing it or chose to hide it.</span></div>
        <div class="mn-hist" id="mn-hist"></div>
      </div>`;

    const $ = (s) => root.querySelector(s);
    let pvSlug = d.tenants.find(isLive) || ctx.tenantSlug;
    let endOpen = null;

    function syncFromForm() {
      d.title = $('#mn-title').value;
      d.summary = $('#mn-sum').value;
      d.tag = $('#mn-tag').value;
      d.tab = (root.querySelector('input[name="tab"]:checked') || {}).value || 'state';
      d.priority = Number($('#mn-prio').value);
      d.locked = $('#mn-lock').checked;
      d.expires = $('#mn-exp').value;
    }
    function drawMeta() {
      const p = Number(d.priority);
      $('#mn-prio-v').textContent = p;
      const b = $('#mn-prio-b');
      b.textContent = priorityLabel(p);
      b.className = 'badge ' + (p >= 100 ? 'badge-danger' : p >= 70 ? 'badge-warn' : '');
      $('#mn-sum-count').textContent = `${d.summary.length} of 300 characters`;
      const alert = p >= 100 && d.locked;
      $('#mn-alertnote').innerHTML = alert ? `<div class="mn-alertnote">${ALERT}<span>This is a statewide alert. It shows as a red banner at the top of every targeted county homepage, and counties can’t hide it.</span></div>` : '';
      const n = d.tenants.length;
      $('#mn-send').textContent = d.id ? 'Save changes' : n ? `Push to ${plural(n, 'county site')}` : 'Push news';
      root.querySelector('[data-act="cancel-edit"]').hidden = !d.id;
      root.querySelector('[data-act="alert-preset"]').hidden = alert;
      $('#mn-form-h').textContent = d.id ? 'Edit this push' : 'Write a network push';
      $('#mn-editing').innerHTML = d.id ? `<div class="mn-editing">${I('<path d="M13.5 3.5l3 3L8 15l-4 1 1-4z"/>', 16)}<span>You’re editing a live push. Saving updates it on every county site.</span></div>` : '';
      root.querySelectorAll('[data-county-pick]').forEach((c) => c.setAttribute('aria-pressed', String(d.tenants.includes(c.dataset.countyPick))));
      const pvc = $('#mn-pvc');
      const opts = liveSlugs();
      if (!opts.includes(pvSlug)) pvSlug = opts[0];
      pvc.innerHTML = opts.map((s) => `<option value="${esc(s)}"${s === pvSlug ? ' selected' : ''}>${esc(shortLabel(s))} homepage</option>`).join('');
    }
    function drawPreview() {
      const t = tenantsData()[pvSlug] || {};
      const c = t.colors || {};
      const p = Number(d.priority);
      const alert = p >= 100 && d.locked;
      const targeted = d.tenants.includes(pvSlug);
      const seedItems = ((t.news || {})[d.tab] || []).slice(0, 2);
      const title = d.title.trim() || 'Your headline appears here';
      const item = `<div class="mn-pv-item is-new"><div class="mn-pv-meta"><span class="badge badge-master">Master Network</span><span>${esc(d.tag)}</span>${d.locked ? `<span title="Locked" style="display:inline-flex">${LOCK}</span>` : ''}<span>just now</span></div>
        <h4>${esc(title)}</h4>${d.summary.trim() ? `<p>${esc(d.summary.trim())}</p>` : ''}</div>`;
      $('#mn-preview').innerHTML = `
        <div class="mn-pv" aria-label="Preview of the ${esc(t.shortName || '')} homepage">
          <div class="mn-pv-chrome"><i></i><i></i><i></i><span>${esc(t.domain || '')}</span></div>
          ${targeted && alert ? `<div class="mn-pv-alert"><span class="mn-pv-tag">Statewide alert</span><span><b>${esc(title)}</b>${d.summary.trim() ? esc(d.summary.trim()) : ''}</span></div>` : ''}
          <div class="mn-pv-bar" style="background:${esc(c.brand || 'var(--brand)')};color:${esc(c.brandInk || '#fff')};border-bottom:3px solid ${esc(c.accent || 'var(--accent)')}">${STAR}<span>${esc(t.shortName || '')}</span><small>${esc(t.county ? t.county + ' County' : '')}</small></div>
          <div class="mn-pv-body">
            <div class="mn-pv-tabs"><span${d.tab === 'national' ? ' class="on"' : ''}>National</span><span${d.tab === 'state' ? ' class="on"' : ''}>State</span><span>County</span><span>City</span></div>
            ${targeted && !alert ? item : ''}
            ${seedItems.map((n) => `<div class="mn-pv-item is-dim"><div class="mn-pv-meta"><span>${esc(n.source || '')}</span></div><h4>${esc(n.title)}</h4></div>`).join('')}
          </div>
        </div>
        <p class="small muted" style="margin-top:10px">${!targeted ? `${esc(shortLabel(pvSlug))} isn’t on the list, so its homepage won’t change.`
          : alert ? 'The banner sits above everything else on the homepage until you take it down.'
          : d.locked ? 'Locked: it stays in the news list on every targeted site.' : `${esc(shortLabel(pvSlug))} can hide or pin this from its Committee Portal.`}</p>`;
    }
    function drawHistory() {
      const live = pushes();
      const ended = archive().slice(0, 6);
      const box = $('#mn-hist');
      if (!live.length && !ended.length) {
        box.innerHTML = `<div class="mn-empty"><strong>Nothing pushed yet</strong>Your first push shows up here with each county’s delivery status.</div>`;
        return;
      }
      const row = (p, isEnded) => {
        const dl = isEnded ? [] : delivery(p);
        const badges = [isAlert(p) ? '<span class="badge badge-danger">Statewide alert</span>' : `<span class="badge">${p.tab === 'national' ? 'National' : 'State'}</span>`,
          `<span class="badge">${esc(p.tag || '')}</span>`, `<span class="badge">Priority ${Number(p.priority)}</span>`,
          p.locked ? `<span class="badge badge-master">${LOCK} Locked</span>` : '<span class="badge">Unlocked</span>'].join(' ');
        const when = isEnded
          ? `${p.endedReason === 'expired' ? 'Ended on its take-down date' : `Unpublished by ${esc(p.endedBy || '')}`} ${esc(ago(p.endedAt))}`
          : `Pushed ${esc(ago(p.createdAt))}${p.editedAt ? `, edited ${esc(ago(p.editedAt))}` : ''}${p.expiresAt ? ` · comes down ${esc(fmtDay(p.expiresAt))}` : ''}`;
        const acts = isEnded
          ? `<button class="btn btn-sm" data-act="repush" data-id="${esc(p.id)}">Push again</button>`
          : `<button class="btn btn-sm" data-act="edit" data-id="${esc(p.id)}">Edit</button>
             <button class="btn btn-sm" data-act="end" data-id="${esc(p.id)}" aria-expanded="${endOpen === p.id}">Set take-down date</button>
             <button class="btn btn-sm btn-ghost" data-act="unpublish" data-id="${esc(p.id)}">Unpublish</button>`;
        const endForm = !isEnded && endOpen === p.id ? `<div class="mn-endform"><div class="mn-field"><label for="mn-end-${esc(p.id)}">Take it down on</label>
            <input class="input" type="date" id="mn-end-${esc(p.id)}" min="${new Date().toISOString().slice(0, 10)}" value="${p.expiresAt ? esc(String(p.expiresAt).slice(0, 10)) : ''}"></div>
            <button class="btn btn-sm btn-master" data-act="end-save" data-id="${esc(p.id)}">Save date</button>
            ${p.expiresAt ? `<button class="btn btn-sm btn-ghost" data-act="end-clear" data-id="${esc(p.id)}">Keep it up</button>` : ''}</div>` : '';
        return `<article class="mn-h${isAlert(p) && !isEnded ? ' is-alert' : ''}${isEnded ? ' is-ended' : ''}">
          <div><div class="row" style="gap:6px">${badges}</div><h3>${esc(p.title)}</h3>${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
            <p class="small muted" style="margin-top:6px">${when} · ${esc((p.tenants || []).map(shortLabel).join(', ') || 'No counties')}</p></div>
          <div class="mn-h-acts">${acts}</div>
          ${dl.length ? `<div class="mn-deliv" aria-label="Delivery status">${dl.map((x) => `<span class="mn-dpill is-${x.state}"><i></i>${esc(x.text)}</span>`).join('')}</div>` : ''}
          ${endForm}
        </article>`;
      };
      box.innerHTML = live.map((p) => row(p, false)).join('') +
        (ended.length ? `<h3 style="margin:14px 0 0;font-size:1.05rem">Taken down</h3>` + ended.map((p) => row(p, true)).join('') : '');
    }
    function drawAll() { drawMeta(); drawPreview(); drawHistory(); }
    drawAll();

    root.addEventListener('input', () => { syncFromForm(); drawMeta(); drawPreview(); });
    root.addEventListener('change', (e) => {
      if (e.target.id === 'mn-pvc') { pvSlug = e.target.value; drawPreview(); return; }
      if (e.target.closest('#mn-form')) { syncFromForm(); drawMeta(); drawPreview(); }
    });
    root.addEventListener('click', (e) => {
      const pick = e.target.closest('[data-county-pick]');
      if (pick) {
        const s = pick.dataset.countyPick;
        d.tenants = d.tenants.includes(s) ? d.tenants.filter((x) => x !== s) : d.tenants.concat(s);
        if (d.tenants.includes(s) && isLive(s)) pvSlug = s;
        drawMeta(); drawPreview(); return;
      }
      const quick = e.target.closest('[data-pick]');
      if (quick) {
        const k = quick.dataset.pick;
        d.tenants = k === 'live' ? liveSlugs() : k === 'all' ? sites.map((c) => c.slug) : [];
        drawMeta(); drawPreview(); return;
      }
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const id = a.dataset.id;
      const act = a.dataset.act;
      if (act === 'alert-preset') {
        $('#mn-prio').value = 100; $('#mn-lock').checked = true; syncFromForm(); drawMeta(); drawPreview();
      } else if (act === 'cancel-edit') {
        draft = blankDraft(); renderPush(parent, ctx);
      } else if (act === 'edit') {
        const p = pushes().find((x) => x.id === id);
        if (!p) return;
        draft = { id: p.id, title: p.title || '', summary: p.summary || '', tag: p.tag || 'Election', source: p.source || 'Master Network', tab: p.tab || 'state',
          tenants: (p.tenants || []).slice(), priority: Number(p.priority) || 0, locked: !!p.locked, expires: p.expiresAt ? String(p.expiresAt).slice(0, 10) : '' };
        renderPush(parent, ctx);
        const f = parent.querySelector('#mn-form');
        if (f) f.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
        ctx.toast(`“${p.title}” is ready to edit in the form above.`, 'info');
      } else if (act === 'end') {
        endOpen = endOpen === id ? null : id; drawHistory();
        const inp = root.querySelector(`#mn-end-${CSS.escape(id)}`); if (inp) inp.focus();
      } else if (act === 'end-save') {
        const inp = root.querySelector(`#mn-end-${CSS.escape(id)}`);
        if (!inp || !inp.value) { if (inp) inp.focus(); return; }
        G().update('networkPushes', id, { expiresAt: new Date(inp.value + 'T23:59:59').toISOString() });
        endOpen = null;
        ctx.toast(`This push comes down at the end of ${fmtDay(inp.value)}.`, 'ok');
      } else if (act === 'end-clear') {
        G().update('networkPushes', id, { expiresAt: null }); endOpen = null;
        ctx.toast('This push stays up until you unpublish it.', 'ok');
      } else if (act === 'unpublish') {
        const p = pushes().find((x) => x.id === id);
        if (!p) return;
        const rec = endPush(p, 'unpublished', false);
        if (draft && draft.id === id) draft = blankDraft();
        const tt = ctx.toast('', 'ok', { html: `Unpublished “${esc(p.title)}”. It’s gone from ${plural((p.tenants || []).length, 'county site')}. <button type="button" class="link-btn" style="color:#fff;margin:0 0 0 6px;padding:0" data-undo>Undo</button>`, duration: 6000 });
        const ub = tt && tt.querySelector('[data-undo]');
        if (ub) ub.addEventListener('click', () => {
          const back = Object.assign({}, p);
          G().remove('networkPushArchive', rec.id);
          G().add('networkPushes', back);
          ctx.toast('The push is back on every county site.', 'ok');
        });
      } else if (act === 'repush') {
        const p = archive().find((x) => x.id === id);
        if (!p) return;
        draft = { id: null, title: p.title || '', summary: p.summary || '', tag: p.tag || 'Election', source: 'Master Network', tab: p.tab || 'state',
          tenants: (p.tenants || []).slice(), priority: Number(p.priority) || 0, locked: !!p.locked, expires: '' };
        renderPush(parent, ctx);
        parent.querySelector('#mn-title').focus();
        ctx.toast('The form has this push again. Check it, then push it.', 'info');
      }
    });
    root.querySelector('#mn-form').addEventListener('submit', (e) => {
      e.preventDefault();
      syncFromForm();
      const err = $('#mn-err');
      err.textContent = '';
      if (!d.title.trim()) { err.textContent = 'Add a headline before you push.'; $('#mn-title').focus(); return; }
      if (!d.tenants.length) { err.textContent = 'Choose at least one county.'; root.querySelector('[data-county-pick]').focus(); return; }
      const doc = {
        title: d.title.trim(), summary: d.summary.trim(), tag: d.tag, source: d.source || 'Master Network',
        tenants: d.tenants.slice(), locked: !!d.locked, priority: Math.max(0, Math.min(100, Number(d.priority) || 0)),
        tab: d.tab === 'national' ? 'national' : 'state',
      };
      if (d.expires) doc.expiresAt = new Date(d.expires + 'T23:59:59').toISOString();
      else if (d.id) doc.expiresAt = null;
      const alert = doc.locked && doc.priority >= 100;
      if (d.id) {
        G().update('networkPushes', d.id, Object.assign(doc, { editedAt: new Date().toISOString(), editedBy: userName() }));
        ctx.toast(`Saved. ${plural(doc.tenants.length, 'county site')} now show the new version.`, 'ok');
      } else {
        G().add('networkPushes', doc);
        ctx.toast(alert ? `Statewide alert is up on ${plural(doc.tenants.length, 'county site')}.` : `Pushed to ${plural(doc.tenants.length, 'county site')}.`, 'ok');
      }
      draft = blankDraft();
      renderPush(parent, ctx);
      const h = parent.querySelector('.mn-h');
      if (h) h.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
    });

    pushRefresh = () => { if (root.isConnected) drawHistory(); };
  }

  /* ================= NETWORK ADS ================= */
  function adPreview(a) {
    const p = a.placement || 'IN_FEED';
    const cls = p === 'HEADER_BANNER' ? ' is-banner' : p === 'SIDEBAR_BOTTOM' ? ' is-side' : '';
    return `<div class="mn-adv${cls}"><div class="mn-adv-txt"><span class="mn-adv-k">Sponsored · ${esc((PLACEMENTS[p] || {}).label || '')}</span>
      <strong>${esc(a.title || 'Your ad headline')}</strong><small>${esc(a.sponsor || 'Sponsor name')}</small></div>
      <span class="mn-adv-cta">${esc(a.cta || 'Learn more')}</span></div>`;
  }
  function validUrl(u) { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch (e) { return false; } }

  function openAdEditor(ctx, existing) {
    const a = Object.assign({ placement: 'IN_FEED', title: '', sponsor: 'RCCC Network', cta: 'Learn more', url: 'https://', tenants: liveSlugs(), active: true }, existing || {});
    const sites = siteCounties();
    const m = ctx.modal({
      title: existing ? 'Edit network ad' : 'New network ad',
      html: `<form class="stack scr-master" id="mn-adf" novalidate>
        <div class="mn-field"><label for="mn-a-title">Ad headline</label><input class="input" id="mn-a-title" maxlength="90" value="${esc(a.title)}" placeholder="For example: Become a poll observer on Election Day"></div>
        <div class="mn-two">
          <div class="mn-field"><label for="mn-a-sponsor">Sponsor</label><input class="input" id="mn-a-sponsor" maxlength="60" value="${esc(a.sponsor)}"></div>
          <div class="mn-field"><label for="mn-a-cta">Button text</label><input class="input" id="mn-a-cta" maxlength="24" value="${esc(a.cta)}"></div>
        </div>
        <div class="mn-field"><label for="mn-a-url">Button link</label><input class="input" id="mn-a-url" type="url" inputmode="url" value="${esc(a.url)}"></div>
        <div class="mn-field"><label for="mn-a-place">Slot</label><select class="select" id="mn-a-place">${Object.keys(PLACEMENTS).map((p) => `<option value="${p}"${p === a.placement ? ' selected' : ''}>${PLACEMENTS[p].label}: ${PLACEMENTS[p].where.toLowerCase()}</option>`).join('')}</select></div>
        <div class="mn-field"><span class="mn-label" id="mn-a-ct">Counties</span>
          <div class="mn-chips" role="group" aria-labelledby="mn-a-ct">${sites.map((c) => `<button type="button" class="mn-chip" data-ad-county="${esc(c.slug)}" aria-pressed="${(a.tenants || []).includes(c.slug)}"><i class="mn-dot${c.status === 'live' ? '' : ' is-setup'}" aria-hidden="true"></i>${esc(shortLabel(c.slug))}</button>`).join('')}</div></div>
        <label class="mn-switch"><input type="checkbox" id="mn-a-active"${a.active ? ' checked' : ''}><span><span class="mn-label">Running</span><br><span class="mn-help">Turn this off to save the ad without showing it.</span></span></label>
        <div class="mn-field"><span class="mn-label">Preview</span><div id="mn-a-pv"></div></div>
        <p class="mn-err" id="mn-a-err" role="alert"></p>
      </form>`,
      actions: [
        { label: 'Cancel' },
        { label: existing ? 'Save ad' : 'Start running this ad', primary: true, onClick(api) {
          const b = api.body;
          const v = (id) => (b.querySelector(id).value || '').trim();
          const err = b.querySelector('#mn-a-err');
          const doc = { placement: v('#mn-a-place'), title: v('#mn-a-title'), sponsor: v('#mn-a-sponsor') || 'RCCC Network', cta: v('#mn-a-cta') || 'Learn more',
            url: v('#mn-a-url'), tenants: Array.from(b.querySelectorAll('[data-ad-county][aria-pressed="true"]')).map((x) => x.dataset.adCounty), active: b.querySelector('#mn-a-active').checked };
          if (!doc.title) { err.textContent = 'Add a headline for the ad.'; b.querySelector('#mn-a-title').focus(); return false; }
          if (!validUrl(doc.url)) { err.textContent = 'Add a full link that starts with https://'; b.querySelector('#mn-a-url').focus(); return false; }
          if (!doc.tenants.length) { err.textContent = 'Choose at least one county.'; return false; }
          if (existing) { G().update('networkAds', existing.id, doc); ctx.toast(`Saved “${doc.title}”.`, 'ok'); }
          else { G().add('networkAds', doc); ctx.toast(doc.active ? `“${doc.title}” is running on ${plural(doc.tenants.length, 'county site')}.` : `“${doc.title}” is saved and paused.`, 'ok'); }
          return true;
        } },
      ],
    });
    const body = m.body;
    const pv = () => {
      body.querySelector('#mn-a-pv').innerHTML = adPreview({ placement: body.querySelector('#mn-a-place').value, title: body.querySelector('#mn-a-title').value.trim(),
        sponsor: body.querySelector('#mn-a-sponsor').value.trim(), cta: body.querySelector('#mn-a-cta').value.trim() });
    };
    body.addEventListener('input', pv);
    body.addEventListener('change', pv);
    body.addEventListener('click', (e) => {
      const c = e.target.closest('[data-ad-county]');
      if (c) c.setAttribute('aria-pressed', String(c.getAttribute('aria-pressed') !== 'true'));
    });
    body.querySelector('#mn-adf').addEventListener('submit', (e) => e.preventDefault());
    pv();
  }

  let adsRefresh = null;
  function renderAds(parent, ctx) {
    const root = fresh(parent);
    function draw() {
      const list = ads();
      const live = liveSlugs();
      const places = Object.keys(PLACEMENTS).map((p) => `<div class="card mn-place">
          <div><h3>${PLACEMENTS[p].label}</h3><span class="small muted">${PLACEMENTS[p].where}</span></div>
          ${live.map((s) => { const r = adFor(s, p); return `<div class="mn-slotline"><b>${esc(shortLabel(s))}</b><span>${r ? esc(r.ad.title) : 'Empty'}${r && r.seed ? ' <span class="mn-sample">Sample</span>' : ''}</span></div>`; }).join('')}
        </div>`).join('');
      const rows = list.length ? list.map((a) => `<article class="mn-ad${a.active ? '' : ' is-paused'}">
          <div><div class="row" style="gap:6px"><span class="badge ${a.active ? 'badge-ok' : ''}">${a.active ? 'Running' : 'Paused'}</span><span class="badge badge-master">${esc((PLACEMENTS[a.placement] || {}).label || a.placement)}</span></div>
            <h3>${esc(a.title)}</h3><div class="small muted">${esc(a.sponsor)} · button “${esc(a.cta)}” · ${esc((a.tenants || []).map(shortLabel).join(', '))} · added ${esc(ago(a.createdAt))}</div></div>
          <div class="mn-actions">
            <button class="btn btn-sm" data-act="toggle" data-id="${esc(a.id)}">${a.active ? 'Pause' : 'Resume'}</button>
            <button class="btn btn-sm" data-act="edit" data-id="${esc(a.id)}">Edit</button>
            <button class="btn btn-sm btn-ghost" data-act="delete" data-id="${esc(a.id)}">Delete</button>
          </div></article>`).join('')
        : `<div class="mn-empty"><strong>No network ads yet</strong>Sample ads fill the three network slots until you add your own.</div>`;
      root.innerHTML = `
        <div class="mn-section-title"><h2>What each slot shows right now</h2><span class="small muted">The newest running ad for a county wins its slot. A sample fills any slot you haven’t claimed.</span></div>
        <div class="mn-places" data-tour="master-ads">${places}</div>
        <div class="mn-block">
          <div class="mn-section-title"><h2>Network ads</h2><span class="spacer"></span><button class="btn btn-master" data-act="new">New network ad</button></div>
          <div class="mn-adlist">${rows}</div>
        </div>
        <div class="mn-block grid-2" style="align-items:start">
          <div class="card"><div class="card-body"><h3 style="font-size:1.05rem;margin:0 0 6px">Every county page has two kinds of ad slots</h3><p class="small" style="margin:0;color:var(--ink-2)"> Network slots carry ads from Master Network. Local slots always belong to the county, so its sponsors and its events keep their place on its site.</p></div></div>
          <div class="card"><div class="card-body stack">
            <div class="small muted">How the two kinds look on a county page</div>
            ${adPreview((adFor(ctx.tenantSlug, 'IN_FEED') || { ad: {} }).ad)}
            <div class="ad-slot local"><strong>${esc(((ctx.tenant.localAds || [])[0] || {}).sponsor || 'Your local sponsor')}</strong><div class="small muted">Set by ${esc(ctx.tenant.shortName || 'your county')}</div></div>
          </div></div>
        </div>`;
    }
    draw();
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = ads().find((x) => x.id === b.dataset.id);
      if (b.dataset.act === 'new') openAdEditor(ctx, null);
      else if (b.dataset.act === 'edit' && a) openAdEditor(ctx, a);
      else if (b.dataset.act === 'toggle' && a) { G().update('networkAds', a.id, { active: !a.active }); ctx.toast(a.active ? `Paused “${a.title}”.` : `“${a.title}” is running again.`, 'ok'); }
      else if (b.dataset.act === 'delete' && a) {
        ctx.modal({ title: 'Delete this ad?', html: `<p>“${esc(a.title)}” comes off every county site, and the sample ad fills its slot again.</p>`,
          actions: [{ label: 'Keep it' }, { label: 'Delete ad', primary: true, onClick: () => { G().remove('networkAds', a.id); ctx.toast('Ad deleted.', 'ok'); } }] });
      }
    });
    adsRefresh = () => { if (root.isConnected) draw(); };
  }

  /* ================= ANALYTICS ================= */
  const METRICS = {
    visitors: { label: 'Visitors', long: 'Weekly visitors across the network', usd: false },
    signups: { label: 'Sign-ups', long: 'Weekly volunteer and newsletter sign-ups', usd: false },
    donationsUsd: { label: 'Donations', long: 'Weekly online donations', usd: true },
  };
  let metric = 'visitors';
  function fmtWeek(w) { return new Date(w + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
  function niceStep(max, ticks) {
    const raw = max / ticks;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }

  function drawLine(host, weekly, animate) {
    const M = METRICS[metric];
    const W = Math.max(280, Math.floor(host.clientWidth));
    const small = W < 520;
    const H = small ? 230 : 290;
    const pad = { l: small ? 44 : 56, r: small ? 46 : 64, t: 16, b: 34 };
    const vals = weekly.map((w) => w[metric]);
    const n = vals.length;
    const step = niceStep(Math.max(...vals), 4);
    const yMax = Math.ceil(Math.max(...vals) / step) * step;
    const x = (i) => pad.l + i * (W - pad.l - pad.r) / (n - 1);
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / yMax);
    const full = (v) => M.usd ? U.fmtUsd(v) : U.fmtNum(v);
    let grid = '';
    for (let v = 0; v <= yMax + 1e-9; v += step) {
      grid += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>
        <text x="${pad.l - 8}" y="${y(v)}" dy=".32em" text-anchor="end" font-size="12.5" fill="var(--ink-3)">${compact(v, M.usd)}</text>`;
    }
    const every = small ? 4 : 2;
    let xl = '';
    weekly.forEach((w, i) => {
      if ((i % every === 0 && n - 1 - i >= every) || i === n - 1) xl += `<text x="${x(i)}" y="${H - pad.b + 20}" text-anchor="middle" font-size="12.5" fill="var(--ink-3)">${fmtWeek(w.week)}</text>`;
    });
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const line = 'M' + pts.join('L');
    const area = `${line}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
    const last = vals[n - 1];
    host.innerHTML = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="${esc(M.long)}, ${fmtWeek(weekly[0].week)} to ${fmtWeek(weekly[n - 1].week)}. Latest week ${full(last)}. Use the left and right arrow keys to read each week.">
        ${grid}
        <line x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line-strong)"/>
        ${xl}
        <path class="${animate ? 'mn-area' : ''}" d="${area}" fill="var(--master)" fill-opacity=".1"/>
        <path class="${animate ? 'mn-line' : ''}" d="${line}" fill="none" stroke="var(--master)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${x(n - 1)}" cy="${y(last)}" r="5" fill="var(--master)" stroke="var(--surface)" stroke-width="2"/>
        <text x="${x(n - 1) + 9}" y="${y(last)}" dy=".32em" font-size="13" font-weight="700" fill="var(--ink)">${compact(last, M.usd)}</text>
        <g class="mn-hover" style="display:none"><line class="mn-cross" y1="${pad.t}" y2="${y(0)}" stroke="var(--ink-3)"/><circle class="mn-hdot" r="5" fill="var(--master)" stroke="var(--surface)" stroke-width="2"/></g>
        <rect class="mn-hit" x="${pad.l - 10}" y="0" width="${W - pad.l - pad.r + 20}" height="${H}" fill="transparent"/>
      </svg>`;
    const path = host.querySelector('.mn-line');
    if (path && path.getTotalLength) path.style.setProperty('--len', Math.ceil(path.getTotalLength()));
    const svg = host.querySelector('svg');
    const hov = svg.querySelector('.mn-hover'), cross = svg.querySelector('.mn-cross'), hdot = svg.querySelector('.mn-hdot');
    let cur = n - 1;
    const show = (i, ev) => {
      cur = Math.max(0, Math.min(n - 1, i));
      const cx = x(cur), cy = y(vals[cur]);
      hov.style.display = '';
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx);
      hdot.setAttribute('cx', cx); hdot.setAttribute('cy', cy);
      const r = svg.getBoundingClientRect();
      tip(`<b>${full(vals[cur])}</b>${esc(M.label)}, week of ${fmtWeek(weekly[cur].week)}`, r.left + cx * (r.width / W), r.top + cy * (r.height / H));
    };
    const hide = () => { hov.style.display = 'none'; tip(null); };
    const toIdx = (e) => { const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) * (W / r.width); return Math.round((px - pad.l) / ((W - pad.l - pad.r) / (n - 1))); };
    const hit = svg.querySelector('.mn-hit');
    hit.addEventListener('pointermove', (e) => show(toIdx(e)));
    hit.addEventListener('pointerdown', (e) => show(toIdx(e)));
    hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    svg.addEventListener('focus', () => show(cur));
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', (e) => {
      const k = { ArrowLeft: cur - 1, ArrowRight: cur + 1, Home: 0, End: n - 1 }[e.key];
      if (k != null) { e.preventDefault(); show(k); }
    });
  }

  /* One floating tooltip for the analytics tab. */
  let tipEl = null;
  function tip(html, px, py) {
    if (!tipEl || !tipEl.isConnected) return;
    if (html == null) { tipEl.style.display = 'none'; return; }
    tipEl.innerHTML = html;
    tipEl.style.display = 'block';
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    tipEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, px - w / 2)) + 'px';
    tipEl.style.top = Math.max(8, py - h - 12) + 'px';
  }

  function renderAnalytics(parent, ctx) {
    const root = fresh(parent);
    const N = net();
    const weekly = N.weekly || [];
    const data = liveSlugs().map(countyStats);
    const tot = savedTotals();
    const days = Math.max(0, Math.ceil((Date.parse(ELECTION + 'T00:00:00') - Date.now()) / 86400000));
    const savedCount = tot.live.reduce((a, s) => a + s.recent.length, 0);

    /* small multiples: each question gets its own scale */
    const ROWS = [
      { key: 'rsvps', q: 'Who is showing up?', sub: 'Event RSVPs, guests included', usd: false },
      { key: 'volunteers', q: 'Who is signing up to help?', sub: 'Volunteers on file', usd: false },
      { key: 'doors', q: 'Who is knocking doors?', sub: 'Doors knocked this cycle', usd: false },
      { key: 'donations', q: 'Where is the money coming from?', sub: 'Raised online this cycle', usd: true },
      { key: 'memberships', q: 'Who is growing the party?', sub: 'New members who joined on the site', usd: false, empty: 'No memberships yet this cycle. They show up here when someone joins on a county site.' },
      { key: 'votes', q: 'Who is voting in meetings?', sub: 'Ballots cast in Meetings & Voting', usd: false, empty: 'No meeting ballots cast yet. They show up here once a county opens voting at a central committee meeting.' },
    ];
    const fmtV = (v, usd) => usd ? U.fmtUsd(v) : U.fmtNum(v);
    const cmp = ROWS.map((r) => {
      const max = Math.max(1, ...data.map((s) => s[r.key].seed + s[r.key].saved));
      const bars = data.map((s) => {
        const seed = s[r.key].seed, saved = s[r.key].saved, total = seed + saved;
        const col = SERIES[s.slug] || 'var(--master)';
        const pct = total / max * 100;
        const seedPct = total ? seed / total * 100 : 0;
        const label = `${shortLabel(s.slug)}: ${fmtV(total, r.usd)}${saved ? `, ${fmtV(saved, r.usd)} saved on this platform` : ''}`;
        return `<div class="mn-bar" tabindex="0" data-tip="${esc(`<b>${fmtV(total, r.usd)}</b>${shortLabel(s.slug)} · ${r.sub}${seed ? `<br>${fmtV(seed, r.usd)} sample starting figure` : ''}<br>${fmtV(saved, r.usd)} saved by people on the site`)}" aria-label="${esc(label)}">
          <span class="mn-bar-name">${esc(s.slug === 'demo' ? 'Demo' : shortLabel(s.slug))}</span>
          <span class="mn-bar-track"><span class="mn-bar-fill" style="width:${Math.max(total ? 1.5 : 0, pct).toFixed(2)}%">${seed ? `<i style="width:${seedPct.toFixed(2)}%;background:${col};opacity:.55"></i>` : ''}${saved ? `<i style="flex:1;background:${col}"></i>` : ''}</span></span>
          <span class="mn-bar-val">${r.usd ? compact(total, true) : U.fmtNum(total)}${saved ? `<small>+${r.usd ? compact(saved, true) : U.fmtNum(saved)}</small>` : ''}</span></div>`;
      }).join('');
      if (max <= 1 && data.every((x) => !(x[r.key].seed + x[r.key].saved))) return `<div class="mn-cmp-row"><div class="mn-cmp-q">${r.q}<small>${r.sub}</small></div><p class="mn-cmp-empty">${esc(r.empty || 'Nothing saved yet.')}</p></div>`;
      return `<div class="mn-cmp-row"><div class="mn-cmp-q">${r.q}<small>${r.sub}</small></div><div class="mn-bars">${bars}</div></div>`;
    }).join('');

    const turfCards = data.map((s) => {
      const doors = s.turfs.reduce((a, t) => a + t.doors, 0), done = s.turfs.reduce((a, t) => a + t.done, 0);
      const col = SERIES[s.slug] || 'var(--master)';
      const sorted = s.turfs.slice().sort((a, b) => (a.done / a.doors) - (b.done / b.doors));
      return `<div><div class="mn-turf-h"><h3>${esc(countyLabel(s.slug))}</h3><span class="small muted">${Math.round(done / Math.max(1, doors) * 100)}% of ${U.fmtNum(doors)} doors</span></div>
        <div class="mn-bars">${sorted.map((t) => {
          const pct = t.done / t.doors * 100;
          return `<div class="mn-bar" tabindex="0" data-tip="${esc(`<b>${U.fmtNum(t.done)} of ${U.fmtNum(t.doors)} doors</b>${t.name}<br>${U.fmtNum(t.doors - t.done)} doors left${t.extra ? `<br>${U.fmtNum(t.extra)} logged on this platform` : ''}`)}" aria-label="${esc(`${t.name}: ${Math.round(pct)} percent knocked, ${t.doors - t.done} doors left`)}">
            <span class="mn-bar-name" title="${esc(t.name)}">${esc(t.name)}</span>
            <span class="mn-bar-track" style="background:var(--surface-2);box-shadow: inset 0 0 0 1px var(--line)"><span class="mn-bar-fill" style="width:${pct.toFixed(2)}%"><i style="flex:1;background:${col}"></i></span></span>
            <span class="mn-bar-val">${Math.round(pct)}%</span></div>`;
        }).join('')}</div></div>`;
    }).join('');

    function crmSection() {
      const cs = crmStats();
      if (!cs.length) return '';
      const pctRow = (q, sub, key, extra) => `<div class="mn-cmp-row"><div class="mn-cmp-q">${q}<small>${sub}</small></div><div class="mn-bars">${cs.map((x) => {
        const v = Number(x[key]) || 0, col = SERIES[x.slug] || 'var(--master)';
        const note = extra ? extra(x) : '';
        const none = key === 'responseRate' && !x.callsMade;
        return `<div class="mn-bar" tabindex="0" data-tip="${esc(`<b>${none ? 'No calls yet' : v + '%'}</b>${shortLabel(x.slug)} · ${sub}${note ? '<br>' + note : ''}`)}" aria-label="${esc(`${shortLabel(x.slug)}: ${none ? 'no calls logged yet' : v + ' percent'}`)}">
          <span class="mn-bar-name">${esc(x.slug === 'demo' ? 'Demo' : shortLabel(x.slug))}</span>
          <span class="mn-bar-track" style="background:var(--surface-2);box-shadow: inset 0 0 0 1px var(--line)"><span class="mn-bar-fill" style="width:${Math.min(100, v).toFixed(1)}%"><i style="flex:1;background:${col}"></i></span></span>
          <span class="mn-bar-val">${none ? '<span class="muted" style="font-weight:600">No calls yet</span>' : v + '%'}</span></div>`;
      }).join('')}</div></div>`;
      const maxP = Math.max(1, ...cs.map((x) => x.people || 0));
      const growth = `<div class="mn-cmp-row"><div class="mn-cmp-q">Whose list is growing?<small>People on the committee list, with the share added this month</small></div><div class="mn-bars">${cs.map((x) => {
        const col = SERIES[x.slug] || 'var(--master)';
        const total = x.people || 0, nw = Math.min(total, x.newThisMonth || 0);
        return `<div class="mn-bar" tabindex="0" data-tip="${esc(`<b>${U.fmtNum(total)} people</b>${shortLabel(x.slug)}<br>${U.fmtNum(nw)} added this month<br>${U.fmtNum(x.volunteers || 0)} volunteers · ${U.fmtNum(x.donors || 0)} donors`)}" aria-label="${esc(`${shortLabel(x.slug)}: ${total} people, ${nw} new this month`)}">
          <span class="mn-bar-name">${esc(x.slug === 'demo' ? 'Demo' : shortLabel(x.slug))}</span>
          <span class="mn-bar-track"><span class="mn-bar-fill" style="width:${(total / maxP * 100).toFixed(1)}%">${total - nw ? `<i style="width:${((total - nw) / Math.max(1, total) * 100).toFixed(1)}%;background:${col};opacity:.55"></i>` : ''}${nw ? `<i style="flex:1;background:${col}"></i>` : ''}</span></span>
          <span class="mn-bar-val">${U.fmtNum(total)}${nw ? `<small>+${U.fmtNum(nw)}</small>` : ''}</span></div>`;
      }).join('')}</div></div>`;
      return `<div class="mn-block card" data-tour="master-crm">
        <div class="card-head"><h3>Which counties are growing their lists, and are people answering?</h3></div>
        <div class="card-body">
          <div class="mn-cmp">${growth}
            ${pctRow('Can we email them?', 'Share of the list opted in to email', 'emailOptInRate')}
            ${pctRow('Can we text them?', 'Share of the list opted in to texts', 'smsOptInRate')}
            ${pctRow('Are people answering?', 'Phone bank calls where someone talked', 'responseRate', (x) => `${U.fmtNum(x.callsMade || 0)} calls made · ${U.fmtNum(x.messagesSent || 0)} messages sent`)}
          </div>
          <p class="small muted" style="margin:12px 0 0">Master Network sees these totals only. Names, contact details and notes stay with each county.</p>
          <details class="mn-tbl"><summary>Show these numbers as a table</summary><div class="table-wrap"><table class="table"><thead><tr><th>Measure</th>${cs.map((x) => `<th class="num">${esc(shortLabel(x.slug))}</th>`).join('')}</tr></thead><tbody>
            ${[['People on the list', 'people', ''], ['Added this month', 'newThisMonth', ''], ['Volunteers', 'volunteers', ''], ['Donors', 'donors', ''], ['Email opt-in', 'emailOptInRate', '%'], ['Text opt-in', 'smsOptInRate', '%'], ['Calls made', 'callsMade', ''], ['Calls that reached someone', 'responseRate', '%'], ['Messages sent', 'messagesSent', ''], ['Interactions, last 30 days', 'interactions30d', '']]
              .map(([l, k, u]) => `<tr><td>${l}</td>${cs.map((x) => `<td class="num">${u ? (x[k] || 0) + u : U.fmtNum(x[k] || 0)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>
        </div></div>`;
    }

    const recent = tot.live.flatMap((s) => s.recent).sort((a, b) => String(b.doc.createdAt || '').localeCompare(String(a.doc.createdAt || ''))).slice(0, 8);
    const feed = recent.length ? `<ul class="mn-feed">${recent.map((r) => {
      const d = r.doc;
      return `<li><span class="mn-feed-dot" style="background:${SERIES[r.slug] || 'var(--master)'}" aria-hidden="true"></span><span class="mn-feed-txt">${esc(activitySentence(r))}</span><span class="small muted" style="white-space:nowrap">${esc(ago(d.createdAt))}</span></li>`;
    }).join('')}</ul>`
      : `<div class="mn-empty"><strong>No sign-ups saved yet</strong>When someone RSVPs, volunteers, joins, gives or logs a door on a county site, it shows up here.</div>`;

    root.innerHTML = `
      <div class="mn-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))" data-tour="master-analytics-kpis">
        <div class="kpi"><div class="kpi-value" data-count="${days}">0</div><div class="kpi-label">Days to Election Day</div><div class="mn-kpi-note">Tuesday, Nov 3, 2026</div></div>
        <div class="kpi"><div class="kpi-value" data-count="${savedCount}">0</div><div class="kpi-label">Actions saved on county sites</div><div class="mn-kpi-note">RSVPs, sign-ups, gifts, doors and votes</div></div>
        <div class="kpi"><div class="kpi-value" data-count="${data.reduce((a, s) => a + s.doors.seed + s.doors.saved, 0)}">0</div><div class="kpi-label">Doors knocked</div><div class="mn-kpi-note">${tot.doors ? `<b>${U.fmtNum(tot.doors)}</b> logged on this platform` : 'Sample starting figure'}</div></div>
        <div class="kpi"><div class="kpi-value" data-count="${Math.round(data.reduce((a, s) => a + s.donations.seed + s.donations.saved, 0))}" data-fmt="usd">0</div><div class="kpi-label">Raised online by live counties</div><div class="mn-kpi-note">${tot.donations ? `<b>${U.fmtUsd(tot.donations)}</b> given on this platform` : 'Sample starting figure'}</div></div>
      </div>

      <div class="mn-block card" data-tour="master-analytics">
        <div class="card-head"><h3>How the live counties compare</h3><span class="spacer"></span>
          <div class="mn-key">${data.map((s) => `<span><i style="background:${SERIES[s.slug]}"></i>${esc(shortLabel(s.slug))}</span>`).join('')}<span><i style="background:var(--ink-3);opacity:.45"></i>Lighter part: sample starting figure</span></div></div>
        <div class="card-body"><div class="mn-cmp" id="mn-cmp">${cmp}</div>
          <details class="mn-tbl"><summary>Show these numbers as a table</summary><div class="table-wrap"><table class="table"><thead><tr><th>Measure</th>${data.map((s) => `<th class="num">${esc(shortLabel(s.slug))}</th>`).join('')}</tr></thead>
            <tbody>${ROWS.map((r) => `<tr><td>${r.sub}</td>${data.map((s) => `<td class="num">${fmtV(s[r.key].seed + s[r.key].saved, r.usd)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details></div>
      </div>

      ${crmSection()}

      <div class="mn-block card">
        <div class="card-head"><h3>Where should the next canvass go?</h3><span class="spacer"></span><span class="small muted">Turfs with the most doors left are at the top</span></div>
        <div class="card-body"><div class="mn-turfs" id="mn-turfs">${turfCards}</div></div>
      </div>

      <div class="mn-block grid-2" style="align-items:start">
        <div class="card">
          <div class="card-head"><h3 id="mn-chart-title"></h3><span class="mn-sample">Sample</span><span class="spacer"></span>
            <div class="row" role="group" aria-label="Choose a measure" style="gap:6px">${Object.keys(METRICS).map((m) => `<button type="button" class="chip${m === metric ? ' active' : ''}" data-metric="${m}" aria-pressed="${m === metric}">${METRICS[m].label}</button>`).join('')}</div></div>
          <div class="card-body"><div class="mn-chart" id="mn-chart"></div>
            <p class="small muted" style="margin-top:6px">Weeks from ${weekly.length ? fmtWeek(weekly[0].week) : ''} to ${weekly.length ? fmtWeek(weekly[weekly.length - 1].week) : ''}, every county on the network. Hover, tap or use the arrow keys to read each week.</p>
            <details class="mn-tbl"><summary>Show the weekly numbers</summary><div class="table-wrap" id="mn-wtable"></div></details></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Latest on the county sites</h3></div>
          <div class="card-body">${feed}</div>
        </div>
      </div>
      <div class="mn-tip" role="tooltip"></div>`;
    tipEl = root.querySelector('.mn-tip');
    animateCounts(root);
    requestAnimationFrame(() => requestAnimationFrame(() => { root.querySelectorAll('.mn-bars').forEach((b) => b.classList.add('is-drawn')); }));

    const host = root.querySelector('#mn-chart');
    function redraw(animate) {
      const M = METRICS[metric];
      root.querySelector('#mn-chart-title').textContent = M.long;
      const f = (v) => M.usd ? U.fmtUsd(v) : U.fmtNum(v);
      root.querySelector('#mn-wtable').innerHTML = `<table class="table"><thead><tr><th>Week starting</th><th class="num">${esc(M.label)}</th></tr></thead><tbody>${weekly.map((w) => `<tr><td>${fmtWeek(w.week)}</td><td class="num">${f(w[metric])}</td></tr>`).join('')}</tbody></table>`;
      if (weekly.length > 1) drawLine(host, weekly, animate);
    }
    redraw(true);
    let lastW = host.clientWidth;
    let ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(() => { if (!host.isConnected) { ro.disconnect(); return; } if (Math.abs(host.clientWidth - lastW) > 4) { lastW = host.clientWidth; redraw(false); } });
      ro.observe(host);
    }
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-metric]');
      if (!b) return;
      metric = b.dataset.metric;
      root.querySelectorAll('[data-metric]').forEach((c) => { const on = c.dataset.metric === metric; c.classList.toggle('active', on); c.setAttribute('aria-pressed', on); });
      redraw(true);
    });
    const showBarTip = (el) => { const r = el.querySelector('.mn-bar-track').getBoundingClientRect(); tip(el.dataset.tip, r.left + Math.min(r.width, 120), r.top); };
    root.addEventListener('pointerover', (e) => { const b = e.target.closest('.mn-bar[data-tip]'); if (b) showBarTip(b); });
    root.addEventListener('pointerout', (e) => { const b = e.target.closest('.mn-bar[data-tip]'); if (b && !b.contains(e.relatedTarget)) tip(null); });
    root.addEventListener('focusin', (e) => { const b = e.target.closest('.mn-bar[data-tip]'); if (b) showBarTip(b); });
    root.addEventListener('focusout', (e) => { if (e.target.closest('.mn-bar[data-tip]')) tip(null); });
    const onScroll = () => tip(null);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (ro) ro.disconnect(); };
  }

  /* ================= register ================= */
  let teardown = [];
  function cleanup() { teardown.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); teardown = []; }

  App.register({
    id: 'master',
    title: 'Master Network Console',
    group: 'Master Network',
    minRole: 'master',
    icon: ICON,
    blurb: 'Push news and alerts to county sites, run network ads, and compare how each county is doing.',
    render(el, ctx) {
      injectStyles();
      cleanup();
      const swept = sweepExpired();
      el.classList.add('scr-master');
      const sub = TABS.some((t) => t.sub === ctx.sub) ? ctx.sub : '';
      el.innerHTML = `<div class="page">${chrome(sub)}<div class="mn-body"></div></div>`;
      const tabsEl = el.querySelector('.mn-tabs'), activeTab = el.querySelector('.mn-tab.active');
      if (tabsEl && activeTab) tabsEl.scrollLeft = Math.max(0, activeTab.offsetLeft - 16);
      const root = el.querySelector('.mn-body');
      let disposeA = null;
      const draw = () => {
        if (sub === 'push') { renderPush(root, ctx); return; }
        if (sub === 'ads') { renderAds(root, ctx); return; }
        if (sub === 'analytics') { if (disposeA) disposeA(); disposeA = renderAnalytics(root, ctx); return; }
        renderDashboard(root, ctx);
      };
      draw();
      teardown.push(() => { if (disposeA) disposeA(); });
      /* Refresh without losing what someone is typing: the push tab redraws only its history list. */
      const refresh = sub === 'push' ? () => { if (pushRefresh) pushRefresh(); } : sub === 'ads' ? () => { if (adsRefresh) adsRefresh(); } : draw;
      if (swept) ctx.toast(`${plural(swept, 'push', 'pushes')} reached the take-down date and came off county sites.`, 'info');

      /* Live updates: another tab, another county site, or this screen saving something. */
      let pending = 0;
      const onChange = (d) => {
        if (!el.isConnected) { cleanup(); return; }
        if (d && (d.name === 'session' || d.name === 'accounts')) return;
        if (sub === '' && d && d.name === 'networkOutreach') return;
        clearTimeout(pending);
        pending = setTimeout(() => { if (el.isConnected) refresh(); }, 60);
      };
      teardown.push(Store.global.on('*', onChange));
      if (sub === 'analytics' || sub === '') teardown.push(Store.on('*', onChange));
    },
  });
})();
