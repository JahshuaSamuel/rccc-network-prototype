/* screens/public-hub.js — Public Media Hub (Agent 3)
   The county's public home page exactly as a visitor sees it, inside a browser frame,
   with a "Show who controls each zone" overlay that labels Network vs Local zones. */
(function () {
  'use strict';
  if (!window.App) return;

  const U = App.util;
  const esc = U.esc;
  const I = (d, s) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

  const ICON = I('<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M3 8h14M7 12h6"/>');
  const IC_NET = I('<circle cx="10" cy="4.5" r="2"/><circle cx="4.5" cy="15" r="2"/><circle cx="15.5" cy="15" r="2"/><path d="M10 6.5v3M10 9.5L5.5 13.3M10 9.5l4.5 3.8"/>', 14);
  const IC_LOCK = '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>';
  const IC_X = I('<path d="M5 5l10 10M15 5L5 15"/>', 16);
  const IC_PIN = I('<path d="M12.5 3.5l4 4-3 1.5-2.5 2.5.5 3.5-1.5 1.5-3-3-3.5 3.5M7 10l3 3M8.5 7.5L11 5"/>', 13);
  const IC_PLAY = '<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor"/></svg>';
  const IC_PAUSE = '<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="4" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="11.5" y="4" width="3.5" height="12" rx="1" fill="currentColor"/></svg>';
  const IC_ADDR = '<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>';

  const STAR = (x, y, r, style) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 ? r * 0.42 : r;
      pts.push((x + rr * Math.cos(a)).toFixed(1) + ',' + (y + rr * Math.sin(a)).toFixed(1));
    }
    return `<polygon points="${pts.join(' ')}" style="${style}"/>`;
  };
  const STAR_ICON = (s, color) => `<svg width="${s}" height="${s}" viewBox="0 0 20 20" aria-hidden="true">${STAR(10, 10.6, 9.4, 'fill:' + (color || 'currentColor'))}</svg>`;

  const TABS = [
    { id: 'national', label: 'National' },
    { id: 'state', label: 'State' },
    { id: 'county', label: 'County' },
    { id: 'city', label: 'City' },
  ];

  /* ---------------- scoped styles ---------------- */
  const HUB_CSS = `
.scr-hub .ph-control { display:flex; flex-wrap:wrap; align-items:center; gap:14px 22px; padding:16px 20px; margin-bottom:16px;
  border:1px solid var(--line); border-radius:var(--r-lg); background:var(--surface); box-shadow:var(--shadow-1);
  transition:border-color .25s ease, box-shadow .25s ease; }
.scr-hub.ph-zones-on .ph-control { border-color:color-mix(in srgb, var(--master) 40%, white); box-shadow:0 0 0 4px color-mix(in srgb, var(--master) 10%, transparent), var(--shadow-1); }
.scr-hub .ph-switch { display:flex; align-items:center; gap:14px; cursor:pointer; flex:1 1 100%; min-width:0; }
.scr-hub .ph-legend { padding-left:70px; }
@media (max-width:560px){ .scr-hub .ph-legend { padding-left:0; } }
.scr-hub .ph-switch input.toggle { width:56px; height:32px; }
.scr-hub .ph-switch input.toggle::after { width:26px; height:26px; }
.scr-hub .ph-switch input.toggle:checked { background:var(--master); }
.scr-hub .ph-switch input.toggle:checked::after { transform:translateX(24px); }
.scr-hub .ph-switch-title { font-family:var(--font-head); font-stretch:85%; font-weight:800; font-size:1.2rem; line-height:1.2; display:block; color:var(--ink); }
.scr-hub .ph-switch-sub { font-size:14.5px; color:var(--ink-2); display:block; }
.scr-hub .ph-legend { display:flex; flex-wrap:wrap; gap:8px; }
.scr-hub .ph-legend-item { display:inline-flex; align-items:center; gap:8px; padding:6px 12px 6px 6px; border-radius:999px; font-size:14px; font-weight:600;
  border:1px solid var(--line); background:var(--surface-2); color:var(--ink-2); transition:background-color .25s, border-color .25s, color .25s; }
.scr-hub .ph-legend-item b { display:inline-flex; align-items:center; justify-content:center; min-width:26px; height:26px; padding:0 7px; border-radius:999px; color:#fff; font-size:13.5px; }
.scr-hub .ph-legend-item.is-net b { background:var(--master); }
.scr-hub .ph-legend-item.is-loc b { background:var(--brand); color:var(--brand-ink); }
.scr-hub.ph-zones-on .ph-legend-item.is-net { background:var(--master-soft); border-color:color-mix(in srgb, var(--master) 35%, white); color:var(--master); }
.scr-hub.ph-zones-on .ph-legend-item.is-loc { background:color-mix(in srgb, var(--brand) 9%, white); border-color:color-mix(in srgb, var(--brand) 35%, white); color:var(--brand); }

.scr-hub .lay-switch { display:inline-flex; align-items:center; gap:4px; padding:4px; border-radius:999px; background:var(--surface); border:1px solid var(--line-strong); box-shadow:var(--shadow-1); max-width:100%; }
.scr-hub .lay-switch-wrap { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin-bottom:18px; }
.scr-hub .lay-switch-label { font-size:14px; font-weight:600; color:var(--ink-3); }
.scr-hub .lay-switch a { display:inline-flex; align-items:center; gap:7px; padding:7px 16px; border-radius:999px; font:600 14.5px/1.2 var(--font-body); color:var(--ink-2); text-decoration:none; white-space:nowrap; }
.scr-hub .lay-switch a:hover { color:var(--ink); background:var(--surface-2); }
.scr-hub .lay-switch a.is-on { background:var(--brand); color:var(--brand-ink); }

/* browser frame */
.scr-hub .ph-browser { border:1px solid var(--line-strong); border-radius:14px; background:#fff; box-shadow:var(--shadow-2); overflow:hidden; container-type:inline-size; }
.scr-hub .ph-chrome { display:flex; align-items:center; gap:12px; padding:10px 14px; background:#E9ECF1; border-bottom:1px solid var(--line-strong); }
.scr-hub .ph-dots { display:flex; gap:7px; flex:none; }
.scr-hub .ph-dots i { width:12px; height:12px; border-radius:50%; background:#F26B5E; display:block; }
.scr-hub .ph-dots i:nth-child(2) { background:#F5BE4F; } .scr-hub .ph-dots i:nth-child(3) { background:#5CC26A; }
.scr-hub .ph-addr { flex:1; min-width:0; display:flex; align-items:center; gap:8px; background:#fff; border:1px solid var(--line); border-radius:999px; padding:6px 14px; font-size:14.5px; color:var(--ink-2); }
.scr-hub .ph-addr svg { color:var(--ok); flex:none; }
.scr-hub .ph-addr span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.scr-hub .ph-addr b { color:var(--ink); font-weight:600; }
.scr-hub .ph-visitor { font-size:13px; font-weight:600; color:var(--ink-3); white-space:nowrap; }

/* site */
.scr-hub .ph-site { display:flex; flex-direction:column; gap:14px; padding:14px; background:#fff; transition:gap .25s ease, padding .25s ease; }
.scr-hub.ph-zones-on .ph-site { gap:36px; padding-top:34px; }
.scr-hub .ph-body { display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:22px; align-items:start; transition:gap .25s ease; }
.scr-hub .ph-main, .scr-hub .ph-side { display:flex; flex-direction:column; gap:22px; min-width:0; transition:gap .25s ease; }
.scr-hub.ph-zones-on .ph-main, .scr-hub.ph-zones-on .ph-side, .scr-hub.ph-zones-on .ph-body { gap:36px; }
@container (max-width: 780px) {
  .scr-hub .ph-body { grid-template-columns:minmax(0,1fr); }
}

/* zones */
.scr-hub .ph-zone { position:relative; border-radius:var(--r); }
.scr-hub .ph-zone::after { content:''; position:absolute; inset:-5px; border-radius:calc(var(--r) + 4px); pointer-events:none;
  box-shadow:0 0 0 3px var(--zc); background:color-mix(in srgb, var(--zc) 6%, transparent); opacity:0; transition:opacity .25s ease; z-index:3; }
.scr-hub .ph-zone[data-zone="network"] { --zc: var(--master); }
.scr-hub .ph-zone[data-zone="local"] { --zc: var(--brand); }
.scr-hub .ph-zone-tag { position:absolute; top:-25px; right:6px; z-index:6; display:inline-flex; align-items:center; gap:6px;
  max-width:calc(100% - 12px); padding:4px 11px 4px 8px; border-radius:999px; font:700 13px/1.25 var(--font-body);
  background:var(--zc); color:#fff; box-shadow:0 4px 12px -4px rgba(15,22,32,.45), 0 0 0 2px #fff;
  opacity:0; transform:translateY(4px) scale(.96); transition:opacity .22s ease, transform .22s ease; pointer-events:none; white-space:nowrap; }
.scr-hub .ph-zone[data-zone="local"] > .ph-zone-tag { color:var(--brand-ink); }
.scr-hub .ph-zone-tag span { overflow:hidden; text-overflow:ellipsis; }
.scr-hub .ph-zone-tag svg { flex:none; }
.scr-hub.ph-zones-on .ph-zone::after { opacity:1; }
.scr-hub.ph-zones-on .ph-zone-tag { opacity:1; transform:none; }
.scr-hub .ph-zone .ph-zone::after { inset:-3px; }

/* ads */
.scr-hub .ph-ad { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
.scr-hub .ph-ad-mark { width:42px; height:42px; border-radius:50%; flex:none; display:inline-flex; align-items:center; justify-content:center; background:var(--slot-color); color:#fff; }
.scr-hub .ad-slot.local .ph-ad-mark { color:var(--brand-ink); }
.scr-hub .ph-ad-text { flex:1 1 220px; min-width:0; }
.scr-hub .ph-ad-title { font-family:var(--font-head); font-stretch:85%; font-weight:800; font-size:1.15rem; line-height:1.2; color:var(--ink); }
.scr-hub .ph-ad-sponsor { font-size:13.5px; color:var(--ink-3); }
.scr-hub .ph-ad-cta { background:var(--slot-color); color:#fff; border-color:var(--slot-color); }
.scr-hub .ad-slot.local .ph-ad-cta { color:var(--brand-ink); }
.scr-hub .ph-ad-cta:hover { background:color-mix(in srgb, var(--slot-color) 85%, black); color:#fff; border-color:transparent; }
.scr-hub .ad-slot.local .ph-ad-cta:hover { color:var(--brand-ink); }
.scr-hub .ph-side .ph-ad { flex-direction:column; align-items:flex-start; gap:10px; }
.scr-hub .ph-side .ph-ad-text { flex-basis:auto; }
.scr-hub .ph-side .ph-ad-title { font-size:1.08rem; }

/* breaking */
.scr-hub .ph-breaking { display:flex; align-items:center; gap:12px; padding:10px 12px 10px 14px; border-radius:var(--r);
  background:var(--accent); color:#fff; }
.scr-hub .ph-breaking-from { display:inline-flex; align-items:center; gap:6px; flex:none; font-size:12.5px; font-weight:800; text-transform:uppercase; letter-spacing:.05em;
  background:rgba(0,0,0,.22); padding:4px 10px; border-radius:999px; }
.scr-hub .ph-breaking-text { flex:1; min-width:0; font-weight:600; font-size:15px; line-height:1.35; cursor:pointer; }
.scr-hub .ph-breaking-text:hover { text-decoration:underline; }
.scr-hub .ph-breaking-x { flex:none; width:34px; height:34px; border-radius:8px; border:1px solid rgba(255,255,255,.4); background:transparent; color:#fff; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
.scr-hub .ph-breaking-x:hover { background:rgba(255,255,255,.15); }

/* nav + hero */
.scr-hub .ph-nav { background:var(--brand); color:var(--brand-ink); border-radius:var(--r); overflow:hidden; }
.scr-hub .ph-nav-bar { display:flex; align-items:center; gap:10px 18px; flex-wrap:wrap; padding:12px 16px; border-bottom:3px solid var(--accent); }
.scr-hub .ph-wm { display:flex; align-items:center; gap:10px; min-width:0; background:none; border:0; color:inherit; cursor:pointer; padding:0; text-align:left; }
.scr-hub .ph-wm-name { font-family:var(--font-head); font-stretch:80%; font-weight:800; font-size:1.45rem; line-height:1; display:block; }
.scr-hub .ph-wm-sub { font-size:13px; opacity:.85; display:block; }
.scr-hub .ph-links { display:flex; align-items:center; gap:2px; margin-left:auto; overflow-x:auto; max-width:100%; scrollbar-width:none; }
.scr-hub .ph-links button { background:none; border:0; color:inherit; font:600 15px/1.2 var(--font-body); padding:9px 10px; border-radius:6px; cursor:pointer; white-space:nowrap; }
.scr-hub .ph-links button:hover { background:rgba(255,255,255,.14); }
.scr-hub .ph-links .ph-donate { background:var(--accent); color:#fff; margin-left:6px; padding:9px 16px; }
.scr-hub .ph-links .ph-donate:hover { background:color-mix(in srgb, var(--accent) 85%, black); }
.scr-hub .ph-hero { position:relative; padding:22px 18px 22px; overflow:hidden; }
.scr-hub .ph-hero p { margin:0; max-width:56ch; font-size:1.12rem; line-height:1.45; font-weight:500; position:relative; }
.scr-hub .ph-hero-star { position:absolute; right:-14px; top:-30px; width:150px; opacity:.12; }
@container (max-width: 640px) {
  .scr-hub .ph-breaking { flex-wrap:wrap; }
  .scr-hub .ph-breaking-text { flex-basis:100%; order:3; }
  .scr-hub .ph-breaking-x { margin-left:auto; }
  .scr-hub .ph-site { padding:10px; }
  .scr-hub .ph-links { margin-left:0; width:100%; flex-wrap:wrap; }
  .scr-hub .ph-hero p { font-size:1rem; }
}

/* above the fold: voter guide + committee panel */
.scr-hub .ph-links .ph-link-guide { background:rgba(255,255,255,.14); }
.scr-hub .ph-links .ph-link-guide:hover { background:rgba(255,255,255,.24); }
.scr-hub .ph-front { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(0,1fr); gap:14px; align-items:stretch; transition:gap .25s ease; }
.scr-hub .ph-front.is-single { grid-template-columns:minmax(0,1fr); }
.scr-hub.ph-zones-on .ph-front { gap:36px; }
.scr-hub .ph-front > .ph-zone { display:flex; flex-direction:column; min-width:0; }
.scr-hub .ph-front > .ph-zone > section { flex:1; }
.scr-hub .ph-cmte { display:flex; flex-direction:column; border:1px solid var(--line); border-radius:var(--r); background:#fff; overflow:hidden; }
.scr-hub .ph-cmte-head { padding:18px 18px 14px; border-bottom:1px solid var(--line); background:color-mix(in srgb, var(--brand) 5%, white); }
.scr-hub .ph-cmte-eyebrow { display:inline-flex; align-items:center; gap:6px; font:800 12px/1.2 var(--font-body); letter-spacing:.09em; text-transform:uppercase; color:var(--ink-3); }
.scr-hub .ph-cmte-head h2 { margin:6px 0 4px; font-size:1.5rem; line-height:1.05; }
.scr-hub .ph-cmte-head p { margin:0; font-size:14.5px; line-height:1.45; color:var(--ink-2); }
.scr-hub .ph-cmte-item { display:flex; gap:12px; align-items:flex-start; padding:14px 18px; border-bottom:1px solid var(--line); }
.scr-hub .ph-cmte-info { flex:1; min-width:0; }
.scr-hub .ph-cmte-kind { display:block; font:800 11.5px/1.3 var(--font-body); letter-spacing:.07em; text-transform:uppercase; color:var(--accent); }
.scr-hub .ph-cmte-title { font-weight:800; font-size:15.5px; line-height:1.3; margin-top:1px; }
.scr-hub .ph-cmte-sub { font-size:13.5px; color:var(--ink-3); line-height:1.4; margin:2px 0 8px; }
.scr-hub .ph-cmte-actions { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:8px; padding:14px 18px 18px; margin-top:auto; }
.scr-hub .ph-cmte-actions .btn { width:100%; justify-content:center; padding-left:8px; padding-right:8px; }
.scr-hub .ph-cmte-donate { background:var(--accent); border-color:var(--accent); color:#fff; }
.scr-hub .ph-cmte-donate:hover { background:color-mix(in srgb, var(--accent) 85%, black); color:#fff; }
@container (max-width: 780px) {
  .scr-hub .ph-front { grid-template-columns:minmax(0,1fr); }
}
@container (max-width: 420px) {
  .scr-hub .ph-cmte-actions { grid-template-columns:minmax(0,1fr); }
}

/* feed */
.scr-hub .ph-section-head { display:flex; align-items:baseline; flex-wrap:wrap; gap:4px 12px; margin-bottom:8px; }
.scr-hub .ph-section-head h2 { margin:0; font-size:1.45rem; }
.scr-hub .ph-feed .tabs { margin-bottom:14px; }
.scr-hub .ph-cards { display:flex; flex-direction:column; gap:12px; }
.scr-hub .ph-card { border:1px solid var(--line); border-radius:var(--r); padding:14px 16px; background:#fff; cursor:pointer; transition:border-color .15s, box-shadow .15s; }
.scr-hub .ph-card:hover { border-color:var(--line-strong); box-shadow:var(--shadow-2); }
.scr-hub .ph-card:focus-visible { box-shadow:var(--focus); }
.scr-hub .ph-card.is-new { border-left:4px solid var(--accent); }
.scr-hub .ph-card.is-pinned { border-left:4px solid var(--master); }
.scr-hub .ph-card-top { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:6px; }
.scr-hub .ph-card-tag { font-size:12.5px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--accent); margin-right:4px; }
.scr-hub .ph-card h3 { font-size:1.15rem; margin:0 0 4px; }
.scr-hub .ph-card p { margin:0 0 6px; color:var(--ink-2); font-size:15px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.scr-hub .ph-meta { font-size:13.5px; color:var(--ink-3); }
.scr-hub .ph-meta b { color:var(--ink-2); font-weight:600; }
.scr-hub .badge-new { background:var(--accent); color:#fff; border-color:var(--accent); }
.scr-hub .ph-empty { padding:24px; text-align:center; border:1px dashed var(--line-strong); border-radius:var(--r); color:var(--ink-3); }

/* video */
.scr-hub .ph-videos { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:14px; }
@container (max-width: 640px) { .scr-hub .ph-videos { grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; } }
.scr-hub .ph-video { background:none; border:0; padding:0; text-align:left; cursor:pointer; color:inherit; font:inherit; min-width:0; }
.scr-hub .ph-thumb { position:relative; border-radius:var(--r); overflow:hidden; aspect-ratio:16/9; background:var(--brand); }
.scr-hub .ph-thumb svg { display:block; width:100%; height:100%; transition:transform .25s ease; }
.scr-hub .ph-video:hover .ph-thumb svg { transform:scale(1.04); }
.scr-hub .ph-dur { position:absolute; right:6px; bottom:6px; background:rgba(10,14,20,.8); color:#fff; font-size:12.5px; font-weight:700; padding:2px 6px; border-radius:4px; }
.scr-hub .ph-vbadge { position:absolute; left:6px; top:6px; }
.scr-hub .ph-video-chan { font-size:13px; color:var(--ink-3); font-weight:600; margin-top:7px; display:block; }
.scr-hub .ph-video-title { font-weight:700; font-size:14.5px; line-height:1.3; color:var(--ink); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }

/* candidate photo thumbnails */
.ph-photo-thumb { position:absolute; inset:0; overflow:hidden; background:#1B222C; }
.ph-photo-thumb img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .25s ease; }
.ph-photo-thumb::after { content:''; position:absolute; inset:0; background:linear-gradient(180deg, rgba(10,14,20,.25), rgba(10,14,20,.6)); }
.ph-photo-thumb.is-big::after { background:linear-gradient(180deg, rgba(10,14,20,.05) 40%, rgba(10,14,20,.7)); }
.scr-hub .ph-video:hover .ph-photo-thumb img { transform:scale(1.04); }
.ph-photo-play { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); z-index:1; width:44px; height:44px; border-radius:50%;
  background:rgba(255,255,255,.92); color:var(--brand); display:inline-flex; align-items:center; justify-content:center; }
.ph-photo-play svg { margin-left:3px; }
.ph-photo-cap { position:absolute; left:5%; bottom:12%; z-index:1; color:#fff; font:800 1.5rem/1.1 var(--font-head); font-stretch:85%; text-shadow:0 1px 4px rgba(0,0,0,.4); }
.scr-hub .ph-thumb .ph-dur, .scr-hub .ph-thumb .ph-vbadge { z-index:2; }
.ph-player-screen .ph-player-big, .ph-player-screen .ph-player-eq { z-index:2; }

/* sidebar widgets */
.scr-hub .ph-widget { border:1px solid var(--line); border-radius:var(--r); background:#fff; }
.scr-hub .ph-widget-head { padding:12px 14px 10px; border-bottom:1px solid var(--line); }
.scr-hub .ph-widget-head h3 { margin:0; font-size:1.12rem; }
.scr-hub .ph-widget-head .small { color:var(--ink-3); }
.scr-hub .ph-event { display:flex; gap:12px; padding:12px 14px; border-bottom:1px solid var(--line); align-items:flex-start; }
.scr-hub .ph-event:last-child { border-bottom:0; }
.scr-hub .ph-date { flex:none; width:46px; text-align:center; border-radius:8px; overflow:hidden; border:1px solid var(--line); }
.scr-hub .ph-date b { display:block; background:var(--brand); color:var(--brand-ink); font-size:11.5px; letter-spacing:.06em; padding:2px 0; }
.scr-hub .ph-date span { display:block; font-family:var(--font-head); font-weight:800; font-size:1.3rem; line-height:1.3; }
.scr-hub .ph-event-info { flex:1; min-width:0; }
.scr-hub .ph-event-title { font-weight:700; font-size:14.5px; line-height:1.3; }
.scr-hub .ph-event-sub { font-size:13px; color:var(--ink-3); line-height:1.35; margin:2px 0 7px; }
.scr-hub .ph-rsvp-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.scr-hub .ph-rsvp.is-going { background:var(--ok-soft); color:var(--ok); border-color:color-mix(in srgb, var(--ok) 35%, white); }
.scr-hub .ph-cand { display:flex; align-items:center; gap:12px; width:100%; padding:11px 14px; background:none; border:0; border-bottom:1px solid var(--line); cursor:pointer; text-align:left; font:inherit; color:inherit; }
.scr-hub .ph-cand:last-child { border-bottom:0; }
.scr-hub .ph-cand:hover { background:var(--surface-2); }
.scr-hub .ph-cand-name { font-weight:700; font-size:15px; display:block; line-height:1.25; }
.scr-hub .ph-cand-office { font-size:13px; color:var(--ink-3); display:block; }
.scr-hub .ph-cand-arrow { margin-left:auto; color:var(--ink-3); flex:none; }

/* footer */
.scr-hub .ph-footer { background:#121A24; color:#D4DAE3; border-radius:var(--r); padding:20px 18px; font-size:14px; }
.scr-hub .ph-footer-top { display:flex; flex-wrap:wrap; gap:14px 24px; align-items:center; justify-content:space-between; margin-bottom:14px; }
.scr-hub .ph-footer .ph-wm-name { color:#fff; font-size:1.3rem; }
.scr-hub .ph-footer-links { display:flex; flex-wrap:wrap; gap:4px 16px; }
.scr-hub .ph-footer-links button { background:none; border:0; color:#D4DAE3; font:600 14px var(--font-body); cursor:pointer; padding:4px 0; }
.scr-hub .ph-footer-links button:hover { color:#fff; text-decoration:underline; }
.scr-hub .ph-paidfor { display:inline-block; border:1.5px solid #8C97A6; padding:6px 10px; font-weight:600; color:#fff; font-size:13.5px; margin-bottom:8px; }
.scr-hub .ph-footer .small { color:#A9B3C1; }

/* modals (live in body, so scoped by modal content class) */
.ph-modal-meta { font-size:14px; color:var(--ink-3); margin-bottom:10px; display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.ph-modal-source { margin-top:14px; padding:10px 12px; border-radius:var(--r-sm); background:var(--surface-2); border:1px solid var(--line); font-size:14.5px; color:var(--ink-2); }
.ph-player { border-radius:var(--r); overflow:hidden; background:#0E141C; }
.ph-player-screen { position:relative; aspect-ratio:16/9; cursor:pointer; }
.ph-player-screen svg { display:block; width:100%; height:100%; }
.ph-player-big { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; transition:opacity .2s; }
.ph-player-big span { width:64px; height:64px; border-radius:50%; background:rgba(255,255,255,.92); color:#111; display:inline-flex; align-items:center; justify-content:center; }
.ph-player-big svg { width:26px; height:26px; margin-left:3px; }
.ph-player.is-playing .ph-player-big { opacity:0; }
.ph-player-eq { position:absolute; left:12px; bottom:10px; display:flex; gap:3px; align-items:flex-end; height:18px; opacity:0; transition:opacity .2s; }
.ph-player-eq i { width:4px; background:#fff; border-radius:2px; height:6px; animation:ph-eq 0.9s ease-in-out infinite; animation-play-state:paused; }
.ph-player-eq i:nth-child(2) { animation-delay:-.3s; } .ph-player-eq i:nth-child(3) { animation-delay:-.6s; }
.ph-player.is-playing .ph-player-eq { opacity:.85; }
.ph-player.is-playing .ph-player-eq i { animation-play-state:running; }
@keyframes ph-eq { 0%,100% { height:5px; } 50% { height:17px; } }
.ph-player-bar { display:flex; align-items:center; gap:10px; padding:8px 10px; color:#fff; }
.ph-player-btn { width:36px; height:36px; border-radius:50%; border:0; background:rgba(255,255,255,.14); color:#fff; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; flex:none; }
.ph-player-btn:hover { background:rgba(255,255,255,.24); }
.ph-player-track { flex:1; height:6px; border-radius:3px; background:rgba(255,255,255,.22); cursor:pointer; position:relative; }
.ph-player-fill { position:absolute; left:0; top:0; bottom:0; width:0; border-radius:3px; background:var(--accent); }
.ph-player-time { font-size:13px; font-variant-numeric:tabular-nums; white-space:nowrap; opacity:.9; }
.ph-player-note { display:flex; gap:8px; align-items:center; margin-top:12px; font-weight:600; color:var(--ok); font-size:14.5px; }
.ph-vol-form { display:flex; flex-direction:column; gap:12px; }
.ph-vol-form label { font-weight:600; font-size:14.5px; display:flex; flex-direction:column; gap:5px; }
.ph-vol-err { color:var(--danger); font-size:14px; font-weight:600; min-height:1em; }
.ph-thanks { text-align:center; padding:12px 4px 4px; }
.ph-thanks-mark { width:56px; height:56px; border-radius:50%; background:var(--ok-soft); color:var(--ok); display:inline-flex; align-items:center; justify-content:center; margin-bottom:10px; }
`;

  function injectStyle() {
    if (document.getElementById('scr-hub-style')) return;
    const s = document.createElement('style');
    s.id = 'scr-hub-style';
    s.textContent = HUB_CSS;
    document.head.appendChild(s);
  }

  /* ---------------- helpers ---------------- */
  function st() {
    const S = App.state;
    S.hiddenPushes = S.hiddenPushes || [];
    S.pinnedPushes = S.pinnedPushes || [];
    S.localPosts = S.localPosts || [];
    S.hub_rsvp = S.hub_rsvp || {};
    S.hub_tab = S.hub_tab || 'national';
    S.extraNetworkItems = S.extraNetworkItems || [];
    if (typeof S.hub_zones !== 'boolean') S.hub_zones = false;
    return S;
  }

  function zoneTag(kind, t) {
    return kind === 'network'
      ? `<span class="ph-zone-tag" aria-hidden="true">${IC_NET}<span>Network — set by Master Network</span></span>`
      : `<span class="ph-zone-tag" aria-hidden="true">${STAR_ICON(13)}<span>Local — set by ${esc(t.shortName)}</span></span>`;
  }
  function zone(kind, t, inner, attrs) {
    return `<div class="ph-zone" data-zone="${kind}" ${attrs || ''}>${zoneTag(kind, t)}${inner}</div>`;
  }

  function adSlot(ad, kind, extra) {
    if (!ad) return '';
    const mark = kind === 'master' ? IC_NET.replace(/width="14" height="14"/, 'width="20" height="20"') : STAR_ICON(20);
    return `<div class="ad-slot ${kind}" ${extra || ''}>
      <div class="ph-ad">
        <span class="ph-ad-mark">${mark}</span>
        <div class="ph-ad-text">
          <div class="ph-ad-title">${esc(ad.title)}</div>
          <div class="ph-ad-sponsor">Sponsored by ${esc(ad.sponsor)}</div>
        </div>
        <button class="btn btn-sm ph-ad-cta" data-act="ad" data-kind="${kind}" data-title="${esc(ad.sponsor)}">${esc(ad.cta)}</button>
      </div>
    </div>`;
  }

  function fmtDate(d) {
    const dt = new Date(d + 'T12:00:00');
    if (isNaN(dt)) return { mon: '', day: '', long: d };
    return {
      mon: dt.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      day: dt.getDate(),
      long: dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    };
  }

  function durSecs(d) {
    const p = String(d || '0:00').split(':').map(Number);
    return p.reduce((a, n) => a * 60 + (n || 0), 0);
  }
  function fmtSecs(s) {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60), r = s % 60;
    return m + ':' + String(r).padStart(2, '0');
  }

  /* Candidate featured in a video, matched by full name in the title. */
  function videoCandidate(v, t) {
    const title = String(v.title || '').toLowerCase();
    return (t.candidates || []).find((c) => c.photo && c.name && title.includes(c.name.toLowerCase())) || null;
  }
  function photoThumb(c, big) {
    return `<div class="ph-photo-thumb${big ? ' is-big' : ''}">
      <img src="${esc(c.photo)}" alt="" loading="lazy" style="object-position:${esc(c.photoPos || '50% 25%')}">
      ${big ? `<span class="ph-photo-cap">${esc(c.name)}</span>` : `<span class="ph-photo-play" aria-hidden="true">${IC_PLAY}</span>`}
    </div>`;
  }

  /* Generated, brand-tinted video art (deterministic per video id). */
  function videoArt(v, uid, W, H, big) {
    const rnd = U.seeded(v.id);
    const g = `ph-g-${uid}`;
    const kind = Math.floor(rnd() * 3);
    let pat = '';
    if (kind === 0) {
      const cx = W * (0.55 + rnd() * 0.35), cy = H * (0.2 + rnd() * 0.5);
      for (let i = 1; i <= 7; i++) pat += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(i * W * 0.07).toFixed(0)}" fill="none" stroke="#fff" stroke-opacity="${(0.16 - i * 0.015).toFixed(3)}" stroke-width="${(W / 80).toFixed(1)}"/>`;
    } else if (kind === 1) {
      const step = W / (8 + Math.floor(rnd() * 5));
      for (let x = -H; x < W + H; x += step) pat += `<path d="M${x.toFixed(0)} ${H} L${(x + H).toFixed(0)} 0" stroke="#fff" stroke-opacity=".09" stroke-width="${(step * 0.38).toFixed(1)}"/>`;
    } else {
      const step = W / 14;
      for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) {
        const r = rnd();
        if (r > 0.45) pat += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(step * 0.12 + r * step * 0.1).toFixed(1)}" fill="#fff" fill-opacity="${(0.06 + r * 0.1).toFixed(2)}"/>`;
      }
    }
    const sx = W * (0.12 + rnd() * 0.18), sy = H * (0.25 + rnd() * 0.15);
    const star = STAR(sx, sy, H * 0.16, 'fill:#fff;fill-opacity:.16');
    const pr = big ? 0 : H * 0.17;
    const play = big ? '' : `<circle cx="${W / 2}" cy="${H / 2}" r="${pr}" fill="#fff" fill-opacity=".92"/>
      <path d="M${(W / 2 - pr * 0.32).toFixed(1)} ${(H / 2 - pr * 0.45).toFixed(1)} L${(W / 2 + pr * 0.5).toFixed(1)} ${H / 2} L${(W / 2 - pr * 0.32).toFixed(1)} ${(H / 2 + pr * 0.45).toFixed(1)}z" style="fill:var(--brand)"/>`;
    const caption = big
      ? `<text x="${W * 0.05}" y="${H * 0.82}" font-family="Archivo, Arial Narrow, sans-serif" font-weight="800" font-size="${H * 0.075}" fill="#fff">${esc(v.channel)}</text>`
      : '';
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" style="stop-color:var(--brand)"/>
        <stop offset="1" style="stop-color:color-mix(in srgb, var(--brand) 55%, black)"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#${g})"/>
      ${pat}${star}
      <rect y="${H - H * 0.035}" width="${W}" height="${H * 0.035}" style="fill:var(--accent)"/>
      ${caption}${play}
    </svg>`;
  }

  /* Build the feed list for a tab, honoring hidden/pinned/local posts. */
  function feedItems(t, tab, S) {
    const hidden = new Set(S.hiddenPushes);
    const pinned = S.pinnedPushes;
    const extras = extraItems(t).filter((n) => n.tab === tab);
    const extraIds = new Set(extras.map((n) => n.id));
    let items = extras.concat(((t.news && t.news[tab]) || []).filter((n) => !extraIds.has(n.id)))
      .filter((n) => !(hidden.has(n.id) && !n.locked));
    const pins = items.filter((n) => pinned.includes(n.id))
      .sort((a, b) => pinned.indexOf(a.id) - pinned.indexOf(b.id))
      .map((n) => Object.assign({}, n, { _pinned: true }));
    const rest = items.filter((n) => !pinned.includes(n.id) && !extraIds.has(n.id)).sort((a, b) => (a.minutesAgo || 0) - (b.minutesAgo || 0));
    const fresh = items.filter((n) => !pinned.includes(n.id) && extraIds.has(n.id)); // newest first, as published
    let locals = [];
    if (tab === 'county') {
      locals = S.localPosts
        .filter((p) => p && !(p.tenantSlug && p.tenantSlug !== t.slug) && !(p.tenant && p.tenant !== t.slug))
        .slice().reverse()
        .map((p, i) => Object.assign({ id: 'local-' + i, source: t.shortName, minutesAgo: 0, tag: 'Local' }, p, { _new: true }));
    }
    return locals.concat(pins, fresh, rest);
  }

  /* Items published from the Master Network console (Agent 4), newest first. */
  function extraItems(t) {
    const list = Array.isArray(App.state.extraNetworkItems) ? App.state.extraNetworkItems : [];
    return list.filter((n) => n && Array.isArray(n.tenants) && n.tenants.includes(t.slug))
      .map((n) => Object.assign({ pushed: true, source: 'Master Network', minutesAgo: 0 }, n, { pushed: true, _fresh: true }));
  }
  function breakingItem(t) {
    const hit = extraItems(t).find((n) => n.locked && (Number(n.priority) || 0) >= 100);
    return hit || t.breaking || null;
  }

  function cardHtml(n, t) {
    const badges = [];
    if (n._new) badges.push('<span class="badge badge-new">New</span>');
    if (n._fresh && !n._pinned) badges.push('<span class="badge badge-new">Just in</span>');
    if (n._pinned) badges.push(`<span class="badge badge-master">${IC_PIN} Pinned</span>`);
    if (n.pushed) badges.push(`<span class="badge badge-master">${IC_NET} Network</span>`);
    if (n.locked) badges.push('<span class="lock" title="Locked by the Network"></span>');
    return `<article class="ph-card${n._new ? ' is-new' : ''}${n._pinned ? ' is-pinned' : ''}" tabindex="0" role="button" data-act="read" data-id="${esc(n.id)}" aria-label="Read: ${esc(n.title)}">
      <div class="ph-card-top"><span class="ph-card-tag">${esc(n.tag || '')}</span>${badges.join('')}</div>
      <h3>${esc(n.title)}</h3>
      <p>${esc(n.summary || '')}</p>
      <div class="ph-meta"><b>${esc(n.source || t.shortName)}</b> · ${esc(U.timeAgo(n.minutesAgo))}</div>
    </article>`;
  }

  function fallbackLocalAd(t) {
    const ev = (t.events || [])[0];
    return { id: 'local-fallback', placement: 'IN_FEED', title: ev ? `${ev.title} — volunteers welcome` : `Volunteer with ${t.shortName}`, sponsor: t.name, cta: 'Count me in' };
  }

  function feedHtml(t, S, network) {
    const tab = S.hub_tab;
    const items = feedItems(t, tab, S);
    const mAd = (network.masterAds || []).find((a) => a.placement === 'IN_FEED');
    const lAd = (t.localAds || []).find((a) => a.placement === 'IN_FEED') || fallbackLocalAd(t);
    if (!items.length) return `<div class="ph-empty">Fresh stories arrive here soon.</div>`;
    const out = [];
    let pos = 0, adN = 0, idx = 0;
    while (idx < items.length) {
      pos++;
      if (pos % 4 === 0) {
        const master = adN % 2 === 0;
        adN++;
        out.push(zone(master ? 'network' : 'local', t, adSlot(master ? mAd : lAd, master ? 'master' : 'local')));
      } else {
        out.push(cardHtml(items[idx++], t));
      }
    }
    return out.join('');
  }

  function findItem(t, id, S) {
    const ex = extraItems(t).find((n) => n.id === id);
    if (ex) return ex;
    const bk = breakingItem(t);
    if (bk && bk.id === id) return bk;
    for (const k of Object.keys(t.news || {})) {
      const f = t.news[k].find((n) => n.id === id);
      if (f) return f;
    }
    if (t.breaking && t.breaking.id === id) return t.breaking;
    const loc = feedItems(t, 'county', S).find((n) => n.id === id);
    return loc || null;
  }

  /* ---------------- render ---------------- */
  function render(el, ctx) {
    injectStyle();
    const t = ctx.tenant || {};
    const network = ctx.network || {};
    const S = st();
    el.classList.add('scr-hub');
    el.classList.toggle('ph-zones-on', S.hub_zones);

    const masterAd = (pl) => (network.masterAds || []).find((a) => a.placement === pl);
    const localAd = (pl) => (t.localAds || []).find((a) => a.placement === pl);
    const feedZone = (tab) => (tab === 'national' || tab === 'state') ? 'network' : 'local';

    const events = (t.events || []).slice(0, 5);
    const cands = (t.candidates || []).filter((c) => c.status === 'ENDORSED' || c.status === 'ACTIVE_CAMPAIGN');
    const videos = (t.videos || []).slice(0, 6);
    const brk = breakingItem(t);
    const guide = App.voterGuide && App.voterGuide.get(t);

    const bannerHtml = zone('network', t, adSlot(masterAd('HEADER_BANNER'), 'master', 'data-tour="hub-master-slot"'));

    const breakingHtml = brk ? zone('network', t, `
      <div class="ph-breaking" data-tour="hub-breaking" role="region" aria-label="Network alert">
        <span class="ph-breaking-from">${IC_LOCK} From the Network</span>
        <span class="ph-breaking-text" data-act="read" data-id="${esc(brk.id)}" tabindex="0" role="button">${esc(brk.title)}</span>
        <button class="ph-breaking-x" data-act="dismiss" aria-label="Dismiss alert">${IC_X}</button>
      </div>`) : '';

    const navHtml = zone('local', t, `
      <div class="ph-nav">
        <div class="ph-nav-bar">
          <button class="ph-wm" data-act="scroll" data-to="ph-top" aria-label="${esc(t.shortName)} home">
            ${STAR_ICON(30, 'var(--accent)')}
            <span><span class="ph-wm-name">${esc(t.shortName)}</span><span class="ph-wm-sub">${esc(t.name)}</span></span>
          </button>
          <nav class="ph-links" aria-label="Site">
            ${guide ? '<button class="ph-link-guide" data-vg="open">Voter Guide</button>' : ''}
            <button data-act="scroll" data-to="ph-news">News</button>
            <button data-act="scroll" data-to="ph-video">Video</button>
            <button data-act="scroll" data-to="ph-cands">Candidates</button>
            <button data-act="scroll" data-to="ph-events">Events</button>
            <button data-act="volunteer">Volunteer</button>
            <button class="ph-donate" data-act="donate">Donate</button>
          </nav>
        </div>
      </div>`);

    /* Above the fold: the committee's voter guide, plus what the committee is doing next. */
    const today = new Date().toISOString().slice(0, 10);
    const nextEv = (t.events || []).find((e) => e.date >= today) || (t.events || [])[0];
    const mtg = t.meeting;
    const dateBlock = (iso) => { const d = fmtDate(iso); return `<div class="ph-date"><b>${esc(d.mon)}</b><span>${esc(d.day)}</span></div>`; };
    const cmteHtml = `
      <section class="ph-cmte" aria-labelledby="ph-cmte-h">
        <div class="ph-cmte-head">
          <span class="ph-cmte-eyebrow">${STAR_ICON(13, 'var(--accent)')} Your county party</span>
          <h2 id="ph-cmte-h">${esc(t.shortName)} this month</h2>
          <p>${esc(t.tagline || '')}</p>
        </div>
        ${mtg ? `<div class="ph-cmte-item">
          ${dateBlock(mtg.date)}
          <div class="ph-cmte-info">
            <span class="ph-cmte-kind">Central Committee meeting</span>
            <div class="ph-cmte-title">${esc(mtg.title)}</div>
            <div class="ph-cmte-sub">${esc(fmtDate(mtg.date).long)} · ${esc(mtg.time)} · ${esc(mtg.provider || '')} · Open to the public</div>
            <div class="ph-rsvp-row">
              <button class="btn btn-sm" data-act="agenda">See agenda</button>
              <button class="btn btn-sm btn-ghost" data-act="calendar">Add to calendar</button>
            </div>
          </div>
        </div>` : ''}
        ${nextEv ? (() => { const going = !!S.hub_rsvp[nextEv.id]; return `<div class="ph-cmte-item">
          ${dateBlock(nextEv.date)}
          <div class="ph-cmte-info">
            <span class="ph-cmte-kind">Next event · ${esc(nextEv.kind || 'Event')}</span>
            <div class="ph-cmte-title">${esc(nextEv.title)}</div>
            <div class="ph-cmte-sub">${esc(fmtDate(nextEv.date).long)} · ${esc(nextEv.time || '')} · ${esc(String(nextEv.location || '').split(',').slice(-1)[0].trim())}</div>
            <div class="ph-rsvp-row">
              <button class="btn btn-sm ph-rsvp${going ? ' is-going' : ''}" data-act="rsvp" data-id="${esc(nextEv.id)}" aria-pressed="${going}">${going ? 'You’re going ✓' : 'RSVP'}</button>
              <span class="small muted"><b data-count="${esc(nextEv.id)}">${U.fmtNum((nextEv.rsvps || 0) + (going ? 1 : 0))}</b> going</span>
            </div>
          </div>
        </div>`; })() : ''}
        <div class="ph-cmte-actions">
          <button class="btn btn-primary" data-act="volunteer">Volunteer</button>
          <button class="btn" data-act="join">Become a member</button>
          <button class="btn ph-cmte-donate" data-act="donate">Donate</button>
        </div>
      </section>`;
    const frontHtml = `<div class="ph-front${guide ? '' : ' is-single'}" data-tour="hub-front">
      ${guide ? zone('local', t, App.voterGuide.teaser(t), 'id="ph-guide"') : ''}
      ${zone('local', t, cmteHtml, 'id="ph-cmte"')}
    </div>`;

    const feedZoneKind = feedZone(S.hub_tab);
    const feedHtmlBlock = `<div class="ph-zone ph-feed" data-zone="${feedZoneKind}" id="ph-news">
      ${zoneTag(feedZoneKind, t)}
      <div class="ph-section-head"><h2>Latest news</h2><span class="small muted">Updated through the day</span></div>
      <div class="tabs" role="tablist" data-tour="hub-tabs">
        ${TABS.map((x) => `<button class="tab${x.id === S.hub_tab ? ' active' : ''}" role="tab" aria-selected="${x.id === S.hub_tab}" data-act="tab" data-tab="${x.id}">${x.label}</button>`).join('')}
      </div>
      <div class="ph-cards">${feedHtml(t, S, network)}</div>
    </div>`;

    const videoHtml = zone('network', t, `
      <div class="ph-section-head"><h2>Video Hub</h2><span class="small muted">Every video plays right on this page</span></div>
      <div class="ph-videos">
        ${videos.map((v, i) => `<button class="ph-video" data-act="video" data-id="${esc(v.id)}" aria-label="Play ${esc(v.title)}">
          <div class="ph-thumb">${videoCandidate(v, t) ? photoThumb(videoCandidate(v, t), false) : videoArt(v, 't' + i, 320, 180, false)}
            ${v.pushed ? `<span class="badge badge-master ph-vbadge">${IC_NET} Network</span>` : `<span class="badge badge-local ph-vbadge">${esc(t.shortName)}</span>`}
            <span class="ph-dur">${esc(v.duration)}</span></div>
          <span class="ph-video-chan">${esc(v.channel)}</span>
          <span class="ph-video-title">${esc(v.title)}</span>
        </button>`).join('')}
      </div>`, 'id="ph-video" data-tour="hub-video"');

    const eventsHtml = zone('local', t, `
      <div class="ph-widget">
        <div class="ph-widget-head"><h3>Upcoming events</h3><span class="small">Tap RSVP (please reply) to save your spot</span></div>
        ${events.map((e) => {
          const d = fmtDate(e.date);
          const going = !!S.hub_rsvp[e.id];
          const count = (e.rsvps || 0) + (going ? 1 : 0);
          return `<div class="ph-event">
            <div class="ph-date"><b>${esc(d.mon)}</b><span>${esc(d.day)}</span></div>
            <div class="ph-event-info">
              <div class="ph-event-title">${esc(e.title)}</div>
              <div class="ph-event-sub">${esc(d.long)} · ${esc(e.time || '')}<br>${esc(String(e.location || '').split(',').slice(-1)[0].trim() || e.location || '')}</div>
              <div class="ph-rsvp-row">
                <button class="btn btn-sm ph-rsvp${going ? ' is-going' : ''}" data-act="rsvp" data-id="${esc(e.id)}" aria-pressed="${going}">${going ? 'You’re going ✓' : 'RSVP'}</button>
                <span class="small muted"><b data-count="${esc(e.id)}">${U.fmtNum(count)}</b> going</span>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>`, 'id="ph-events"');

    const candsHtml = zone('local', t, `
      <div class="ph-widget">
        <div class="ph-widget-head"><h3>Endorsed candidates</h3><span class="small">Endorsed by the ${esc(t.shortName)} central committee</span></div>
        ${cands.length ? cands.map((c) => `<button class="ph-cand" data-act="cand" data-id="${esc(c.id)}">
            ${U.candidatePhoto ? U.candidatePhoto(c, 44, { shape: 'circle' }) : U.avatar(c.name, 44)}
            <span style="min-width:0"><span class="ph-cand-name">${esc(c.name)}</span><span class="ph-cand-office">${esc(c.office)}${c.district ? ', ' + esc(c.district) : ''}</span></span>
            <span class="ph-cand-arrow">${I('<path d="M8 5l5 5-5 5"/>', 18)}</span>
          </button>`).join('') : '<div class="ph-empty" style="margin:12px">Endorsements are announced after the next committee vote.</div>'}
      </div>`, 'id="ph-cands"');

    const sideHtml = `
      ${zone('local', t, adSlot(localAd('SIDEBAR_TOP') || fallbackLocalAd(t), 'local', 'data-tour="hub-local-slot"'))}
      ${eventsHtml}
      ${candsHtml}
      ${zone('network', t, adSlot(masterAd('SIDEBAR_BOTTOM'), 'master'))}`;

    const year = 2026;
    const footerHtml = `
      ${zone('local', t, adSlot(localAd('FOOTER_BANNER') || fallbackLocalAd(t), 'local'))}
      ${zone('local', t, `
        <footer class="ph-footer">
          <div class="ph-footer-top">
            <div class="ph-wm">${STAR_ICON(26, 'var(--accent)')}<span><span class="ph-wm-name">${esc(t.shortName)}</span><span class="ph-wm-sub">${esc(t.county || '')}</span></span></div>
            <div class="ph-footer-links">
              <button data-act="scroll" data-to="ph-news">News</button>
              <button data-act="scroll" data-to="ph-events">Events</button>
              <button data-act="volunteer">Volunteer</button>
              <button data-act="donate">Donate</button>
              <button data-act="contact">Contact</button>
            </div>
          </div>
          <div class="ph-paidfor">Paid for by ${esc(t.name)}</div>
          <div class="small">Prepared independently of any candidate or candidate committee. © ${year} ${esc(t.name)}. Sample site for demonstration.</div>
        </footer>`)}`;

    el.innerHTML = `
    <div class="page">
      <div class="lay-switch-wrap"><span class="lay-switch-label">Compare homepage layouts</span>
        <nav class="lay-switch" aria-label="Homepage layout"><a href="#/public-hub" class="is-on" aria-current="page">Classic hub</a><a href="#/newsroom">Newsroom</a></nav></div>
      <div class="page-head">
        <div>
          <h1>Public Media Hub</h1>
          <p>Your county’s home page, exactly as voters see it at ${esc(t.domain || '')}. Fresh news every day, video that plays on your site, and events and candidates your committee controls.</p>
        </div>
        <div class="row">
          <button class="btn btn-ghost" data-act="portal">Manage local zones</button>
        </div>
      </div>

      <div class="explain" style="margin-bottom:16px"><strong>Always fresh, always yours.</strong> The Network supplies daily national and state news so your site stays fresh even in a quiet week, and your county controls its own local zones: county and city news, events, endorsements and local sponsors.</div>

      <div class="ph-control" data-tour="hub-zones-toggle">
        <label class="ph-switch">
          <input type="checkbox" class="toggle" data-act="zones" ${S.hub_zones ? 'checked' : ''} aria-describedby="ph-switch-sub">
          <span><span class="ph-switch-title">Show who controls each zone</span>
          <span class="ph-switch-sub" id="ph-switch-sub">${S.hub_zones ? 'Every block on the page is labeled. Switch to County or City to see the news zone turn local.' : 'Turn on to label every block of the page: Network or your county.'}</span></span>
        </label>
        <div class="ph-legend" aria-live="polite">
          <span class="ph-legend-item is-net"><b data-legend="network">0</b> Network zones · set by Master Network</span>
          <span class="ph-legend-item is-loc"><b data-legend="local">0</b> Local zones · set by ${esc(t.shortName)}</span>
        </div>
      </div>

      <div class="ph-browser">
        <div class="ph-chrome">
          <span class="ph-dots" aria-hidden="true"><i></i><i></i><i></i></span>
          <div class="ph-addr">${IC_ADDR}<span><b>https://${esc(t.domain || '')}</b></span></div>
          <span class="ph-visitor">Visitor view</span>
        </div>
        <div class="ph-site" id="ph-top">
          ${breakingHtml}
          ${navHtml}
          ${frontHtml}
          ${bannerHtml}
          <div class="ph-body">
            <div class="ph-main">${feedHtmlBlock}${videoHtml}</div>
            <aside class="ph-side" aria-label="Sidebar">${sideHtml}</aside>
          </div>
          ${footerHtml}
        </div>
      </div>
    </div>`;

    updateLegend(el);

    // Shared links (#/public-hub/voter-guide) open the guide straight away.
    if (ctx.sub === 'voter-guide' && guide) setTimeout(() => App.voterGuide.open(t), 60);

    /* ---------------- interactions ---------------- */
    function rerenderFeed() {
      const feed = el.querySelector('.ph-feed');
      if (!feed) return;
      const kind = feedZone(S.hub_tab);
      feed.dataset.zone = kind;
      const oldTag = feed.querySelector(':scope > .ph-zone-tag');
      if (oldTag) oldTag.outerHTML = zoneTag(kind, t);
      feed.querySelectorAll('.tab').forEach((b) => {
        const on = b.dataset.tab === S.hub_tab;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on);
      });
      feed.querySelector('.ph-cards').innerHTML = feedHtml(t, S, network);
      updateLegend(el);
    }

    function openArticle(id) {
      const n = findItem(t, id, S);
      if (!n) return;
      const badges = [];
      if (n.pushed) badges.push(`<span class="badge badge-master">${IC_NET} Network</span>`);
      if (n.locked) badges.push('<span class="badge badge-warn">Locked by the Network</span>');
      ctx.modal({
        title: n.title,
        html: `<div class="ph-modal-meta"><span>${esc(n.source || t.shortName)} · ${esc(U.timeAgo(n.minutesAgo))}</span>${badges.join('')}</div>
          <p style="font-size:16.5px;line-height:1.6">${esc(n.summary || '')}</p>
          <div class="ph-modal-source">Read the full story at <b>${esc(n.source || t.shortName)}</b>.</div>`,
        actions: [
          { label: 'Share', onClick: () => { ctx.toast(`Share link copied for “${n.title}”.`, 'ok'); return false; } },
          { label: 'Close', primary: true },
        ],
      });
    }

    function openVideo(id) {
      const v = videos.find((x) => x.id === id);
      if (!v) return;
      const total = durSecs(v.duration) || 60;
      let pos = 0, timer = null;
      const m = ctx.modal({
        title: v.title,
        html: `<div class="ph-player">
            <div class="ph-player-screen" data-p="toggle">${videoCandidate(v, t) ? photoThumb(videoCandidate(v, t), true) : videoArt(v, 'p', 640, 360, true)}
              <div class="ph-player-big"><span>${IC_PLAY}</span></div>
              <div class="ph-player-eq" aria-hidden="true"><i></i><i></i><i></i></div>
            </div>
            <div class="ph-player-bar">
              <button class="ph-player-btn" data-p="toggle" aria-label="Play">${IC_PLAY}</button>
              <div class="ph-player-track" data-p="seek" role="slider" aria-label="Progress" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="0"><div class="ph-player-fill"></div></div>
              <span class="ph-player-time">0:00 / ${esc(v.duration)}</span>
            </div>
          </div>
          <div class="ph-modal-meta" style="margin-top:12px"><b>${esc(v.channel)}</b> · ${U.fmtNum(v.views)} views ${v.pushed ? `<span class="badge badge-master">${IC_NET} Network</span>` : `<span class="badge badge-local">${esc(t.shortName)}</span>`}</div>
          <div class="ph-player-note">${I('<path d="M4 10.5l4 4 8-9"/>', 18)} Plays right here — visitors stay on your site.</div>`,
        actions: [{ label: 'Close', primary: true }],
      });
      const root = m.body.querySelector('.ph-player');
      const fill = root.querySelector('.ph-player-fill');
      const time = root.querySelector('.ph-player-time');
      const btn = root.querySelector('.ph-player-btn');
      const track = root.querySelector('.ph-player-track');
      function paint() {
        fill.style.width = (pos / total * 100).toFixed(2) + '%';
        time.textContent = fmtSecs(pos) + ' / ' + v.duration;
        track.setAttribute('aria-valuenow', Math.floor(pos));
      }
      function stop() { if (timer) clearInterval(timer); timer = null; root.classList.remove('is-playing'); btn.innerHTML = IC_PLAY; btn.setAttribute('aria-label', 'Play'); }
      function play() {
        if (pos >= total) pos = 0;
        root.classList.add('is-playing'); btn.innerHTML = IC_PAUSE; btn.setAttribute('aria-label', 'Pause');
        timer = setInterval(() => {
          if (!root.isConnected) { clearInterval(timer); return; }
          pos = Math.min(total, pos + 2); // simulated playback: 2 seconds of video per tick
          paint();
          if (pos >= total) stop();
        }, 250);
      }
      root.addEventListener('click', (e) => {
        const p = e.target.closest('[data-p]');
        if (!p) return;
        if (p.dataset.p === 'toggle') { timer ? stop() : play(); }
        else if (p.dataset.p === 'seek') {
          const r = track.getBoundingClientRect();
          pos = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * total;
          paint();
        }
      });
      paint();
    }

    function openVolunteer() {
      const interests = ['Walk precincts', 'Phone bank', 'Host a yard sign', 'Help at events'];
      const chosen = new Set(['Walk precincts']);
      const m = ctx.modal({
        title: `Volunteer with ${t.shortName}`,
        html: `<div class="ph-vol-form">
          <p class="muted" style="margin:0">A neighborhood team lead reaches out within two days with your first shift.</p>
          <label>Your name<input class="input" data-v="name" autocomplete="name" placeholder="First and last name"></label>
          <label>Email or phone<input class="input" data-v="contact" placeholder="How should we reach you?"></label>
          <div><div style="font-weight:600;font-size:14.5px;margin-bottom:6px">I’d like to</div>
            <div class="row">${interests.map((x) => `<button type="button" class="chip${chosen.has(x) ? ' active' : ''}" data-chip="${esc(x)}" aria-pressed="${chosen.has(x)}">${esc(x)}</button>`).join('')}</div></div>
          <div class="ph-vol-err" aria-live="polite"></div>
        </div>`,
        actions: [
          { label: 'Cancel' },
          { label: 'Sign me up', primary: true, onClick: (api) => {
            const name = api.body.querySelector('[data-v="name"]').value.trim();
            const contact = api.body.querySelector('[data-v="contact"]').value.trim();
            if (!name || !contact) {
              api.body.querySelector('.ph-vol-err').textContent = 'Add your name and a way to reach you, and you’re all set.';
              return false;
            }
            S.hub_volunteers = (S.hub_volunteers || 0) + 1;
            const first = name.split(/\s+/)[0];
            api.body.innerHTML = `<div class="ph-thanks">
              <span class="ph-thanks-mark">${I('<path d="M4 10.5l4 4 8-9"/>', 28)}</span>
              <h3>Thank you, ${esc(first)}!</h3>
              <p class="muted">You’re signed up for: ${esc(Array.from(chosen).join(', ') || 'general help')}. A ${esc(t.shortName)} team lead will reach out soon with your first shift.</p></div>`;
            const foot = api.el.querySelector('.modal-foot');
            foot.innerHTML = '';
            const done = document.createElement('button');
            done.className = 'btn btn-primary';
            done.textContent = 'Done';
            done.addEventListener('click', api.close);
            foot.appendChild(done);
            done.focus();
            ctx.toast(`New volunteer sign-up sent to the ${t.shortName} volunteer team.`, 'ok');
            return false;
          } },
        ],
      });
      m.body.addEventListener('click', (e) => {
        const c = e.target.closest('[data-chip]');
        if (!c) return;
        const k = c.dataset.chip;
        chosen.has(k) ? chosen.delete(k) : chosen.add(k);
        c.classList.toggle('active', chosen.has(k));
        c.setAttribute('aria-pressed', chosen.has(k));
      });
    }

    function scrollTo(id) {
      const target = el.querySelector('#' + id);
      if (!target) return;
      const y = target.getBoundingClientRect().top + window.scrollY - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h'), 10) || 64) - 20;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }

    el.addEventListener('change', (e) => {
      if (e.target.matches('[data-act="zones"]')) {
        S.hub_zones = e.target.checked;
        el.classList.toggle('ph-zones-on', S.hub_zones);
        const sub = el.querySelector('#ph-switch-sub');
        if (sub) sub.textContent = S.hub_zones
          ? 'Every block on the page is labeled. Switch to County or City to see the news zone turn local.'
          : 'Turn on to label every block of the page: Network or your county.';
        if (S.hub_zones) ctx.toast(`Purple zones come from the Network. ${t.shortName}-colored zones belong to your county.`, 'info');
      }
    });

    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-act="read"]')) {
        e.preventDefault();
        openArticle(e.target.dataset.id);
      }
    });

    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a || a.dataset.act === 'zones') return;
      const act = a.dataset.act;
      if (act === 'tab') { S.hub_tab = a.dataset.tab; rerenderFeed(); }
      else if (act === 'read') openArticle(a.dataset.id);
      else if (act === 'dismiss') ctx.toast('The Network locked this alert, so every county shows it until it expires.', 'warn');
      else if (act === 'video') openVideo(a.dataset.id);
      else if (act === 'ad') {
        e.stopPropagation();
        ctx.toast(a.dataset.kind === 'master'
          ? `Network sponsor: ${a.dataset.title}. The Network fills this slot on every county site.`
          : `Local sponsor: ${a.dataset.title}. ${t.shortName} sells and manages this slot.`, 'info');
      }
      else if (act === 'rsvp') {
        const id = a.dataset.id;
        const ev = events.find((x) => x.id === id);
        const going = !S.hub_rsvp[id];
        S.hub_rsvp[id] = going;
        const count = (ev ? ev.rsvps || 0 : 0) + (going ? 1 : 0);
        // The same event can show in the top committee panel and the sidebar; keep both in sync.
        el.querySelectorAll(`[data-act="rsvp"][data-id="${CSS_escape(id)}"]`).forEach((b) => {
          b.classList.toggle('is-going', going);
          b.setAttribute('aria-pressed', going);
          b.textContent = going ? 'You’re going ✓' : 'RSVP';
        });
        el.querySelectorAll(`[data-count="${CSS_escape(id)}"]`).forEach((c) => { c.textContent = U.fmtNum(count); });
        ctx.toast(going ? `You’re on the list for ${ev ? ev.title : 'this event'}. A reminder arrives the day before.` : 'RSVP removed. Your seat is open for a neighbor.', going ? 'ok' : 'info');
      }
      else if (act === 'cand') ctx.navigate('candidate/microsite/' + a.dataset.id);
      else if (act === 'scroll') scrollTo(a.dataset.to);
      else if (act === 'volunteer') openVolunteer();
      else if (act === 'donate') ctx.toast(`Donations open on ${t.shortName}’s secure donate page. Every gift funds local precinct work.`, 'ok');
      else if (act === 'contact') ctx.toast(`Messages go straight to the ${t.shortName} volunteer inbox.`, 'info');
      else if (act === 'join') ctx.toast(`Membership sign-up opens on ${t.shortName}’s secure join page. Members get meeting notices and voting updates.`, 'ok');
      else if (act === 'calendar') ctx.toast(`Calendar invite for the ${t.meeting ? t.meeting.title : 'committee meeting'} downloaded.`, 'ok');
      else if (act === 'agenda' && t.meeting) {
        const m = t.meeting;
        ctx.modal({
          title: `${m.title} — agenda`,
          html: `<p class="muted" style="margin-top:0">${esc(fmtDate(m.date).long)} · ${esc(m.time)} · ${esc(m.provider || '')}. Members of the public are welcome to attend.</p>
            <ol style="margin:0;padding-left:22px;line-height:1.7;font-size:15.5px">${(m.agenda || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`,
          actions: [{ label: 'Add to calendar', onClick: () => { ctx.toast(`Calendar invite for the ${m.title} downloaded.`, 'ok'); } }, { label: 'Close', primary: true }],
        });
      }
      else if (act === 'portal') ctx.navigate('portal');
    });
  }

  function CSS_escape(s) { return (window.CSS && window.CSS.escape) ? window.CSS.escape(s) : String(s).replace(/"/g, '\\"'); }

  function updateLegend(el) {
    const zones = el.querySelectorAll('.ph-site .ph-zone');
    let n = 0, l = 0;
    zones.forEach((z) => { if (z.dataset.zone === 'network') n++; else l++; });
    const bn = el.querySelector('[data-legend="network"]');
    const bl = el.querySelector('[data-legend="local"]');
    if (bn) bn.textContent = n;
    if (bl) bl.textContent = l;
  }

  App.register({
    id: 'public-hub',
    title: 'Public Media Hub',
    group: 'Public Site',
    icon: ICON,
    blurb: 'The county home page voters see: fresh news every day, video, events and endorsed candidates.',
    render,
  });
})();
