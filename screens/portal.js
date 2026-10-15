/* screens/portal.js — Committee Portal (Agent 5)
   Routes: #/portal (Our Website Content), #/portal/ads (Local Ad Slots), #/portal/network (Network & Exchange) */
(function () {
  'use strict';
  if (!window.App) return;

  const I = (d) => `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = I('<circle cx="7" cy="7" r="2.5"/><circle cx="13.5" cy="8" r="2"/><path d="M2.5 16c.6-2.8 2.4-4.2 4.5-4.2s3.9 1.4 4.5 4.2M11.5 12.3c2.3-.4 4.2.8 5 3.7"/>');
  const LOCK = '<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>';
  const PIN = '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h6l-1 5 3 3H5l3-3z"/><path d="M10 11v6"/></svg>';
  const EYE_OFF = '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l14 14"/><path d="M8.6 5.2A8 8 0 0 1 10 5c4.5 0 7 5 7 5a12 12 0 0 1-2 2.6M5.3 6.6A12 12 0 0 0 3 10s2.5 5 7 5a7 7 0 0 0 3-.7"/></svg>';
  const SHIELD = '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5l6 2.3v4.7c0 3.9-2.6 6.6-6 8-3.4-1.4-6-4.1-6-8V4.8z"/><path d="M7.5 10l1.8 1.8L12.8 8"/></svg>';

  const SLOT_LABEL = {
    HEADER_BANNER: 'Header banner', ALERT_BAR: 'Alert bar', IN_FEED_NET: 'In-feed (network)',
    SIDEBAR_TOP: 'Sidebar top', IN_FEED: 'In-feed (local)', SIDEBAR_BOTTOM: 'Sidebar bottom', FOOTER_BANNER: 'Footer banner',
  };
  const LOCAL_SLOTS = ['SIDEBAR_TOP', 'IN_FEED', 'FOOTER_BANNER'];

  /* Extra co-host invitations (fictional) so the Co-host button has somewhere to go. */
  const OPEN_EVENTS = [
    { id: 'pt-je-a', title: 'Regional Slate Card Print Day', date: '2026-10-24', hosts: ['san-mateo', 'placer'], location: 'Shared print shop, split bulk run', rsvps: 31 },
    { id: 'pt-je-b', title: 'Lincoln Day Dinner Speaker Swap', date: '2027-02-13', hosts: ['orange', 'san-luis-obispo'], location: 'Each county’s own dinner, one shared keynote', rsvps: 12 },
  ];

  const REPLIES = [
    (t) => `Thanks, ${t}! That helps. We will bring it to our board Thursday.`,
    () => 'Good idea. Can you drop the file in the Asset Exchange so we can copy it?',
    () => 'Count us in. I will add it to our volunteer calendar tonight.',
    () => 'Great timing. Our precinct captains asked about this today.',
    (t) => `Love it. ${t} always shares the good stuff. Let us split the print run.`,
  ];

  /* ---------------- helpers ---------------- */
  const esc = (s) => App.util.esc(s);
  function S() {
    const s = App.state;
    s.hiddenPushes = s.hiddenPushes || [];
    s.pinnedPushes = s.pinnedPushes || [];
    s.localPosts = s.localPosts || [];
    s.portal_slots = s.portal_slots || {};
    s.portal_newAds = s.portal_newAds || {};
    s.portal_msgs = s.portal_msgs || {};
    s.portal_channel = s.portal_channel || {};
    s.portal_joined = s.portal_joined || {};
    s.portal_forks = s.portal_forks || {};
    s.portal_copied = s.portal_copied || {};
    s.portal_shared = s.portal_shared || {};
    s.portal_cohost = s.portal_cohost || {};
    s.portal_draft = s.portal_draft || {};
    s.portal_filter = s.portal_filter || 'all';
    return s;
  }
  function countyName(slug) {
    const T = (window.DATA && DATA.tenants) || {};
    if (T[slug]) return T[slug].shortName;
    const c = ((DATA.network && DATA.network.counties) || []).find((x) => x.slug === slug);
    return c ? `${c.name} County` : slug;
  }
  function countyColors(slug) {
    const T = DATA.tenants || {};
    if (T[slug]) return [T[slug].colors.brand, T[slug].colors.accent];
    return ['#5B3FA0', '#9A86CF'];
  }
  function countyBadge(slug, tenantSlug) {
    const mine = slug === tenantSlug;
    return `<span class="badge ${mine ? 'badge-local' : ''} pt-cbadge" style="${mine ? '' : `--cb:${countyColors(slug)[0]}`}">${esc(countyName(slug))}</span>`;
  }
  function fmtDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ---------------- scoped styles ---------------- */
  function injectStyle() {
    if (document.getElementById('scr-portal-style')) return;
    const st = document.createElement('style');
    st.id = 'scr-portal-style';
    st.textContent = `
.scr-portal .pt-eyebrow { font-weight: 700; color: var(--brand); font-size: 14.5px; margin-bottom: 4px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.scr-portal .pt-cols { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.scr-portal .pt-list { list-style: none; margin: 0; padding: 0; }
.scr-portal .pt-item { display: flex; gap: 12px; align-items: flex-start; padding: 14px 20px; border-top: 1px solid var(--line); }
.scr-portal .pt-item:first-child { border-top: 0; }
.scr-portal .pt-item-main { flex: 1; min-width: 0; }
.scr-portal .pt-item h4 { font-size: 1rem; margin: 0 0 3px; line-height: 1.3; }
.scr-portal .pt-item p { margin: 0 0 6px; font-size: 14px; color: var(--ink-2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.scr-portal .pt-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 13px; color: var(--ink-3); }
.scr-portal .pt-actions { display: flex; flex-direction: column; gap: 6px; flex: none; }
.scr-portal .pt-item.is-hidden { background: var(--surface-2); }
.scr-portal .pt-item.is-hidden h4, .scr-portal .pt-item.is-hidden p { color: var(--ink-3); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--ink-3) 50%, transparent); }
.scr-portal .pt-item.is-pinned { background: color-mix(in srgb, var(--brand) 5%, white); box-shadow: inset 3px 0 0 var(--brand); }
.scr-portal .pt-item.is-locked { background: var(--warn-soft); box-shadow: inset 3px 0 0 var(--warn); }
.scr-portal .pt-lockwrap { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: var(--warn); font-size: 13px; }
.scr-portal .pt-locknote { font-size: 13px; color: var(--warn); margin-top: 6px; font-weight: 600; }
.scr-portal .pt-btn-on { background: var(--brand); color: var(--brand-ink); border-color: var(--brand); }
.scr-portal .pt-btn-on:hover { background: color-mix(in srgb, var(--brand) 86%, black); color: var(--brand-ink); }
.scr-portal .pt-subhead { padding: 10px 20px; background: var(--surface-2); border-top: 1px solid var(--line); font: 700 13.5px/1.2 var(--font-body); color: var(--ink-2); display: flex; gap: 8px; align-items: center; }
.scr-portal .pt-counter { font-weight: 700; font-size: 14px; color: var(--ink-2); background: var(--surface-2); border: 1px solid var(--line); padding: 4px 10px; border-radius: 999px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.scr-portal .pt-seg { display: flex; gap: 6px; flex-wrap: wrap; }
.scr-portal .pt-success { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; background: var(--ok-soft); color: var(--ok); border: 1px solid color-mix(in srgb, var(--ok) 25%, white); border-radius: var(--r); padding: 10px 14px; font-weight: 600; font-size: 14.5px; }
.scr-portal .pt-field label { display: block; font-weight: 600; font-size: 14px; margin-bottom: 5px; color: var(--ink-2); }
.scr-portal .pt-cbadge:not(.badge-local) { background: color-mix(in srgb, var(--cb) 9%, white); color: var(--cb); border-color: color-mix(in srgb, var(--cb) 28%, white); }

/* ad map */
.scr-portal .pt-browser { border: 1px solid var(--line-strong); border-radius: var(--r-lg); overflow: hidden; background: var(--surface); box-shadow: var(--shadow-1); }
.scr-portal .pt-browser-bar { display: flex; align-items: center; gap: 10px; padding: 9px 14px; background: var(--surface-2); border-bottom: 1px solid var(--line); }
.scr-portal .pt-dots { display: flex; gap: 6px; flex: none; }
.scr-portal .pt-dots i { width: 10px; height: 10px; border-radius: 50%; background: var(--line-strong); display: block; }
.scr-portal .pt-url { flex: 1; min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 3px 12px; font-size: 13.5px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scr-portal .pt-site { padding: 16px; display: grid; gap: 14px; }
.scr-portal .pt-sitehead { display: flex; align-items: center; gap: 10px; background: var(--brand); color: var(--brand-ink); border-radius: var(--r); padding: 10px 14px; font-family: var(--font-head); font-weight: 800; font-stretch: 85%; }
.scr-portal .pt-sitehead .pt-navmock { margin-left: auto; display: flex; gap: 10px; }
.scr-portal .pt-sitehead .pt-navmock i { display: block; width: 38px; height: 7px; border-radius: 4px; background: color-mix(in srgb, var(--brand-ink) 45%, transparent); }
.scr-portal .pt-sitebody { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 14px; }
.scr-portal .pt-region-label { font: 700 12.5px/1.2 var(--font-body); color: var(--ink-3); margin: 0 0 6px; letter-spacing: .02em; }
.scr-portal .pt-mock { border-radius: var(--r); background: var(--surface-2); border: 1px solid var(--line); padding: 12px; display: grid; gap: 7px; }
.scr-portal .pt-mock i { display: block; height: 8px; border-radius: 4px; background: var(--line); }
.scr-portal .pt-mock i.h { height: 11px; width: 70%; background: var(--line-strong); }
.scr-portal .pt-mock i.s { width: 55%; }
.scr-portal button.ad-slot { display: block; width: 100%; text-align: left; font: inherit; color: inherit; cursor: pointer; transition: box-shadow .15s ease, transform .15s ease; }
.scr-portal button.ad-slot:hover { box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand) 18%, transparent); }
.scr-portal .ad-slot.master.pt-grey { filter: grayscale(.55); opacity: .72; }
.scr-portal .pt-slot-title { font-weight: 700; font-size: 14.5px; line-height: 1.3; }
.scr-portal .pt-slot-sub { font-size: 13px; color: var(--ink-3); margin-top: 2px; }
.scr-portal .pt-slot-cta { display: inline-block; margin-top: 8px; font: 700 12.5px/1 var(--font-body); padding: 6px 10px; border-radius: 999px; background: var(--slot-color); color: #fff; }
.scr-portal .ad-slot.local .pt-slot-cta { color: var(--brand-ink); }
.scr-portal .pt-slot-hint { position: absolute; top: 4px; right: 10px; font-size: 12.5px; font-weight: 700; color: var(--brand); }
.scr-portal .pt-slot-name { position: absolute; top: 4px; right: 10px; font-size: 12.5px; font-weight: 600; color: var(--ink-3); }
.scr-portal .pt-legend { display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 14px; color: var(--ink-2); }
.scr-portal .pt-legend span { display: inline-flex; align-items: center; gap: 8px; }
.scr-portal .pt-legend i { width: 22px; height: 14px; border-radius: 4px; border: 2px dashed; display: inline-block; }
.scr-portal .pt-pick { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--r); cursor: pointer; margin-bottom: 8px; }
.scr-portal .pt-pick:has(input:checked), .pt-modal .pt-pick:has(input:checked) { border-color: var(--brand); background: color-mix(in srgb, var(--brand) 6%, white); }
.pt-modal .pt-pick { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--r); cursor: pointer; margin-bottom: 8px; }
.pt-modal .pt-pick input { margin-top: 4px; accent-color: var(--brand); }
.pt-modal .pt-field { margin-top: 10px; }
.pt-modal .pt-field label { display: block; font-weight: 600; font-size: 14px; margin-bottom: 5px; color: var(--ink-2); }
.pt-modal .pt-divider { display: flex; align-items: center; gap: 10px; margin: 14px 0 4px; font-weight: 700; font-size: 14px; color: var(--ink-2); }
.pt-modal .pt-divider::after { content: ''; flex: 1; height: 1px; background: var(--line); }
.pt-modal .pt-preview { border: 1px solid var(--line); border-radius: var(--r); padding: 14px; background: var(--surface-2); text-align: center; }
.pt-modal .pt-preview svg { width: 100%; max-width: 320px; height: auto; }
.pt-modal .pt-steps { margin: 12px 0 0; padding-left: 20px; font-size: 14.5px; }

/* chat */
.scr-portal .pt-chat { display: grid; grid-template-columns: 250px minmax(0, 1fr); min-height: 460px; }
.scr-portal .pt-chans { border-right: 1px solid var(--line); background: var(--surface-2); padding: 10px; display: flex; flex-direction: column; gap: 4px; border-bottom-left-radius: var(--r-lg); }
.scr-portal .pt-chan { appearance: none; border: 0; background: transparent; text-align: left; font: inherit; cursor: pointer; padding: 9px 10px; border-radius: var(--r-sm); display: flex; align-items: center; gap: 8px; color: var(--ink-2); border-left: 3px solid transparent; }
.scr-portal .pt-chan:hover { background: var(--surface); }
.scr-portal .pt-chan.active { background: var(--surface); color: var(--brand); font-weight: 700; border-left-color: var(--accent); box-shadow: var(--shadow-1); }
.scr-portal .pt-chan-name { flex: 1; min-width: 0; font-size: 14.5px; line-height: 1.3; }
.scr-portal .pt-chan-type { display: block; font-size: 12.5px; color: var(--ink-3); font-weight: 500; }
.scr-portal .pt-unread { flex: none; min-width: 22px; height: 22px; border-radius: 999px; background: var(--accent); color: #fff; font-size: 12.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; padding: 0 6px; }
.scr-portal .pt-chans-label { font: 700 12.5px/1.2 var(--font-body); color: var(--ink-3); padding: 8px 10px 4px; }
.scr-portal .pt-pane { display: flex; flex-direction: column; min-width: 0; }
.scr-portal .pt-pane-head { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; padding: 12px 18px; border-bottom: 1px solid var(--line); }
.scr-portal .pt-pane-head h3 { margin: 0; font-size: 1.1rem; }
.scr-portal .pt-enc { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; font-weight: 600; color: var(--ok); }
.scr-portal .pt-msgs { flex: 1; overflow-y: auto; max-height: 420px; padding: 14px 18px; display: flex; flex-direction: column; gap: 14px; }
.scr-portal .pt-msg { display: flex; gap: 10px; align-items: flex-start; }
.scr-portal .pt-msg-body { min-width: 0; flex: 1; }
.scr-portal .pt-msg-top { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; font-size: 14px; }
.scr-portal .pt-msg-top b { font-weight: 700; }
.scr-portal .pt-msg-text { margin-top: 4px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 4px var(--r) var(--r) var(--r); padding: 8px 12px; font-size: 15px; line-height: 1.45; display: inline-block; max-width: 100%; overflow-wrap: anywhere; }
.scr-portal .pt-msg.mine .pt-msg-text { background: color-mix(in srgb, var(--brand) 8%, white); border-color: color-mix(in srgb, var(--brand) 22%, white); }
.scr-portal .pt-typing { font-size: 13.5px; color: var(--ink-3); font-style: italic; }
.scr-portal .pt-compose { display: flex; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--line); }
.scr-portal .pt-compose .input { flex: 1; min-width: 0; }

/* assets */
.scr-portal .pt-featured { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 18px; align-items: center; }
.scr-portal .pt-flow { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 10px 0 12px; }
.scr-portal .pt-flow div { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--r); padding: 8px 10px; font-size: 13.5px; line-height: 1.35; }
.scr-portal .pt-flow b { display: block; color: var(--brand); font-size: 13px; }
.scr-portal .pt-asset { display: flex; flex-direction: column; overflow: hidden; }
.scr-portal .pt-illus { margin: -10px 0 16px; }
.scr-portal .pt-thumb { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; border-bottom: 1px solid var(--line); background: var(--surface-2); }
.scr-portal .pt-featured .pt-thumb { border: 1px solid var(--line); border-radius: var(--r); }
.scr-portal .pt-asset-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
.scr-portal .pt-asset-body h4 { font-size: 1rem; line-height: 1.3; margin: 0; }
.scr-portal .pt-asset-stats { font-size: 13.5px; color: var(--ink-3); display: flex; gap: 12px; flex-wrap: wrap; font-variant-numeric: tabular-nums; }
.scr-portal .pt-asset-body .row { margin-top: auto; }
.scr-portal .pt-event-date { font: 800 13.5px/1.2 var(--font-body); color: var(--accent); letter-spacing: .02em; }
.scr-portal .pt-section { margin-top: 32px; }
.scr-portal .pt-section > .row:first-child { margin-bottom: 12px; }
.scr-portal .pt-section h2 { margin: 0; }

@media (max-width: 900px) {
  .scr-portal .pt-cols { grid-template-columns: minmax(0, 1fr); }
  .scr-portal .pt-chat { grid-template-columns: minmax(0, 1fr); }
  .scr-portal .pt-chans { border-right: 0; border-bottom: 1px solid var(--line); border-radius: 0; flex-direction: row; overflow-x: auto; }
  .scr-portal .pt-chans-label { display: none; }
  .scr-portal .pt-chan { flex: none; max-width: 230px; border-left: 0; border-bottom: 3px solid transparent; }
  .scr-portal .pt-chan.active { border-bottom-color: var(--accent); }
}
@media (max-width: 720px) {
  .scr-portal .pt-sitebody { grid-template-columns: minmax(0, 1fr); }
  .scr-portal .pt-sitehead .pt-navmock { display: none; }
  .scr-portal .pt-featured { grid-template-columns: minmax(0, 1fr); }
  .scr-portal .pt-featured .pt-thumb { max-width: 240px; }
  .scr-portal .pt-flow { grid-template-columns: minmax(0, 1fr); }
  .scr-portal .pt-item { padding: 12px 14px; flex-wrap: wrap; }
  .scr-portal .pt-actions { flex-direction: row; flex-wrap: wrap; width: 100%; }
  .scr-portal .pt-subhead { padding: 10px 14px; }
  .scr-portal .pt-assets { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .scr-portal .pt-asset { flex-direction: row; }
  .scr-portal .pt-asset > .pt-thumb { width: 120px; height: 75px; aspect-ratio: 16 / 10; flex: none; align-self: flex-start; margin: 12px 0 12px 12px; border: 1px solid var(--line); border-radius: var(--r-sm); }
  .scr-portal .pt-asset-body { padding: 12px; gap: 6px; }
}`;
    document.head.appendChild(st);
  }

  /* ---------------- asset thumbnails ---------------- */
  function thumb(kind, fromSlug, title) {
    const [c1, c2] = countyColors(fromSlug);
    const name = esc(countyName(fromSlug));
    const lines = (x, y, w, n, gap, col) => Array.from({ length: n }, (_, i) => `<rect x="${x}" y="${y + i * gap}" width="${i === n - 1 ? w * 0.6 : w}" height="4" rx="2" fill="${col || '#C3CAD4'}"/>`).join('');
    const star = (x, y, r, f) => {
      const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.42 : r; p.push((x + rr * Math.cos(a)).toFixed(1) + ',' + (y + rr * Math.sin(a)).toFixed(1)); }
      return `<polygon points="${p.join(' ')}" fill="${f}"/>`;
    };
    let art = '';
    if (kind === 'Door hanger') {
      art = `<rect x="62" y="8" width="44" height="86" rx="6" fill="#fff" stroke="${c1}" stroke-width="2"/>
        <path d="M62 14a6 6 0 0 1 6-6h32a6 6 0 0 1 6 6v24H62z" fill="${c1}"/>
        <circle cx="84" cy="21" r="7.5" fill="#fff"/><rect x="82" y="28" width="4" height="8" fill="#fff"/>
        ${lines(68, 46, 32, 4, 8)}<rect x="68" y="80" width="18" height="8" rx="2" fill="${c2}"/>
        <rect x="90" y="78" width="11" height="11" fill="none" stroke="${c1}" stroke-width="1.6"/>`;
    } else if (kind === 'Flyer') {
      art = `<rect x="50" y="8" width="64" height="86" rx="3" fill="#fff" stroke="#C3CAD4" stroke-width="1.5"/>
        <rect x="50" y="8" width="64" height="26" rx="3" fill="${c1}"/>${star(66, 21, 7, '#fff')}
        <rect x="77" y="16" width="30" height="5" rx="2" fill="#fff" opacity=".9"/><rect x="77" y="24" width="20" height="4" rx="2" fill="#fff" opacity=".6"/>
        ${lines(57, 42, 50, 4, 8)}<rect x="57" y="78" width="50" height="10" rx="3" fill="${c2}"/>`;
    } else if (kind === 'Playbook') {
      art = `<path d="M30 16h48v72H34a4 4 0 0 1-4-4z" fill="${c1}"/><path d="M82 16h48v68a4 4 0 0 1-4 4H82z" fill="#fff" stroke="#C3CAD4" stroke-width="1.5"/>
        <rect x="78" y="14" width="4" height="76" fill="${c2}"/>${star(54, 40, 10, '#fff')}
        <rect x="38" y="58" width="32" height="5" rx="2" fill="#fff" opacity=".85"/><rect x="38" y="67" width="22" height="4" rx="2" fill="#fff" opacity=".6"/>
        ${lines(90, 26, 32, 7, 8)}`;
    } else if (kind === 'Yard sign') {
      art = `<path d="M58 62v32M102 62v32" stroke="#8A6A3E" stroke-width="3"/>
        <rect x="30" y="12" width="100" height="54" rx="4" fill="${c1}"/>${star(46, 30, 9, c2)}
        <rect x="60" y="22" width="58" height="9" rx="2" fill="#fff"/><rect x="60" y="36" width="42" height="6" rx="2" fill="#fff" opacity=".75"/>
        <rect x="38" y="50" width="84" height="8" rx="2" fill="${c2}"/>`;
    } else {
      art = `<rect x="28" y="10" width="104" height="80" rx="6" fill="#fff" stroke="#C3CAD4" stroke-width="1.5"/>
        <path d="M28 44l34-8 22 14 48-10M62 10v26M84 50v40M104 46l-6 44" stroke="#DCE1E8" stroke-width="2" fill="none"/>
        <path d="M62 36l22 14 20-4 2-36H62z" fill="${c1}" opacity=".22"/><path d="M28 44l34-8 22 14v40H28z" fill="${c2}" opacity=".18"/>
        <path d="M84 50l20-4 28-6v50H98z" fill="${c1}" opacity=".1"/>
        <path d="M80 26a8 8 0 0 1 16 0c0 6-8 14-8 14s-8-8-8-14z" fill="${c2}"/><circle cx="88" cy="26" r="3" fill="#fff"/>`;
    }
    return `<svg class="pt-thumb" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(kind)} preview: ${esc(title || '')} from ${name}">
      <rect width="160" height="100" fill="color-mix(in srgb, ${c1} 7%, #F8F9FB)"/>${art}</svg>`;
  }

  /* ---------------- data access ---------------- */
  function networkItems(t) {
    const out = [];
    if (t.breaking) out.push(Object.assign({ _scope: 'Alert' }, t.breaking));
    (t.news.state || []).filter((x) => x.pushed).forEach((x) => out.push(Object.assign({ _scope: 'State' }, x, { _ref: x })));
    (t.news.national || []).filter((x) => x.pushed).forEach((x) => out.push(Object.assign({ _scope: 'National' }, x, { _ref: x })));
    return out;
  }
  function ownPosts(ctx) {
    const s = S();
    const mine = s.localPosts.filter((p) => !p.tenantSlug || p.tenantSlug === ctx.tenantSlug)
      .map((p) => ({ item: p, tab: p.tab || 'county', isNew: true }));
    const county = (ctx.tenant.news.county || []).filter((x) => !x.pushed).map((x) => ({ item: x, tab: 'county' }));
    const city = (ctx.tenant.news.city || []).filter((x) => !x.pushed).map((x) => ({ item: x, tab: 'city' }));
    return mine.concat(county, city);
  }
  function allLocalAds(ctx) {
    const s = S();
    return (ctx.tenant.localAds || []).concat(s.portal_newAds[ctx.tenantSlug] || []);
  }
  function slotMap(ctx) {
    const s = S();
    if (!s.portal_slots[ctx.tenantSlug]) {
      const m = {};
      LOCAL_SLOTS.forEach((p) => { const a = (ctx.tenant.localAds || []).find((x) => x.placement === p); m[p] = a ? a.id : null; });
      s.portal_slots[ctx.tenantSlug] = m;
    }
    return s.portal_slots[ctx.tenantSlug];
  }
  function channelsFor(ctx) {
    const s = S();
    const all = ctx.network.channels || [];
    const joined = s.portal_joined[ctx.tenantSlug] || [];
    const mine = all.filter((c) => c.counties.includes(ctx.tenantSlug) || joined.includes(c.id));
    const joinable = all.filter((c) => c.type === 'REGIONAL' && !mine.includes(c));
    return { mine, joinable };
  }
  function msgsFor(ctx, ch) {
    const s = S();
    const k = ctx.tenantSlug + ':' + ch.id;
    return ch.messages.concat(s.portal_msgs[k] || []);
  }
  function assetsFor(ctx) {
    const s = S();
    return (s.portal_shared[ctx.tenantSlug] || []).concat(ctx.network.sharedAssets || []);
  }

  /* ---------------- shared page chrome ---------------- */
  function head(ctx) {
    const t = ctx.tenant;
    const tabs = [['', 'Our Website Content'], ['ads', 'Local Ad Slots'], ['network', 'Network & Exchange']];
    const roleNote = ctx.role === 'board' || ctx.role === 'master' ? ''
      : `<span class="badge badge-warn">Viewing as ${esc(App.roleLabel(ctx.role))}: in production these tools open for the Executive Board</span>`;
    return `
      <div class="page-head">
        <div>
          <div class="pt-eyebrow">${esc(t.name)} <span class="badge badge-local">Executive Board tools</span> ${roleNote}</div>
          <h1>Committee Portal</h1>
          <p>Run ${esc(t.shortName)}’s own website, local sponsors and county-to-county teamwork from one place. Changes go live at ${esc(t.domain)} right away.</p>
        </div>
        <button class="btn btn-ghost" data-act="go-hub">View our public site →</button>
      </div>
      <nav class="tabs" aria-label="Committee Portal sections">
        ${tabs.map(([k, l]) => `<a class="tab${ctx.sub === k ? ' active' : ''}" href="#/portal${k ? '/' + k : ''}"${ctx.sub === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}
      </nav>
      ${ctx.sub === 'network' && ctx.network.note ? `<p class="small muted pt-illus">${esc(ctx.network.note)}</p>` : ''}`;
  }

  /* ================= CONTENT ================= */
  function contentHtml(ctx) {
    const s = S();
    const t = ctx.tenant;
    const draft = s.portal_draft[ctx.tenantSlug] || { title: '', summary: '', tab: 'county' };
    const f = s.portal_filter;
    const allPosts = ownPosts(ctx).filter((p) => f === 'all' || p.tab === f);
    const showAll = !!s.portal_showAll;
    const posts = showAll ? allPosts : allPosts.slice(0, 6);
    const items = networkItems(t);
    const hidden = items.filter((x) => !x.locked && s.hiddenPushes.includes(x.id)).length;
    const pinned = items.filter((x) => s.pinnedPushes.includes(x.id)).length;
    const published = s.portal_lastPublished && s.portal_lastPublished.tenant === ctx.tenantSlug;

    const postRow = (p) => `
      <li class="pt-item">
        <div class="pt-item-main">
          <h4>${esc(p.item.title)}</h4>
          <p>${esc(p.item.summary)}</p>
          <div class="pt-meta">
            ${p.isNew ? '<span class="badge badge-ok">New</span>' : ''}
            <span class="badge badge-local">${p.tab === 'city' ? 'City' : 'County'}</span>
            <span>${esc(p.item.source || t.shortName)}</span><span>·</span><span>${esc(App.util.timeAgo(p.item.minutesAgo))}</span>
          </div>
        </div>
        <div class="pt-actions"><button class="btn btn-sm" data-act="edit" data-id="${esc(p.item.id)}">Edit</button></div>
      </li>`;

    const netRow = (x) => {
      const isHidden = !x.locked && s.hiddenPushes.includes(x.id);
      const isPinned = s.pinnedPushes.includes(x.id);
      const cls = x.locked ? ' is-locked' : isHidden ? ' is-hidden' : isPinned ? ' is-pinned' : '';
      return `
      <li class="pt-item${cls}">
        <div class="pt-item-main">
          <div class="pt-meta" style="margin-bottom:4px">
            <span class="badge badge-master">${x._scope === 'Alert' ? 'Urgent alert' : x._scope === 'State' ? 'California' : 'National'}</span>
            ${x.locked ? `<span class="pt-lockwrap" data-tour="portal-lock"><span class="lock">${LOCK}</span>Locked</span>` : ''}
            ${isPinned && !x.locked ? `<span class="badge badge-local">${PIN} Pinned</span>` : ''}
            ${isHidden ? '<span class="badge">Hidden from our site</span>' : ''}
          </div>
          <h4>${esc(x.title)}</h4>
          <div class="pt-meta"><span>${esc(x.source)}</span><span>·</span><span>${esc(App.util.timeAgo(x.minutesAgo))}</span></div>
          ${x.locked ? '<div class="pt-locknote">Locked by the Network for every county until it expires.</div>' : ''}
        </div>
        <div class="pt-actions">
          ${x.locked
            ? `<button class="btn btn-sm" disabled title="Locked by the Network for every county until it expires.">${EYE_OFF} Hide</button>
               <button class="btn btn-sm" disabled title="Locked alerts already sit at the top">${PIN} Pin</button>`
            : `<button class="btn btn-sm${isHidden ? ' pt-btn-on' : ''}" data-act="hide" data-id="${esc(x.id)}" aria-pressed="${isHidden}">${EYE_OFF} ${isHidden ? 'Show' : 'Hide'}</button>
               <button class="btn btn-sm${isPinned ? ' pt-btn-on' : ''}" data-act="pin" data-id="${esc(x.id)}" aria-pressed="${isPinned}" ${isHidden ? 'disabled title="Show it first to pin it"' : ''}>${PIN} ${isPinned ? 'Unpin' : 'Pin'}</button>`}
        </div>
      </li>`;
    };
    const groups = [['Alert', 'Urgent alert from the Network'], ['State', 'California news (Golden State Wire and Capitol Report)'], ['National', 'National news']];

    return `
      <div class="explain" style="margin-bottom:20px"><strong>Your county decides what appears on its own site.</strong> The Network only suggests stories; you hide, pin or keep them. The one exception is an urgent locked alert, like a registration deadline, which stays up for every county until it expires.</div>
      <div class="pt-cols">
        <div class="stack">
          <div class="card">
            <div class="card-head"><h3>Write a local post</h3><span class="spacer"></span><span class="small muted">Publishes to ${esc(t.domain)}</span></div>
            <div class="card-body stack" style="gap:12px">
              <div class="pt-field"><label for="pt-title">Headline</label><input id="pt-title" class="input" data-draft="title" maxlength="120" placeholder="e.g. Precinct walk this Saturday: meet at 9 AM" value="${esc(draft.title)}"></div>
              <div class="pt-field"><label for="pt-sum">Summary</label><textarea id="pt-sum" class="textarea" data-draft="summary" style="min-height:80px" placeholder="Two or three sentences your neighbors will read on the home page.">${esc(draft.summary)}</textarea></div>
              <div class="row">
                <span class="small" style="font-weight:600;color:var(--ink-2)">Show under</span>
                <div class="pt-seg" role="radiogroup" aria-label="Show under">
                  <button class="chip${draft.tab !== 'city' ? ' active' : ''}" role="radio" aria-checked="${draft.tab !== 'city'}" data-act="draft-tab" data-tab="county">County news</button>
                  <button class="chip${draft.tab === 'city' ? ' active' : ''}" role="radio" aria-checked="${draft.tab === 'city'}" data-act="draft-tab" data-tab="city">City news</button>
                </div>
                <span class="spacer"></span>
                <button class="btn btn-primary" data-act="publish">Publish</button>
              </div>
              ${published ? `<div class="pt-success" role="status">✓ “${esc(s.portal_lastPublished.title)}” is live on ${esc(t.domain)}<span class="spacer"></span><button class="btn btn-sm" data-act="go-hub">See it on the Public Media Hub</button></div>` : ''}
            </div>
          </div>
          <div class="card">
            <div class="card-head">
              <h3>Our posts</h3><span class="spacer"></span>
              <div class="pt-seg">
                ${[['all', 'All'], ['county', 'County'], ['city', 'City']].map(([k, l]) => `<button class="chip${f === k ? ' active' : ''}" data-act="filter" data-f="${k}">${l}</button>`).join('')}
              </div>
            </div>
            <ul class="pt-list">${posts.map(postRow).join('') || '<li class="pt-item"><span class="muted">Your first post shows up here.</span></li>'}</ul>
            ${allPosts.length > 6 ? `<div class="card-body" style="padding:12px 20px;border-top:1px solid var(--line)"><button class="btn btn-ghost btn-sm" data-act="more">${showAll ? 'Show fewer' : `Show all ${allPosts.length} posts`}</button></div>` : ''}
          </div>
        </div>

        <div class="card" data-tour="portal-network-items">
          <div class="card-head">
            <h3>From the Network</h3><span class="spacer"></span>
            <span class="pt-counter" aria-live="polite">Hidden: ${hidden} · Pinned: ${pinned}</span>
          </div>
          <div class="card-body small muted" style="padding:12px 20px">Suggested by the Master Network. Hide what fits other counties better; pin what your voters need first.</div>
          ${groups.map(([g, label]) => {
            const rows = items.filter((x) => x._scope === g);
            if (!rows.length) return '';
            return `<div class="pt-subhead">${label}</div><ul class="pt-list">${rows.map(netRow).join('')}</ul>`;
          }).join('')}
        </div>
      </div>`;
  }

  function findOwnItem(ctx, id) {
    const p = ownPosts(ctx).find((x) => x.item.id === id);
    return p ? p.item : null;
  }

  /* ================= ADS ================= */
  function adsHtml(ctx) {
    const t = ctx.tenant;
    const m = slotMap(ctx);
    const ads = allLocalAds(ctx);
    const master = ctx.network.masterAds || [];
    const mAd = (p) => master.find((a) => a.placement === p);
    const adById = (id) => ads.find((a) => a.id === id);

    const masterSlot = (key, ad, extra) => `
      <div class="ad-slot master pt-grey" aria-label="${SLOT_LABEL[key]}: managed by the Network">
        <span class="pt-slot-name">${SLOT_LABEL[key]}</span>
        ${extra || `<div class="pt-slot-title">${esc(ad ? ad.title : 'National campaign')}</div>`}
        <div class="pt-slot-sub">Managed by the Network — national campaigns</div>
      </div>`;
    const localSlot = (key) => {
      const ad = adById(m[key]);
      return `
      <button class="ad-slot local" data-act="slot" data-slot="${key}" aria-label="${SLOT_LABEL[key]}: change local ad">
        <span class="pt-slot-hint">${SLOT_LABEL[key]} · Change</span>
        ${ad
          ? `<div class="pt-slot-title">${esc(ad.title)}</div><div class="pt-slot-sub">${esc(ad.sponsor)}</div><span class="pt-slot-cta">${esc(ad.cta)}</span>`
          : `<div class="pt-slot-title">Open slot</div><div class="pt-slot-sub">Click to place a local sponsor or your own event.</div>`}
      </button>`;
    };
    const mock = (n) => `<div class="pt-mock"><i class="h"></i>${'<i></i>'.repeat(n)}<i class="s"></i></div>`;
    const where = (id) => {
      const k = LOCAL_SLOTS.find((p) => m[p] === id);
      return k ? `<span class="badge badge-local">${SLOT_LABEL[k]}</span>` : '<span class="badge">Saved, ready to place</span>';
    };

    return `
      <div class="explain" style="margin-bottom:20px"><strong>Local slots belong to ${esc(t.shortName)}.</strong> Sell them to neighborhood businesses or use them for your own Lincoln Day Dinner and forums; the money and the message stay with your county. Network slots carry national campaigns and need nothing from your volunteers.</div>
      <div class="row" style="margin-bottom:12px">
        <h2 style="margin:0">Your home page, slot by slot</h2><span class="spacer"></span>
        <div class="pt-legend">
          <span><i style="border-color:var(--brand)"></i>Local slot: click to change</span>
          <span><i style="border-color:var(--master)"></i>Network slot</span>
        </div>
      </div>
      <div class="pt-browser" data-tour="portal-ads-map">
        <div class="pt-browser-bar"><span class="pt-dots"><i></i><i></i><i></i></span><span class="pt-url">https://${esc(t.domain)}</span></div>
        <div class="pt-site">
          <div class="pt-sitehead">★ ${esc(t.shortName)}<span class="pt-navmock"><i></i><i></i><i></i><i></i></span></div>
          ${masterSlot('HEADER_BANNER', mAd('HEADER_BANNER'))}
          ${masterSlot('ALERT_BAR', null, t.breaking ? `<div class="pt-slot-title"><span class="lock" style="vertical-align:-5px;margin-right:6px">${LOCK}</span>${esc(t.breaking.title)}</div>` : '')}
          <div class="pt-sitebody">
            <div class="stack" style="gap:12px">
              <div class="pt-region-label">News feed</div>
              ${mock(2)}
              ${masterSlot('IN_FEED_NET', mAd('IN_FEED'))}
              ${mock(2)}
              ${localSlot('IN_FEED')}
              ${mock(1)}
            </div>
            <div class="stack" style="gap:12px">
              <div class="pt-region-label">Sidebar</div>
              ${localSlot('SIDEBAR_TOP')}
              ${mock(3)}
              ${masterSlot('SIDEBAR_BOTTOM', mAd('SIDEBAR_BOTTOM'))}
            </div>
          </div>
          ${localSlot('FOOTER_BANNER')}
          <div class="pt-mock" style="grid-template-columns:repeat(4,1fr);gap:10px"><i></i><i></i><i></i><i></i></div>
        </div>
      </div>

      <div class="pt-section">
        <div class="row"><h2>Our local ads</h2><span class="spacer"></span><button class="btn btn-primary btn-sm" data-act="slot" data-slot="SIDEBAR_TOP" data-new="1">+ New local ad</button></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Ad</th><th>Sponsor</th><th>Call to action</th><th>Showing in</th><th></th></tr></thead>
            <tbody>${ads.map((a) => `<tr>
              <td style="min-width:220px"><b>${esc(a.title)}</b></td>
              <td style="min-width:160px">${esc(a.sponsor)}</td>
              <td>${esc(a.cta)}</td>
              <td>${where(a.id)}</td>
              <td><button class="btn btn-sm" data-act="place" data-id="${esc(a.id)}">Place…</button></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>`;
  }

  function slotModal(ctx, slot, focusNew, redraw) {
    const s = S();
    const m = slotMap(ctx);
    const ads = allLocalAds(ctx);
    const html = `<div class="pt-modal">
      <p class="muted" style="margin-bottom:12px">Choose what visitors to ${esc(ctx.tenant.domain)} see in the <b>${SLOT_LABEL[slot]}</b> slot.</p>
      ${ads.map((a) => `<label class="pt-pick"><input type="radio" name="pt-ad" value="${esc(a.id)}" ${m[slot] === a.id && !focusNew ? 'checked' : ''}>
        <span><b>${esc(a.title)}</b><br><span class="small muted">${esc(a.sponsor)} · “${esc(a.cta)}”</span></span></label>`).join('')}
      <label class="pt-pick"><input type="radio" name="pt-ad" value="__new" ${focusNew ? 'checked' : ''}><span><b>Create a new local ad</b><br><span class="small muted">A local business, your next event, or a volunteer drive.</span></span></label>
      <div class="pt-new">
        <div class="pt-field"><label for="pt-na-t">Headline</label><input id="pt-na-t" class="input" placeholder="e.g. Volunteer Saturday: 40 doors before lunch"></div>
        <div class="pt-field"><label for="pt-na-s">Sponsor</label><input id="pt-na-s" class="input" placeholder="e.g. Maple Street Bakery"></div>
        <div class="pt-field"><label for="pt-na-c">Call to action (button text)</label><input id="pt-na-c" class="input" placeholder="e.g. Sign up"></div>
      </div></div>`;
    const md = ctx.modal({
      title: `Local slot: ${SLOT_LABEL[slot]}`, html,
      actions: [
        { label: 'Cancel' },
        { label: 'Save to slot', primary: true, onClick: (api) => {
          const b = api.body;
          const pick = b.querySelector('input[name="pt-ad"]:checked');
          if (!pick) { ctx.toast('Pick an ad or create a new one.', 'warn'); return false; }
          let ad;
          if (pick.value === '__new') {
            const title = b.querySelector('#pt-na-t').value.trim();
            const sponsor = b.querySelector('#pt-na-s').value.trim();
            const cta = b.querySelector('#pt-na-c').value.trim() || 'Learn more';
            if (!title || !sponsor) { ctx.toast('Add a headline and a sponsor for the new ad.', 'warn'); return false; }
            const list = s.portal_newAds[ctx.tenantSlug] = s.portal_newAds[ctx.tenantSlug] || [];
            ad = { id: `${ctx.tenantSlug}-pt-ad-${list.length + 1}`, placement: slot, title, sponsor, cta };
            list.push(ad);
          } else ad = ads.find((a) => a.id === pick.value);
          LOCAL_SLOTS.forEach((p) => { if (m[p] === ad.id) m[p] = null; });
          m[slot] = ad.id;
          ctx.toast(`${SLOT_LABEL[slot]} on ${ctx.tenant.domain} now shows “${ad.title}”.`, 'ok');
          redraw();
        } },
      ],
    });
    const nb = md.body.querySelector('.pt-new');
    const sync = () => { nb.style.display = md.body.querySelector('input[value="__new"]').checked ? '' : 'none'; };
    md.body.addEventListener('change', sync); sync();
    if (focusNew) setTimeout(() => { const i = md.body.querySelector('#pt-na-t'); if (i) i.focus(); }, 60);
  }

  function placeModal(ctx, id, redraw) {
    const ad = allLocalAds(ctx).find((a) => a.id === id);
    const m = slotMap(ctx);
    if (!ad) return;
    ctx.modal({
      title: 'Place this ad',
      html: `<div class="pt-modal"><p class="muted" style="margin-bottom:12px">Where should “${esc(ad.title)}” appear on ${esc(ctx.tenant.domain)}?</p>
        ${LOCAL_SLOTS.map((p) => {
          const cur = allLocalAds(ctx).find((a) => a.id === m[p]);
          return `<label class="pt-pick"><input type="radio" name="pt-pl" value="${p}" ${m[p] === id ? 'checked' : ''}><span><b>${SLOT_LABEL[p]}</b><br><span class="small muted">${cur ? 'Now: ' + esc(cur.title) : 'Open slot'}</span></span></label>`;
        }).join('')}</div>`,
      actions: [{ label: 'Cancel' }, { label: 'Place ad', primary: true, onClick: (api) => {
        const pick = api.body.querySelector('input[name="pt-pl"]:checked');
        if (!pick) { ctx.toast('Pick a slot first.', 'warn'); return false; }
        LOCAL_SLOTS.forEach((p) => { if (m[p] === id) m[p] = null; });
        m[pick.value] = id;
        ctx.toast(`“${ad.title}” now shows in ${SLOT_LABEL[pick.value]}.`, 'ok');
        redraw();
      } }],
    });
  }

  /* ================= NETWORK & EXCHANGE ================= */
  function chatPaneHtml(ctx, ch) {
    const s = S();
    const msgs = msgsFor(ctx, ch);
    const typing = s.portal_typing && s.portal_typing.key === ctx.tenantSlug + ':' + ch.id ? s.portal_typing.county : null;
    return `
      <div class="pt-pane-head">
        <h3>${esc(ch.name)}</h3>
        <span class="spacer"></span>
        <span class="pt-enc">${SHIELD} Encrypted between committees</span>
        <div class="row" style="gap:6px;width:100%">${ch.counties.map((c) => countyBadge(c, ctx.tenantSlug)).join('')}</div>
      </div>
      <div class="pt-msgs" aria-live="polite">
        ${msgs.map((mm) => `
          <div class="pt-msg${mm.county === ctx.tenantSlug ? ' mine' : ''}">
            ${App.util.avatar(mm.from, 34)}
            <div class="pt-msg-body">
              <div class="pt-msg-top"><b>${esc(mm.from)}</b>${countyBadge(mm.county, ctx.tenantSlug)}<span class="small muted">${esc(App.util.timeAgo(mm.minutesAgo))}</span></div>
              <div class="pt-msg-text">${esc(mm.text)}</div>
            </div>
          </div>`).join('')}
        ${typing ? `<div class="pt-typing">${esc(countyName(typing))} is typing…</div>` : ''}
      </div>
      <form class="pt-compose" data-form="chat">
        <label class="sr-only" for="pt-chat-in" style="position:absolute;left:-9999px">Message</label>
        <input id="pt-chat-in" class="input" autocomplete="off" placeholder="Message ${esc(ch.name)}…">
        <button class="btn btn-primary" type="submit">Send</button>
      </form>`;
  }

  function networkHtml(ctx) {
    const s = S();
    const t = ctx.tenant;
    const { mine, joinable } = channelsFor(ctx);
    let chId = s.portal_channel[ctx.tenantSlug];
    if (!mine.find((c) => c.id === chId)) chId = mine[0] ? mine[0].id : null;
    s.portal_channel[ctx.tenantSlug] = chId;
    const ch = mine.find((c) => c.id === chId);
    const readKey = (c) => ctx.tenantSlug + ':' + c.id;
    s.portal_read = s.portal_read || {};
    if (ch) s.portal_read[readKey(ch)] = true;
    const typeLabel = { REGIONAL: 'Regional', GROUP: 'Working group', DIRECT: 'Direct, two counties' };

    const assets = assetsFor(ctx);
    const copied = s.portal_copied[ctx.tenantSlug] || [];
    const featured = assets.find((a) => a.fromCounty !== ctx.tenantSlug && a.kind === 'Door hanger')
      || assets.find((a) => a.fromCounty !== ctx.tenantSlug);
    const forks = (a) => a.forks + (s.portal_forks[a.id] || 0);
    const assetBtn = (a, primary) => {
      if (a.fromCounty === ctx.tenantSlug) return `<button class="btn btn-sm" data-act="asset-view" data-id="${esc(a.id)}">View ours</button>`;
      if (copied.includes(a.id)) return `<button class="btn btn-sm" data-act="asset-view" data-id="${esc(a.id)}">✓ In our library: open</button>`;
      return `<button class="btn btn-sm ${primary ? 'btn-primary' : ''}" data-act="copy" data-id="${esc(a.id)}">Copy to our library</button>`;
    };

    const events = (ctx.network.jointEvents || []).concat(OPEN_EVENTS).map((e) => {
      const extra = s.portal_cohost[ctx.tenantSlug + ':' + e.id] ? [ctx.tenantSlug] : [];
      return Object.assign({}, e, { hosts: e.hosts.concat(extra.filter((x) => !e.hosts.includes(x))), rsvps: e.rsvps });
    });

    return `
      <div class="explain" style="margin-bottom:20px"><strong>Every county is stronger together.</strong> Chairs and field directors trade ideas in secure channels, copy each other’s proven door hangers and playbooks in one click, and co-host events, so no committee starts from a blank page.</div>

      <div class="row" style="margin-bottom:12px"><h2 style="margin:0">Secure chat</h2><span class="spacer"></span><span class="small muted">Only invited committees can read a channel.</span></div>
      <div class="card" data-tour="portal-chat">
        <div class="pt-chat">
          <div class="pt-chans" role="tablist" aria-label="Channels">
            <div class="pt-chans-label">Your channels</div>
            ${mine.map((c) => {
              const unread = s.portal_read[readKey(c)] ? 0 : c.unread;
              return `<button class="pt-chan${c.id === chId ? ' active' : ''}" role="tab" aria-selected="${c.id === chId}" data-act="chan" data-id="${esc(c.id)}">
                <span class="pt-chan-name">${esc(c.name)}<span class="pt-chan-type">${typeLabel[c.type] || c.type} · ${c.counties.length} counties</span></span>
                ${unread ? `<span class="pt-unread" aria-label="${unread} unread">${unread}</span>` : ''}</button>`;
            }).join('')}
            ${joinable.length ? `<div class="pt-chans-label">Regional channels you can join</div>
              ${joinable.map((c) => `<button class="pt-chan" data-act="join" data-id="${esc(c.id)}"><span class="pt-chan-name">${esc(c.name)}<span class="pt-chan-type">Regional · ${c.counties.length} counties</span></span><span class="badge badge-local">Join</span></button>`).join('')}` : ''}
          </div>
          <div class="pt-pane" id="pt-pane">${ch ? chatPaneHtml(ctx, ch) : '<div class="card-body muted">Join a regional channel to start talking with neighboring counties.</div>'}</div>
        </div>
      </div>

      <div class="pt-section" data-tour="portal-assets">
        <div class="row"><h2>Asset Exchange</h2><span class="spacer"></span><button class="btn btn-sm btn-primary" data-act="share">+ Share an asset</button></div>
        ${featured ? `
        <div class="card" style="margin-bottom:16px">
          <div class="card-body pt-featured">
            ${thumb(featured.kind, featured.fromCounty, featured.title)}
            <div>
              <div class="row" style="gap:6px;margin-bottom:6px"><span class="badge badge-ok">Proven in the field</span>${countyBadge(featured.fromCounty, ctx.tenantSlug)}</div>
              <h3 style="margin-bottom:4px">${esc(featured.title)}</h3>
              <div class="small muted">${esc(countyName(featured.fromCounty))} shared this ${esc(featured.kind.toLowerCase())}. ${App.util.fmtNum(featured.downloads)} downloads, ${forks(featured)} counties made it their own.</div>
              <div class="pt-flow">
                <div><b>1 · They share</b>${esc(countyName(featured.fromCounty))} posts the file once.</div>
                <div><b>2 · You copy</b>One click puts it in ${esc(t.shortName)}’s library.</div>
                <div><b>3 · It becomes yours</b>Name, colors and QR (Quick Response) code switch to ${esc(t.domain)}.</div>
              </div>
              ${assetBtn(featured, true)}
            </div>
          </div>
        </div>` : ''}
        <div class="grid-4 pt-assets">
          ${assets.map((a) => `
            <div class="card pt-asset">
              ${thumb(a.kind, a.fromCounty, a.title)}
              <div class="pt-asset-body">
                <div class="row" style="gap:6px"><span class="badge">${esc(a.kind)}</span>${a._new ? '<span class="badge badge-ok">Just shared</span>' : ''}</div>
                <h4>${esc(a.title)}</h4>
                <div class="small">From ${countyBadge(a.fromCounty, ctx.tenantSlug)}</div>
                <div class="pt-asset-stats"><span>${App.util.fmtNum(a.downloads)} downloads</span><span>${forks(a)} copies</span></div>
                <div class="row">${assetBtn(a, false)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>

      <div class="pt-section">
        <div class="row"><h2>Joint events</h2><span class="spacer"></span><span class="small muted">One event, several counties, shared sign-ups. Sample events.</span></div>
        <div class="grid-3">
          ${events.map((e) => {
            const isHost = e.hosts.includes(ctx.tenantSlug);
            return `<div class="card"><div class="card-body stack" style="gap:8px">
              <div class="pt-event-date">${esc(fmtDate(e.date))}</div>
              <h4 style="margin:0">${esc(e.title)}</h4>
              <div class="small muted">${esc(e.location)}</div>
              <div class="row" style="gap:6px">${e.hosts.map((h) => countyBadge(h, ctx.tenantSlug)).join('')}</div>
              <div class="row"><span class="small"><b>${App.util.fmtNum(e.rsvps)}</b> people signed up</span><span class="spacer"></span>
                ${isHost
                  ? `<button class="btn btn-sm" data-act="invite" data-id="${esc(e.id)}">✓ Co-hosting: invite members</button>`
                  : `<button class="btn btn-sm btn-primary" data-act="cohost" data-id="${esc(e.id)}">Co-host</button>`}
              </div>
            </div></div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function assetPreview(ctx, a) {
    const s = S();
    const ours = a.fromCounty === ctx.tenantSlug;
    const t = ctx.tenant;
    ctx.modal({
      title: ours ? 'Our shared asset' : 'Now in our library',
      html: `<div class="pt-modal">
        <div class="pt-preview">${thumb(a.kind, ours ? a.fromCounty : ctx.tenantSlug, a.title)}</div>
        <h3 style="margin:14px 0 4px">${esc(a.title)}</h3>
        <p class="small muted">${ours ? `Shared by ${esc(t.shortName)} with the Network. ${App.util.fmtNum(a.downloads)} downloads, ${a.forks + (s.portal_forks[a.id] || 0)} copies.`
          : `Original by ${esc(countyName(a.fromCounty))}. This copy belongs to ${esc(t.shortName)}.`}</p>
        ${ours ? '' : `<ol class="pt-steps">
          <li>Colors switched to ${esc(t.shortName)}’s brand.</li>
          <li>Footer reads “${esc(t.name)} · ${esc(t.domain)}”.</li>
          <li>QR (Quick Response) code now points to ${esc(t.domain)}/ballot.</li>
        </ol>`}
      </div>`,
      actions: [{ label: 'Close' }, { label: ours ? 'Copy share link' : 'Send to print shop', primary: true, onClick: () => {
        ctx.toast(ours ? 'Share link copied for other county chairs.' : `Print-ready file sent to ${t.shortName}’s print shop queue.`, 'ok');
      } }],
    });
  }

  /* ================= render ================= */
  App.register({
    id: 'portal',
    title: 'Committee Portal',
    group: 'Committee Portal',
    icon: ICON,
    blurb: 'Run your own site: write local posts, choose which Network stories show, fill local ad slots and work with other counties.',
    render(el, ctx) {
      injectStyle();
      S();
      el.classList.add('scr-portal');
      const sub = ['', 'ads', 'network'].includes(ctx.sub) ? ctx.sub : '';
      ctx = Object.assign({}, ctx, { sub });

      function draw() {
        const body = sub === 'ads' ? adsHtml(ctx) : sub === 'network' ? networkHtml(ctx) : contentHtml(ctx);
        el.innerHTML = `<div class="page">${head(ctx)}${body}</div>`;
        const ms = el.querySelector('.pt-msgs'); if (ms) ms.scrollTop = ms.scrollHeight;
      }
      draw();
      const s = App.state;

      el.addEventListener('input', (e) => {
        const k = e.target.dataset && e.target.dataset.draft;
        if (!k) return;
        const d = s.portal_draft[ctx.tenantSlug] = s.portal_draft[ctx.tenantSlug] || { title: '', summary: '', tab: 'county' };
        d[k] = e.target.value;
      });

      el.addEventListener('submit', (e) => {
        const f = e.target.closest('[data-form="chat"]');
        if (!f) return;
        e.preventDefault();
        const inp = f.querySelector('input');
        const text = inp.value.trim();
        if (!text) { ctx.toast('Type a message first.', 'info'); return; }
        sendChat(text);
      });

      function refreshPane() {
        const pane = el.querySelector('#pt-pane');
        if (!pane || !el.isConnected) return;
        const ch = (ctx.network.channels || []).find((c) => c.id === s.portal_channel[ctx.tenantSlug]);
        if (!ch) return;
        pane.innerHTML = chatPaneHtml(ctx, ch);
        const ms = pane.querySelector('.pt-msgs'); if (ms) ms.scrollTop = ms.scrollHeight;
        const inp = pane.querySelector('input'); if (inp) inp.focus({ preventScroll: true });
      }

      function sendChat(text) {
        const ch = (ctx.network.channels || []).find((c) => c.id === s.portal_channel[ctx.tenantSlug]);
        if (!ch) return;
        const key = ctx.tenantSlug + ':' + ch.id;
        const list = s.portal_msgs[key] = s.portal_msgs[key] || [];
        const t = ctx.tenant;
        list.push({ from: `${t.chair.name}, ${t.shortName}`, county: ctx.tenantSlug, text, minutesAgo: 0 });
        const n = list.filter((m) => m.county === ctx.tenantSlug).length - 1;
        const others = ch.counties.filter((c) => c !== ctx.tenantSlug);
        const rc = others[n % others.length] || others[0];
        s.portal_typing = rc ? { key, county: rc } : null;
        refreshPane();
        if (!rc) return;
        setTimeout(() => {
          const prior = ch.messages.slice().reverse().find((m) => m.county === rc);
          const from = prior ? prior.from : `Chair, ${countyName(rc)}`;
          list.push({ from, county: rc, text: REPLIES[n % REPLIES.length](t.shortName), minutesAgo: 0 });
          if (s.portal_typing && s.portal_typing.key === key) s.portal_typing = null;
          if (App.route.id === 'portal' && App.route.sub === 'network' && App.state.tenant === ctx.tenantSlug) refreshPane();
        }, 1500);
      }

      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b || b.disabled) return;
        const act = b.dataset.act, id = b.dataset.id;
        const t = ctx.tenant;

        if (act === 'go-hub') { ctx.navigate('public-hub'); return; }

        /* content */
        if (act === 'more') { s.portal_showAll = !s.portal_showAll; draw(); return; }
        if (act === 'filter') { s.portal_filter = b.dataset.f; draw(); return; }
        if (act === 'draft-tab') {
          const d = s.portal_draft[ctx.tenantSlug] = s.portal_draft[ctx.tenantSlug] || { title: '', summary: '', tab: 'county' };
          d.tab = b.dataset.tab; draw(); return;
        }
        if (act === 'publish') {
          const d = s.portal_draft[ctx.tenantSlug] || {};
          const title = (d.title || '').trim(), summary = (d.summary || '').trim();
          if (!title) { ctx.toast('Add a headline, then publish.', 'warn'); const i = el.querySelector('#pt-title'); if (i) i.focus(); return; }
          const tab = d.tab === 'city' ? 'city' : 'county';
          const post = {
            id: `${ctx.tenantSlug}-local-${s.localPosts.length + 1}`, title,
            summary: summary || `A new update from ${t.shortName}.`,
            source: t.shortName, minutesAgo: 0, pushed: false, locked: false, priority: 65,
            tag: tab === 'city' ? 'City' : 'County', tab, tenantSlug: ctx.tenantSlug, isNew: true,
          };
          s.localPosts.unshift(post);
          s.portal_draft[ctx.tenantSlug] = { title: '', summary: '', tab };
          s.portal_lastPublished = { tenant: ctx.tenantSlug, title };
          ctx.toast(`Published to ${t.domain} — see it on the Public Media Hub`, 'ok');
          draw(); return;
        }
        if (act === 'edit') {
          const item = findOwnItem(ctx, id);
          if (!item) return;
          ctx.modal({
            title: 'Edit post',
            html: `<div class="pt-modal"><div class="pt-field"><label for="pt-e-t">Headline</label><input id="pt-e-t" class="input" value="${esc(item.title)}"></div>
              <div class="pt-field"><label for="pt-e-s">Summary</label><textarea id="pt-e-s" class="textarea">${esc(item.summary)}</textarea></div>
              <p class="small muted" style="margin-top:10px">Saving updates ${esc(t.domain)} immediately.</p></div>`,
            actions: [{ label: 'Cancel' }, { label: 'Save changes', primary: true, onClick: (api) => {
              const nt = api.body.querySelector('#pt-e-t').value.trim();
              if (!nt) { ctx.toast('A headline keeps the post readable.', 'warn'); return false; }
              item.title = nt;
              item.summary = api.body.querySelector('#pt-e-s').value.trim();
              ctx.toast(`Saved. ${t.domain} shows the new version.`, 'ok');
              draw();
            } }],
          });
          return;
        }
        if (act === 'hide') {
          const i = s.hiddenPushes.indexOf(id);
          if (i >= 0) { s.hiddenPushes.splice(i, 1); ctx.toast(`Back on ${t.domain}.`, 'info'); }
          else {
            s.hiddenPushes.push(id);
            const p = s.pinnedPushes.indexOf(id); if (p >= 0) s.pinnedPushes.splice(p, 1);
            ctx.toast(`Hidden from ${t.domain}. Other counties keep their own choice.`, 'ok');
          }
          draw(); return;
        }
        if (act === 'pin') {
          const i = s.pinnedPushes.indexOf(id);
          if (i >= 0) { s.pinnedPushes.splice(i, 1); ctx.toast('Unpinned.', 'info'); }
          else { s.pinnedPushes.push(id); ctx.toast(`Pinned to the top of ${t.domain}.`, 'ok'); }
          draw(); return;
        }

        /* ads */
        if (act === 'slot') { slotModal(ctx, b.dataset.slot, !!b.dataset.new, draw); return; }
        if (act === 'place') { placeModal(ctx, id, draw); return; }

        /* network */
        if (act === 'chan') { s.portal_channel[ctx.tenantSlug] = id; draw(); const i = el.querySelector('#pt-chat-in'); if (i) i.focus({ preventScroll: true }); return; }
        if (act === 'join') {
          const j = s.portal_joined[ctx.tenantSlug] = s.portal_joined[ctx.tenantSlug] || [];
          if (!j.includes(id)) j.push(id);
          s.portal_channel[ctx.tenantSlug] = id;
          const ch = (ctx.network.channels || []).find((c) => c.id === id);
          ctx.toast(`${t.shortName} joined ${ch ? ch.name : 'the channel'}. Say hello!`, 'ok');
          draw(); return;
        }
        if (act === 'copy') {
          const a = assetsFor(ctx).find((x) => x.id === id);
          const c = s.portal_copied[ctx.tenantSlug] = s.portal_copied[ctx.tenantSlug] || [];
          if (!c.includes(id)) { c.push(id); s.portal_forks[id] = (s.portal_forks[id] || 0) + 1; }
          ctx.toast(`Copied to ${t.shortName}’s library. Name, colors and QR (Quick Response) code now point to ${t.domain}.`, 'ok');
          draw();
          if (a) setTimeout(() => assetPreview(ctx, a), 250);
          return;
        }
        if (act === 'asset-view') { const a = assetsFor(ctx).find((x) => x.id === id); if (a) assetPreview(ctx, a); return; }
        if (act === 'share') {
          const kinds = ['Door hanger', 'Flyer', 'Playbook', 'Yard sign', 'Precinct strategy'];
          ctx.modal({
            title: 'Share an asset with the Network',
            html: `<div class="pt-modal"><p class="muted">Other counties can copy it in one click. Your name stays on the original.</p>
              <div class="pt-field"><label for="pt-sh-t">Title</label><input id="pt-sh-t" class="input" placeholder="e.g. Election-week poll greeter sign"></div>
              <div class="pt-field"><label for="pt-sh-k">Kind</label><select id="pt-sh-k" class="select">${kinds.map((k) => `<option>${k}</option>`).join('')}</select></div>
              <div class="pt-field"><label class="toggle"><input type="checkbox" checked> Let counties swap in their own name and QR (Quick Response) code</label></div></div>`,
            actions: [{ label: 'Cancel' }, { label: 'Share with the Network', primary: true, onClick: (api) => {
              const title = api.body.querySelector('#pt-sh-t').value.trim();
              if (!title) { ctx.toast('Give the asset a title other chairs will recognize.', 'warn'); return false; }
              const list = s.portal_shared[ctx.tenantSlug] = s.portal_shared[ctx.tenantSlug] || [];
              list.unshift({ id: `${ctx.tenantSlug}-pt-sa-${list.length + 1}`, title, kind: api.body.querySelector('#pt-sh-k').value, fromCounty: ctx.tenantSlug, downloads: 0, forks: 0, updated: '2026-10-14', _new: true });
              ctx.toast(`Shared. Every county in the Network can now copy “${title}”.`, 'ok');
              draw();
            } }],
          });
          return;
        }
        if (act === 'cohost') {
          s.portal_cohost[ctx.tenantSlug + ':' + id] = true;
          const ev = (ctx.network.jointEvents || []).concat(OPEN_EVENTS).find((x) => x.id === id);
          ctx.toast(`${t.shortName} is now a co-host of ${ev ? ev.title : 'this event'}. It appears on your events page.`, 'ok');
          draw(); return;
        }
        if (act === 'invite') {
          const ev = (ctx.network.jointEvents || []).concat(OPEN_EVENTS).find((x) => x.id === id);
          ctx.toast(`Invitation for ${ev ? ev.title : 'the event'} queued for ${App.util.fmtNum((t.members || []).length)} committee members.`, 'ok');
          return;
        }
      });
    },
  });
})();
