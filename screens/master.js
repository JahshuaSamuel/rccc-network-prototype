/* screens/master.js — Master Network Console (Agent 4)
   Routes: #/master (Dashboard) · #/master/push · #/master/ads · #/master/analytics
   App.state keys owned here:
     master_pushes   — recent pushes table (seeded from DATA.network.pushes)
     master_draft    — Push Content composer fields
     master_ads      — network ad campaigns (seeded from DATA.network.masterAds)
     master_county   — selected county on the dashboard map
     master_metric   — analytics metric ('visitors' | 'signups' | 'donationsUsd')
   Shared output (for the Public Hub):
     extraNetworkItems — array of Items published here, newest first. Each Item has the
       standard shape { id, title, summary, source, minutesAgo, pushed, locked, priority, tag }
       plus { kind, scope, tab: 'national'|'state', tenants: ['svgop'|'demo' reached], targetLabel }.
*/
(function () {
  'use strict';
  if (!window.App) return;
  const U = App.util;
  const esc = U.esc;

  const I = (d) => `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = I('<circle cx="10" cy="4.5" r="2"/><circle cx="4.5" cy="15" r="2"/><circle cx="15.5" cy="15" r="2"/><path d="M10 6.5v3M10 9.5L5.5 13.3M10 9.5l4.5 3.8"/>');
  const LOCK = '<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>';
  const INFO = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5M10 6.2h.01"/></svg>';
  const STAR = '<svg width="12" height="12" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5l2.5 5.3 5.8.7-4.3 4 1.1 5.7L10 14.4l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z" fill="currentColor"/></svg>';

  const TABS = [
    { sub: '', label: 'Dashboard' },
    { sub: 'push', label: 'Push Content' },
    { sub: 'ads', label: 'Network Ads' },
    { sub: 'analytics', label: 'Analytics' },
  ];
  const KIND = { alert: 'Alert', article: 'Article', video: 'Video', cta: 'Call to action' };
  const STATUS_LABEL = { live: 'Live', onboarding: 'Onboarding', invited: 'Invited' };
  const PLACEMENT = { HEADER_BANNER: 'Header banner', SIDEBAR_BOTTOM: 'Sidebar, bottom', IN_FEED: 'In the news feed' };

  /* Hand-placed tile positions, roughly north → south (col 0–5, row 0–8). */
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
  /* Short tile labels for phone width (full name is in the side panel and tooltip). */
  const SHORT = {
    'san-francisco': 'S.F.', 'san-mateo': 'S. Mateo', 'svgop': 'S. Clara', 'contra-costa': 'C. Costa',
    'santa-barbara': 'S. Barb.', 'los-angeles': 'L.A.', 'san-bernardino': 'S. Bern.',
    'san-diego': 'S. Diego', 'alameda': 'Alam.', 'monterey': 'Mont.', 'san-luis-obispo': 'S.L.O.', 'sacramento': 'Sac.', 'stanislaus': 'Stan.', 'riverside': 'River.',
  };

  const REGION_SHORT = { 'bay-area': 'Bay', 'southern-california': 'SoCal', 'central-valley': 'C. Valley', 'sacramento-valley': 'Sac. Valley', 'central-coast': 'C. Coast' };

  /* ---------------- scoped styles ---------------- */
  function injectStyles() {
    if (document.getElementById('scr-master-style')) return;
    const s = document.createElement('style');
    s.id = 'scr-master-style';
    s.textContent = `
.scr-master .mn-banner { display:flex; align-items:center; gap:10px; padding:9px 14px; margin-bottom:18px;
  background: var(--master-soft); color: var(--master); border:1px solid color-mix(in srgb, var(--master) 25%, white);
  border-radius: var(--r); font-size:14.5px; font-weight:600; }
.scr-master .mn-banner .lock { color: var(--master); background: #fff; }
.scr-master .mn-eyebrow { display:inline-flex; align-items:center; gap:6px; font-weight:700; font-size:13.5px; color: var(--master); margin-bottom:6px; letter-spacing:.02em; }
.scr-master .tabs { margin-bottom: 10px; }
.scr-master .tab.active { color: var(--master); border-bottom-color: var(--master); }
.scr-master .mn-note { display:flex; align-items:flex-start; gap:6px; color: var(--ink-3); font-size:13.5px; margin: 0 0 20px; }
.scr-master .mn-note svg { flex:none; margin-top:2px; }
.scr-master .mn-section-title { display:flex; align-items:baseline; flex-wrap:wrap; gap:4px 10px; margin: 0 0 12px; }
.scr-master .mn-section-title h2 { margin:0; font-size:1.3rem; }
.scr-master .mn-kpis { display:grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap:16px; }
.scr-master .mn-kpis .kpi::before { background: var(--master); }
.scr-master .mn-kpis .kpi-value { font-variant-numeric: normal; }
.scr-master .mn-block { margin-top: 28px; }

/* map */
.scr-master .mn-map-wrap { display:grid; grid-template-columns: minmax(0, 1.65fr) minmax(250px, 1fr); gap: 0; }
.scr-master .mn-map-col { padding:20px; border-right:1px solid var(--line); min-width:0; }
.scr-master .mn-map { display:grid; grid-template-columns: repeat(6, minmax(0, 1fr)); grid-auto-rows: 58px; gap:6px; }
.scr-master .mn-tile { appearance:none; position:relative; display:flex; align-items:center; justify-content:center; text-align:center;
  padding:3px; border-radius:8px; font: 600 12.5px/1.15 var(--font-body); cursor:pointer; min-width:0; overflow:hidden;
  border:1.5px solid var(--line-strong); background: var(--surface); color: var(--ink-2); transition: transform .12s ease, box-shadow .12s ease; }
.scr-master .mn-tile:hover { transform: translateY(-1px); box-shadow: var(--shadow-2); }
.scr-master .mn-tile.st-live { background: var(--brand); color: var(--brand-ink); border-color: var(--brand); }
.scr-master .mn-tile.st-onboarding { background: var(--warn-soft); color: var(--warn); border-color: #E2B45C; }
.scr-master .mn-tile.st-invited { border-style: dashed; color: var(--ink-3); }
.scr-master .mn-tile.is-sel { box-shadow: 0 0 0 3px var(--surface), 0 0 0 5px var(--master); z-index:1; }
.scr-master .mn-tile .mn-star { position:absolute; top:3px; right:4px; color: var(--accent); }
.scr-master .mn-tile.st-live .mn-star { color: #fff; }
.scr-master .mn-tile .mn-s, .scr-master .mn-hh .mn-s { display:none; }
.scr-master .mn-legend { display:flex; flex-wrap:wrap; gap:8px 16px; margin-top:14px; font-size:13.5px; color: var(--ink-2); }
.scr-master .mn-legend span { display:inline-flex; align-items:center; gap:6px; }
.scr-master .mn-sw { width:16px; height:16px; border-radius:4px; border:1.5px solid var(--line-strong); display:inline-block; }
.scr-master .mn-sw.st-live { background: var(--brand); border-color: var(--brand); }
.scr-master .mn-sw.st-onboarding { background: var(--warn-soft); border-color:#E2B45C; }
.scr-master .mn-sw.st-invited { border-style:dashed; background: var(--surface); }
.scr-master .mn-panel { padding:20px; display:flex; flex-direction:column; gap:12px; min-width:0; }
.scr-master .mn-panel h3 { margin:0; }
.scr-master .mn-stats { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
.scr-master .mn-stat { background: var(--surface-2); border:1px solid var(--line); border-radius: var(--r); padding:10px 12px; }
.scr-master .mn-stat b { display:block; font-family: var(--font-head); font-stretch:85%; font-size:1.35rem; line-height:1.1; }
.scr-master .mn-stat span { font-size:13px; color: var(--ink-3); }
.scr-master .mn-states { list-style:none; margin:0; padding:0; display:grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap:8px 16px; }
.scr-master .mn-states li { display:flex; align-items:center; gap:10px; padding:9px 4px; border-bottom:1px solid var(--line); }
.scr-master .mn-states .mn-code { width:34px; height:28px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center;
  font: 700 13px/1 var(--font-head); background: var(--master-soft); color: var(--master); flex:none; }
.scr-master .mn-states .mn-sname { flex:1; min-width:0; font-weight:600; }
.scr-master .mn-states .mn-sname small { display:block; font-weight:400; color: var(--ink-3); font-size:13px; }

/* push */
.scr-master .mn-push-grid { display:grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap:20px; align-items:start; }
.scr-master .mn-field { display:flex; flex-direction:column; gap:6px; }
.scr-master .mn-field > label, .scr-master .mn-label { font-weight:600; font-size:14.5px; }
.scr-master .mn-help { font-size:13.5px; color: var(--ink-3); }
.scr-master .mn-radios { display:flex; flex-wrap:wrap; gap:8px; }
.scr-master .mn-radio { display:inline-flex; align-items:center; gap:7px; padding:7px 12px; border:1px solid var(--line-strong); border-radius:999px;
  cursor:pointer; font-size:14.5px; font-weight:500; background: var(--surface); }
.scr-master .mn-radio input { accent-color: var(--master); margin:0; }
.scr-master .mn-radio.is-on { border-color: var(--master); background: var(--master-soft); color: var(--master); font-weight:600; }
.scr-master .mn-chips { display:flex; flex-wrap:wrap; gap:8px; }
.scr-master .mn-reach { display:flex; align-items:center; gap:12px; padding:12px 14px; border-radius: var(--r);
  background: var(--master-soft); border:1px solid color-mix(in srgb, var(--master) 25%, white); }
.scr-master .mn-reach b { font-family: var(--font-head); font-stretch:80%; font-size:2rem; line-height:1; color: var(--master); }
.scr-master .mn-reach span { font-weight:600; color: var(--ink); }
.scr-master .mn-reach small { display:block; font-weight:400; color: var(--ink-3); font-size:13px; }
.scr-master .mn-range { width:100%; accent-color: var(--master); }
.scr-master .mn-prio { display:flex; align-items:center; gap:10px; }
.scr-master .mn-lockrow { display:flex; align-items:flex-start; gap:12px; padding:12px 14px; border:1px solid var(--line); border-radius: var(--r); background: var(--surface-2); }
.scr-master .mn-lockrow .toggle { margin-top:2px; }
.scr-master .mn-preview-frame { border:1px solid var(--line); border-radius: var(--r); overflow:hidden; background: var(--bg); }
.scr-master .mn-pv-bar { background: var(--brand); color: var(--brand-ink); padding:8px 12px; display:flex; align-items:center; gap:8px; font-family: var(--font-head); font-weight:800; font-stretch:80%; font-size:1.05rem; border-bottom:3px solid var(--accent); }
.scr-master .mn-pv-bar small { font-family: var(--font-body); font-weight:500; font-size:12.5px; opacity:.85; margin-left:auto; }
.scr-master .mn-pv-body { padding:14px; }
.scr-master .mn-pv-card { background: var(--surface); border:1px solid var(--line); border-left:4px solid var(--master); border-radius: var(--r); padding:14px; }
.scr-master .mn-pv-card.is-breaking { border-left-color: var(--danger); background: color-mix(in srgb, var(--danger) 4%, white); }
.scr-master .mn-pv-card h4 { margin:8px 0 6px; font-size:1.15rem; overflow-wrap:anywhere; }
.scr-master .mn-pv-card p { font-size:14.5px; color: var(--ink-2); margin:0 0 8px; overflow-wrap:anywhere; }
.scr-master .mn-pv-video { height:120px; border-radius:8px; margin:8px 0; background: linear-gradient(135deg, #1B222C, #3C4858); display:flex; align-items:center; justify-content:center; }
.scr-master .mn-pv-video span { width:46px; height:46px; border-radius:50%; background: rgba(255,255,255,.9); display:flex; align-items:center; justify-content:center; }
.scr-master .mn-deliver { display:grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap:6px; }
.scr-master .mn-dtile { font-size:13px; line-height:1.2; padding:7px 6px; border-radius:6px; text-align:center; border:1px dashed var(--line-strong);
  color: var(--ink-3); background: var(--surface); transition: background-color .2s ease, color .2s ease, transform .2s ease; overflow-wrap:anywhere; }
.scr-master .mn-dtile.is-on { background: var(--master); color:#fff; border:1px solid var(--master); transform: scale(1.04); }
.scr-master .mn-dtile.is-tenant { font-weight:700; }
.scr-master .mn-success { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:12px 14px; border-radius: var(--r); background: var(--ok-soft); color: var(--ok); font-weight:600; }
.scr-master .mn-err { color: var(--danger); font-size:13.5px; font-weight:600; }

/* ads */
.scr-master .mn-meter { display:flex; align-items:center; gap:8px; min-width:140px; }
.scr-master .mn-meter-track { flex:1; height:8px; border-radius:999px; background: var(--master-soft); overflow:hidden; }
.scr-master .mn-meter-fill { height:100%; border-radius:999px; background: var(--master); }
.scr-master .mn-heat { display:grid; gap:2px; grid-template-columns: minmax(130px, 1fr) repeat(5, minmax(0, 1.3fr)); font-size:13.5px; }
.scr-master .mn-heat .mn-hh { overflow-wrap:anywhere; font-weight:700; color: var(--ink-2); padding:6px 4px; text-align:center; line-height:1.2; }
.scr-master .mn-heat .mn-hr { font-weight:600; color: var(--ink-2); padding:6px 6px 6px 0; display:flex; align-items:center; }
.scr-master .mn-heat .mn-cell { border-radius:4px; min-height:44px; display:flex; align-items:center; justify-content:center; font-weight:700; cursor:default; }
.scr-master .mn-heat .mn-cell:hover, .scr-master .mn-heat .mn-cell:focus-visible { outline:2px solid var(--ink); outline-offset:1px; }
.scr-master .mn-scale { display:flex; align-items:center; gap:8px; font-size:13px; color: var(--ink-3); margin-top:10px; }
.scr-master .mn-scale i { display:inline-block; width:22px; height:12px; border-radius:3px; }
.scr-master .mn-slots { display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-top:12px; }

/* analytics */
.scr-master .mn-chart { position:relative; min-height:240px; }
.scr-master .mn-chart svg { display:block; overflow:visible; }
.scr-master .mn-chart svg:focus-visible { outline:none; box-shadow: var(--focus); border-radius:6px; }
.scr-master .mn-tip { position:absolute; pointer-events:none; background: var(--surface); border:1px solid var(--line); border-radius:8px;
  box-shadow: var(--shadow-2); padding:8px 10px; font-size:13.5px; line-height:1.35; white-space:nowrap; transform: translate(-50%, -100%); display:none; z-index:2; }
.scr-master .mn-tip b { display:block; font-size:16px; color: var(--ink); font-variant-numeric: tabular-nums; }
.scr-master .mn-tip .mn-key { display:inline-block; width:14px; height:2px; background: var(--master); vertical-align:middle; margin-right:6px; }
.scr-master .mn-sum { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:12px; margin-bottom:14px; }
.scr-master details.mn-tbl summary { cursor:pointer; font-weight:600; color: var(--master); margin-top:12px; }
.scr-master details.mn-tbl[open] summary { margin-bottom:10px; }

@media (max-width: 1000px) {
  .scr-master .mn-push-grid { grid-template-columns: minmax(0,1fr); }
}
@media (max-width: 900px) {
  .scr-master .mn-map-wrap { grid-template-columns: minmax(0,1fr); }
  .scr-master .mn-map-col { border-right:0; border-bottom:1px solid var(--line); }
}
@media (max-width: 600px) {
  .scr-master .mn-map-col { padding:12px; }
  .scr-master .mn-map { grid-auto-rows: 46px; gap:4px; }
  .scr-master .mn-tile { font-size:13px; padding:2px; letter-spacing:-.01em; }
  .scr-master .mn-tile .mn-f { display:none; }
  .scr-master .mn-tile .mn-s { display:inline; }
  .scr-master .mn-tile .mn-star { top:1px; right:2px; }
  .scr-master .mn-slots { grid-template-columns: 1fr; }
  .scr-master .mn-sum { grid-template-columns: minmax(0,1fr); }
  .scr-master .mn-heat { grid-template-columns: 80px repeat(5, minmax(0, 1fr)); font-size:13px; }
  .scr-master .mn-heat .mn-hh { font-size:13px; padding:4px 1px; overflow-wrap:normal; }
  .scr-master .mn-hh .mn-f { display:none; }
  .scr-master .mn-hh .mn-s { display:inline; }
  .scr-master .mn-heat .mn-cell { font-size:12.5px; }
}`;
    document.head.appendChild(s);
  }

  /* ---------------- state helpers ---------------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function S(ctx) {
    const st = App.state;
    const net = ctx.network || {};
    if (!st.master_pushes) st.master_pushes = clone(net.pushes || []);
    if (!st.master_ads) st.master_ads = clone(net.masterAds || []);
    if (!st.master_draft) {
      st.master_draft = {
        title: 'Early voting starts Monday: find your nearest vote center',
        message: 'Vote centers open across California on Monday. Bring a friend, check your registration, and return your mail ballot early.',
        kind: 'alert', scope: 'ALL_ORGS', stateCode: 'CA', region: 'bay-area', selected: ['svgop', 'demo'],
        priority: 105, locked: true,
      };
    }
    st.extraNetworkItems = st.extraNetworkItems || [];
    st.hiddenPushes = st.hiddenPushes || [];
    return st;
  }
  function countyName(net, slug) {
    const c = (net.counties || []).find((x) => x.slug === slug);
    if (!c) return slug;
    if (slug === 'svgop') return 'SVGOP (Santa Clara)';
    if (slug === 'demo') return 'Demo County GOP';
    return c.name;
  }
  function priorityLabel(p) { return p >= 100 ? 'Breaking' : p >= 80 ? 'High' : p >= 50 ? 'Normal' : 'Low'; }
  function compact(n, usd) {
    const a = Math.abs(n);
    let s;
    if (a >= 1e6) s = (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    else if (a >= 1e3) s = (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
    else s = String(Math.round(n));
    return (usd ? '$' : '') + s;
  }
  function article(word) { return /^[aeiou]/i.test(word) ? 'An' : 'A'; }

  /* Target sites for a draft, in deterministic delivery order. One source for tiles and counter:
     every county in DATA.network.counties (any status). */
  function allSites(net) {
    return (net.counties || []).map((c) => ({ key: c.slug, slug: c.slug, region: c.region, state: c.state,
      label: c.slug === 'svgop' ? 'SVGOP' : c.slug === 'demo' ? 'Demo County' : c.name, visitors: Number(c.visitors7d) || 0 }));
  }
  function targets(d, net) {
    const all = allSites(net);
    if (d.scope === 'ALL_ORGS') return all;
    if (d.scope === 'STATE') return all.filter((c) => c.state === d.stateCode);
    if (d.scope === 'REGION') return all.filter((c) => c.region === d.region);
    return all.filter((c) => (d.selected || []).includes(c.slug));
  }
  function targetLabel(d, net) {
    if (d.scope === 'ALL_ORGS') return 'All counties in the network';
    if (d.scope === 'STATE') {
      const st = (net.states || []).find((s) => s.code === d.stateCode);
      return `${st ? st.name : d.stateCode} · all counties`;
    }
    if (d.scope === 'REGION') {
      const r = (net.regions || []).find((x) => x.id === d.region);
      return `${r ? r.name : d.region} region`;
    }
    const names = (d.selected || []).map((s) => countyName(net, s));
    return names.length ? names.join(', ') : 'No counties chosen';
  }

  /* ---------------- shared chrome ---------------- */
  function chrome(ctx) {
    const sub = ctx.sub || '';
    const roleName = App.roleLabel ? App.roleLabel(ctx.role) : ctx.role;
    const banner = ctx.role !== 'master'
      ? `<div class="mn-banner" role="note"><span class="lock" aria-hidden="true">${LOCK}</span><span>You're previewing the Master Network Console. ${article(roleName)} ${esc(roleName)} would normally see this as locked.</span></div>`
      : '';
    const tabs = TABS.map((t) => `<a class="tab${t.sub === sub ? ' active' : ''}" href="#/master${t.sub ? '/' + t.sub : ''}"${t.sub === sub ? ' aria-current="page"' : ''}>${t.label}</a>`).join('');
    return `${banner}
      <div class="page-head">
        <div>
          <div class="mn-eyebrow">${STAR} Master Network</div>
          <h1>Master Network Console</h1>
          <p>Share news, alerts and network ads with every county committee at once. Each county keeps full control of its own local zones.</p>
        </div>
      </div>
      <nav class="tabs" aria-label="Master Network sections">${tabs}</nav>
      <p class="mn-note">${INFO}<span>${esc((ctx.network && ctx.network.note) || 'Illustrative network data for demonstration.')}</span></p>`;
  }

  /* ================= DASHBOARD ================= */
  function renderDashboard(el, ctx, root) {
    const net = ctx.network;
    const st = S(ctx);
    const k = net.kpis || {};
    if (!st.master_county || !TILE_POS[st.master_county]) st.master_county = ctx.tenantSlug;
    const kpi = (v, label, note) => `<div class="kpi"><div class="kpi-value">${v}</div><div class="kpi-label">${label}</div>${note ? `<div class="small muted" style="margin-top:4px">${note}</div>` : ''}</div>`;

    const tiles = (net.counties || []).filter((c) => TILE_POS[c.slug]).map((c) => {
      const [col, row] = TILE_POS[c.slug];
      const mine = c.slug === ctx.tenantSlug;
      const full = c.slug === 'svgop' ? 'Santa Clara' : c.name;
      const short = SHORT[c.slug] || full;
      return `<button type="button" class="mn-tile st-${c.status}${c.slug === st.master_county ? ' is-sel' : ''}" data-county="${esc(c.slug)}"
        style="grid-column:${col + 1};grid-row:${row + 1}" title="${esc(full)} County — ${STATUS_LABEL[c.status]}"
        aria-label="${esc(full)} County, ${STATUS_LABEL[c.status]}${mine ? ', the committee you are viewing' : ''}" aria-pressed="${c.slug === st.master_county}">
        ${mine ? `<span class="mn-star">${STAR}</span>` : ''}<span class="mn-f">${esc(full)}</span><span class="mn-s">${esc(short)}</span></button>`;
    }).join('');

    const stateBadge = (s) => s.status === 'active' ? '<span class="badge badge-ok">Active</span>'
      : s.status === 'pilot' ? '<span class="badge badge-warn">Pilot</span>' : '<span class="badge">Waitlist</span>';
    const states = (net.states || []).map((s) => `<li><span class="mn-code" aria-hidden="true">${esc(s.code)}</span>
      <span class="mn-sname">${esc(s.name)}<small>${s.counties ? `${s.counties} ${s.counties === 1 ? 'county' : 'counties'} on the platform` : 'Ready to start when a county signs up'}</small></span>${stateBadge(s)}</li>`).join('');

    root.innerHTML = `
      <div class="mn-section-title"><h2>Illustrative network totals</h2><span class="small muted">Sample figures across every participating state</span></div>
      <div class="mn-kpis" data-tour="master-kpis">
        ${kpi(U.fmtNum(k.sites), 'Committee websites', 'Live and onboarding')}
        ${kpi(compact(k.weeklyVisitors), 'Visitors this week', 'Across all county sites')}
        ${kpi(U.fmtNum(k.candidatesRecruited), 'Candidates recruited', 'Through county pipelines')}
        ${kpi(U.fmtNum(k.volunteers), 'Active volunteers', 'Signed up for shifts')}
        ${kpi(compact(k.donationsUsd, true), 'Raised online', 'This election cycle')}
      </div>

      <div class="mn-block">
        <div class="mn-section-title"><h2>California committees</h2><span class="small muted">Tap a county to see its numbers</span></div>
        <div class="card" data-tour="master-map">
          <div class="mn-map-wrap">
            <div class="mn-map-col">
              <div class="mn-map" role="group" aria-label="California county committees, arranged north to south">${tiles}</div>
              <div class="mn-legend" aria-label="Legend">
                <span><i class="mn-sw st-live"></i>Live</span>
                <span><i class="mn-sw st-onboarding"></i>Onboarding</span>
                <span><i class="mn-sw st-invited"></i>Invited</span>
                <span style="color:var(--accent)">${STAR}<span style="color:var(--ink-2)">Committee you're viewing</span></span>
              </div>
              <p class="small muted" style="margin-top:8px">Stylized layout, north at the top. Tiles show approximate position only.</p>
            </div>
            <div class="mn-panel" id="mn-panel" aria-live="polite"></div>
          </div>
        </div>
      </div>

      <div class="mn-block">
        <div class="explain"><strong>Why this matters for your committee.</strong> Every county on the map runs its own site with its own data. The network adds shared news and resources on top, so a small county gets the reach of a statewide operation without giving up control.</div>
      </div>

      <div class="mn-block">
        <div class="mn-section-title"><h2>States in the network</h2><span class="small muted">Illustrative rollout status</span></div>
        <div class="card"><div class="card-body"><ul class="mn-states">${states}</ul></div></div>
      </div>`;

    const panel = root.querySelector('#mn-panel');
    function drawPanel() {
      const c = (net.counties || []).find((x) => x.slug === st.master_county) || (net.counties || [])[0];
      if (!c) return;
      const region = (net.regions || []).find((r) => r.id === c.region);
      const full = c.slug === 'svgop' ? 'Santa Clara' : c.name;
      const badge = c.status === 'live' ? '<span class="badge badge-ok">Live</span>' : c.status === 'onboarding' ? '<span class="badge badge-warn">Onboarding</span>' : '<span class="badge">Invited</span>';
      let body;
      if (c.status === 'live') {
        body = `<div class="mn-stats">
          <div class="mn-stat"><b>${U.fmtNum(c.visitors7d)}</b><span>Visitors, last 7 days</span></div>
          <div class="mn-stat"><b>${U.fmtNum(c.volunteers)}</b><span>Volunteers</span></div>
          <div class="mn-stat"><b>${U.fmtNum(c.candidates)}</b><span>Candidates</span></div>
          <div class="mn-stat"><b>${U.fmtUsd(c.donationsUsd)}</b><span>Raised online</span></div>
        </div>
        <button class="btn btn-sm btn-primary" data-act="open-site" data-slug="${esc(c.slug)}">Open their public site</button>`;
      } else if (c.status === 'onboarding') {
        body = `<p class="small">This committee is setting up its site. Numbers appear here the day it goes live.</p>
        <button class="btn btn-sm" data-act="checklist" data-name="${esc(full)}">Send onboarding checklist</button>`;
      } else {
        body = `<p class="small">This committee has an open invitation to join the network. Its site launches as soon as the board says yes.</p>
        <button class="btn btn-sm" data-act="invite" data-name="${esc(full)}">Resend invitation</button>`;
      }
      const label = c.slug === 'svgop' ? 'Santa Clara County Republican Party (SVGOP)' : c.slug === 'demo' ? 'Demo County Republican Party' : `${full} County`;
      panel.innerHTML = `<div class="row" style="gap:8px">${badge}<span class="small muted">${esc(region ? region.name : '')}</span></div>
        <h3>${esc(label)}</h3>${body}
        ${c.slug === ctx.tenantSlug ? '<p class="small muted">This is the committee you are viewing right now.</p>' : ''}`;
    }
    drawPanel();

    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-county]');
      if (t) {
        st.master_county = t.dataset.county;
        root.querySelectorAll('.mn-tile').forEach((b) => {
          const on = b.dataset.county === st.master_county;
          b.classList.toggle('is-sel', on); b.setAttribute('aria-pressed', on);
        });
        drawPanel();
        if (window.innerWidth < 900) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'open-site') {
        const slug = a.dataset.slug;
        if (slug !== ctx.tenantSlug) App.setTenant(slug);
        ctx.navigate('public-hub');
      } else if (a.dataset.act === 'checklist') {
        ctx.toast(`Onboarding checklist sent to the ${a.dataset.name} County board.`, 'ok');
      } else if (a.dataset.act === 'invite') {
        ctx.toast(`Invitation resent to the ${a.dataset.name} County chair.`, 'ok');
      }
    });
  }

  /* ================= PUSH CONTENT ================= */
  function renderPush(el, ctx, root) {
    const net = ctx.network;
    const st = S(ctx);
    const d = st.master_draft;
    const t = ctx.tenant || {};
    const regions = net.regions || [];
    const statesWithSites = (net.states || []).filter((s) => (net.counties || []).some((c) => c.state === s.code));
    const caLive = allSites(net);

    root.innerHTML = `
      <div class="mn-push-grid">
        <div class="stack">
          <div class="card">
            <div class="card-head"><h3>1. Write the update</h3></div>
            <div class="card-body stack">
              <div class="mn-field"><label for="mn-title">Headline</label>
                <input class="input" id="mn-title" maxlength="120" value="${esc(d.title)}" placeholder="A short, clear headline"></div>
              <div class="mn-field"><label for="mn-msg">Message</label>
                <textarea class="textarea" id="mn-msg" maxlength="400" placeholder="Two or three sentences for the county homepage">${esc(d.message)}</textarea></div>
              <div class="mn-field"><label for="mn-kind">Type</label>
                <select class="select" id="mn-kind">${Object.keys(KIND).map((k) => `<option value="${k}"${d.kind === k ? ' selected' : ''}>${KIND[k]}</option>`).join('')}</select></div>
            </div>
          </div>

          <div class="card" data-tour="push-targeting">
            <div class="card-head"><h3>2. Choose who receives it</h3></div>
            <div class="card-body stack">
              <div class="mn-radios" role="radiogroup" aria-label="Who receives this">
                ${[['ALL_ORGS', 'All counties'], ['STATE', 'One state'], ['REGION', 'One region'], ['SELECTED', 'Selected counties']].map(([v, l]) =>
                  `<label class="mn-radio${d.scope === v ? ' is-on' : ''}"><input type="radio" name="mn-scope" value="${v}"${d.scope === v ? ' checked' : ''}>${l}</label>`).join('')}
              </div>
              <div id="mn-scope-detail"></div>
              <div class="mn-reach" aria-live="polite" id="mn-reach"></div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h3>3. Set priority and lock</h3></div>
            <div class="card-body stack">
              <div class="mn-field">
                <label for="mn-prio" class="mn-prio">Priority <span class="badge" id="mn-prio-badge"></span><span class="spacer"></span><b id="mn-prio-val" style="font-variant-numeric:tabular-nums"></b></label>
                <input type="range" class="mn-range" id="mn-prio" min="0" max="150" step="5" value="${d.priority}">
                <span class="mn-help">Higher priority shows nearer the top. 100 and above shows as a Breaking banner on every county homepage.</span>
              </div>
              <div class="mn-lockrow" data-tour="push-lock">
                <label class="toggle"><input type="checkbox" id="mn-lock"${d.locked ? ' checked' : ''} aria-describedby="mn-lock-help"><span class="sr-only" style="position:absolute;left:-9999px">Lock this item</span></label>
                <div><div class="mn-label">Lock on county pages</div>
                  <div class="mn-help" id="mn-lock-help">Locked items can't be hidden by counties — use for urgent alerts.</div></div>
              </div>
              <div class="row">
                <button class="btn btn-primary" id="mn-publish" data-tour="push-publish">Publish to the network</button>
                <span class="small muted" id="mn-pub-note"></span>
              </div>
              <div id="mn-result"></div>
              <div><div class="row" style="margin-bottom:8px"><span class="mn-label">Delivery</span><span class="spacer"></span><span class="small muted" id="mn-deliver-count"></span></div>
                <div class="mn-deliver" id="mn-deliver" aria-label="Committee sites receiving this update"></div></div>
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="card-head"><h3>Live preview</h3><span class="spacer"></span><span class="small muted">${esc(t.shortName || '')} homepage</span></div>
            <div class="card-body">
              <div class="mn-preview-frame">
                <div class="mn-pv-bar">${STAR}<span>${esc(t.shortName || t.name || '')}</span><small>${esc(t.domain || '')}</small></div>
                <div class="mn-pv-body" id="mn-preview"></div>
              </div>
            </div>
          </div>
          <div class="explain"><strong>Why this matters for your committee.</strong> One volunteer at the network writes an update once, and every county site has it in seconds. Counties can still hide or pin regular items; only urgent locked alerts stay put.</div>
        </div>
      </div>

      <div class="mn-block">
        <div class="mn-section-title"><h2>Recent pushes</h2><span class="small muted">Newest first. “Hidden by” lists counties that chose to hide an item.</span></div>
        <div class="table-wrap" id="mn-recent"></div>
      </div>`;

    const $ = (s) => root.querySelector(s);

    function drawScopeDetail() {
      const box = $('#mn-scope-detail');
      if (d.scope === 'ALL_ORGS') {
        box.innerHTML = `<p class="mn-help">Every county committee in the network receives this update.</p>`;
      } else if (d.scope === 'STATE') {
        box.innerHTML = `<div class="mn-field"><label for="mn-state">State</label><select class="select" id="mn-state">${statesWithSites.map((s) => `<option value="${s.code}"${s.code === d.stateCode ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>`;
      } else if (d.scope === 'REGION') {
        box.innerHTML = `<div class="mn-field"><label for="mn-region">California region</label><select class="select" id="mn-region">${regions.map((r) => `<option value="${r.id}"${r.id === d.region ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>`;
      } else {
        box.innerHTML = `<div class="mn-field"><span class="mn-label">Counties</span>
          <div class="mn-chips">${caLive.map((c) => `<button type="button" class="chip${(d.selected || []).includes(c.slug) ? ' active' : ''}" data-sel="${esc(c.slug)}" aria-pressed="${(d.selected || []).includes(c.slug)}">${esc(c.label)}</button>`).join('')}</div>
          <span class="mn-help">Tap counties to add or remove them.</span></div>`;
      }
    }

    function drawReach() {
      const list = targets(d, net);
      const n = list.length;
      $('#mn-reach').innerHTML = `<b>${n}</b><span>Reaches ${n} committee ${n === 1 ? 'site' : 'sites'}<small>${esc(targetLabel(d, net))} · about ${U.fmtNum(list.reduce((a, x) => a + x.visitors, 0))} weekly readers, based on last week's visitors</small></span>`;
      $('#mn-deliver-count').textContent = `${n} ${n === 1 ? 'site' : 'sites'}`;
      $('#mn-deliver').innerHTML = n
        ? list.map((x) => `<div class="mn-dtile${x.slug === ctx.tenantSlug ? ' is-tenant' : ''}" data-k="${esc(x.key)}">${esc(x.label)}</div>`).join('')
        : '<p class="small muted" style="grid-column:1/-1">Choose at least one county to see the delivery list.</p>';
      const reachesMe = list.some((x) => x.slug === ctx.tenantSlug);
      $('#mn-pub-note').textContent = reachesMe ? `Includes ${t.shortName || 'this committee'}` : `${t.shortName || 'This committee'} is outside this target`;
    }

    function drawPreview() {
      const p = Number(d.priority);
      const breaking = p >= 100;
      const kindTag = `<span class="badge">${esc(KIND[d.kind] || d.kind)}</span>`;
      const extra = d.kind === 'video'
        ? `<div class="mn-pv-video" aria-hidden="true"><span><svg width="18" height="18" viewBox="0 0 20 20"><path d="M7 5l8 5-8 5z" fill="#1B222C"/></svg></span></div>`
        : d.kind === 'cta' ? `<button type="button" class="btn btn-sm btn-primary" data-act="pv-cta">Sign up</button>` : '';
      $('#mn-preview').innerHTML = `
        <div class="mn-pv-card${breaking ? ' is-breaking' : ''}">
          <div class="row" style="gap:6px">
            ${breaking ? '<span class="badge badge-danger">Breaking</span>' : ''}
            <span class="badge badge-master">Network</span>${kindTag}
            ${d.locked ? `<span class="lock" title="Locked: counties keep this visible">${LOCK}</span>` : ''}
          </div>
          <h4>${esc(d.title || 'Your headline appears here')}</h4>
          ${d.message ? `<p>${esc(d.message)}</p>` : ''}
          ${extra}
          <div class="small muted">Master Network · just now</div>
        </div>
        <p class="small muted" style="margin-top:10px">${d.locked ? 'Locked: stays visible on every county page that receives it.' : 'Counties can hide or pin this item from their Committee Portal.'}</p>`;
      $('#mn-prio-val').textContent = p;
      const b = $('#mn-prio-badge');
      b.textContent = priorityLabel(p);
      b.className = 'badge ' + (breaking ? 'badge-danger' : p >= 80 ? 'badge-warn' : '');
    }

    function drawRecent() {
      const rows = st.master_pushes.map((p) => {
        const hidden = (p.hiddenBy || []).slice();
        if (!p.locked && st.hiddenPushes.includes(p.itemId || p.id) && !hidden.includes(ctx.tenantSlug)) hidden.push(ctx.tenantSlug);
        const statusB = p.status === 'published' ? '<span class="badge badge-ok">Published</span>'
          : p.status === 'scheduled' ? `<span class="badge badge-warn">Scheduled${p.scheduledFor ? ' · ' + esc(p.scheduledFor) : ''}</span>` : '<span class="badge">Draft</span>';
        const when = p.publishedMinutesAgo != null ? `<div class="small muted">${U.timeAgo(p.publishedMinutesAgo)}</div>` : '';
        return `<tr>
          <td style="min-width:220px"><strong>${esc(p.title)}</strong><div class="small muted">${esc(KIND[p.kind] || p.kind)}</div></td>
          <td style="min-width:130px">${esc(p.targetLabel)}</td>
          <td class="num">${p.priority}${p.priority >= 100 ? ' <span class="badge badge-danger">Breaking</span>' : ''}</td>
          <td>${p.locked ? `<span class="lock" title="Locked">${LOCK}</span>` : '<span class="small muted">Open</span>'}</td>
          <td>${statusB}${when}</td>
          <td class="num">${p.reach ? U.fmtNum(p.reach) : '—'}${p.sites ? `<div class="small muted">${p.sites} sites</div>` : ''}</td>
          <td>${hidden.length ? hidden.map((s) => `<span class="badge">${esc(s === 'svgop' ? 'SVGOP' : s === 'demo' ? 'Demo County' : countyName(net, s))}</span>`).join(' ') : '<span class="small muted">None</span>'}</td>
          <td>${p.status !== 'published' ? `<button class="btn btn-sm btn-ghost" data-edit="${esc(p.id)}">Edit</button>` : ''}</td>
        </tr>`;
      }).join('');
      $('#mn-recent').innerHTML = `<table class="table"><thead><tr><th>Title</th><th>Target</th><th class="num">Priority</th><th>Lock</th><th>Status</th><th class="num">Reach</th><th>Hidden by</th><th><span style="position:absolute;left:-9999px">Actions</span></th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    drawScopeDetail(); drawReach(); drawPreview(); drawRecent();

    root.addEventListener('input', (e) => {
      const id = e.target.id;
      if (id === 'mn-title') { d.title = e.target.value; drawPreview(); }
      else if (id === 'mn-msg') { d.message = e.target.value; drawPreview(); }
      else if (id === 'mn-prio') { d.priority = Number(e.target.value); drawPreview(); }
    });
    root.addEventListener('change', (e) => {
      const tg = e.target;
      if (tg.name === 'mn-scope') {
        d.scope = tg.value;
        root.querySelectorAll('.mn-radio').forEach((l) => l.classList.toggle('is-on', l.querySelector('input').checked));
        drawScopeDetail(); drawReach();
      } else if (tg.id === 'mn-kind') { d.kind = tg.value; drawPreview(); }
      else if (tg.id === 'mn-state') { d.stateCode = tg.value; drawReach(); }
      else if (tg.id === 'mn-region') { d.region = tg.value; drawReach(); }
      else if (tg.id === 'mn-lock') { d.locked = tg.checked; drawPreview(); ctx.toast(d.locked ? 'Locked: counties keep this item visible.' : 'Unlocked: counties may hide or pin this item.', 'info'); }
    });

    let busy = false;
    root.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-sel]');
      if (chip) {
        const slug = chip.dataset.sel;
        d.selected = d.selected || [];
        d.selected = d.selected.includes(slug) ? d.selected.filter((x) => x !== slug) : d.selected.concat(slug);
        chip.classList.toggle('active', d.selected.includes(slug));
        chip.setAttribute('aria-pressed', d.selected.includes(slug));
        drawReach();
        return;
      }
      if (e.target.closest('[data-act="pv-cta"]')) { ctx.toast('Preview only: on the live site this opens the sign-up form.', 'info'); return; }
      if (e.target.closest('[data-act="to-hub"]')) { ctx.navigate('public-hub'); return; }
      const ed = e.target.closest('[data-edit]');
      if (ed) {
        const p = st.master_pushes.find((x) => x.id === ed.dataset.edit);
        if (p) {
          Object.assign(d, { title: p.title, kind: p.kind, priority: p.priority, locked: p.locked, scope: p.scope });
          if (p.scope === 'SELECTED') d.selected = ['svgop', 'demo'];
          if (p.scope === 'REGION') d.region = 'bay-area';
          if (p.scope === 'STATE') d.stateCode = 'CA';
          ctx.toast(`Loaded “${p.title}” into the composer.`, 'info');
          App.rerender();
        }
        return;
      }
      if (e.target.closest('#mn-publish')) publish();
    });

    function publish() {
      if (busy) return;
      const res = $('#mn-result');
      if (!d.title || !d.title.trim()) {
        res.innerHTML = '<p class="mn-err">Add a headline to publish.</p>';
        $('#mn-title').focus();
        return;
      }
      const list = targets(d, net);
      if (!list.length) {
        res.innerHTML = '<p class="mn-err">Choose at least one county to publish.</p>';
        return;
      }
      busy = true;
      res.innerHTML = '';
      const btn = $('#mn-publish');
      btn.disabled = true; btn.textContent = 'Delivering…';
      drawReach();
      const tiles = Array.from(root.querySelectorAll('.mn-dtile'));
      const step = Math.max(45, Math.round(1500 / list.length));
      const snapshot = clone(d);
      const n = list.length;
      const reach = list.reduce((a, x) => a + x.visitors, 0);
      const label = targetLabel(snapshot, net);
      const stamp = st.master_pushes.length + 1;
      const id = 'mp-' + stamp;
      const itemId = 'net-' + stamp;
      tiles.forEach((tl, i) => setTimeout(() => tl.classList.add('is-on'), step * (i + 1)));
      setTimeout(() => {
        st.master_pushes.unshift({
          id, itemId, title: snapshot.title.trim(), kind: snapshot.kind, scope: snapshot.scope, targetLabel: label,
          priority: snapshot.priority, locked: snapshot.locked, status: 'published', reach, sites: n, hiddenBy: [], publishedMinutesAgo: 0,
        });
        st.extraNetworkItems.unshift({
          id: itemId, title: snapshot.title.trim(), summary: (snapshot.message || '').trim(), source: 'Master Network',
          minutesAgo: 0, pushed: true, locked: !!snapshot.locked, priority: snapshot.priority, tag: KIND[snapshot.kind] || 'Network',
          kind: snapshot.kind, scope: snapshot.scope, tab: snapshot.scope === 'ALL_ORGS' ? 'national' : 'state',
          tenants: list.filter((x) => x.slug === 'svgop' || x.slug === 'demo').map((x) => x.slug), targetLabel: label,
        });
        ctx.toast(`Delivered to ${n} ${n === 1 ? 'site' : 'sites'}`, 'ok');
        busy = false;
        if (!root.isConnected) return;
        btn.disabled = false; btn.textContent = 'Publish to the network';
        const reachesMe = list.some((x) => x.slug === ctx.tenantSlug);
        res.innerHTML = `<div class="mn-success"><span>Published to ${n} ${n === 1 ? 'site' : 'sites'}.</span><span class="spacer"></span>
          ${reachesMe ? `<button class="btn btn-sm" data-act="to-hub">See it on the ${esc(t.shortName || '')} Public Hub</button>` : ''}</div>`;
        drawRecent();
      }, step * (list.length + 1) + 150);
    }
  }

  /* ================= NETWORK ADS ================= */
  function heatValue(placement, region, ads) {
    const inPl = ads.filter((a) => a.placement === placement);
    const base = inPl.length ? inPl.reduce((s, a) => s + a.fillRate, 0) / inPl.length : 0;
    const r = U.seeded('heat:' + placement + ':' + region)();
    return Math.max(0, Math.min(1, base + (r - 0.55) * 0.3));
  }
  const HEAT_STEPS = [12, 28, 46, 66, 86]; // % of --master mixed into white
  function heatStep(v) { return v < 0.55 ? 0 : v < 0.7 ? 1 : v < 0.8 ? 2 : v < 0.9 ? 3 : 4; }

  function renderAds(el, ctx, root) {
    const net = ctx.network;
    const st = S(ctx);
    const regions = net.regions || [];

    function draw() {
      const ads = st.master_ads;
      const rows = ads.map((a) => `<tr>
        <td><span class="badge badge-master">${esc(PLACEMENT[a.placement] || a.placement)}</span></td>
        <td style="min-width:220px"><strong>${esc(a.title)}</strong>${a.isNew ? ' <span class="badge badge-ok">New</span>' : ''}<div class="small muted">Button: ${esc(a.cta)}</div></td>
        <td style="min-width:160px">${esc(a.sponsor)}</td>
        <td><div class="mn-meter" title="Fill rate ${Math.round(a.fillRate * 100)}%"><div class="mn-meter-track"><div class="mn-meter-fill" style="width:${Math.round(a.fillRate * 100)}%"></div></div><b style="font-variant-numeric:tabular-nums;min-width:38px;text-align:right">${Math.round(a.fillRate * 100)}%</b></div></td>
      </tr>`).join('');

      const placements = Object.keys(PLACEMENT);
      let heat = `<div class="mn-hh" aria-hidden="true"></div>` + regions.map((r) => `<div class="mn-hh"><span class="mn-f">${esc(r.name)}</span><span class="mn-s">${esc(REGION_SHORT[r.id] || r.name)}</span></div>`).join('');
      placements.forEach((p) => {
        heat += `<div class="mn-hr">${esc(PLACEMENT[p])}</div>`;
        regions.forEach((r) => {
          const v = heatValue(p, r.id, ads);
          const s = heatStep(v);
          const ink = s >= 2 ? '#fff' : 'var(--ink)';
          heat += `<div class="mn-cell" tabindex="0" style="background:color-mix(in srgb, var(--master) ${HEAT_STEPS[s]}%, white);color:${ink}"
            title="${esc(PLACEMENT[p])} · ${esc(r.name)}: ${Math.round(v * 100)}% filled" aria-label="${esc(PLACEMENT[p])} in ${esc(r.name)}: ${Math.round(v * 100)} percent filled">${Math.round(v * 100)}%</div>`;
        });
      });

      root.innerHTML = `
        <div class="card" data-tour="master-ads">
          <div class="card-head"><h3>Network ad campaigns</h3><span class="spacer"></span>
            <button class="btn btn-sm btn-primary" data-act="new">New network campaign</button></div>
          <div class="table-wrap" style="border:0;border-radius:0 0 var(--r-lg) var(--r-lg)">
            <table class="table"><thead><tr><th>Placement</th><th>Campaign</th><th>Sponsor</th><th>Fill rate</th></tr></thead><tbody>${rows}</tbody></table>
          </div>
        </div>
        <p class="small muted" style="margin-top:8px">Fill rate is the share of network slots showing this campaign this week.</p>

        <div class="mn-block">
          <div class="card">
            <div class="card-head"><h3>Slot fill by region</h3></div>
            <div class="card-body">
              <div class="mn-heat" role="table" aria-label="Network slot fill rate by placement and region">${heat}</div>
              <div class="mn-scale" aria-hidden="true">Less filled ${HEAT_STEPS.map((p) => `<i style="background:color-mix(in srgb, var(--master) ${p}%, white)"></i>`).join('')} Fully filled</div>
            </div>
          </div>
        </div>
        <div class="mn-block grid-2" style="align-items:start">
            <div class="explain"><strong>Network slots and local slots.</strong> Network slots are reserved for national campaigns. Local slots always belong to the county, so your sponsors and your events keep their place on your site.</div>
            <div class="card"><div class="card-body">
              <div class="small muted" style="margin-bottom:6px">How the two kinds look on every county page</div>
              <div class="mn-slots">
                <div class="ad-slot master"><strong>${esc((ads[0] || {}).title || 'Network campaign')}</strong><div class="small muted">Set by the Master Network</div></div>
                <div class="ad-slot local"><strong>${esc(((ctx.tenant.localAds || [])[0] || {}).sponsor || 'Your local sponsor')}</strong><div class="small muted">Set by ${esc(ctx.tenant.shortName || 'your county')}</div></div>
              </div>
            </div></div>
        </div>`;
    }
    draw();

    root.addEventListener('click', (e) => {
      if (!e.target.closest('[data-act="new"]')) return;
      ctx.modal({
        title: 'New network campaign',
        html: `<div class="stack scr-master">
          <div class="mn-field"><label for="mn-n-title">Campaign headline</label><input class="input" id="mn-n-title" value="Become a poll observer on Election Day"></div>
          <div class="mn-field"><label for="mn-n-sponsor">Sponsor</label><input class="input" id="mn-n-sponsor" value="Republican County Committee Network"></div>
          <div class="mn-field"><label for="mn-n-place">Placement</label><select class="select" id="mn-n-place">${Object.keys(PLACEMENT).map((p) => `<option value="${p}">${PLACEMENT[p]}</option>`).join('')}</select></div>
          <div class="mn-field"><label for="mn-n-cta">Button text</label><input class="input" id="mn-n-cta" value="Sign up"></div>
          <p class="small muted">The campaign fills network slots only. Every county's local slots stay with the county.</p>
          <p class="mn-err" id="mn-n-err" hidden></p>
        </div>`,
        actions: [
          { label: 'Cancel' },
          { label: 'Launch campaign', primary: true, onClick(api) {
            const v = (id) => (api.body.querySelector(id).value || '').trim();
            const title = v('#mn-n-title');
            if (!title) { const er = api.body.querySelector('#mn-n-err'); er.hidden = false; er.textContent = 'Add a headline to launch.'; return false; }
            st.master_ads.unshift({ id: 'ma-new-' + (st.master_ads.length + 1), placement: v('#mn-n-place'), title, sponsor: v('#mn-n-sponsor') || 'Republican County Committee Network', cta: v('#mn-n-cta') || 'Learn more', fillRate: 0.35, isNew: true });
            ctx.toast(`“${title}” is now filling network slots.`, 'ok');
            if (root.isConnected) draw();
          } },
        ],
      });
    });
  }

  /* ================= ANALYTICS ================= */
  const METRICS = {
    visitors: { label: 'Visitors', long: 'Weekly visitors', usd: false },
    signups: { label: 'Signups', long: 'Weekly volunteer and newsletter signups', usd: false },
    donationsUsd: { label: 'Donations', long: 'Weekly online donations', usd: true },
  };
  function fmtDate(w) { return new Date(w + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
  function niceStep(max, ticks) {
    const raw = max / ticks;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }

  function drawChart(host, metric, weekly) {
    const M = METRICS[metric];
    const W = Math.max(280, Math.floor(host.clientWidth));
    const small = W < 520;
    const H = small ? 240 : 300;
    const pad = { l: small ? 44 : 56, r: small ? 46 : 64, t: 18, b: 34 };
    const vals = weekly.map((w) => w[metric]);
    const n = vals.length;
    const step = niceStep(Math.max(...vals), 4);
    const yMax = Math.ceil(Math.max(...vals) / step) * step;
    const x = (i) => pad.l + i * (W - pad.l - pad.r) / (n - 1);
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / yMax);
    const fmtFull = (v) => M.usd ? U.fmtUsd(v) : U.fmtNum(v);
    let grid = '';
    for (let v = 0; v <= yMax + 1e-9; v += step) {
      grid += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>
        <text x="${pad.l - 8}" y="${y(v)}" dy=".32em" text-anchor="end" font-size="12.5" fill="var(--ink-3)" style="font-variant-numeric:tabular-nums">${compact(v, M.usd)}</text>`;
    }
    const every = small ? 4 : 2;
    let xl = '';
    weekly.forEach((w, i) => {
      if (i % every === 0 || i === n - 1) {
        if (i !== n - 1 && n - 1 - i < every) return;
        xl += `<text x="${x(i)}" y="${H - pad.b + 20}" text-anchor="middle" font-size="12.5" fill="var(--ink-3)">${fmtDate(w.week)}</text>`;
      }
    });
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const line = 'M' + pts.join('L');
    const area = `${line}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
    const last = vals[n - 1];
    host.innerHTML = `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="${esc(M.long)}, ${fmtDate(weekly[0].week)} to ${fmtDate(weekly[n - 1].week)}. Latest week ${fmtFull(last)}. Use left and right arrow keys to read each week.">
        ${grid}
        <line x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line-strong)" stroke-width="1"/>
        ${xl}
        <path d="${area}" fill="var(--master)" fill-opacity=".1"/>
        <path d="${line}" fill="none" stroke="var(--master)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${x(n - 1)}" cy="${y(last)}" r="5" fill="var(--master)" stroke="var(--surface)" stroke-width="2"/>
        <text x="${x(n - 1) + 9}" y="${y(last)}" dy=".32em" font-size="13" font-weight="700" fill="var(--ink)">${compact(last, M.usd)}</text>
        <g class="mn-hover" style="display:none">
          <line class="mn-cross" y1="${pad.t}" y2="${y(0)}" stroke="var(--ink-3)" stroke-width="1"/>
          <circle class="mn-hdot" r="5" fill="var(--master)" stroke="var(--surface)" stroke-width="2"/>
        </g>
        <rect class="mn-hit" x="${pad.l - 10}" y="0" width="${W - pad.l - pad.r + 20}" height="${H}" fill="transparent"/>
      </svg>
      <div class="mn-tip" role="presentation"></div>`;
    const svg = host.querySelector('svg');
    const hov = svg.querySelector('.mn-hover');
    const cross = svg.querySelector('.mn-cross');
    const hdot = svg.querySelector('.mn-hdot');
    const tip = host.querySelector('.mn-tip');
    let cur = n - 1;
    function show(i) {
      cur = Math.max(0, Math.min(n - 1, i));
      const cx = x(cur), cy = y(vals[cur]);
      hov.style.display = '';
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx);
      hdot.setAttribute('cx', cx); hdot.setAttribute('cy', cy);
      tip.textContent = '';
      const b = document.createElement('b'); b.textContent = fmtFull(vals[cur]);
      const row = document.createElement('div');
      const key = document.createElement('span'); key.className = 'mn-key';
      row.appendChild(key); row.appendChild(document.createTextNode(`${M.label} · week of ${fmtDate(weekly[cur].week)}`));
      tip.appendChild(b); tip.appendChild(row);
      tip.style.display = 'block';
      const tw = tip.offsetWidth;
      const left = Math.max(tw / 2 + 2, Math.min(W - tw / 2 - 2, cx));
      tip.style.left = left + 'px';
      tip.style.top = Math.max(tip.offsetHeight + 4, cy - 12) + 'px';
    }
    function hide() { hov.style.display = 'none'; tip.style.display = 'none'; }
    const hit = svg.querySelector('.mn-hit');
    const toIdx = (e) => {
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) * (W / r.width);
      return Math.round((px - pad.l) / ((W - pad.l - pad.r) / (n - 1)));
    };
    hit.addEventListener('pointermove', (e) => show(toIdx(e)));
    hit.addEventListener('pointerdown', (e) => show(toIdx(e)));
    hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    svg.addEventListener('focus', () => show(cur));
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(cur - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); show(cur + 1); }
      else if (e.key === 'Home') { e.preventDefault(); show(0); }
      else if (e.key === 'End') { e.preventDefault(); show(n - 1); }
    });
  }

  function renderAnalytics(el, ctx, root) {
    const net = ctx.network;
    const st = S(ctx);
    const weekly = net.weekly || [];
    if (!METRICS[st.master_metric]) st.master_metric = 'visitors';
    const totalVisitors = (net.kpis && net.kpis.weeklyVisitors) || 1;

    const top = (net.counties || []).filter((c) => c.status !== 'invited')
      .sort((a, b) => (b.visitors7d - a.visitors7d) || a.name.localeCompare(b.name));
    const topRows = top.map((c, i) => {
      const region = (net.regions || []).find((r) => r.id === c.region);
      const live = c.status === 'live';
      return `<tr>
        <td class="num">${i + 1}</td>
        <td><strong>${esc(countyName(net, c.slug))}</strong><div class="small muted">${esc(region ? region.name : '')}</div></td>
        <td>${live ? '<span class="badge badge-ok">Live</span>' : '<span class="badge badge-warn">Onboarding</span>'}</td>
        <td class="num">${live ? U.fmtNum(c.visitors7d) : '—'}</td>
        <td class="num">${live ? U.fmtNum(c.volunteers) : '—'}</td>
        <td class="num">${live ? U.fmtNum(c.candidates) : '—'}</td>
        <td class="num">${live ? U.fmtUsd(c.donationsUsd) : '—'}</td>
        <td class="num">${live ? (c.visitors7d / totalVisitors * 100).toFixed(1) + '%' : '—'}</td>
      </tr>`;
    }).join('');

    root.innerHTML = `
      <div class="card" data-tour="master-analytics">
        <div class="card-head"><h3 id="mn-chart-title"></h3><span class="spacer"></span>
          <div class="row" role="group" aria-label="Choose a measure" style="gap:6px">
            ${Object.keys(METRICS).map((m) => `<button type="button" class="chip${m === st.master_metric ? ' active' : ''}" data-metric="${m}" aria-pressed="${m === st.master_metric}">${METRICS[m].label}</button>`).join('')}
          </div>
        </div>
        <div class="card-body">
          <div class="mn-sum" id="mn-sum"></div>
          <div class="mn-chart" id="mn-chart"></div>
          <p class="small muted" style="margin-top:6px">Weeks starting ${fmtDate(weekly[0].week)} through ${fmtDate(weekly[weekly.length - 1].week)}. Hover or tap the chart for each week.</p>
          <details class="mn-tbl"><summary>Show the numbers as a table</summary><div class="table-wrap" id="mn-wtable"></div></details>
        </div>
      </div>

      <div class="mn-block">
        <div class="explain"><strong>Why this matters for your committee.</strong> Seeing the whole network side by side shows which ideas work. When one county's volunteer drive takes off, every other county can borrow the same playbook the next week.</div>
      </div>

      <div class="mn-block">
        <div class="mn-section-title"><h2>Top counties</h2><span class="small muted">California committees on the platform, last 7 days</span></div>
        <div class="table-wrap"><table class="table"><thead><tr><th class="num">#</th><th>Committee</th><th>Status</th><th class="num">Visitors</th><th class="num">Volunteers</th><th class="num">Candidates</th><th class="num">Raised</th><th class="num">Share of network visitors</th></tr></thead><tbody>${topRows}</tbody></table></div>
        <p class="small muted" style="margin-top:8px">Onboarding committees start reporting the day their site goes live.</p>
      </div>`;

    const host = root.querySelector('#mn-chart');
    function redraw() {
      const m = st.master_metric, M = METRICS[m];
      root.querySelector('#mn-chart-title').textContent = M.long;
      const vals = weekly.map((w) => w[m]);
      const n = vals.length;
      const lastV = vals[n - 1], prev = vals[n - 2], four = vals[n - 5];
      const pct = (a, b) => ((a - b) / b * 100);
      const f = (v) => M.usd ? U.fmtUsd(v) : U.fmtNum(v);
      const sumTile = (val, label, delta) => `<div class="kpi" style="padding:12px 14px"><div class="kpi-value" style="font-size:1.6rem">${val}</div><div class="kpi-label">${label}</div>${delta != null ? `<div class="kpi-delta ${delta >= 0 ? 'up' : 'down'}">${Math.abs(delta).toFixed(1)}%</div>` : ''}</div>`;
      root.querySelector('#mn-sum').innerHTML =
        sumTile(f(lastV), 'Latest week', pct(lastV, prev)) +
        sumTile(f(four), 'Four weeks earlier', null) +
        sumTile(f(vals.reduce((a, b) => a + b, 0)), `Total, ${n} weeks`, null);
      root.querySelector('#mn-wtable').innerHTML = `<table class="table"><thead><tr><th>Week starting</th><th class="num">${esc(M.label)}</th></tr></thead><tbody>${weekly.map((w) => `<tr><td>${fmtDate(w.week)}</td><td class="num">${f(w[m])}</td></tr>`).join('')}</tbody></table>`;
      drawChart(host, m, weekly);
    }
    redraw();
    let lastW = host.clientWidth;
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        if (!host.isConnected) { ro.disconnect(); return; }
        if (Math.abs(host.clientWidth - lastW) > 4) { lastW = host.clientWidth; drawChart(host, st.master_metric, weekly); }
      });
      ro.observe(host);
    }
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-metric]');
      if (!b) return;
      st.master_metric = b.dataset.metric;
      root.querySelectorAll('[data-metric]').forEach((c) => { const on = c.dataset.metric === st.master_metric; c.classList.toggle('active', on); c.setAttribute('aria-pressed', on); });
      redraw();
    });
  }

  /* ================= register ================= */
  App.register({
    id: 'master',
    title: 'Master Network Console',
    group: 'Master Network',
    icon: ICON,
    blurb: 'Push news and network ads to every county while each keeps its local zones.',
    render(el, ctx) {
      injectStyles();
      S(ctx);
      el.classList.add('scr-master');
      const sub = TABS.some((t) => t.sub === ctx.sub) ? ctx.sub : '';
      el.innerHTML = `<div class="page">${chrome(Object.assign({}, ctx, { sub }))}<div class="mn-body"></div></div>`;
      const root = el.querySelector('.mn-body');
      if (sub === 'push') renderPush(el, ctx, root);
      else if (sub === 'ads') renderAds(el, ctx, root);
      else if (sub === 'analytics') renderAnalytics(el, ctx, root);
      else renderDashboard(el, ctx, root);
    },
  });
})();
