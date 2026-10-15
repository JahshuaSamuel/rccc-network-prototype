/* screens/newsroom.js — "Newsroom" alternative county homepage (Agent 3)
   Cable-news front page + video platform, inside the same browser frame as the Public Hub.
   Data: window.NEWSROOM (newsroom-data.js) — real vetted headlines and real videos, used exactly as given.
   Local zones (county news, events, endorsed candidates, local ad) come from the tenant. */
(function () {
  'use strict';
  if (!window.App) return;

  const U = App.util;
  const esc = U.esc;
  const I = (d, s) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = I('<rect x="2.5" y="4" width="15" height="11" rx="2"/><path d="M8.5 7.5l4 2-4 2z" fill="currentColor"/><path d="M6 17.5h8"/>');
  const IC_OUT = I('<path d="M11 4h5v5M16 4l-7 7M14 12v3.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5H8"/>', 13);
  const IC_NET = I('<circle cx="10" cy="4.5" r="2"/><circle cx="4.5" cy="15" r="2"/><circle cx="15.5" cy="15" r="2"/><path d="M10 6.5v3M10 9.5L5.5 13.3M10 9.5l4.5 3.8"/>', 13);
  const IC_PLAY = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4.8l8.4 5.2L7 15.2z" fill="currentColor"/></svg>';
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
  const EXT = 'target="_blank" rel="noopener"';

  /* Deterministic color pairs for channel tiles (bg, accent). No logos, no faces. */
  const PALETTE = [
    ['#1E2A44', '#F2C14E'], ['#3B1C32', '#FF9F80'], ['#0F3B36', '#7FD8BE'], ['#2B2D42', '#FF5A5F'],
    ['#1D3557', '#A8DADC'], ['#3D2A1A', '#F4A259'], ['#26313F', '#FFE08A'], ['#2E1F47', '#C9B2FF'],
    ['#123524', '#B5E48C'], ['#43202B', '#FFC2B4'], ['#16324F', '#FF8C42'], ['#2A2A2A', '#FFD166'],
    ['#0E2F44', '#62D2FF'], ['#3A2E12', '#E9D58B'], ['#301934', '#F7A8D8'], ['#1B3B2F', '#F2E863'],
    ['#2C1A12', '#FFB703'],
  ];

  /* ---------------- styles ---------------- */
  const NR_CSS = `
.scr-nr .lay-switch { display:inline-flex; align-items:center; gap:4px; padding:4px; border-radius:999px; background:var(--surface); border:1px solid var(--line-strong); box-shadow:var(--shadow-1); max-width:100%; }
.scr-nr .lay-switch-wrap { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin-bottom:18px; }
.scr-nr .lay-switch-label { font-size:14px; font-weight:600; color:var(--ink-3); }
.scr-nr .lay-switch a { display:inline-flex; align-items:center; gap:7px; padding:7px 16px; border-radius:999px; font:600 14.5px/1.2 var(--font-body); color:var(--ink-2); text-decoration:none; white-space:nowrap; }
.scr-nr .lay-switch a:hover { color:var(--ink); background:var(--surface-2); }
.scr-nr .lay-switch a.is-on { background:var(--brand); color:var(--brand-ink); }

.scr-nr .nr-browser { border:1px solid var(--line-strong); border-radius:14px; background:#fff; box-shadow:var(--shadow-2); overflow:hidden; container-type:inline-size; }
.scr-nr .nr-chrome { display:flex; align-items:center; gap:12px; padding:10px 14px; background:#E9ECF1; border-bottom:1px solid var(--line-strong); }
.scr-nr .nr-dots { display:flex; gap:7px; flex:none; }
.scr-nr .nr-dots i { width:12px; height:12px; border-radius:50%; background:#F26B5E; display:block; }
.scr-nr .nr-dots i:nth-child(2) { background:#F5BE4F; } .scr-nr .nr-dots i:nth-child(3) { background:#5CC26A; }
.scr-nr .nr-addr { flex:1; min-width:0; display:flex; align-items:center; gap:8px; background:#fff; border:1px solid var(--line); border-radius:999px; padding:6px 14px; font-size:14.5px; color:var(--ink); font-weight:600; }
.scr-nr .nr-addr svg { color:var(--ok); flex:none; }
.scr-nr .nr-addr span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.scr-nr .nr-visitor { font-size:13px; font-weight:600; color:var(--ink-3); white-space:nowrap; }
.scr-nr .nr-site { background:#fff; color:var(--ink); }
.scr-nr .nr-pad { padding:0 20px; }

/* ads */
.scr-nr .nr-adrow { padding:12px 20px; background:var(--surface-2); border-bottom:1px solid var(--line); }
.scr-nr .nr-ad { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
.scr-nr .nr-ad-text { flex:1 1 200px; min-width:0; }
.scr-nr .nr-ad-title { font-family:var(--font-head); font-stretch:85%; font-weight:800; font-size:1.1rem; line-height:1.2; }
.scr-nr .nr-ad-sponsor { font-size:13.5px; color:var(--ink-3); }
.scr-nr .nr-ad-cta { background:var(--slot-color); color:#fff; border-color:var(--slot-color); }
.scr-nr .ad-slot.local .nr-ad-cta { color:var(--brand-ink); }
.scr-nr .nr-ad-cta:hover { background:color-mix(in srgb, var(--slot-color) 85%, black); color:#fff; }
.scr-nr .ad-slot.local .nr-ad-cta:hover { color:var(--brand-ink); }

/* masthead */
.scr-nr .nr-mast { background:var(--brand); color:var(--brand-ink); }
.scr-nr .nr-mast-top { display:flex; align-items:center; flex-wrap:wrap; gap:8px 18px; padding:16px 20px 12px; }
.scr-nr .nr-wm { display:flex; align-items:center; gap:12px; min-width:0; }
.scr-nr .nr-wm-name { font-family:var(--font-head); font-stretch:75%; font-weight:800; font-size:2.3rem; line-height:.95; letter-spacing:-.01em; text-transform:uppercase; display:block; }
.scr-nr .nr-wm-sub { font-size:13px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; opacity:.85; display:block; margin-top:3px; }
.scr-nr .nr-date { margin-left:auto; text-align:right; font-size:13.5px; line-height:1.35; opacity:.92; }
.scr-nr .nr-date b { display:block; font-size:14.5px; }
.scr-nr .nr-nav { display:flex; align-items:center; gap:2px; padding:0 12px; border-top:1px solid rgba(255,255,255,.18); border-bottom:4px solid var(--accent); overflow-x:auto; scrollbar-width:none; }
.scr-nr .nr-nav button { background:none; border:0; color:inherit; font:700 15px/1 var(--font-body); padding:13px 12px; cursor:pointer; white-space:nowrap; letter-spacing:.02em; border-bottom:3px solid transparent; margin-bottom:-1px; }
.scr-nr .nr-nav button:hover { border-bottom-color:rgba(255,255,255,.7); }
.scr-nr .nr-nav .nr-nav-watch { margin-left:auto; display:inline-flex; align-items:center; gap:7px; }
.scr-nr .nr-nav .nr-nav-watch i { width:9px; height:9px; border-radius:50%; background:var(--accent); display:inline-block; }

/* breaking + ticker */
.scr-nr .nr-breaking { display:flex; align-items:stretch; background:#B8102B; color:#fff; }
.scr-nr .nr-breaking-label { flex:none; display:flex; align-items:center; gap:8px; padding:10px 16px; background:#8E0A20; font:800 14px/1 var(--font-head); font-stretch:85%; letter-spacing:.12em; }
.scr-nr .nr-pulse { width:9px; height:9px; border-radius:50%; background:#fff; animation:nr-pulse 1.4s ease-in-out infinite; }
@keyframes nr-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.35; transform:scale(.7); } }
.scr-nr .nr-breaking a { flex:1; min-width:0; display:flex; flex-wrap:wrap; align-items:baseline; gap:2px 12px; padding:10px 16px; color:#fff; text-decoration:none; }
.scr-nr .nr-breaking a:hover .nr-bk-head { text-decoration:underline; }
.scr-nr .nr-bk-head { font-family:var(--font-head); font-stretch:85%; font-weight:800; font-size:1.2rem; line-height:1.2; }
.scr-nr .nr-bk-meta { font-size:13.5px; opacity:.9; display:inline-flex; align-items:center; gap:6px; }
.scr-nr .nr-ticker { display:flex; align-items:center; background:#11161D; color:#E6EAF0; border-bottom:1px solid #000; overflow:hidden; }
.scr-nr .nr-ticker-label { flex:none; padding:8px 14px; background:var(--accent); color:#fff; font:800 12.5px/1 var(--font-body); letter-spacing:.12em; position:relative; z-index:1; }
.scr-nr .nr-ticker-viewport { flex:1; min-width:0; overflow:hidden; }
.scr-nr .nr-ticker-track { display:flex; width:max-content; animation:nr-tick 90s linear infinite; }
.scr-nr .nr-ticker:hover .nr-ticker-track { animation-play-state:paused; }
.scr-nr .nr-ticker-track a { color:#E6EAF0; text-decoration:none; font-size:14px; font-weight:600; padding:8px 0; white-space:nowrap; }
.scr-nr .nr-ticker-track a:hover { color:#fff; text-decoration:underline; }
.scr-nr .nr-ticker-track span.sep { color:var(--accent); padding:0 16px; }
@keyframes nr-tick { from { transform:translateX(0); } to { transform:translateX(-50%); } }

/* headlines */
.scr-nr .nr-kicker { font:800 12.5px/1.2 var(--font-body); letter-spacing:.09em; text-transform:uppercase; color:#B8102B; }
.scr-nr .nr-meta { font-size:13px; color:var(--ink-3); display:flex; flex-wrap:wrap; gap:2px 6px; align-items:center; }
.scr-nr .nr-meta b { color:var(--ink-2); font-weight:700; }
.scr-nr .nr-hl { color:var(--ink); text-decoration:none; }
.scr-nr .nr-hl:hover { color:var(--ink); text-decoration:underline; text-decoration-thickness:2px; text-underline-offset:3px; }
.scr-nr .nr-hl .nr-out { color:var(--ink-3); display:inline-block; vertical-align:baseline; margin-left:4px; opacity:.7; }
.scr-nr .nr-sec-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:22px 0 10px; border-bottom:3px solid var(--ink); margin-bottom:6px; }
.scr-nr .nr-sec-head h2 { margin:0; font-size:1.55rem; font-stretch:80%; text-transform:uppercase; letter-spacing:.01em; }
.scr-nr .nr-sec-head .spacer { flex:1; }

/* lead grid */
.scr-nr .nr-lead-grid { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(0,1fr); gap:0 26px; padding:22px 20px 8px; }
.scr-nr .nr-lead { padding-right:0; }
.scr-nr .nr-lead .nr-hl { display:block; font-family:var(--font-head); font-stretch:78%; font-weight:800; font-size:clamp(2rem, 1.2rem + 2.6cqw, 3.15rem); line-height:1.02; letter-spacing:-.01em; margin:8px 0 12px; }
.scr-nr .nr-lead p { font-size:1.08rem; color:var(--ink-2); line-height:1.5; margin:0 0 12px; max-width:52ch; }
.scr-nr .nr-lead-cta { display:inline-flex; align-items:center; gap:7px; margin-top:6px; font-weight:700; font-size:14.5px; color:var(--brand); text-decoration:none; border-bottom:2px solid var(--accent); padding-bottom:2px; }
.scr-nr .nr-lead-cta:hover { color:var(--accent); }
.scr-nr .nr-lead-rule { height:6px; background:repeating-linear-gradient(90deg, var(--brand) 0 40px, var(--accent) 40px 52px); margin-bottom:14px; border-radius:2px; }
.scr-nr .nr-secondary { border-left:1px solid var(--line); padding-left:22px; display:flex; flex-direction:column; }
.scr-nr .nr-sec-item { padding:12px 0; border-bottom:1px solid var(--line); }
.scr-nr .nr-sec-item:first-child { padding-top:0; }
.scr-nr .nr-sec-item:last-child { border-bottom:0; }
.scr-nr .nr-sec-item .nr-hl { display:block; font-family:var(--font-head); font-stretch:85%; font-weight:800; font-size:1.2rem; line-height:1.15; margin:4px 0 6px; }
.scr-nr .nr-river { min-width:0; display:flex; flex-direction:column; gap:14px; padding-top:18px; padding-bottom:4px; }
.scr-nr .nr-river h3 { border-bottom:3px solid var(--ink); padding-bottom:8px; }
.scr-nr .nr-river ol { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:0 24px; }
.scr-nr .nr-river ol::before { display:none; }
.scr-nr .nr-river h3 { margin:0; font-size:1.05rem; text-transform:uppercase; letter-spacing:.06em; font-stretch:85%; display:flex; align-items:center; gap:8px; }
.scr-nr .nr-river h3 i { width:8px; height:8px; border-radius:50%; background:#B8102B; animation:nr-pulse 1.4s ease-in-out infinite; }
.scr-nr .nr-river ol { list-style:none; margin:0; padding:0; position:relative; }
.scr-nr .nr-river ol::before { content:''; position:absolute; left:4px; top:6px; bottom:6px; width:2px; background:var(--line); }
.scr-nr .nr-river li { position:relative; padding:0 0 12px 20px; }
.scr-nr .nr-river li::before { content:''; position:absolute; left:0; top:5px; width:10px; height:10px; border-radius:50%; background:#fff; border:2px solid var(--brand); }
.scr-nr .nr-river time { display:block; font:700 12.5px/1.2 var(--font-body); color:#B8102B; letter-spacing:.03em; margin-bottom:2px; }
.scr-nr .nr-river .nr-hl { font-weight:700; font-size:14.5px; line-height:1.3; display:block; }
.scr-nr .nr-river .nr-src { font-size:12.5px; color:var(--ink-3); }
@container (max-width: 1000px) {
  .scr-nr .nr-river ol { grid-template-columns:repeat(2, minmax(0,1fr)); }
}
@container (max-width: 680px) { .scr-nr .nr-river ol { grid-template-columns:minmax(0,1fr); } .scr-nr .nr-river ol::before { display:block; } }
@container (max-width: 680px) {
  .scr-nr .nr-lead-grid { grid-template-columns:minmax(0,1fr); padding:18px 14px 6px; }
  .scr-nr .nr-secondary { border-left:0; padding-left:0; border-top:1px solid var(--line); padding-top:12px; margin-top:12px; }
  .scr-nr .nr-pad { padding:0 14px; }
  .scr-nr .nr-mast-top { padding:14px 14px 10px; }
  .scr-nr .nr-wm-name { font-size:1.9rem; }
  .scr-nr .nr-date { margin-left:0; text-align:left; }
  .scr-nr .nr-breaking { flex-direction:column; }
  .scr-nr .nr-breaking-label { padding:8px 14px; }
  .scr-nr .nr-adrow { padding:12px 14px; }
}

/* sections */
.scr-nr .nr-sections { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:0 28px; }
.scr-nr .nr-section { min-width:0; }
.scr-nr .nr-list-item { display:grid; grid-template-columns:minmax(0,1fr); gap:3px; padding:12px 0; border-bottom:1px solid var(--line); }
.scr-nr .nr-list-item:last-child { border-bottom:0; }
.scr-nr .nr-list-item .nr-hl { font-family:var(--font-head); font-stretch:85%; font-weight:800; font-size:1.13rem; line-height:1.2; }
.scr-nr .nr-list-item p { margin:0; font-size:14.5px; color:var(--ink-2); line-height:1.45; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.scr-nr .nr-list-item.is-top .nr-hl { font-size:1.4rem; line-height:1.12; }
.scr-nr .nr-hl-btn { background:none; border:0; padding:0; text-align:left; cursor:pointer; font:inherit; }
.scr-nr .nr-opinion .nr-list-item .nr-hl { font-style:italic; font-weight:700; font-family:Georgia, 'Times New Roman', serif; font-stretch:normal; }
.scr-nr .nr-local-zone { margin-top:8px; border:2px solid color-mix(in srgb, var(--brand) 22%, white); border-radius:var(--r-lg); padding:0 18px 12px; background:color-mix(in srgb, var(--brand) 3%, white); }
.scr-nr .nr-local-zone .nr-sec-head { border-bottom-color:var(--brand); }
.scr-nr .nr-local-grid { display:grid; grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr); gap:0 24px; }
.scr-nr .nr-sub { font:800 13px/1.2 var(--font-body); text-transform:uppercase; letter-spacing:.08em; color:var(--brand); margin:14px 0 2px; }
.scr-nr .nr-cand { display:flex; align-items:center; gap:12px; width:100%; padding:10px 0; background:none; border:0; border-bottom:1px solid var(--line); text-align:left; cursor:pointer; font:inherit; color:inherit; }
.scr-nr .nr-cand:last-child { border-bottom:0; }
.scr-nr .nr-cand:hover .nr-cand-name { text-decoration:underline; }
.scr-nr .nr-cand-name { font-weight:700; display:block; font-size:15px; line-height:1.25; }
.scr-nr .nr-cand-office { font-size:13px; color:var(--ink-3); display:block; }
.scr-nr .nr-event { display:flex; gap:12px; align-items:flex-start; padding:10px 0; border-bottom:1px solid var(--line); }
.scr-nr .nr-event:last-child { border-bottom:0; }
.scr-nr .nr-edate { flex:none; width:46px; text-align:center; border:1px solid var(--line); border-radius:8px; overflow:hidden; background:#fff; }
.scr-nr .nr-edate b { display:block; background:var(--brand); color:var(--brand-ink); font-size:11.5px; letter-spacing:.06em; padding:2px 0; }
.scr-nr .nr-edate span { display:block; font-family:var(--font-head); font-weight:800; font-size:1.25rem; line-height:1.3; }
.scr-nr .nr-event-title { font-weight:700; font-size:14.5px; line-height:1.3; }
.scr-nr .nr-event-sub { font-size:13px; color:var(--ink-3); margin:1px 0 6px; }
.scr-nr .nr-rsvp.is-going { background:var(--ok-soft); color:var(--ok); border-color:color-mix(in srgb, var(--ok) 35%, white); }
@container (max-width: 1000px) {
  .scr-nr .nr-local-grid { grid-template-columns:repeat(2, minmax(0,1fr)); }
  .scr-nr .nr-local-grid > :first-child { grid-column:1 / -1; }
}
@container (max-width: 680px) {
  .scr-nr .nr-sections, .scr-nr .nr-local-grid { grid-template-columns:minmax(0,1fr); }
  .scr-nr .nr-local-zone { padding:0 12px 10px; }
}

/* watch (video platform) */
.scr-nr .nr-watch { margin-top:28px; background:#0D1117; color:#E8ECF2; padding:6px 20px 24px; }
.scr-nr .nr-watch .nr-sec-head { border-bottom-color:#E8ECF2; }
.scr-nr .nr-watch .nr-sec-head h2 { color:#fff; }
.scr-nr .nr-watch-sub { color:#A9B3C1; font-size:14px; }
.scr-nr .nr-chips { display:flex; gap:8px; overflow-x:auto; padding:12px 0 16px; scrollbar-width:thin; }
.scr-nr .nr-chip { flex:none; border:1px solid #2E3744; background:#1A212B; color:#E8ECF2; font:600 14px/1 var(--font-body); padding:9px 14px; border-radius:999px; cursor:pointer; white-space:nowrap; }
.scr-nr .nr-chip:hover { background:#252E3A; }
.scr-nr .nr-chip.active { background:#fff; color:#0D1117; border-color:#fff; }
.scr-nr .nr-chip .n { opacity:.6; margin-left:4px; font-weight:500; }
.scr-nr .nr-vgrid { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:22px 16px; }
@container (max-width: 760px) { .scr-nr .nr-vgrid { grid-template-columns:repeat(2, minmax(0,1fr)); } }
@container (max-width: 560px) { .scr-nr .nr-vgrid { grid-template-columns:minmax(0,1fr); } .scr-nr .nr-watch { padding:6px 14px 20px; } }
.scr-nr .nr-vcard { display:block; color:inherit; text-decoration:none; min-width:0; }
.scr-nr .nr-vtile { position:relative; aspect-ratio:16/9; border-radius:12px; overflow:hidden; background:var(--c-bg); container-type:inline-size;
  background-image:
    radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--c-ac) 35%, transparent) 0, transparent 55%),
    repeating-linear-gradient(135deg, rgba(255,255,255,.035) 0 10px, transparent 10px 22px);
  transition:transform .18s ease, box-shadow .18s ease; }
.scr-nr .nr-vcard:hover .nr-vtile, .scr-nr .nr-vcard:focus-visible .nr-vtile { transform:translateY(-2px); box-shadow:0 0 0 3px var(--c-ac); }
.scr-nr .nr-vtile::after { content:''; position:absolute; left:0; right:0; bottom:0; height:4px; background:var(--c-ac); }
.scr-nr .nr-vtile-text { position:absolute; left:7%; right:22%; top:50%; transform:translateY(-50%); font-family:var(--font-head); font-stretch:78%; font-weight:800;
  font-size:clamp(14px, 8.4cqw, 30px); line-height:1.02; color:#fff; text-transform:uppercase; letter-spacing:-.005em;
  display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
.scr-nr .nr-vtile-text em { font-style:normal; color:var(--c-ac); }
.scr-nr .nr-vtile-chip { position:absolute; left:7%; top:8%; font:800 11.5px/1 var(--font-body); letter-spacing:.08em; text-transform:uppercase; padding:5px 8px; border-radius:4px; background:rgba(0,0,0,.45); color:var(--c-ac); }
.scr-nr .nr-vtile-chip.is-live { background:#D7263D; color:#fff; }
.scr-nr .nr-vtile-play { position:absolute; right:6%; bottom:10%; width:clamp(32px, 15cqw, 52px); height:clamp(32px, 15cqw, 52px); border-radius:50%; background:var(--c-ac); color:var(--c-bg); display:flex; align-items:center; justify-content:center; }
.scr-nr .nr-vtile-play svg { width:55%; height:55%; margin-left:8%; }
.scr-nr .nr-vtile-dur { position:absolute; right:6%; top:8%; font:700 12px/1 var(--font-body); padding:4px 6px; border-radius:4px; background:rgba(0,0,0,.6); color:#fff; }
.scr-nr .nr-vinfo { display:flex; gap:10px; margin-top:10px; align-items:flex-start; }
.scr-nr .nr-vav { flex:none; width:36px; height:36px; border-radius:50%; background:var(--c-ac); color:var(--c-bg); display:inline-flex; align-items:center; justify-content:center; font:800 13px/1 var(--font-body); }
.scr-nr .nr-vtitle { font-weight:700; font-size:15px; line-height:1.3; color:var(--ink); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.scr-nr .nr-vcard:hover .nr-vtitle { text-decoration:underline; }
.scr-nr .nr-vchan { font-size:13.5px; color:var(--ink-3); margin-top:2px; }
.scr-nr .nr-dark .nr-vtitle { color:#fff; }
.scr-nr .nr-dark .nr-vchan { color:#A9B3C1; }
.scr-nr .nr-badge-sample { background:#FFF4D6; color:#7A5300; border:1px dashed #C99A2E; font:700 11.5px/1.2 var(--font-body); letter-spacing:.06em; text-transform:uppercase; padding:2px 7px; border-radius:4px; display:inline-flex; align-items:center; }
.scr-nr .nr-sample-item { background:repeating-linear-gradient(135deg, transparent 0 12px, rgba(201,154,46,.06) 12px 24px); border-left:3px dashed #C99A2E; padding-left:12px !important; }
.scr-nr .nr-sub .nr-badge-sample { margin-left:6px; vertical-align:middle; }
.scr-nr .nr-kicker-row { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }

/* watch-now rail */
.scr-nr .nr-rail { background:#0D1117; color:#E8ECF2; padding:6px 20px 22px; margin-top:18px; }
.scr-nr .nr-rail .nr-sec-head { border-bottom-color:#E8ECF2; padding-top:16px; }
.scr-nr .nr-rail .nr-sec-head h2 { color:#fff; }
.scr-nr .nr-feature { display:grid; grid-template-columns:minmax(0,1.6fr) minmax(0,1fr); gap:20px; align-items:center; padding:14px 0 18px; color:inherit; text-decoration:none; }
.scr-nr .nr-feature .nr-vtile-text { font-size:clamp(20px, 9cqw, 54px); }
.scr-nr .nr-feature .nr-vtile-play { width:clamp(44px, 13cqw, 76px); height:clamp(44px, 13cqw, 76px); }
.scr-nr .nr-feature-title { font-family:var(--font-head); font-stretch:82%; font-weight:800; font-size:1.7rem; line-height:1.1; color:#fff; margin:8px 0 10px; }
.scr-nr .nr-feature:hover .nr-feature-title { text-decoration:underline; }
.scr-nr .nr-feature-kick { font:800 12.5px/1 var(--font-body); letter-spacing:.12em; text-transform:uppercase; color:var(--c-ac); }
.scr-nr .nr-feature-cta { display:inline-flex; align-items:center; gap:8px; margin-top:14px; background:var(--c-ac); color:var(--c-bg); font-weight:800; font-size:14.5px; padding:9px 16px; border-radius:999px; }
.scr-nr .nr-feature-cta svg { width:16px; height:16px; }
.scr-nr .nr-rowwrap { position:relative; }
.scr-nr .nr-row { display:flex; gap:14px; overflow-x:auto; scroll-snap-type:x mandatory; scroll-behavior:smooth; padding-bottom:8px; scrollbar-width:thin; overscroll-behavior-x:contain; }
.scr-nr .nr-row > .nr-vcard { flex:0 0 240px; scroll-snap-align:start; }
.scr-nr .nr-arrow { position:absolute; top:calc(240px * 9 / 32 - 20px); z-index:2; width:40px; height:40px; border-radius:50%; border:1px solid #2E3744; background:rgba(13,17,23,.92); color:#fff; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 4px 14px rgba(0,0,0,.4); }
.scr-nr .nr-arrow:hover { background:#252E3A; }
.scr-nr .nr-arrow:disabled { opacity:0; pointer-events:none; }
.scr-nr .nr-arrow.prev { left:-8px; } .scr-nr .nr-arrow.next { right:-8px; }
.scr-nr .nr-embed { padding:12px 0; border-bottom:1px solid var(--line); }
.scr-nr .nr-embed-label { font:800 12px/1 var(--font-body); letter-spacing:.1em; text-transform:uppercase; color:var(--ink-3); margin-bottom:8px; display:flex; align-items:center; gap:6px; }
.scr-nr .nr-embed .nr-vcard { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:14px; align-items:center; }
.scr-nr .nr-embed .nr-vinfo { margin-top:0; }
@container (max-width: 760px) {
  .scr-nr .nr-feature { grid-template-columns:minmax(0,1fr); gap:10px; }
  .scr-nr .nr-feature-title { font-size:1.35rem; }
  .scr-nr .nr-arrow { display:none; }
  .scr-nr .nr-row > .nr-vcard { flex-basis:72%; }
  .scr-nr .nr-rail { padding:4px 14px 18px; }
}
@container (max-width: 560px) { .scr-nr .nr-embed .nr-vcard { grid-template-columns:minmax(0,1fr); gap:0; } .scr-nr .nr-embed .nr-vinfo { margin-top:10px; } }
.scr-nr .nr-more { display:flex; justify-content:center; margin-top:22px; }
.scr-nr .nr-more .btn { background:#1A212B; color:#fff; border-color:#2E3744; }
.scr-nr .nr-more .btn:hover { background:#252E3A; color:#fff; }
.scr-nr .nr-channels { margin-top:26px; padding-top:16px; border-top:1px solid #2A323E; }
.scr-nr .nr-channels h3 { color:#fff; font-size:1rem; text-transform:uppercase; letter-spacing:.08em; margin:0 0 10px; }
.scr-nr .nr-chan-strip { display:flex; gap:10px; overflow-x:auto; padding-bottom:6px; scrollbar-width:thin; }
.scr-nr .nr-chan { flex:none; display:inline-flex; align-items:center; gap:8px; padding:6px 14px 6px 6px; border-radius:999px; background:#1A212B; border:1px solid #2E3744; color:#E8ECF2; text-decoration:none; font-weight:600; font-size:14px; white-space:nowrap; }
.scr-nr .nr-chan:hover { border-color:var(--c-ac); color:#fff; }
.scr-nr .nr-chan .nr-vav { width:28px; height:28px; font-size:11px; }

/* footer */
.scr-nr .nr-footer { background:#121A24; color:#D4DAE3; padding:20px; font-size:14px; }
.scr-nr .nr-footer-top { display:flex; flex-wrap:wrap; gap:12px 24px; align-items:center; justify-content:space-between; margin-bottom:12px; }
.scr-nr .nr-footer .nr-wm-name { font-size:1.4rem; color:#fff; }
.scr-nr .nr-paidfor { display:inline-block; border:1.5px solid #8C97A6; padding:6px 10px; font-weight:600; color:#fff; font-size:13.5px; margin-bottom:8px; }
.scr-nr .nr-footer .small { color:#A9B3C1; }
.scr-nr .nr-capnote { margin-top:12px; font-size:13.5px; color:var(--ink-3); text-align:center; }
`;
  function injectStyle() {
    if (document.getElementById('scr-nr-style')) return;
    const s = document.createElement('style');
    s.id = 'scr-nr-style';
    s.textContent = NR_CSS;
    document.head.appendChild(s);
  }

  /* ---------------- time helpers ---------------- */
  function parseTime(s) {
    if (!s) return null;
    const m = String(s).match(/^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}(?::\d{2})?)?(Z|[+-]\d{2}:\d{2})?/);
    if (!m) return null;
    if (!m[2]) return { date: new Date(m[1] + 'T12:00:00-07:00'), dateOnly: true };
    const d = new Date(m[1] + m[2] + (m[3] || '-07:00'));
    return isNaN(d) ? null : { date: d, dateOnly: false };
  }
  const TZ = { timeZone: 'America/Los_Angeles' };
  function fmtClock(d) { try { return d.toLocaleTimeString('en-US', Object.assign({ hour: 'numeric', minute: '2-digit' }, TZ)); } catch (e) { return ''; } }
  function fmtDay(d, year) { try { return d.toLocaleDateString('en-US', Object.assign({ month: 'short', day: 'numeric' }, year ? { year: 'numeric' } : {}, TZ)); } catch (e) { return ''; } }
  function rel(s, asOf) {
    const p = parseTime(s);
    if (!p) return '—';
    if (p.dateOnly) return fmtDay(p.date, true);
    const mins = (asOf - p.date) / 60000;
    if (mins >= 0 && mins < 60 * 24) return U.timeAgo(mins);
    return fmtDay(p.date, false);
  }
  function stamp(s, asOf) {
    const p = parseTime(s);
    if (!p) return '—';
    const sameDay = fmtDay(p.date) === fmtDay(asOf);
    return sameDay ? fmtClock(p.date) : fmtDay(p.date) + ' · ' + fmtClock(p.date);
  }

  /* ---------------- render pieces ---------------- */
  function adSlot(ad, kind, extra) {
    if (!ad) return '';
    return `<div class="ad-slot ${kind}" ${extra || ''}><div class="nr-ad">
      <div class="nr-ad-text"><div class="nr-ad-title">${esc(ad.title)}</div><div class="nr-ad-sponsor">Sponsored by ${esc(ad.sponsor)} <span class="nr-badge-sample">Sample ad</span></div></div>
      <button class="btn btn-sm nr-ad-cta" data-act="ad" data-kind="${kind}" data-sponsor="${esc(ad.sponsor)}">${esc(ad.cta)}</button>
    </div></div>`;
  }
  const hlLink = (s, cls) => `<a class="nr-hl ${cls || ''}" href="${esc(s.url)}" ${EXT}>${esc(s.headline)}<span class="nr-out">${IC_OUT}</span><span class="sr-only" style="position:absolute;left:-9999px">(opens ${esc(s.source)} in a new tab)</span></a>`;
  const metaRow = (s, asOf) => `<div class="nr-meta"><b>${esc(s.source)}</b><span>·</span><span>${esc(rel(s.published, asOf))}</span></div>`;

  function channelColors(N, name) {
    const idx = (N.channels || []).findIndex((c) => c.name === name);
    const i = idx >= 0 ? idx : Math.floor(U.seeded('ch:' + name)() * PALETTE.length);
    return PALETTE[i % PALETTE.length];
  }
  function tileText(title) {
    const main = String(title || '').split(' | ')[0].replace(/^@\w+\s*/, '');
    const words = main.split(/\s+/);
    // emphasize the first two words in the accent color
    return `<em>${esc(words.slice(0, 2).join(' '))}</em> ${esc(words.slice(2).join(' '))}`;
  }
  function videoCard(v, N) {
    const [bg, ac] = channelColors(N, v.channel);
    const pub = v.published ? rel(v.published, parseTime(N.asOf).date) : '';
    return `<a class="nr-vcard" href="${esc(v.url)}" ${EXT} style="--c-bg:${bg};--c-ac:${ac}" aria-label="${esc(v.title)} — ${esc(v.channel)} (opens video in a new tab)">
      <div class="nr-vtile">
        <span class="nr-vtile-chip${v.isLive ? ' is-live' : ''}">${v.isLive ? '● Live' : esc(v.topic || 'Video')}</span>
        ${v.duration ? `<span class="nr-vtile-dur">${esc(v.duration)}</span>` : ''}
        <div class="nr-vtile-text" aria-hidden="true">${tileText(v.title)}</div>
        <span class="nr-vtile-play">${IC_PLAY}</span>
      </div>
      <div class="nr-vinfo">
        <span class="nr-vav" aria-hidden="true">${esc(U.initials(v.channel))}</span>
        <div style="min-width:0">
          <div class="nr-vtitle">${esc(v.title)}</div>
          <div class="nr-vchan">${esc(v.channel)}${pub ? ' · ' + esc(pub) : ''}${v.views != null ? ' · ' + U.fmtNum(v.views) + ' views' : ''}</div>
        </div>
      </div>
    </a>`;
  }

  function fmtEventDate(d) {
    const dt = new Date(d + 'T12:00:00');
    if (isNaN(dt)) return { mon: '', day: '', long: d };
    return { mon: dt.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(), day: dt.getDate(), long: dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) };
  }

  /* ---------------- render ---------------- */
  function render(el, ctx) {
    injectStyle();
    el.classList.add('scr-nr');
    const N = window.NEWSROOM;
    const t = ctx.tenant || {};
    const network = ctx.network || {};
    const S = ctx.state;
    S.hub_rsvp = S.hub_rsvp || {};
    S.nr_topic = S.nr_topic || 'All';
    if (typeof S.nr_showAll !== 'boolean') S.nr_showAll = false;

    const switcher = `<div class="lay-switch-wrap"><span class="lay-switch-label">Compare homepage layouts</span>
      <nav class="lay-switch" aria-label="Homepage layout"><a href="#/public-hub">Classic hub</a><a href="#/newsroom" class="is-on" aria-current="page">Newsroom</a></nav></div>`;

    if (!N || !Array.isArray(N.stories)) {
      el.innerHTML = `<div class="page">${switcher}<div class="card"><div class="card-body"><h2>Newsroom feeds are loading</h2><p class="muted">The headline and video feeds arrive in a moment.</p></div></div></div>`;
      return;
    }

    const asOfP = parseTime(N.asOf);
    const asOf = asOfP ? asOfP.date : new Date();
    const byTime = (a, b) => ((parseTime(b.published) || { date: 0 }).date - (parseTime(a.published) || { date: 0 }).date);
    // Real Santa Clara local headlines belong only on SVGOP's site.
    const stories = N.stories.filter((x) => x.category !== 'local' || t.slug === 'svgop');
    const cat = (c) => stories.filter((s) => s.category === c).sort(byTime);
    const breaking = stories.find((s) => s.id === N.breaking) || stories.slice().sort(byTime)[0];
    const lead = breaking;
    const secondary = stories.filter((s) => s.id !== lead.id && (s.category === 'national' || s.category === 'california')).sort(byTime).slice(0, 4);
    const river = stories.slice().sort(byTime).filter((s) => s.id !== lead.id).slice(0, 7);
    const used = new Set([lead.id].concat(secondary.map((s) => s.id)));
    const national = cat('national').filter((s) => !used.has(s.id));
    const california = cat('california').filter((s) => !used.has(s.id));
    const opinion = cat('opinion');
    const realLocal = t.slug === 'svgop' ? cat('local') : [];
    const countyNews = [].concat(
      (S.localPosts || []).filter((p) => p && !(p.tenantSlug && p.tenantSlug !== t.slug)).slice().reverse().map((p) => Object.assign({ _new: true }, p)),
      ((t.news && t.news.county) || []).slice(0, 3),
      ((t.news && t.news.city) || []).slice(0, 2));
    const events = (t.events || []).slice(0, 3);
    const cands = (t.candidates || []).filter((c) => c.status === 'ENDORSED' || c.status === 'ACTIVE_CAMPAIGN');

    const masterAd = (pl) => (network.masterAds || []).find((a) => a.placement === pl);
    const localAd = (pl) => (t.localAds || []).find((a) => a.placement === pl);

    const videos = N.videos || [];
    const topics = [];
    videos.forEach((v) => { if (v.topic && !topics.includes(v.topic)) topics.push(v.topic); });
    const hasLive = videos.some((v) => v.isLive);
    const chipList = ['All'].concat(hasLive ? ['Live'] : [], topics);
    if (!chipList.includes(S.nr_topic)) S.nr_topic = 'All';
    const featured = videos[0];
    const railVids = videos.slice(1, 8);
    const railIds = new Set(videos.slice(0, 8).map((v) => v.id));
    const natVideo = videos.find((v) => !railIds.has(v.id) && v.topic === 'Elections');
    const caVideo = videos.find((v) => !railIds.has(v.id) && v.topic === 'California');

    let dateLine = '';
    try { dateLine = asOf.toLocaleDateString('en-US', Object.assign({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }, TZ)); } catch (e) { dateLine = ''; }

    const tickerItems = stories.slice().sort(byTime).slice(0, 10)
      .map((s) => `<a href="${esc(s.url)}" ${EXT}>${esc(s.headline)}</a><span class="sep" aria-hidden="true">■</span>`).join('');

    const listItem = (s, top) => `<div class="nr-list-item${top ? ' is-top' : ''}">
      <span class="nr-kicker">${esc(s.tag || '')}</span>${hlLink(s)}${top ? `<p>${esc(s.summary)}</p>` : ''}${metaRow(s, asOf)}</div>`;
    const embed = (v) => v ? `<div class="nr-embed"><div class="nr-embed-label">${IC_PLAY.replace('<svg ', '<svg width="12" height="12" ')} Related video</div>${videoCard(v, N)}</div>` : '';
    const section = (id, title, list, opts) => `<section class="nr-section ${opts && opts.cls ? opts.cls : ''}" id="${id}">
      <div class="nr-sec-head"><h2>${esc(title)}</h2><span class="spacer"></span><span class="badge badge-master">${IC_NET} Network feed</span></div>
      ${list.map((s, i) => listItem(s, i === 0) + (i === 1 && opts && opts.video ? embed(opts.video) : '')).join('')}${list.length < 2 && opts && opts.video ? embed(opts.video) : ''}</section>`;

    const localNewsHtml = countyNews.map((n, i) => `<div class="nr-list-item nr-sample-item${i === 0 ? ' is-top' : ''}">
        <span class="nr-kicker-row"><span class="nr-badge-sample">Sample</span><span class="nr-kicker" style="color:var(--brand)">${esc(n.tag || 'Local')}${n._new ? ' · New' : ''}</span></span>
        <button class="nr-hl nr-hl-btn" data-act="local" data-id="${esc(n.id)}">${esc(n.title)}</button>
        ${i === 0 ? `<p>${esc(n.summary || '')}</p>` : ''}
        <div class="nr-meta"><span>Posted by <b>${esc(t.shortName)}</b></span><span>·</span><span>${esc(U.timeAgo(n.minutesAgo))}</span></div></div>`).join('');

    el.innerHTML = `
    <div class="page">
      ${switcher}
      <div class="page-head">
        <div>
          <h1>Newsroom homepage</h1>
          <p>An alternative front page for ${esc(t.domain || '')}: live headlines like a 24-hour news site, a video wall like a streaming platform, and your county’s own news, events and candidates in the middle.</p>
        </div>
      </div>
      <div class="explain" style="margin-bottom:18px"><strong>Why a newsroom layout?</strong> Voters come back to sites that change every hour. The Network keeps headlines and videos fresh around the clock, and your committee keeps its own local zone, events and endorsements front and center.</div>

      <div class="nr-browser">
        <div class="nr-chrome">
          <span class="nr-dots" aria-hidden="true"><i></i><i></i><i></i></span>
          <div class="nr-addr">${IC_ADDR}<span>https://${esc(t.domain || '')}</span></div>
          <span class="nr-visitor">Visitor view</span>
        </div>
        <div class="nr-site">
          <div class="nr-adrow">${adSlot(masterAd('HEADER_BANNER'), 'master')}</div>

          <header class="nr-mast">
            <div class="nr-mast-top">
              <div class="nr-wm">${STAR_ICON(40, 'var(--accent)')}<span><span class="nr-wm-name">${esc(t.shortName)} News</span><span class="nr-wm-sub">${esc(t.county || t.name)} · Newsroom</span></span></div>
              <div class="nr-date"><b>${esc(dateLine)}</b>Updated ${esc(fmtClock(asOf))} Pacific</div>
            </div>
            <nav class="nr-nav" aria-label="Sections">
              <button data-act="jump" data-to="nr-national">National</button>
              <button data-act="jump" data-to="nr-california">California</button>
              <button data-act="jump" data-to="nr-local">Local</button>
              <button data-act="jump" data-to="nr-opinion">Opinion</button>
              <button data-act="jump" data-to="nr-watch" class="nr-nav-watch"><i aria-hidden="true"></i>Video</button>
            </nav>
          </header>

          <div class="nr-breaking" data-tour="newsroom-breaking">
            <span class="nr-breaking-label"><span class="nr-pulse" aria-hidden="true"></span>BREAKING</span>
            <a href="${esc(breaking.url)}" ${EXT}><span class="nr-bk-head">${esc(breaking.headline)}</span><span class="nr-bk-meta">${esc(breaking.source)} · ${esc(rel(breaking.published, asOf))} ${IC_OUT}</span></a>
          </div>
          <div class="nr-ticker" aria-label="Latest headlines">
            <span class="nr-ticker-label">LATEST</span>
            <div class="nr-ticker-viewport"><div class="nr-ticker-track"><div style="display:flex">${tickerItems}</div><div style="display:flex" aria-hidden="true">${tickerItems.replace(/<a /g, '<a tabindex="-1" ')}</div></div></div>
          </div>
          ${App.voterGuide ? App.voterGuide.bar(t) : ''}

          <div class="nr-lead-grid">
            <article class="nr-lead" data-tour="newsroom-lead">
              <div class="nr-lead-rule" aria-hidden="true"></div>
              <span class="nr-kicker">${esc(lead.tag || '')} · Top story</span>
              ${hlLink(lead)}
              <p>${esc(lead.summary)}</p>
              ${metaRow(lead, asOf)}
              <a class="nr-lead-cta" href="${esc(lead.url)}" ${EXT}>Read the full story at ${esc(lead.source)} ${IC_OUT}</a>
            </article>
            <div class="nr-secondary">
              ${secondary.map((s) => `<div class="nr-sec-item"><span class="nr-kicker">${esc(s.tag || '')}</span>${hlLink(s)}${metaRow(s, asOf)}</div>`).join('')}
            </div>
          </div>

          ${featured ? (() => { const [bg, ac] = channelColors(N, featured.channel); return `
          <section class="nr-rail nr-dark" aria-label="Watch now">
            <div class="nr-sec-head"><h2>Watch now</h2><span class="nr-watch-sub" style="color:#A9B3C1;font-size:14px">Plays on the creator’s channel</span><span class="spacer"></span><button class="btn btn-sm" data-act="jump" data-to="nr-watch" style="background:#1A212B;color:#fff;border-color:#2E3744">All ${videos.length} videos</button></div>
            <a class="nr-feature" href="${esc(featured.url)}" ${EXT} style="--c-bg:${bg};--c-ac:${ac}" aria-label="${esc(featured.title)} — ${esc(featured.channel)} (opens video in a new tab)">
              <div class="nr-vtile">
                <span class="nr-vtile-chip${featured.isLive ? ' is-live' : ''}">${featured.isLive ? '● Live' : esc(featured.topic || 'Video')}</span>
                <div class="nr-vtile-text" aria-hidden="true">${tileText(featured.title)}</div>
                <span class="nr-vtile-play">${IC_PLAY}</span>
              </div>
              <div>
                <span class="nr-feature-kick">Featured · ${esc(featured.topic || 'Video')}</span>
                <div class="nr-feature-title">${esc(featured.title)}</div>
                <div class="nr-vinfo" style="margin-top:0"><span class="nr-vav" aria-hidden="true">${esc(U.initials(featured.channel))}</span><div><div class="nr-vtitle">${esc(featured.channel)}</div>${featured.published ? `<div class="nr-vchan">${esc(rel(featured.published, asOf))}</div>` : ''}</div></div>
                <span class="nr-feature-cta">${IC_PLAY} Watch video</span>
              </div>
            </a>
            <div class="nr-rowwrap">
              <button class="nr-arrow prev" data-act="rail" data-dir="-1" aria-label="Scroll videos left" disabled>${I('<path d="M12 5l-5 5 5 5"/>', 20)}</button>
              <div class="nr-row" tabindex="0" aria-label="More videos">${railVids.map((v) => videoCard(v, N)).join('')}</div>
              <button class="nr-arrow next" data-act="rail" data-dir="1" aria-label="Scroll videos right">${I('<path d="M8 5l5 5-5 5"/>', 20)}</button>
            </div>
          </section>`; })() : ''}
            <aside class="nr-river nr-pad" aria-label="Latest">
              <h3><i aria-hidden="true"></i>Latest</h3>
              <ol>${river.map((s) => `<li><time>${esc(stamp(s.published, asOf))}</time>${hlLink(s)}<span class="nr-src">${esc(s.source)}</span></li>`).join('')}</ol>
              ${adSlot(localAd('SIDEBAR_TOP'), 'local')}
            </aside>

          <div class="nr-pad">
            <div class="nr-sections">
              ${section('nr-national', 'National', national, { video: natVideo })}
              ${section('nr-california', 'California', california, { video: caVideo })}
            </div>

            <section class="nr-local-zone" id="nr-local">
              <div class="nr-sec-head"><h2>Local · ${esc(t.county || '')}</h2><span class="spacer"></span><span class="badge badge-local">${STAR_ICON(12)} Set by ${esc(t.shortName)}</span></div>
              <div class="nr-local-grid">
                <div>
                  ${realLocal.length ? `<div class="nr-sub">Around the county · real headlines</div>${realLocal.slice(0, 4).map((s, i) => listItem(s, i === 0)).join('')}` : ''}
                  <div class="nr-sub" style="${realLocal.length ? 'margin-top:22px' : ''}">Committee posts<span class="nr-badge-sample">Sample</span></div>
                  ${localNewsHtml}
                </div>
                <div>
                  <div class="nr-sub">Upcoming events<span class="nr-badge-sample">Sample</span></div>
                  ${events.map((e) => {
                    const d = fmtEventDate(e.date);
                    const going = !!S.hub_rsvp[e.id];
                    return `<div class="nr-event"><div class="nr-edate"><b>${esc(d.mon)}</b><span>${esc(d.day)}</span></div>
                      <div style="min-width:0"><div class="nr-event-title">${esc(e.title)}</div><div class="nr-event-sub">${esc(d.long)} · ${esc(e.time || '')}</div>
                      <div class="row" style="gap:8px"><button class="btn btn-sm nr-rsvp${going ? ' is-going' : ''}" data-act="rsvp" data-id="${esc(e.id)}" aria-pressed="${going}">${going ? 'You’re going ✓' : 'RSVP'}</button>
                      <span class="small muted"><b data-count="${esc(e.id)}">${U.fmtNum((e.rsvps || 0) + (going ? 1 : 0))}</b> going</span></div></div></div>`;
                  }).join('')}
                </div>
                <div>
                  <div class="nr-sub">Endorsed candidates<span class="nr-badge-sample">Sample</span></div>
                  ${cands.map((c) => `<button class="nr-cand" data-act="cand" data-id="${esc(c.id)}">${U.candidatePhoto ? U.candidatePhoto(c, 46, { shape: 'circle' }) : U.avatar(c.name, 46)}
                    <span style="min-width:0"><span class="nr-cand-name">${esc(c.name)}</span><span class="nr-cand-office">${esc(c.office)}${c.district ? ', ' + esc(c.district) : ''}</span></span></button>`).join('')}
                </div>
              </div>
            </section>

            ${section('nr-opinion', 'Opinion', opinion, { cls: 'nr-opinion' })}
            <div style="margin-top:18px">${adSlot(masterAd('IN_FEED'), 'master')}</div>
          </div>

          <section class="nr-watch nr-dark" id="nr-watch" data-tour="newsroom-watch">
            <div class="nr-sec-head"><h2>Watch</h2><span class="nr-watch-sub">Conservative video from across the country</span><span class="spacer"></span><span class="badge badge-master">${IC_NET} Network feed</span></div>
            <div class="nr-chips" role="toolbar" aria-label="Filter videos by topic">
              ${chipList.map((c) => {
                const n = c === 'All' ? videos.length : c === 'Live' ? videos.filter((v) => v.isLive).length : videos.filter((v) => v.topic === c).length;
                return `<button class="nr-chip${c === S.nr_topic ? ' active' : ''}" data-act="topic" data-topic="${esc(c)}" aria-pressed="${c === S.nr_topic}">${esc(c)}<span class="n">${n}</span></button>`;
              }).join('')}
            </div>
            <div class="nr-vgrid"></div>
            <div class="nr-more"></div>
            <div class="nr-channels">
              <h3>Channels</h3>
              <div class="nr-chan-strip">
                ${(N.channels || []).map((c) => { const [bg, ac] = channelColors(N, c.name); return `<a class="nr-chan" href="${esc(c.url)}" ${EXT} style="--c-bg:${bg};--c-ac:${ac}"><span class="nr-vav" aria-hidden="true">${esc(U.initials(c.name))}</span>${esc(c.name)}</a>`; }).join('')}
              </div>
            </div>
          </section>

          <footer class="nr-footer">
            <div class="nr-footer-top">
              <div class="nr-wm">${STAR_ICON(28, 'var(--accent)')}<span><span class="nr-wm-name">${esc(t.shortName)} News</span></span></div>
              <span class="small">Headlines link to their original publishers. Videos open on their own channels.</span>
            </div>
            <div class="nr-paidfor">Paid for by ${esc(t.name)}</div>
            <div class="small">Prepared independently of any candidate or candidate committee. © 2026 ${esc(t.name)}.</div>
          </footer>
        </div>
      </div>
      <p class="nr-capnote">Headlines and videos captured Oct 14, 2026. In production, the Media Curation agent refreshes these feeds every 15 minutes.</p>
    </div>`;

    function drawVideos() {
      const list = videos.filter((v) => S.nr_topic === 'All' || (S.nr_topic === 'Live' ? v.isLive : v.topic === S.nr_topic));
      const limit = S.nr_showAll ? list.length : 8;
      el.querySelector('.nr-vgrid').innerHTML = list.slice(0, limit).map((v) => videoCard(v, N)).join('');
      el.querySelector('.nr-more').innerHTML = list.length > limit
        ? `<button class="btn" data-act="more">Show all ${list.length} videos</button>`
        : (S.nr_showAll && list.length > 8 ? `<button class="btn" data-act="less">Show fewer</button>` : '');
      el.querySelectorAll('.nr-chip').forEach((b) => {
        const on = b.dataset.topic === S.nr_topic;
        b.classList.toggle('active', on); b.setAttribute('aria-pressed', on);
      });
    }
    drawVideos();

    const row = el.querySelector('.nr-row');
    function syncArrows() {
      if (!row) return;
      const p = el.querySelector('.nr-arrow.prev'), n = el.querySelector('.nr-arrow.next');
      if (p) p.disabled = row.scrollLeft < 8;
      if (n) n.disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 8;
    }
    if (row) { row.addEventListener('scroll', syncArrows, { passive: true }); requestAnimationFrame(syncArrows); }

    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'rail') { if (row) row.scrollBy({ left: Number(a.dataset.dir) * Math.max(260, row.clientWidth * 0.8), behavior: 'smooth' }); }
      else if (act === 'topic') { S.nr_topic = a.dataset.topic; S.nr_showAll = false; drawVideos(); }
      else if (act === 'more') { S.nr_showAll = true; drawVideos(); }
      else if (act === 'less') { S.nr_showAll = false; drawVideos(); el.querySelector('#nr-watch').scrollIntoView({ block: 'start' }); }
      else if (act === 'jump') {
        const target = el.querySelector('#' + a.dataset.to);
        if (target) {
          const off = (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h'), 10) || 64) + 16;
          window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - off, behavior: 'smooth' });
        }
      }
      else if (act === 'ad') {
        ctx.toast(a.dataset.kind === 'master'
          ? `Network sponsor: ${a.dataset.sponsor}. The Network fills this slot on every county site.`
          : `Local sponsor: ${a.dataset.sponsor}. ${t.shortName} sells and manages this slot.`, 'info');
      }
      else if (act === 'local') {
        const n = countyNews.find((x) => String(x.id) === a.dataset.id);
        if (!n) return;
        ctx.modal({
          title: n.title,
          html: `<p class="small muted" style="margin-bottom:10px">Posted by ${esc(t.shortName)} · ${esc(U.timeAgo(n.minutesAgo))} <span class="badge badge-warn">Sample</span></p>
            <p style="font-size:16.5px;line-height:1.6">${esc(n.summary || '')}</p>
            <p class="small muted">Sample committee post for this prototype. In production, your committee writes these in the Committee Portal.</p>`,
        });
      }
      else if (act === 'rsvp') {
        const id = a.dataset.id;
        const ev = events.find((x) => x.id === id);
        const going = !S.hub_rsvp[id];
        S.hub_rsvp[id] = going;
        a.classList.toggle('is-going', going);
        a.setAttribute('aria-pressed', going);
        a.textContent = going ? 'You’re going ✓' : 'RSVP';
        const c = el.querySelector(`[data-count="${id}"]`);
        if (c) c.textContent = U.fmtNum((ev ? ev.rsvps || 0 : 0) + (going ? 1 : 0));
        ctx.toast(going ? `You’re on the list for ${ev ? ev.title : 'this event'}.` : 'RSVP removed. Your seat is open for a neighbor.', going ? 'ok' : 'info');
      }
      else if (act === 'cand') ctx.navigate('candidate/microsite/' + a.dataset.id);
    });
  }

  App.register({
    id: 'newsroom',
    title: 'Newsroom homepage',
    group: 'Public Site',
    icon: ICON,
    blurb: 'Alternative homepage: live headlines and conservative video, newsroom style.',
    render,
  });
})();
