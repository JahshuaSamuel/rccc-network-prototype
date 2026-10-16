/* screens/portal.js: Committee Portal (Committee agent)
   Routes: #/portal (posts), #/portal/events, #/portal/responses, #/portal/settings,
           #/portal/ads (local ad slots), #/portal/network (network pushes, channels, shared files).
   Everything saved goes through window.Store, using the shapes in docs/BRIEF.md section 8:
     posts, events, localAds, siteSettings (key), rsvps / volunteers / memberships (read),
     Store.global networkPushes (read), Store.global channelMessages, networkPrefs (key: {hidden, pinned}),
     fileLibrary (copies of shared files). Seed data in window.DATA is never mutated. */
(function () {
  'use strict';
  if (!window.App) return;

  const U = App.util;
  const esc = (s) => U.esc(s);
  const Store = window.Store;

  /* ---------------- icons ---------------- */
  const I = (d, s) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = I('<circle cx="7" cy="7" r="2.5"/><circle cx="13.5" cy="8" r="2"/><path d="M2.5 16c.6-2.8 2.4-4.2 4.5-4.2s3.9 1.4 4.5 4.2M11.5 12.3c2.3-.4 4.2.8 5 3.7"/>');
  const IC = {
    lock: I('<rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>', 14),
    pin: I('<path d="M7 3h6l-1 5 3 3H5l3-3z"/><path d="M10 11v6"/>', 15),
    eyeOff: I('<path d="M3 3l14 14"/><path d="M8.6 5.2A8 8 0 0 1 10 5c4.5 0 7 5 7 5a12 12 0 0 1-2 2.6M5.3 6.6A12 12 0 0 0 3 10s2.5 5 7 5a7 7 0 0 0 3-.7"/>', 15),
    eye: I('<path d="M3 10s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="10" cy="10" r="2.2"/>', 15),
    ext: I('<path d="M11 4h5v5M16 4l-7 7M14 11.5V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.5"/>', 15),
    plus: I('<path d="M10 4v12M4 10h12"/>', 16),
    edit: I('<path d="M13.5 3.5l3 3L7 16H4v-3z"/>', 15),
    post: I('<rect x="3.5" y="3" width="13" height="14" rx="2"/><path d="M6.5 7h7M6.5 10h7M6.5 13h4"/>', 26),
    cal: I('<rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 3v3M13 3v3"/>', 26),
    people: I('<circle cx="7" cy="7" r="2.5"/><circle cx="13.5" cy="8" r="2"/><path d="M2.5 16c.6-2.8 2.4-4.2 4.5-4.2s3.9 1.4 4.5 4.2M11.5 12.3c2.3-.4 4.2.8 5 3.7"/>', 26),
    file: I('<path d="M5 2.5h6.5L15.5 6.5v10a1 1 0 0 1-1 1h-9.5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z"/><path d="M11.5 2.5v4h4"/>', 26),
    chat: I('<path d="M4 4.5h12a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z"/>', 26),
    down: I('<path d="M10 3.5v10M5.5 9.5L10 14l4.5-4.5M4 17h12"/>', 15),
    check: I('<path d="M4.5 10.5l3.5 3.5 7.5-8"/>', 15),
    shield: I('<path d="M10 2.5l6 2.3v4.7c0 3.9-2.6 6.6-6 8-3.4-1.4-6-4.1-6-8V4.8z"/><path d="M7.5 10l1.8 1.8L12.8 8"/>', 15),
    map: I('<path d="M10 17s5-4.6 5-8.5A5 5 0 0 0 5 8.5C5 12.4 10 17 10 17z"/><circle cx="10" cy="8.5" r="1.8"/>', 15),
  };

  /* ---------------- constants ---------------- */
  const SLOT_LABEL = {
    HEADER_BANNER: 'Header banner', ALERT_BAR: 'Alert bar', IN_FEED_NET: 'Between stories (network)',
    SIDEBAR_TOP: 'Sidebar top', IN_FEED: 'Between stories (local)', SIDEBAR_BOTTOM: 'Sidebar bottom', FOOTER_BANNER: 'Footer banner',
  };
  const SLOT_HINT = {
    SIDEBAR_TOP: 'The first thing in the right-hand column on the home page.',
    IN_FEED: 'Sits between county news stories, styled like a story card.',
    FOOTER_BANNER: 'A wide banner across the bottom of every page.',
  };
  const LOCAL_SLOTS = ['SIDEBAR_TOP', 'IN_FEED', 'FOOTER_BANNER'];
  const TAGS = ['County news', 'Elections', 'Events', 'Volunteers', 'Candidates', 'Party', 'Community'];
  const KINDS = ['Phone bank', 'Canvass', 'Forum', 'Meeting', 'Training', 'Fundraiser', 'Watch party', 'Lincoln Day Dinner', 'Social'];
  /* Real California cities near each county, for placing events on the map. */
  const CITIES = {
    svgop: [['San Jose', 37.3382, -121.8863], ['Santa Clara', 37.3541, -121.9552], ['Sunnyvale', 37.3688, -122.0363],
      ['Mountain View', 37.3861, -122.0839], ['Palo Alto', 37.4419, -122.143], ['Cupertino', 37.323, -122.0322],
      ['Campbell', 37.2872, -121.95], ['Milpitas', 37.4323, -121.8996], ['Los Gatos', 37.2358, -121.9624],
      ['Saratoga', 37.2638, -122.023], ['Los Altos', 37.3852, -122.1141], ['Morgan Hill', 37.1305, -121.6544], ['Gilroy', 37.0058, -121.5683]],
    demo: [['Visalia', 36.3302, -119.2921], ['Tulare', 36.2077, -119.3473], ['Porterville', 36.0652, -119.0168],
      ['Hanford', 36.3275, -119.6457], ['Lemoore', 36.3008, -119.7829], ['Exeter', 36.2961, -119.1421],
      ['Lindsay', 36.203, -119.0882], ['Dinuba', 36.5433, -119.3871], ['Fresno', 36.7378, -119.7871]],
  };
  const SUBS = [
    ['', 'Posts'], ['events', 'Events'], ['responses', 'RSVPs & sign-ups'], ['settings', 'Site settings'],
    ['ads', 'Local ads'], ['network', 'Network'],
  ];

  /* ---------------- helpers ---------------- */
  const fresh = new Set();         // ids to animate in on the next draw
  const ui = { postFilter: 'all', respTab: 'rsvps', respEvent: 'all', channel: {} };

  function siteUrl(slug, hash, extra) {
    return `index.html?county=${encodeURIComponent(slug)}${extra || ''}${hash ? '#/' + hash : ''}`;
  }
  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parseIso(iso) { const d = new Date(String(iso || '') + 'T12:00:00'); return isNaN(d) ? null : d; }
  function fmtDate(iso, opts) {
    const d = parseIso(iso);
    return d ? d.toLocaleDateString('en-US', opts || { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
  }
  function fmtStamp(iso) {
    const t = Date.parse(iso || '');
    if (isNaN(t)) return '';
    const mins = (Date.now() - t) / 60000;
    if (mins < 60 * 24 * 6) return U.timeAgo(mins);
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function to24(t) {
    const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i);
    if (!m) return /^\d{2}:\d{2}$/.test(String(t || '')) ? t : '';
    let h = Number(m[1]) % 12; if (/p/i.test(m[3])) h += 12;
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  }
  function to12(v) {
    const m = String(v || '').match(/^(\d{2}):(\d{2})/);
    if (!m) return '';
    const h = Number(m[1]);
    return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
  }
  function cityList(slug) { return CITIES[slug] || CITIES.svgop; }
  function guessCity(slug, location) {
    const loc = String(location || '').toLowerCase();
    return cityList(slug).find((c) => loc.includes(c[0].toLowerCase())) || null;
  }
  function plural(n, one, many) { return `${U.fmtNum(n)} ${n === 1 ? one : (many || one + 's')}`; }
  function countyName(slug) {
    const T = (window.DATA && DATA.tenants) || {};
    if (T[slug]) return T[slug].shortName;
    const c = ((DATA.network && DATA.network.counties) || []).find((x) => x.slug === slug);
    return c ? `${c.name} County` : slug;
  }
  function countyColors(slug) {
    const T = (window.DATA && DATA.tenants) || {};
    if (T[slug]) return [T[slug].colors.brand, T[slug].colors.accent];
    return ['#5B3FA0', '#9A86CF'];
  }
  function countyBadge(slug, mineSlug) {
    const mine = slug === mineSlug;
    return `<span class="badge ${mine ? 'badge-local' : 'pt-cbadge'}"${mine ? '' : ` style="--cb:${countyColors(slug)[0]}"`}>${esc(countyName(slug))}</span>`;
  }
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;            // keep spreadsheet apps from running formulas
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function downloadCsv(name, rows) {
    const text = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  function validUrl(u) { return /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}$/i.test(String(u || '').trim()); }

  /* ---------------- data access ---------------- */
  function posts() {
    return Store.list('posts').slice().sort((a, b) => String(b.publishedAt || b.updatedAt || b.createdAt || '').localeCompare(String(a.publishedAt || a.updatedAt || a.createdAt || '')));
  }
  function rsvpsFor(eventId) { return Store.list('rsvps').filter((r) => r.eventId === eventId); }
  function headcount(list) { return list.reduce((s, r) => s + 1 + (Number(r.guests) || 0), 0); }
  function allEvents(t) {
    const saved = Store.list('events');
    const byId = new Map(saved.map((e) => [e.id, e]));
    const seed = (t.events || []).map((e) => Object.assign({ status: 'published' }, e, byId.get(e.id) || {}, { _seed: true }));
    const extra = saved.filter((e) => !seed.some((s) => s.id === e.id));
    return seed.concat(extra).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(to24(a.time)).localeCompare(String(to24(b.time))));
  }
  function eventCount(e) { return (Number(e.rsvps) || 0) + headcount(rsvpsFor(e.id)); }
  function siteSettings(t) {
    return Object.assign({ tagline: t.tagline || '', heroNote: '', layout: 'classic' }, Store.get('siteSettings', null) || {});
  }
  function localAd(t, placement) {
    const saved = Store.list('localAds').find((a) => a.placement === placement);
    if (saved) return Object.assign({ active: true, url: '' }, saved, { _saved: true });
    const seed = (t.localAds || []).find((a) => a.placement === placement);
    return seed ? Object.assign({ active: true, url: '' }, seed) : null;
  }
  function prefs() {
    const p = Store.get('networkPrefs', null) || {};
    return { hidden: Array.isArray(p.hidden) ? p.hidden : [], pinned: Array.isArray(p.pinned) ? p.pinned : [] };
  }
  function networkItems(ctx) {
    const t = ctx.tenant;
    const out = [];
    if (t.breaking) out.push(Object.assign({ _scope: 'Alert' }, t.breaking));
    (t.news.state || []).filter((x) => x.pushed).forEach((x) => out.push(Object.assign({ _scope: 'State' }, x)));
    (t.news.national || []).filter((x) => x.pushed).forEach((x) => out.push(Object.assign({ _scope: 'National' }, x)));
    const pushed = Store.global.list('networkPushes').filter((p) => !Array.isArray(p.tenants) || !p.tenants.length || p.tenants.includes(ctx.tenantSlug));
    pushed.forEach((p) => {
      const alert = p.locked && Number(p.priority) >= 100;
      out.push(Object.assign({}, p, {
        _scope: alert ? 'Alert' : p.tab === 'national' ? 'National' : 'State', _new: true,
        minutesAgo: p.createdAt ? Math.max(0, (Date.now() - Date.parse(p.createdAt)) / 60000) : 0,
      }));
    });
    return out;
  }
  function channelsFor(ctx) {
    const all = (ctx.network.channels || []);
    const joined = Store.get('joinedChannels', []) || [];
    const mine = all.filter((c) => c.counties.includes(ctx.tenantSlug) || joined.includes(c.id));
    const joinable = all.filter((c) => c.type === 'REGIONAL' && !mine.includes(c));
    return { mine, joinable };
  }
  function messagesFor(ch) {
    const saved = Store.global.list('channelMessages').filter((m) => m.channelId === ch.id)
      .map((m) => Object.assign({}, m, { minutesAgo: Math.max(0, (Date.now() - Date.parse(m.createdAt || '')) / 60000) || 0 }));
    return ch.messages.map((m) => Object.assign({}, m)).concat(saved);
  }

  /* ---------------- styles ---------------- */
  function injectStyle() {
    if (document.getElementById('scr-portal-style')) return;
    const st = document.createElement('style');
    st.id = 'scr-portal-style';
    st.textContent = `
.scr-portal .badge { max-width: 100%; white-space: normal; }
.scr-portal .table-wrap { position: relative; }
.scr-portal .pt-eyebrow { font-weight: 700; color: var(--brand); font-size: 14.5px; margin-bottom: 4px; }
.scr-portal .pt-head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.scr-portal .pt-note { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: var(--r); background: var(--info-soft); color: var(--info); font-size: 15px; margin-bottom: 20px; }
.scr-portal .pt-note svg { flex: none; margin-top: 3px; }
.scr-portal .pt-bar { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; margin-bottom: 14px; }
.scr-portal .pt-intro { margin: 0 0 16px; color: var(--ink-2); max-width: 72ch; }
.scr-portal .pt-bar h2 { margin: 0; font-size: 1.35rem; }
.scr-portal .pt-bar .pt-sub { color: var(--ink-3); font-size: 14.5px; }
.scr-portal .pt-seg { display: flex; gap: 6px; flex-wrap: wrap; }
.scr-portal .pt-list { list-style: none; margin: 0; padding: 0; }
.scr-portal .pt-item { display: flex; gap: 14px; align-items: flex-start; padding: 16px 20px; border-top: 1px solid var(--line); }
.scr-portal .pt-item:first-child { border-top: 0; }
.scr-portal .pt-item-main { flex: 1; min-width: 0; }
.scr-portal .pt-item h3, .scr-portal .pt-item h4 { font-size: 1.05rem; margin: 0 0 4px; line-height: 1.3; overflow-wrap: anywhere; }
.scr-portal .pt-item p { margin: 0 0 8px; font-size: 14.5px; color: var(--ink-2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.scr-portal .pt-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 13.5px; color: var(--ink-3); }
.scr-portal .pt-actions { display: flex; gap: 6px; flex: none; flex-wrap: wrap; justify-content: flex-end; }
.scr-portal .pt-item.is-draft { background: var(--surface-2); }
.scr-portal .is-new { animation: pt-in .42s cubic-bezier(.2,.8,.2,1); }
@keyframes pt-in { from { opacity: 0; transform: translateY(-6px); background: color-mix(in srgb, var(--ok) 10%, white); } to { opacity: 1; transform: none; } }
.scr-portal .pt-empty { text-align: center; padding: 44px 24px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.scr-portal .pt-empty-icon { width: 56px; height: 56px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--brand) 9%, white); color: var(--brand); margin-bottom: 6px; }
.scr-portal .pt-empty h3 { margin: 0; font-size: 1.2rem; }
.scr-portal .pt-empty p { margin: 0 0 8px; color: var(--ink-2); max-width: 46ch; }

/* events */
.scr-portal .pt-date { flex: none; width: 58px; text-align: center; border: 1px solid var(--line); border-radius: var(--r); overflow: hidden; background: var(--surface); }
.scr-portal .pt-date b { display: block; background: var(--brand); color: var(--brand-ink); font: 700 12px/1 var(--font-body); padding: 5px 0; letter-spacing: .06em; text-transform: uppercase; }
.scr-portal .pt-date span { display: block; font: 800 1.45rem/1.1 var(--font-head); font-stretch: 85%; padding: 5px 0 6px; color: var(--ink); }
.scr-portal .pt-fill { height: 6px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--line); overflow: hidden; width: 120px; max-width: 100%; display: inline-block; vertical-align: middle; }
.scr-portal .pt-fill > i { display: block; height: 100%; background: var(--ok); border-radius: 999px; }
.scr-portal .pt-past { opacity: .7; }

/* responses */
.scr-portal .pt-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
.scr-portal .pt-kpi { appearance: none; text-align: left; font: inherit; color: inherit; cursor: pointer; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 14px 16px; min-width: 0; transition: border-color .15s ease, box-shadow .15s ease; }
.scr-portal .pt-kpi:hover { border-color: var(--ink-3); }
.scr-portal .pt-kpi[aria-pressed="true"] { border-color: var(--brand); box-shadow: inset 0 -3px 0 var(--accent); }
.scr-portal .pt-kpi b { display: block; font: 800 1.9rem/1.05 var(--font-head); font-stretch: 80%; font-variant-numeric: tabular-nums; }
.scr-portal .pt-kpi span { font-size: 14px; color: var(--ink-2); font-weight: 600; }
.scr-portal .pt-who { display: flex; align-items: center; gap: 10px; min-width: 0; }
.scr-portal .pt-who > span { min-width: 0; overflow-wrap: anywhere; }
.scr-portal .pt-resp-table td { vertical-align: top; }

/* settings */
.scr-portal .pt-field { display: block; }
.scr-portal .pt-field > label, .pt-modal .pt-field > label, .scr-portal .pt-label { display: block; font-weight: 600; font-size: 14.5px; margin-bottom: 6px; color: var(--ink-2); }
.scr-portal .pt-help, .pt-modal .pt-help { font-size: 13.5px; color: var(--ink-3); margin-top: 5px; }
.scr-portal .pt-layouts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.scr-portal .pt-layout { position: relative; display: block; border: 2px solid var(--line); border-radius: var(--r-lg); padding: 12px; cursor: pointer; background: var(--surface); transition: border-color .15s ease, box-shadow .15s ease; }
.scr-portal .pt-layout:hover { border-color: var(--ink-3); }
.scr-portal .pt-layout:has(input:checked) { border-color: var(--brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 14%, transparent); }
.scr-portal .pt-layout input { position: absolute; opacity: 0; pointer-events: none; }
.scr-portal .pt-layout:has(input:focus-visible) { box-shadow: var(--focus); }
.scr-portal .pt-layout svg { display: block; width: 100%; height: auto; border-radius: var(--r-sm); background: var(--surface-2); }
.scr-portal .pt-layout strong { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.scr-portal .pt-layout .pt-tick { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--line-strong); flex: none; display: inline-flex; align-items: center; justify-content: center; color: var(--brand-ink); }
.scr-portal .pt-layout:has(input:checked) .pt-tick { background: var(--brand); border-color: var(--brand); }
.scr-portal .pt-layout small { display: block; color: var(--ink-3); font-size: 13.5px; margin-top: 2px; }
.scr-portal .pt-save-row { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; padding: 14px 20px; border-top: 1px solid var(--line); background: var(--surface-2); border-radius: 0 0 var(--r-lg) var(--r-lg); }

/* ads */
.scr-portal .pt-browser { border: 1px solid var(--line-strong); border-radius: var(--r-lg); overflow: hidden; background: var(--surface); box-shadow: var(--shadow-1); }
.scr-portal .pt-browser-bar { display: flex; align-items: center; gap: 10px; padding: 9px 14px; background: var(--surface-2); border-bottom: 1px solid var(--line); }
.scr-portal .pt-dots { display: flex; gap: 6px; flex: none; }
.scr-portal .pt-dots i { width: 10px; height: 10px; border-radius: 50%; background: var(--line-strong); display: block; }
.scr-portal .pt-url { flex: 1; min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 3px 12px; font-size: 13.5px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scr-portal .pt-site { padding: 14px; display: grid; gap: 12px; }
.scr-portal .pt-sitehead { display: flex; align-items: center; gap: 10px; background: var(--brand); color: var(--brand-ink); border-radius: var(--r); padding: 10px 14px; font-family: var(--font-head); font-weight: 800; font-stretch: 85%; }
.scr-portal .pt-sitebody { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 12px; }
.scr-portal .pt-mock { border-radius: var(--r); background: var(--surface-2); border: 1px solid var(--line); padding: 10px; display: grid; gap: 6px; }
.scr-portal .pt-mock i { display: block; height: 7px; border-radius: 4px; background: var(--line); }
.scr-portal .pt-mock span { font-size: 12.5px; font-weight: 600; color: var(--ink-3); }
.scr-portal .pt-mock i.h { height: 10px; width: 70%; background: var(--line-strong); }
.scr-portal .pt-mapslot { padding: 26px 12px 10px; min-height: 0; font-size: 13.5px; }
.scr-portal a.pt-mapslot { display: block; color: inherit; text-decoration: none; transition: box-shadow .15s ease; }
.scr-portal a.pt-mapslot:hover { box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand) 18%, transparent); }
.scr-portal .pt-mapslot b { display: block; font-size: 13.5px; line-height: 1.3; overflow-wrap: anywhere; }
.scr-portal .ad-slot.master.pt-grey { filter: grayscale(.5); opacity: .72; }
.scr-portal .pt-mapslot.is-paused { opacity: .55; }
.scr-portal .pt-adgrid { display: grid; gap: 18px; margin-top: 24px; }
.scr-portal .pt-adcard { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); scroll-margin-top: calc(var(--topbar-h) + 16px); }
.scr-portal .pt-adcard.is-flash { animation: pt-flash 1.2s ease; }
@keyframes pt-flash { 0%, 60% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand) 28%, transparent); } 100% { box-shadow: var(--shadow-1); } }
.scr-portal .pt-adform { padding: 18px 20px; display: grid; gap: 12px; border-right: 1px solid var(--line); min-width: 0; }
.scr-portal .pt-adprev { padding: 18px 20px; background: var(--surface-2); border-radius: 0 var(--r-lg) var(--r-lg) 0; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.scr-portal .pt-prevlabel { font: 700 12.5px/1.2 var(--font-body); color: var(--ink-3); letter-spacing: .04em; text-transform: uppercase; }
.scr-portal .pt-ad { position: relative; border: 1px solid var(--line); border-radius: var(--r); background: var(--surface); padding: 14px; transition: opacity .2s ease, filter .2s ease; overflow-wrap: anywhere; }
.scr-portal .pt-ad .pt-spons { font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-3); }
.scr-portal .pt-ad h4 { margin: 4px 0 4px; font-size: 1.02rem; line-height: 1.3; }
.scr-portal .pt-ad .pt-by { font-size: 13.5px; color: var(--ink-2); }
.scr-portal .pt-ad .pt-cta { display: inline-block; margin-top: 10px; font: 700 13.5px/1 var(--font-body); padding: 9px 14px; border-radius: var(--r-sm); background: var(--brand); color: var(--brand-ink); }
.scr-portal .pt-ad.in-feed { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 12px; align-items: start; }
.scr-portal .pt-ad.in-feed .pt-thumbbox { width: 64px; height: 64px; border-radius: var(--r-sm); background: color-mix(in srgb, var(--accent) 16%, white); display: flex; align-items: center; justify-content: center; color: var(--accent); font: 800 1.3rem var(--font-head); }
.scr-portal .pt-ad.footer { background: var(--brand); color: var(--brand-ink); border-color: var(--brand); display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
.scr-portal .pt-ad.footer h4 { color: var(--brand-ink); margin: 0; flex: 1 1 180px; }
.scr-portal .pt-ad.footer .pt-spons, .scr-portal .pt-ad.footer .pt-by { color: color-mix(in srgb, var(--brand-ink) 78%, transparent); }
.scr-portal .pt-ad.footer .pt-cta { background: var(--brand-ink); color: var(--brand); margin-top: 0; }
.scr-portal .pt-ad.is-off { opacity: .45; filter: grayscale(1); }
.scr-portal .pt-paused { font-size: 13.5px; font-weight: 600; color: var(--warn); }
.scr-portal .pt-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }

/* network */
.scr-portal .pt-netgrid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 20px; align-items: start; }
.scr-portal .pt-item.is-hidden { background: var(--surface-2); }
.scr-portal .pt-item.is-hidden h4 { color: var(--ink-3); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--ink-3) 50%, transparent); }
.scr-portal .pt-item.is-pinned { background: color-mix(in srgb, var(--brand) 5%, white); box-shadow: inset 3px 0 0 var(--brand); }
.scr-portal .pt-item.is-locked { background: var(--warn-soft); box-shadow: inset 3px 0 0 var(--warn); }
.scr-portal .pt-lockwrap { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: var(--warn); font-size: 13.5px; }
.scr-portal .pt-locknote { font-size: 13.5px; color: var(--warn); margin-top: 6px; font-weight: 600; }
.scr-portal .pt-btn-on { background: var(--brand); color: var(--brand-ink); border-color: var(--brand); }
.scr-portal .pt-btn-on:hover { background: color-mix(in srgb, var(--brand) 86%, black); color: var(--brand-ink); }
.scr-portal .pt-subhead { padding: 10px 20px; background: var(--surface-2); border-top: 1px solid var(--line); font: 700 13.5px/1.2 var(--font-body); color: var(--ink-2); }
.scr-portal .pt-counter { font-weight: 700; font-size: 14px; color: var(--ink-2); background: var(--surface-2); border: 1px solid var(--line); padding: 4px 10px; border-radius: 999px; font-variant-numeric: tabular-nums; }
.scr-portal .pt-cbadge { background: color-mix(in srgb, var(--cb) 9%, white); color: var(--cb); border-color: color-mix(in srgb, var(--cb) 28%, white); }
.scr-portal .pt-chat { display: grid; grid-template-columns: minmax(0, 1fr); }
.scr-portal .pt-netgrid > [data-tour="portal-chat"] { position: sticky; top: calc(var(--topbar-h) + 16px); }
.scr-portal .pt-chans { border-bottom: 1px solid var(--line); background: var(--surface-2); padding: 8px 10px; display: flex; flex-direction: row; gap: 4px; overflow-x: auto; }
.scr-portal .pt-chans-label { display: none; }
.scr-portal .pt-chan { flex: none; max-width: 220px; appearance: none; border: 0; background: transparent; text-align: left; font: inherit; cursor: pointer; padding: 8px 10px; min-height: 44px; border-radius: var(--r-sm); display: flex; align-items: center; gap: 8px; color: var(--ink-2); border-bottom: 3px solid transparent; }
.scr-portal .pt-chan:hover { background: var(--surface); }
.scr-portal .pt-chan.active { background: var(--surface); color: var(--brand); font-weight: 700; border-bottom-color: var(--accent); box-shadow: var(--shadow-1); }
.scr-portal .pt-chan-name { flex: 1; min-width: 0; font-size: 14.5px; line-height: 1.3; }
.scr-portal .pt-chan-type { display: block; font-size: 12.5px; color: var(--ink-3); font-weight: 500; }
.scr-portal .pt-pane { display: flex; flex-direction: column; min-width: 0; }
.scr-portal .pt-pane-head { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; padding: 12px 18px; border-bottom: 1px solid var(--line); }
.scr-portal .pt-pane-head h3 { margin: 0; font-size: 1.1rem; }
.scr-portal .pt-enc { display: inline-flex; gap: 6px; align-items: center; font-size: 13.5px; font-weight: 600; color: var(--ok); }
.scr-portal .pt-msgs { flex: 1; overflow-y: auto; max-height: min(420px, 52vh); padding: 14px 18px; display: flex; flex-direction: column; gap: 14px; }
.scr-portal .pt-msg { display: flex; gap: 10px; align-items: flex-start; }
.scr-portal .pt-msg .avatar { flex: none; }
.scr-portal .pt-msg-body { min-width: 0; flex: 1; }
.scr-portal .pt-msg-top { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; font-size: 14px; }
.scr-portal .pt-msg-text { margin-top: 4px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 4px var(--r) var(--r) var(--r); padding: 8px 12px; font-size: 15px; line-height: 1.45; display: inline-block; max-width: 100%; overflow-wrap: anywhere; }
.scr-portal .pt-msg.mine .pt-msg-text { background: color-mix(in srgb, var(--brand) 8%, white); border-color: color-mix(in srgb, var(--brand) 22%, white); }
.scr-portal .pt-compose { display: flex; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--line); }
.scr-portal .pt-compose .input { flex: 1; min-width: 0; }
.scr-portal .pt-readonly-line { padding: 12px 18px; border-top: 1px solid var(--line); font-size: 14px; color: var(--ink-3); }
.scr-portal .pt-files { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.scr-portal .pt-filecard { display: flex; flex-direction: column; overflow: hidden; }
.scr-portal .pt-thumb { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; border-bottom: 1px solid var(--line); background: var(--surface-2); }
.scr-portal .pt-file-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
.scr-portal .pt-file-body h4 { font-size: 1rem; line-height: 1.3; margin: 0; overflow-wrap: anywhere; }
.scr-portal .pt-file-stats { font-size: 13.5px; color: var(--ink-3); display: flex; gap: 12px; flex-wrap: wrap; font-variant-numeric: tabular-nums; }
.scr-portal .pt-file-body .row { margin-top: auto; }
.scr-portal .pt-section { margin-top: 32px; }
.pt-modal .pt-field { margin-top: 12px; }
.pt-modal .pt-field:first-child { margin-top: 0; }
.pt-modal .pt-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.pt-modal .pt-two > .pt-field { margin-top: 12px; }
.pt-modal .pt-err { color: var(--danger); font-size: 13.5px; margin-top: 5px; min-height: 0; }
.pt-modal .pt-err:empty { display: none; }
.pt-modal .pt-map { height: 220px; border-radius: var(--r); border: 1px solid var(--line); background: var(--surface-2); margin-top: 8px; position: relative; z-index: 0; }
.pt-modal .pt-map-fallback { display: flex; align-items: center; justify-content: center; height: 100%; padding: 16px; text-align: center; color: var(--ink-3); font-size: 14px; }
.pt-modal .pt-maphint { display: flex; align-items: center; gap: 6px; font-size: 13.5px; color: var(--ink-3); margin-top: 6px; }
.pt-modal .pt-preview { border: 1px solid var(--line); border-radius: var(--r); padding: 14px; background: var(--surface-2); text-align: center; }
.pt-modal .pt-preview svg { width: 100%; max-width: 320px; height: auto; }
.pt-modal .pt-steps { margin: 12px 0 0; padding-left: 20px; font-size: 15px; }
@media (max-width: 1100px) { .scr-portal .pt-files { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 960px) {
  .scr-portal .pt-netgrid { grid-template-columns: minmax(0, 1fr); }
  .scr-portal .pt-adcard { grid-template-columns: minmax(0, 1fr); }
  .scr-portal .pt-adform { border-right: 0; border-bottom: 1px solid var(--line); }
  .scr-portal .pt-adprev { border-radius: 0 0 var(--r-lg) var(--r-lg); }
}
@media (max-width: 900px) {
  .scr-portal .pt-netgrid > [data-tour="portal-chat"] { position: static; }
}
@media (max-width: 720px) {
  .scr-portal .pt-sitebody { grid-template-columns: minmax(0, 1fr); }
  .scr-portal .pt-item { padding: 14px 16px; flex-wrap: wrap; }
  .scr-portal .pt-actions { width: 100%; justify-content: flex-start; }
  .scr-portal .pt-actions .btn, .scr-portal .chip { min-height: 44px; }
  .scr-portal .pt-subhead { padding: 10px 16px; }
  .scr-portal .pt-kpis { gap: 8px; }
  .scr-portal .pt-kpi { padding: 12px; }
  .scr-portal .pt-kpi b { font-size: 1.5rem; }
  .scr-portal .pt-kpi span { font-size: 13px; }
  .scr-portal .pt-layouts { grid-template-columns: minmax(0, 1fr); }
  .scr-portal .pt-files { grid-template-columns: minmax(0, 1fr); }
  .scr-portal .pt-filecard { flex-direction: row; }
  .scr-portal .pt-filecard > .pt-thumb { width: 112px; height: 70px; flex: none; align-self: flex-start; margin: 12px 0 12px 12px; border: 1px solid var(--line); border-radius: var(--r-sm); }
  .scr-portal .pt-file-body { padding: 12px; }
  .scr-portal .pt-bar .btn-primary { width: 100%; min-height: 46px; }
  .scr-portal .pt-head-actions .btn { min-height: 44px; }
  .pt-modal .pt-two { grid-template-columns: minmax(0, 1fr); gap: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .scr-portal .is-new, .scr-portal .pt-adcard.is-flash { animation: none; }
}`;
    document.head.appendChild(st);
  }

  /* ---------------- shared file thumbnails ---------------- */
  function thumb(kind, fromSlug, title) {
    const [c1, c2] = countyColors(fromSlug);
    const name = esc(countyName(fromSlug));
    const lines = (x, y, w, n, gap) => Array.from({ length: n }, (_, i) => `<rect x="${x}" y="${y + i * gap}" width="${i === n - 1 ? w * 0.6 : w}" height="4" rx="2" fill="#C3CAD4"/>`).join('');
    const star = (x, y, r, f) => {
      const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.42 : r; p.push((x + rr * Math.cos(a)).toFixed(1) + ',' + (y + rr * Math.sin(a)).toFixed(1)); }
      return `<polygon points="${p.join(' ')}" fill="${f}"/>`;
    };
    let art;
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
        <path d="M80 26a8 8 0 0 1 16 0c0 6-8 14-8 14s-8-8-8-14z" fill="${c2}"/><circle cx="88" cy="26" r="3" fill="#fff"/>`;
    }
    return `<svg class="pt-thumb" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(kind)} preview: ${esc(title || '')} from ${name}">
      <rect width="160" height="100" fill="color-mix(in srgb, ${c1} 7%, #F8F9FB)"/>${art}</svg>`;
  }

  /* ---------------- Leaflet (loaded on first use) ---------------- */
  let leafletP = null;
  function loadLeaflet() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (leafletP) return leafletP;
    leafletP = new Promise((resolve, reject) => {
      if (!document.querySelector('link[href*="leaflet@1.9.4"]')) {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(l);
      }
      let s = document.querySelector('script[src*="leaflet@1.9.4"]');
      const done = () => (window.L && window.L.map ? resolve(window.L) : reject(new Error('Leaflet missing')));
      if (s) { if (window.L && window.L.map) done(); else { s.addEventListener('load', done); s.addEventListener('error', reject); } return; }
      s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.addEventListener('load', done);
      s.addEventListener('error', reject);
      document.head.appendChild(s);
    }).catch((e) => { leafletP = null; throw e; });
    return leafletP;
  }

  /* ---------------- page chrome ---------------- */
  function headHtml(ctx) {
    const t = ctx.tenant;
    const sub = ctx.sub;
    const viewHref = siteUrl(ctx.tenantSlug);
    const readOnly = !ctx.can('portal.edit');
    return `
      <div class="page-head">
        <div>
          <div class="pt-eyebrow">${esc(t.name)}</div>
          <h1>Committee Portal</h1>
          <p>Post news and fill local ad slots on ${esc(t.domain)}. Your changes go live right away.</p>
        </div>
        <div class="pt-head-actions"><a class="btn btn-ghost" href="${esc(viewHref)}" target="_blank" rel="noopener">${IC.ext} View your public site</a></div>
      </div>
      <nav class="tabs" aria-label="Committee Portal sections">
        ${SUBS.map(([k, l]) => `<a class="tab${sub === k ? ' active' : ''}" href="#/portal${k ? '/' + k : ''}"${sub === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}
      </nav>
      ${readOnly ? `<div class="pt-note" role="note">${IC.lock}<span>Only Executive Board members can make changes here. You can look around.</span></div>` : ''}`;
  }
  function emptyHtml(icon, title, text, action) {
    return `<div class="pt-empty"><span class="pt-empty-icon">${icon}</span><h3>${esc(title)}</h3><p>${esc(text)}</p>${action || ''}</div>`;
  }

  /* ================= POSTS ================= */
  function postsHtml(ctx) {
    const t = ctx.tenant;
    const edit = ctx.can('portal.edit');
    const all = posts();
    const f = ui.postFilter;
    const list = all.filter((p) => f === 'all' || (f === 'drafts' ? p.status !== 'published' : p.status === 'published'));
    const pub = all.filter((p) => p.status === 'published').length;
    const row = (p) => {
      const isPub = p.status === 'published';
      return `<li class="pt-item${isPub ? '' : ' is-draft'}${fresh.has(p.id) ? ' is-new' : ''}" data-id="${esc(p.id)}">
        <div class="pt-item-main">
          <h3>${esc(p.title)}</h3>
          ${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
          <div class="pt-meta">
            ${isPub ? '<span class="badge badge-ok">Published</span>' : '<span class="badge">Draft</span>'}
            ${p.tag ? `<span class="badge badge-local">${esc(p.tag)}</span>` : ''}
            <span>${isPub ? 'Published ' + esc(fmtStamp(p.publishedAt || p.createdAt)) : 'Saved ' + esc(fmtStamp(p.updatedAt || p.createdAt))}</span>
          </div>
        </div>
        <div class="pt-actions">
          ${isPub ? `<a class="btn btn-sm" href="${esc(siteUrl(ctx.tenantSlug, 'news/' + p.id))}" target="_blank" rel="noopener">${IC.ext} View on site</a>` : ''}
          ${edit ? `<button class="btn btn-sm" data-act="post-edit" data-id="${esc(p.id)}">${IC.edit} Edit</button>` : ''}
        </div>
      </li>`;
    };
    const filters = [['all', `All (${all.length})`], ['published', `Published (${pub})`], ['drafts', `Drafts (${all.length - pub})`]];
    let body;
    if (!all.length) {
      body = emptyHtml(IC.post, 'No posts yet',
        `Posts show up on ${t.domain} under County news, next to headlines from local papers. A short post about your next meeting or a volunteer drive is a good first one.`,
        edit ? `<button class="btn btn-primary" data-act="post-new">${IC.plus} Write your first post</button>` : '');
    } else if (!list.length) {
      body = emptyHtml(IC.post, f === 'drafts' ? 'No drafts' : 'Nothing published yet', f === 'drafts' ? 'Every post is live on your site.' : 'Publish a draft and it shows up here.');
    } else body = `<ul class="pt-list">${list.map(row).join('')}</ul>`;

    return `
      <div class="pt-bar">
        <h2>County news posts</h2>
        <span class="pt-sub">${plural(pub, 'post')} live on ${esc(t.domain)}</span>
        <span class="spacer"></span>
        ${edit && all.length ? `<button class="btn btn-primary" data-act="post-new">${IC.plus} Write a post</button>` : ''}
      </div>
      ${all.length ? `<div class="pt-seg" style="margin-bottom:12px" role="group" aria-label="Filter posts">${filters.map(([k, l]) => `<button class="chip${f === k ? ' active' : ''}" data-act="post-filter" data-f="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>` : ''}
      <div class="card">${body}</div>`;
  }

  function postEditor(ctx, id) {
    const t = ctx.tenant;
    const p = id ? Store.list('posts').find((x) => x.id === id) : null;
    if (id && !p) return;
    const isPub = p && p.status === 'published';
    const v = p || { title: '', summary: '', body: '', tag: 'County news' };
    const html = `<form class="pt-modal" novalidate onsubmit="return false">
      <div class="pt-field"><label for="pe-title">Headline</label>
        <input id="pe-title" class="input" maxlength="120" value="${esc(v.title)}" placeholder="Precinct walk this Saturday: meet at 9 AM" aria-describedby="pe-title-err">
        <div class="pt-err" id="pe-title-err" aria-live="polite"></div></div>
      <div class="pt-field"><label for="pe-sum">Summary</label>
        <textarea id="pe-sum" class="textarea" style="min-height:76px" maxlength="280" placeholder="One or two sentences for the home page.">${esc(v.summary)}</textarea>
        <div class="pt-help">Shown on the home page and in link previews.</div></div>
      <div class="pt-field"><label for="pe-body">Full story</label>
        <textarea id="pe-body" class="textarea" style="min-height:150px" placeholder="Write the whole post here. Leave a blank line between paragraphs.">${esc(v.body || '')}</textarea></div>
      <div class="pt-field"><label for="pe-tag">Topic</label>
        <select id="pe-tag" class="select">${TAGS.map((g) => `<option${g === v.tag ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
    </form>`;
    const read = (api) => {
      const b = api.body;
      const title = b.querySelector('#pe-title').value.trim();
      const err = b.querySelector('#pe-title-err');
      if (!title) { err.textContent = 'Add a headline before you save.'; b.querySelector('#pe-title').focus(); return null; }
      err.textContent = '';
      const body = b.querySelector('#pe-body').value.trim();
      let summary = b.querySelector('#pe-sum').value.trim();
      if (!summary && body) summary = body.split(/\n\s*\n/)[0].slice(0, 240);
      return { title, summary, body, tag: b.querySelector('#pe-tag').value };
    };
    const save = (api, status) => {
      const d = read(api);
      if (!d) return false;
      const now = new Date().toISOString();
      d.status = status;
      if (status === 'published' && !(p && p.publishedAt)) d.publishedAt = now;
      let saved;
      if (p) { saved = Store.update('posts', p.id, d); }
      else { saved = Store.add('posts', d); }
      if (!saved) { ctx.toast('That post could not be saved. Try again.', 'error'); return false; }
      fresh.add(saved.id);
      if (status === 'published') {
        ctx.toast('', 'ok', { html: `Published to ${esc(t.domain)}. <a href="${esc(siteUrl(ctx.tenantSlug, 'news/' + saved.id))}" target="_blank" rel="noopener" style="color:inherit;font-weight:700">See it on your public site</a>` });
      } else ctx.toast(p && isPub ? 'Moved to drafts. It no longer shows on your site.' : 'Draft saved. Only board members can see it.', 'ok');
      return true;
    };
    const actions = [];
    if (p) actions.push({ label: 'Delete post', onClick: () => { confirmDelete(ctx, p); } });
    actions.push({ label: isPub ? 'Move to drafts' : 'Save draft', onClick: (api) => save(api, 'draft') });
    actions.push({ label: isPub ? 'Update post' : 'Publish', primary: true, onClick: (api) => save(api, 'published') });
    const md = ctx.modal({ title: p ? 'Edit post' : 'Write a post', html, actions });
    setTimeout(() => { const i = md.body.querySelector('#pe-title'); if (i) i.focus(); }, 80);
  }
  function confirmDelete(ctx, p) {
    setTimeout(() => ctx.modal({
      title: 'Delete this post?',
      html: `<p>“${esc(p.title)}” will come off ${esc(ctx.tenant.domain)} and out of your list. This can’t be undone.</p>`,
      actions: [{ label: 'Keep it' }, { label: 'Delete post', primary: true, onClick: () => { Store.remove('posts', p.id); ctx.toast('Post deleted.', 'ok'); } }],
    }), 200);
  }

  /* ================= EVENTS ================= */
  function eventsHtml(ctx) {
    const t = ctx.tenant;
    const edit = ctx.can('portal.edit');
    const today = todayIso();
    const evs = allEvents(t);
    const up = evs.filter((e) => String(e.date) >= today);
    const past = evs.filter((e) => String(e.date) < today).reverse();
    const row = (e) => {
      const d = parseIso(e.date);
      const n = eventCount(e);
      const cap = Number(e.capacity) || 0;
      const isPub = e.status !== 'draft';
      const online = rsvpsFor(e.id).length;
      return `<li class="pt-item${isPub ? '' : ' is-draft'}${String(e.date) < today ? ' pt-past' : ''}${fresh.has(e.id) ? ' is-new' : ''}">
        <div class="pt-date" aria-hidden="true"><b>${d ? esc(d.toLocaleDateString('en-US', { month: 'short' })) : ''}</b><span>${d ? d.getDate() : ''}</span></div>
        <div class="pt-item-main">
          <h3>${esc(e.title)}</h3>
          <div class="pt-meta" style="margin-bottom:6px"><span>${esc(fmtDate(e.date, { weekday: 'long', month: 'long', day: 'numeric' }))}${e.time ? ' · ' + esc(e.time) : ''}</span></div>
          <div class="pt-meta" style="margin-bottom:8px"><span>${IC.map}</span><span>${esc(e.location || 'Location to come')}</span></div>
          <div class="pt-meta">
            ${isPub ? '<span class="badge badge-ok">Published</span>' : '<span class="badge">Draft</span>'}
            ${e.kind ? `<span class="badge badge-local">${esc(e.kind)}</span>` : ''}
            <span><b style="color:var(--ink)">${U.fmtNum(n)}</b> going${cap ? ` of ${U.fmtNum(cap)}` : ''}</span>
            ${cap ? `<span class="pt-fill" aria-hidden="true"><i style="width:${Math.min(100, (n / cap) * 100).toFixed(0)}%"></i></span>` : ''}
          </div>
        </div>
        <div class="pt-actions">
          ${online ? `<a class="btn btn-sm" href="#/portal/responses" data-act="see-rsvps" data-id="${esc(e.id)}">${plural(online, 'RSVP')}</a>` : ''}
          ${isPub ? `<a class="btn btn-sm" href="${esc(siteUrl(ctx.tenantSlug, 'events/' + e.id))}" target="_blank" rel="noopener">${IC.ext} View on site</a>` : ''}
          ${edit ? `<button class="btn btn-sm" data-act="event-edit" data-id="${esc(e.id)}">${IC.edit} Edit</button>` : ''}
        </div>
      </li>`;
    };
    return `
      <div class="pt-bar">
        <h2>Events</h2>
        <span class="pt-sub">${plural(up.length, 'upcoming event')}</span>
        <span class="spacer"></span>
        ${edit ? `<button class="btn btn-primary" data-act="event-new">${IC.plus} Add an event</button>` : ''}
      </div>
      <div class="card">${up.length ? `<ul class="pt-list">${up.map(row).join('')}</ul>`
        : emptyHtml(IC.cal, 'No upcoming events', `Events you add here show on ${t.domain} with a map and an RSVP button.`, '')}</div>
      ${past.length ? `<div class="pt-section"><div class="pt-bar"><h2 style="font-size:1.1rem">Past events</h2></div><div class="card"><ul class="pt-list">${past.map(row).join('')}</ul></div></div>` : ''}
      <p class="small muted" style="margin-top:14px">Counts include RSVPs taken before online sign-up (Sample) plus everyone who RSVPs on your site, with their guests.</p>`;
  }

  function eventEditor(ctx, id) {
    const t = ctx.tenant;
    const slug = ctx.tenantSlug;
    const cities = cityList(slug);
    const e = id ? allEvents(t).find((x) => x.id === id) : null;
    if (id && !e) return;
    const isPub = e && e.status !== 'draft';
    const city = e ? (guessCity(slug, e.location) || null) : cities[0];
    let lat = e && e.lat != null ? Number(e.lat) : city ? city[1] : cities[0][1];
    let lng = e && e.lng != null ? Number(e.lng) : city ? city[2] : cities[0][2];
    let venue = e ? String(e.location || '') : '';
    if (e && city) venue = venue.replace(new RegExp(',?\\s*' + city[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i'), '').trim();
    const cityName = city ? city[0] : '';
    const html = `<form class="pt-modal" novalidate onsubmit="return false">
      <div class="pt-field"><label for="ee-title">Event name</label>
        <input id="ee-title" class="input" maxlength="100" value="${esc(e ? e.title : '')}" placeholder="Saturday precinct walk">
        <div class="pt-err" id="ee-title-err" aria-live="polite"></div></div>
      <div class="pt-two">
        <div class="pt-field"><label for="ee-date">Date</label><input id="ee-date" class="input" type="date" value="${esc(e ? e.date : '')}"><div class="pt-err" id="ee-date-err" aria-live="polite"></div></div>
        <div class="pt-field"><label for="ee-time">Start time</label><input id="ee-time" class="input" type="time" value="${esc(e ? to24(e.time) : '10:00')}"></div>
      </div>
      <div class="pt-two">
        <div class="pt-field"><label for="ee-kind">Type</label><select id="ee-kind" class="select">${KINDS.concat(e && e.kind && !KINDS.includes(e.kind) ? [e.kind] : []).map((k) => `<option${e && e.kind === k ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
        <div class="pt-field"><label for="ee-cap">Capacity <span class="muted" style="font-weight:400">(optional)</span></label><input id="ee-cap" class="input" type="number" min="1" inputmode="numeric" value="${esc(e && e.capacity ? e.capacity : '')}" placeholder="No limit"></div>
      </div>
      <div class="pt-two">
        <div class="pt-field"><label for="ee-city">City</label><select id="ee-city" class="select">
          ${cities.map((c) => `<option value="${esc(c[0])}"${c[0] === cityName ? ' selected' : ''}>${esc(c[0])}</option>`).join('')}
          <option value=""${cityName ? '' : ' selected'}>Somewhere else (drop a pin)</option></select></div>
        <div class="pt-field"><label for="ee-venue">Venue and street</label><input id="ee-venue" class="input" maxlength="140" value="${esc(venue)}" placeholder="Orchard Commons Hall, 150 Main St"><div class="pt-err" id="ee-venue-err" aria-live="polite"></div></div>
      </div>
      <div class="pt-field"><span class="pt-label" id="ee-map-l">Map pin</span>
        <div class="pt-map" id="ee-map" role="application" aria-labelledby="ee-map-l"><div class="pt-map-fallback">Loading the map…</div></div>
        <div class="pt-maphint" id="ee-maphint">${IC.map}<span>Click the map to move the pin. Picking a city moves it there.</span></div></div>
    </form>`;
    const read = (api) => {
      const b = api.body;
      const g = (s) => b.querySelector(s);
      const title = g('#ee-title').value.trim();
      const date = g('#ee-date').value;
      const venueV = g('#ee-venue').value.trim();
      const c = g('#ee-city').value;
      g('#ee-title-err').textContent = title ? '' : 'Give the event a name.';
      g('#ee-date-err').textContent = date ? '' : 'Pick a date.';
      g('#ee-venue-err').textContent = venueV || c ? '' : 'Add where people should go.';
      if (!title || !date || !(venueV || c)) { const bad = b.querySelector('.pt-err:not(:empty)'); if (bad) { const inp = bad.parentElement.querySelector('input,select'); if (inp) inp.focus(); } return null; }
      const location = [venueV, c && !venueV.toLowerCase().includes(c.toLowerCase()) ? c : ''].filter(Boolean).join(', ');
      const cap = parseInt(g('#ee-cap').value, 10);
      const doc = { title, kind: g('#ee-kind').value, date, time: to12(g('#ee-time').value) || '', location,
        lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
      if (cap > 0) doc.capacity = cap; else doc.capacity = null;
      return doc;
    };
    const save = (api, status) => {
      const d = read(api);
      if (!d) return false;
      d.status = status;
      const savedList = Store.list('events');
      let saved;
      if (e && savedList.some((x) => x.id === e.id)) saved = Store.update('events', e.id, d);
      else if (e) saved = Store.add('events', Object.assign({ id: e.id }, d));   // first edit of a seed event: same id overrides it
      else saved = Store.add('events', d);
      if (!saved) { ctx.toast('That event could not be saved. Try again.', 'error'); return false; }
      fresh.add(saved.id);
      if (status === 'published') {
        ctx.toast('', 'ok', { html: `${esc(saved.title)} is on ${esc(t.domain)}. <a href="${esc(siteUrl(slug, 'events/' + saved.id))}" target="_blank" rel="noopener" style="color:inherit;font-weight:700">View on site</a>` });
      } else ctx.toast(isPub ? 'Event moved to drafts. It no longer shows on your site.' : 'Event saved as a draft.', 'ok');
      return true;
    };
    const actions = [
      { label: isPub ? 'Move to drafts' : 'Save draft', onClick: (api) => save(api, 'draft') },
      { label: isPub ? 'Update event' : 'Publish event', primary: true, onClick: (api) => save(api, 'published') },
    ];
    const md = ctx.modal({ title: e ? 'Edit event' : 'Add an event', html, actions });

    /* map */
    const mapEl = md.body.querySelector('#ee-map');
    const hint = md.body.querySelector('#ee-maphint span');
    let map = null, marker = null;
    const setHint = (txt) => { if (hint) hint.textContent = txt; };
    loadLeaflet().then((L) => {
      if (!mapEl.isConnected) return;
      mapEl.innerHTML = '';
      map = L.map(mapEl, { scrollWheelZoom: false, attributionControl: true }).setView([lat, lng], 13);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#0B2A4A';
      marker = L.circleMarker([lat, lng], { radius: 10, color: '#fff', weight: 3, fillColor: brand, fillOpacity: 1 }).addTo(map);
      map.on('click', (ev) => {
        lat = ev.latlng.lat; lng = ev.latlng.lng;
        marker.setLatLng(ev.latlng);
        setHint(`Pin dropped at ${lat.toFixed(4)}, ${lng.toFixed(4)}.`);
      });
      setTimeout(() => { if (map) map.invalidateSize(); }, 260);
    }).catch(() => {
      mapEl.innerHTML = '<div class="pt-map-fallback">The map didn’t load. Pick a city and the event uses its location.</div>';
    });
    md.body.querySelector('#ee-city').addEventListener('change', (ev) => {
      const c = cities.find((x) => x[0] === ev.target.value);
      if (!c) { setHint('Click the map where the event is.'); return; }
      lat = c[1]; lng = c[2];
      if (map && marker) {
        marker.setLatLng([lat, lng]);
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) map.setView([lat, lng], 13); else map.flyTo([lat, lng], 13, { duration: 0.8 });
      }
      setHint(`Pin moved to ${c[0]}. Click the map to fine-tune it.`);
    });
    setTimeout(() => { const i = md.body.querySelector('#ee-title'); if (i && !e) i.focus(); }, 80);
  }

  /* ================= RSVPs & SIGN-UPS ================= */
  function responsesHtml(ctx) {
    const t = ctx.tenant;
    const board = ctx.can('portal.edit');
    const evs = allEvents(t);
    const evById = new Map(evs.map((e) => [e.id, e]));
    const rs = Store.list('rsvps').slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const vols = Store.list('volunteers').slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const mems = Store.list('memberships').slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const tab = ui.respTab;
    const kpi = (k, n, l) => `<button class="pt-kpi" data-act="resp-tab" data-k="${k}" aria-pressed="${tab === k}"><b>${U.fmtNum(n)}</b><span>${l}</span></button>`;
    const contact = (r) => board ? esc(r.contact || r.email || r.phone || '') : '<span class="muted">Board only</span>';
    const who = (r) => `<span class="pt-who">${U.avatar(r.name || '?', 28)}<span>${esc(r.name || 'Name not given')}</span></span>`;
    let table = '', rows = [], empty = '';
    if (tab === 'rsvps') {
      const evFilter = ui.respEvent;
      const list = rs.filter((r) => evFilter === 'all' || r.eventId === evFilter);
      const withRsvps = evs.filter((e) => rs.some((r) => r.eventId === e.id));
      table = `<div class="row" style="margin-bottom:12px">
          <label class="pt-label" for="pt-ev-filter" style="margin:0">Event</label>
          <select id="pt-ev-filter" class="select" style="width:auto;max-width:100%;flex:1 1 220px" data-act-change="resp-event">
            <option value="all">All events (${U.fmtNum(rs.length)})</option>
            ${withRsvps.map((e) => `<option value="${esc(e.id)}"${evFilter === e.id ? ' selected' : ''}>${esc(e.title)} (${rs.filter((r) => r.eventId === e.id).length})</option>`).join('')}
          </select></div>`;
      rows = list.map((r) => { const e = evById.get(r.eventId); return [r.name, r.contact, (e && e.title) || r.title, (e && e.date) || r.date, r.guests || 0, r.createdAt]; });
      if (list.length) {
        table += `<div class="table-wrap"><table class="table pt-resp-table"><thead><tr><th>Name</th><th>Contact</th><th>Event</th><th class="num">Guests</th><th>When</th></tr></thead><tbody>
          ${list.map((r) => { const e = evById.get(r.eventId); return `<tr class="${fresh.has(r.id) ? 'is-new' : ''}"><td>${who(r)}</td><td>${contact(r)}</td><td style="min-width:180px">${esc((e && e.title) || r.title || '')}<div class="small muted">${esc(fmtDate((e && e.date) || r.date, { month: 'short', day: 'numeric' }))}</div></td><td class="num">${U.fmtNum(r.guests || 0)}</td><td class="small muted">${esc(fmtStamp(r.createdAt))}</td></tr>`; }).join('')}
        </tbody></table></div>`;
      } else empty = emptyHtml(IC.people, 'No RSVPs yet', `When someone RSVPs to an event on ${t.domain}, their name and contact show up here.`, `<a class="btn" href="${esc(siteUrl(ctx.tenantSlug, 'events'))}" target="_blank" rel="noopener">${IC.ext} Open your events page</a>`);
    } else if (tab === 'volunteers') {
      rows = vols.map((v) => [v.name, v.contact, (v.interests || []).join('; '), v.zip, v.createdAt]);
      if (vols.length) {
        table = `<div class="table-wrap"><table class="table pt-resp-table"><thead><tr><th>Name</th><th>Contact</th><th>Wants to help with</th><th>ZIP</th><th>When</th></tr></thead><tbody>
          ${vols.map((v) => `<tr><td>${who(v)}</td><td>${contact(v)}</td><td style="min-width:160px">${(v.interests || []).map((x) => `<span class="badge" style="margin:0 4px 4px 0">${esc(x)}</span>`).join('') || '<span class="muted">Anything</span>'}</td><td>${esc(v.zip || '')}</td><td class="small muted">${esc(fmtStamp(v.createdAt))}</td></tr>`).join('')}
        </tbody></table></div>`;
      } else empty = emptyHtml(IC.people, 'No volunteer sign-ups yet', `People who sign up on ${t.domain}/volunteer show up here, with what they want to help with.`, `<a class="btn" href="${esc(siteUrl(ctx.tenantSlug, 'volunteer'))}" target="_blank" rel="noopener">${IC.ext} Open your volunteer page</a>`);
    } else {
      rows = mems.map((m) => [m.name, m.contact, m.amount != null ? m.amount : '', m.createdAt]);
      if (mems.length) {
        table = `<div class="table-wrap"><table class="table pt-resp-table"><thead><tr><th>Name</th><th>Contact</th><th class="num">Dues</th><th>When</th></tr></thead><tbody>
          ${mems.map((m) => `<tr><td>${who(m)}</td><td>${contact(m)}</td><td class="num">${m.amount != null ? esc(U.fmtUsd(m.amount)) : '<span class="muted">None</span>'}</td><td class="small muted">${esc(fmtStamp(m.createdAt))}</td></tr>`).join('')}
        </tbody></table></div>`;
      } else empty = emptyHtml(IC.people, 'No new memberships yet', `When someone joins the party through ${t.domain}/join, they show up here so your membership chair can welcome them.`, `<a class="btn" href="${esc(siteUrl(ctx.tenantSlug, 'join'))}" target="_blank" rel="noopener">${IC.ext} Open your join page</a>`);
    }
    const label = { rsvps: 'RSVPs', volunteers: 'Volunteer sign-ups', memberships: 'New memberships' }[tab];
    return `
      <div class="pt-kpis" role="group" aria-label="Choose a list">
        ${kpi('rsvps', rs.length, 'Event RSVPs')}${kpi('volunteers', vols.length, 'Volunteer sign-ups')}${kpi('memberships', mems.length, 'New memberships')}
      </div>
      <div class="pt-bar">
        <h2>${label}</h2><span class="spacer"></span>
        ${board && rows.length ? `<button class="btn btn-primary" data-act="csv">${IC.down} Download CSV</button>` : ''}
      </div>
      ${table ? `${table}` : `<div class="card">${empty}</div>`}
      ${!board && rows.length ? '<p class="small muted" style="margin-top:12px">Contact details and the CSV download are for Executive Board members.</p>' : ''}`;
  }
  function exportCsv(ctx) {
    const t = ctx.tenant;
    const evById = new Map(allEvents(t).map((e) => [e.id, e]));
    const tab = ui.respTab;
    let rows, name;
    if (tab === 'rsvps') {
      const list = Store.list('rsvps').filter((r) => ui.respEvent === 'all' || r.eventId === ui.respEvent);
      rows = [['Name', 'Contact', 'Event', 'Event date', 'Guests', 'RSVP received']].concat(list.map((r) => {
        const e = evById.get(r.eventId); return [r.name, r.contact, (e && e.title) || r.title, (e && e.date) || r.date, r.guests || 0, r.createdAt];
      }));
      name = `${ctx.tenantSlug}-rsvps${ui.respEvent !== 'all' ? '-' + ui.respEvent : ''}.csv`;
    } else if (tab === 'volunteers') {
      rows = [['Name', 'Contact', 'Interests', 'ZIP', 'Signed up']].concat(Store.list('volunteers').map((v) => [v.name, v.contact, (v.interests || []).join('; '), v.zip, v.createdAt]));
      name = `${ctx.tenantSlug}-volunteers.csv`;
    } else {
      rows = [['Name', 'Contact', 'Dues', 'Joined']].concat(Store.list('memberships').map((m) => [m.name, m.contact, m.amount != null ? m.amount : '', m.createdAt]));
      name = `${ctx.tenantSlug}-memberships.csv`;
    }
    downloadCsv(name, rows);
    ctx.toast(`Downloaded ${name} with ${plural(rows.length - 1, 'row')}.`, 'ok');
  }

  /* ================= SITE SETTINGS ================= */
  function layoutSvg(kind) {
    const b = 'var(--brand)', l = 'var(--line-strong)', s = 'var(--line)';
    if (kind === 'newsroom') {
      return `<svg viewBox="0 0 200 120" aria-hidden="true"><rect x="8" y="8" width="184" height="12" rx="3" fill="${b}"/>
        <rect x="8" y="26" width="118" height="54" rx="4" fill="${l}"/><rect x="8" y="86" width="56" height="26" rx="3" fill="${s}"/><rect x="70" y="86" width="56" height="26" rx="3" fill="${s}"/>
        <rect x="134" y="26" width="58" height="8" rx="2" fill="${l}"/>${[40, 54, 68, 82, 96].map((y) => `<rect x="134" y="${y}" width="58" height="6" rx="2" fill="${s}"/>`).join('')}</svg>`;
    }
    return `<svg viewBox="0 0 200 120" aria-hidden="true"><rect x="8" y="8" width="184" height="12" rx="3" fill="${b}"/>
      <rect x="8" y="26" width="184" height="36" rx="4" fill="${l}"/><rect x="20" y="36" width="80" height="7" rx="2" fill="#fff" opacity=".8"/><rect x="20" y="47" width="50" height="5" rx="2" fill="#fff" opacity=".6"/>
      <rect x="8" y="68" width="58" height="44" rx="3" fill="${s}"/><rect x="71" y="68" width="58" height="44" rx="3" fill="${s}"/><rect x="134" y="68" width="58" height="44" rx="3" fill="${s}"/></svg>`;
  }
  function settingsHtml(ctx) {
    const t = ctx.tenant;
    const edit = ctx.can('portal.edit');
    const s = siteSettings(t);
    const dis = edit ? '' : ' disabled';
    const saved = Store.get('siteSettings', null);
    return `
      <div class="card">
        <div class="card-head"><h2 style="font-size:1.2rem">Home page</h2><span class="spacer"></span>
          <a class="btn btn-sm btn-ghost" href="${esc(siteUrl(ctx.tenantSlug, '', s.layout === 'newsroom' ? '&layout=newsroom' : ''))}" target="_blank" rel="noopener" data-preview>${IC.ext} Preview on site</a></div>
        <form class="card-body stack" style="gap:18px" data-form="settings" novalidate>
          <div class="pt-field"><label for="ps-tag">Tagline</label>
            <input id="ps-tag" class="input" maxlength="140" value="${esc(s.tagline)}"${dis}>
            <div class="pt-help">One line under your county’s name at the top of the home page. <span data-count>${s.tagline.length}</span> of 140 characters.</div></div>
          <div class="pt-field"><label for="ps-note">Banner note <span class="muted" style="font-weight:400">(optional)</span></label>
            <input id="ps-note" class="input" maxlength="120" value="${esc(s.heroNote)}" placeholder="Mail ballots are out. Return yours by Nov 3."${dis}>
            <div class="pt-help">A short, timely note shown on the home page banner. Leave it empty to hide it.</div></div>
          <fieldset style="border:0;padding:0;margin:0"><legend class="pt-label">Home page layout</legend>
            <div class="pt-layouts">
              <label class="pt-layout"><input type="radio" name="ps-layout" value="classic"${s.layout !== 'newsroom' ? ' checked' : ''}${dis}>${layoutSvg('classic')}
                <strong><span class="pt-tick">${IC.check}</span>Classic</strong><small>A large welcome banner, then events, news and candidates in cards.</small></label>
              <label class="pt-layout"><input type="radio" name="ps-layout" value="newsroom"${s.layout === 'newsroom' ? ' checked' : ''}${dis}>${layoutSvg('newsroom')}
                <strong><span class="pt-tick">${IC.check}</span>Newsroom</strong><small>Leads with the top story and a running list of headlines, like a local paper.</small></label>
            </div></fieldset>
        </form>
        ${edit ? `<div class="pt-save-row"><button class="btn btn-primary" data-act="settings-save">Save settings</button><span class="small muted" aria-live="polite" data-status>${saved && saved.updatedAt ? 'Last saved ' + esc(fmtStamp(saved.updatedAt)) + '.' : 'Not changed yet. Your site uses these defaults.'}</span></div>` : ''}
      </div>`;
  }

  /* ================= LOCAL ADS ================= */
  function adPreview(ad, placement, t) {
    if (!ad) return '';
    const off = ad.active === false ? ' is-off' : '';
    const title = esc(ad.title || 'Your headline');
    const by = esc(ad.sponsor || 'Sponsor name');
    const cta = esc(ad.cta || 'Learn more');
    if (placement === 'IN_FEED') {
      return `<div class="pt-ad in-feed${off}"><span class="pt-thumbbox" aria-hidden="true">${esc(U.initials(ad.sponsor || t.shortName))}</span>
        <div><span class="pt-spons">Sponsored · ${by}</span><h4>${title}</h4><span class="pt-cta">${cta}</span></div></div>`;
    }
    if (placement === 'FOOTER_BANNER') {
      return `<div class="pt-ad footer${off}"><div style="flex:1 1 180px;min-width:0"><span class="pt-spons">Sponsored</span><h4>${title}</h4><span class="pt-by">${by}</span></div><span class="pt-cta">${cta}</span></div>`;
    }
    return `<div class="pt-ad${off}"><span class="pt-spons">Sponsored</span><h4>${title}</h4><span class="pt-by">${by}</span><br><span class="pt-cta">${cta}</span></div>`;
  }
  function adsHtml(ctx) {
    const t = ctx.tenant;
    const edit = ctx.can('ads.manage');
    const dis = edit ? '' : ' disabled';
    const netAds = (ctx.network.masterAds || []).concat(Store.global.list('networkAds').filter((a) => a.active !== false && (!Array.isArray(a.tenants) || !a.tenants.length || a.tenants.includes(ctx.tenantSlug))));
    const mAd = (p) => netAds.slice().reverse().find((a) => a.placement === p);
    const masterSlot = (key, ad, extra) => `
      <div class="ad-slot master pt-grey pt-mapslot" aria-label="${SLOT_LABEL[key]}: filled by Master Network">
        ${extra || `<b>${esc(ad ? ad.title : 'Network sponsor')}</b>`}<span class="small muted">${SLOT_LABEL[key]}</span></div>`;
    const localSlot = (key) => {
      const ad = localAd(t, key);
      return `<a class="ad-slot local pt-mapslot${ad && ad.active === false ? ' is-paused' : ''}" href="#pt-ad-${key}" data-act="slot-jump" data-slot="${key}">
        <b>${esc(ad ? ad.title : 'Open slot')}</b><span class="small muted">${SLOT_LABEL[key]}${ad && ad.active === false ? ' · Paused' : ''}</span></a>`;
    };
    const mock = (n) => `<div class="pt-mock" aria-hidden="true"><span>${n > 1 ? 'News story' : 'Event card'}</span>${'<i></i>'.repeat(n)}</div>`;
    const card = (key) => {
      const ad = localAd(t, key) || { placement: key, title: '', sponsor: '', cta: '', url: '', active: true };
      return `<section class="card pt-adcard" id="pt-ad-${key}" data-slot="${key}" aria-labelledby="pt-ad-h-${key}">
        <form class="pt-adform" data-form="ad" data-slot="${key}" novalidate>
          <div class="pt-toggle-row"><h3 id="pt-ad-h-${key}" style="margin:0;font-size:1.1rem">${SLOT_LABEL[key]}</h3>
            <label class="toggle"><input type="checkbox" name="active"${ad.active !== false ? ' checked' : ''}${dis}> <span data-active-label>${ad.active !== false ? 'Showing' : 'Paused'}</span></label></div>
          <p class="small muted" style="margin:0">${SLOT_HINT[key]}</p>
          <div class="pt-field"><label for="ad-t-${key}">Headline</label><input id="ad-t-${key}" class="input" name="title" maxlength="90" value="${esc(ad.title)}" placeholder="Volunteer Saturday: 40 doors before lunch"${dis}></div>
          <div class="pt-field"><label for="ad-s-${key}">Sponsor</label><input id="ad-s-${key}" class="input" name="sponsor" maxlength="60" value="${esc(ad.sponsor)}" placeholder="Maple Street Bakery"${dis}></div>
          <div class="pt-field"><label for="ad-c-${key}">Button text</label><input id="ad-c-${key}" class="input" name="cta" maxlength="28" value="${esc(ad.cta)}" placeholder="Visit the bakery"${dis}></div>
          <div class="pt-field"><label for="ad-u-${key}">Sponsor link</label><input id="ad-u-${key}" class="input" name="url" type="url" inputmode="url" value="${esc(ad.url || '')}" placeholder="https://maplestreetbakery.com"${dis}>
            <div class="pt-err" data-err="url" aria-live="polite"></div></div>
          ${edit ? `<div class="row"><button class="btn btn-primary" type="submit">Save ad</button><span class="small muted" data-saved>${ad._saved && ad.updatedAt ? 'Saved ' + esc(fmtStamp(ad.updatedAt)) : ad._saved ? 'Saved' : ''}</span></div>` : ''}
        </form>
        <div class="pt-adprev"><span class="pt-prevlabel">How it looks on ${esc(t.domain)}</span><div data-preview>${adPreview(ad, key, t)}</div>
          <span class="pt-paused" data-paused${ad.active !== false ? ' hidden' : ''}>Paused: this slot is empty on your site until you turn it back on.</span></div>
      </section>`;
    };
    return `
      <div class="pt-bar"><h2>Your home page, slot by slot</h2><span class="pt-sub">The three local slots are yours to sell or use. Master Network fills the grey network slots.</span></div>
      <div class="pt-browser" data-tour="portal-ads-map">
        <div class="pt-browser-bar"><span class="pt-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="pt-url">https://${esc(t.domain)}</span></div>
        <div class="pt-site">
          <div class="pt-sitehead">★ ${esc(t.shortName)}</div>
          ${masterSlot('HEADER_BANNER', mAd('HEADER_BANNER'))}
          <div class="pt-sitebody">
            <div class="stack" style="gap:10px">${mock(2)}${masterSlot('IN_FEED_NET', mAd('IN_FEED'))}${mock(1)}${localSlot('IN_FEED')}</div>
            <div class="stack" style="gap:10px">${localSlot('SIDEBAR_TOP')}${mock(2)}${masterSlot('SIDEBAR_BOTTOM', mAd('SIDEBAR_BOTTOM'))}</div>
          </div>
          ${localSlot('FOOTER_BANNER')}
        </div>
      </div>
      <div class="pt-adgrid">${LOCAL_SLOTS.map(card).join('')}</div>`;
  }
  function readAdForm(form) {
    const g = (n) => form.querySelector(`[name="${n}"]`);
    return { title: g('title').value.trim(), sponsor: g('sponsor').value.trim(), cta: g('cta').value.trim(), url: g('url').value.trim(), active: g('active').checked };
  }

  /* ================= NETWORK ================= */
  function networkHtml(ctx) {
    const t = ctx.tenant;
    const edit = ctx.can('portal.edit');
    const pr = prefs();
    const items = networkItems(ctx);
    const hiddenN = items.filter((x) => !x.locked && pr.hidden.includes(x.id)).length;
    const pinnedN = items.filter((x) => !x.locked && pr.pinned.includes(x.id)).length;
    let lockTourDone = false;
    const netRow = (x) => {
      const isHidden = !x.locked && pr.hidden.includes(x.id);
      const isPinned = !x.locked && pr.pinned.includes(x.id);
      const cls = x.locked ? ' is-locked' : isHidden ? ' is-hidden' : isPinned ? ' is-pinned' : '';
      const tourLock = x.locked && !lockTourDone ? ' data-tour="portal-lock"' : '';
      if (x.locked) lockTourDone = true;
      return `<li class="pt-item${cls}${fresh.has(x.id) ? ' is-new' : ''}">
        <div class="pt-item-main">
          <div class="pt-meta" style="margin-bottom:5px">
            ${x.locked ? `<span class="pt-lockwrap"${tourLock}><span class="lock">${IC.lock}</span>Locked</span>` : ''}
            ${isPinned ? `<span class="badge badge-local">${IC.pin} Pinned</span>` : ''}
            ${isHidden ? '<span class="badge">Hidden from your site</span>' : ''}
            ${x._new ? '<span class="badge badge-master">New from Master Network</span>' : ''}
          </div>
          <h4>${esc(x.title)}</h4>
          <div class="pt-meta"><span>${esc(x.source || 'Master Network')}</span><span aria-hidden="true">·</span><span>${esc(U.timeAgo(x.minutesAgo))}</span></div>
          ${x.locked ? '<div class="pt-locknote">Master Network locked this for every county until it expires, so it can’t be hidden.</div>' : ''}
        </div>
        ${edit && !x.locked ? `<div class="pt-actions">
          <button class="btn btn-sm${isPinned ? ' pt-btn-on' : ''}" data-act="pin" data-id="${esc(x.id)}" aria-pressed="${isPinned}"${isHidden ? ' disabled title="Show it on your site first, then pin it"' : ''}>${IC.pin} ${isPinned ? 'Unpin' : 'Pin'}</button>
          <button class="btn btn-sm${isHidden ? ' pt-btn-on' : ''}" data-act="hide" data-id="${esc(x.id)}" aria-pressed="${isHidden}">${isHidden ? IC.eye + ' Show' : IC.eyeOff + ' Hide'}</button>
        </div>` : ''}
      </li>`;
    };
    const groups = [['Alert', 'Urgent alert from Master Network'], ['State', 'California news'], ['National', 'National news']];

    /* channels */
    const { mine, joinable } = channelsFor(ctx);
    let chId = ui.channel[ctx.tenantSlug];
    if (!mine.find((c) => c.id === chId)) chId = mine[0] ? mine[0].id : null;
    ui.channel[ctx.tenantSlug] = chId;
    const ch = mine.find((c) => c.id === chId);
    const typeLabel = { REGIONAL: 'Regional', GROUP: 'Working group', DIRECT: 'Two counties' };

    /* files */
    const files = (ctx.network.sharedAssets || []);
    const lib = Store.list('fileLibrary');
    const copied = new Set(lib.map((l) => l.assetId));
    const libCount = (a) => Store.global.list('fileCopies').filter((c) => c.assetId === a.id).length;
    const fileBtn = (a) => {
      if (a.fromCounty === ctx.tenantSlug) return '<span class="badge badge-local">Shared by your county</span>';
      if (copied.has(a.id)) return `<button class="btn btn-sm" data-act="file-view" data-id="${esc(a.id)}">${IC.check} Open our copy</button>`;
      return edit ? `<button class="btn btn-sm btn-primary" data-act="file-copy" data-id="${esc(a.id)}">Copy to our library</button>` : `<button class="btn btn-sm" data-act="file-view" data-id="${esc(a.id)}">Preview</button>`;
    };

    return `
      <p class="pt-intro">Master Network suggests stories for your site, and you choose which ones to hide or pin. Only an urgent locked alert stays up for every county.</p>
      <div class="pt-netgrid">
        <div class="card" data-tour="portal-network-items">
          <div class="card-head"><h3>Network pushes</h3><span class="spacer"></span>
            <span class="pt-counter" aria-live="polite">${hiddenN} hidden · ${pinnedN} pinned</span></div>
          ${groups.map(([g, label]) => {
            const rows = items.filter((x) => x._scope === g);
            if (!rows.length) return '';
            return `<div class="pt-subhead">${label}</div><ul class="pt-list">${rows.map(netRow).join('')}</ul>`;
          }).join('')}
        </div>

        <div class="card" data-tour="portal-chat">
          <div class="card-head"><h3>County chat</h3></div>
          <div class="pt-chat">
            <div class="pt-chans" role="tablist" aria-label="Channels">
              <div class="pt-chans-label">Your channels</div>
              ${mine.map((c) => `<button class="pt-chan${c.id === chId ? ' active' : ''}" role="tab" aria-selected="${c.id === chId}" data-act="chan" data-id="${esc(c.id)}">
                  <span class="pt-chan-name">${esc(c.name)}<span class="pt-chan-type">${c.type === 'DIRECT' ? 'Direct message' : `${typeLabel[c.type] || c.type} · ${c.counties.length} counties`}</span></span></button>`).join('')}
              ${joinable.length && edit ? `<div class="pt-chans-label">Regional channels you can join</div>
                ${joinable.map((c) => `<button class="pt-chan" data-act="join" data-id="${esc(c.id)}"><span class="pt-chan-name">${esc(c.name)}<span class="pt-chan-type">Regional · ${c.counties.length} counties</span></span><span class="badge badge-local">Join</span></button>`).join('')}` : ''}
            </div>
            <div class="pt-pane" role="tabpanel">${ch ? chatPaneHtml(ctx, ch) : `<div class="card-body">${emptyHtml(IC.chat, 'No channels yet', 'Join a regional channel to talk with neighboring counties.', '')}</div>`}</div>
          </div>
        </div>
      </div>

      <div class="pt-section" data-tour="portal-assets">
        <div class="pt-bar"><h2>Shared files</h2><span class="pt-sub">Borrow what already works in other counties. A copied file switches to your county’s name and QR code.</span></div>
        <div class="pt-files">
          ${files.map((a) => `<div class="card pt-filecard">
              ${thumb(a.kind, a.fromCounty, a.title)}
              <div class="pt-file-body">
                <div class="row" style="gap:6px"><span class="badge">${esc(a.kind)}</span>${countyBadge(a.fromCounty, ctx.tenantSlug)}</div>
                <h4>${esc(a.title)}</h4>
                <div class="pt-file-stats"><span>${U.fmtNum(a.downloads)} downloads</span><span>Copied by ${U.fmtNum(a.forks + libCount(a))} counties</span></div>
                <div class="row">${fileBtn(a)}</div>
              </div></div>`).join('')}
        </div>
      </div>`;
  }
  function chatPaneHtml(ctx, ch) {
    const edit = ctx.can('portal.edit');
    const msgs = messagesFor(ch);
    return `
      <div class="pt-pane-head">
        <h3>${esc(ch.name)}</h3><span class="spacer"></span>
        <span class="pt-enc">${IC.shield} Only member counties can read this channel</span>
        <div class="row" style="gap:6px;width:100%">${ch.counties.map((c) => countyBadge(c, ctx.tenantSlug)).join('')}</div>
      </div>
      <div class="pt-msgs" aria-live="polite">
        ${msgs.map((m) => `
          <div class="pt-msg${m.county === ctx.tenantSlug ? ' mine' : ''}${m.id && fresh.has(m.id) ? ' is-new' : ''}">
            ${U.avatar(m.from, 34)}
            <div class="pt-msg-body">
              <div class="pt-msg-top"><b>${esc(m.from)}</b>${countyBadge(m.county, ctx.tenantSlug)}<span class="small muted">${esc(U.timeAgo(m.minutesAgo))}</span></div>
              <div class="pt-msg-text">${esc(m.text)}</div>
            </div>
          </div>`).join('')}
      </div>
      ${edit ? `<form class="pt-compose" data-form="chat">
        <label class="sr-only" for="pt-chat-in">Message ${esc(ch.name)}</label>
        <input id="pt-chat-in" class="input" autocomplete="off" maxlength="600" placeholder="Message ${esc(ch.name)}">
        <button class="btn btn-primary" type="submit">Send</button>
      </form>` : '<div class="pt-readonly-line">Executive Board members post in county channels. Everyone on the committee can read along.</div>'}`;
  }
  function filePreview(ctx, a) {
    const t = ctx.tenant;
    const mine = Store.list('fileLibrary').some((l) => l.assetId === a.id);
    ctx.modal({
      title: mine ? 'Our copy' : 'Preview',
      html: `<div class="pt-modal">
        <div class="pt-preview">${thumb(a.kind, mine ? ctx.tenantSlug : a.fromCounty, a.title)}</div>
        <h3 style="margin:14px 0 4px">${esc(a.title)}</h3>
        <p class="small muted">Original by ${esc(countyName(a.fromCounty))}. ${mine ? `This copy belongs to ${esc(t.shortName)}.` : ''}</p>
        ${mine ? `<ol class="pt-steps"><li>Colors and footer switched to ${esc(t.shortName)}’s.</li><li>QR code now points to ${esc(t.domain)}/ballot.</li></ol>` : ''}
      </div>`,
      actions: [{ label: 'Close', primary: true }],
    });
  }

  /* ================= render ================= */
  let unsubs = [];
  App.register({
    id: 'portal',
    title: 'Committee Portal',
    group: 'Committee Portal',
    icon: ICON,
    blurb: 'Post county news and events, see who RSVPd, fill local ad slots and choose which network stories show.',
    render(el, ctx) {
      injectStyle();
      el.classList.add('scr-portal');
      const sub = SUBS.some(([k]) => k === ctx.sub) ? ctx.sub : '';
      ctx = Object.assign({}, ctx, { sub });

      function draw() {
        if (!el.isConnected && el.childElementCount) { cleanup(); return; }
        const body = sub === 'events' ? eventsHtml(ctx) : sub === 'responses' ? responsesHtml(ctx)
          : sub === 'settings' ? settingsHtml(ctx) : sub === 'ads' ? adsHtml(ctx) : sub === 'network' ? networkHtml(ctx) : postsHtml(ctx);
        el.innerHTML = `<div class="page">${headHtml(ctx)}${body}</div>`;
        const ms = el.querySelector('.pt-msgs'); if (ms) ms.scrollTop = ms.scrollHeight;
        fresh.clear();
      }
      function cleanup() { unsubs.forEach((u) => { try { u(); } catch (e) { /* ignore */ } }); unsubs = []; }
      cleanup();
      const WATCH = { '': ['posts'], events: ['events', 'rsvps'], responses: ['rsvps', 'volunteers', 'memberships', 'events'],
        settings: [], ads: [], network: ['networkPrefs', 'fileLibrary', 'joinedChannels'] }[sub] || [];
      WATCH.forEach((n) => unsubs.push(Store.on(n, () => { if (el.isConnected) draw(); else cleanup(); })));
      if (sub === 'network') ['networkPushes', 'channelMessages', 'fileCopies'].forEach((n) => unsubs.push(Store.global.on(n, () => { if (el.isConnected) draw(); else cleanup(); })));
      if (sub === 'ads') unsubs.push(Store.global.on('networkAds', () => { if (el.isConnected) draw(); else cleanup(); }));
      draw();

      el.addEventListener('change', (e) => {
        if (e.target.id === 'pt-ev-filter') { ui.respEvent = e.target.value; draw(); return; }
        const form = e.target.closest('[data-form="ad"]');
        if (form && e.target.name === 'active') {
          const lbl = form.querySelector('[data-active-label]'); if (lbl) lbl.textContent = e.target.checked ? 'Showing' : 'Paused';
          updateAdPreview(form);
        }
        if (e.target.name === 'ps-layout') {
          const a = el.querySelector('[data-preview]');
          if (a) a.href = siteUrl(ctx.tenantSlug, '', e.target.value === 'newsroom' ? '&layout=newsroom' : '');
        }
      });
      el.addEventListener('input', (e) => {
        const form = e.target.closest('[data-form="ad"]');
        if (form) { updateAdPreview(form); if (e.target.name === 'url') form.querySelector('[data-err="url"]').textContent = ''; }
        if (e.target.id === 'ps-tag') { const c = el.querySelector('[data-count]'); if (c) c.textContent = e.target.value.length; }
      });
      function updateAdPreview(form) {
        const slot = form.dataset.slot;
        const d = readAdForm(form);
        const card = form.closest('.pt-adcard');
        card.querySelector('[data-preview]').innerHTML = adPreview(d, slot, ctx.tenant);
        const p = card.querySelector('[data-paused]'); if (p) p.hidden = d.active;
      }

      el.addEventListener('submit', (e) => {
        const form = e.target;
        if (form.dataset.form === 'chat') {
          e.preventDefault();
          if (!App.auth.require('portal.edit', { reason: 'Executive Board members post in county channels.' })) return;
          const inp = form.querySelector('input');
          const text = inp.value.trim();
          if (!text) { inp.focus(); return; }
          const chId = ui.channel[ctx.tenantSlug];
          const user = ctx.user;
          const doc = Store.global.add('channelMessages', { channelId: chId, from: user ? user.name : ctx.tenant.shortName, county: ctx.tenantSlug, text, title: 'County chat message' });
          fresh.add(doc.id);
          setTimeout(() => { const i = el.querySelector('#pt-chat-in'); if (i) i.focus({ preventScroll: true }); }, 0);
          return;
        }
        if (form.dataset.form === 'ad') {
          e.preventDefault();
          if (!App.auth.require('ads.manage', { reason: 'Executive Board members manage local ads.' })) return;
          const slot = form.dataset.slot;
          const d = readAdForm(form);
          if (!d.title || !d.sponsor) {
            ctx.toast('Add a headline and a sponsor before you save.', 'warn');
            (form.querySelector(d.title ? '[name="sponsor"]' : '[name="title"]')).focus(); return;
          }
          if (d.url && !/^https?:\/\//i.test(d.url)) d.url = 'https://' + d.url;
          if (d.url && !validUrl(d.url)) { form.querySelector('[data-err="url"]').textContent = 'Check the link. It should look like https://example.com.'; form.querySelector('[name="url"]').focus(); return; }
          if (!d.cta) d.cta = 'Learn more';
          const existing = Store.list('localAds').find((a) => a.placement === slot);
          const seed = (ctx.tenant.localAds || []).find((a) => a.placement === slot);
          const doc = Object.assign({ placement: slot }, d, { title: d.title });
          if (existing) Store.update('localAds', existing.id, doc);
          else Store.add('localAds', Object.assign({ id: seed ? seed.id : `${ctx.tenantSlug}-ad-${slot.toLowerCase()}` }, doc));
          ctx.toast(d.active ? `${SLOT_LABEL[slot]} on ${ctx.tenant.domain} now shows “${d.title}”.` : `${SLOT_LABEL[slot]} is paused. Nothing shows there until you turn it back on.`, 'ok');
          const saved = form.querySelector('[data-saved]'); if (saved) saved.textContent = 'Saved just now';
          const u = form.querySelector('[name="url"]'); if (u) u.value = d.url;
          const mapSlot = el.querySelector(`a.pt-mapslot[data-slot="${slot}"]`);
          if (mapSlot) { mapSlot.classList.toggle('is-paused', !d.active); mapSlot.querySelector('b').textContent = d.title; mapSlot.querySelector('span').textContent = SLOT_LABEL[slot] + (d.active ? '' : ' · Paused'); }
          return;
        }
        if (form.dataset.form === 'settings') e.preventDefault();
      });

      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b || b.disabled) return;
        const act = b.dataset.act, id = b.dataset.id;
        const t = ctx.tenant;

        if (act === 'post-filter') { ui.postFilter = b.dataset.f; draw(); return; }
        if (act === 'post-new' || act === 'post-edit') {
          if (!App.auth.require('portal.edit', { reason: 'Executive Board members write posts for the county site.' })) return;
          postEditor(ctx, act === 'post-edit' ? id : null); return;
        }
        if (act === 'event-new' || act === 'event-edit') {
          if (!App.auth.require('portal.edit', { reason: 'Executive Board members add events to the county site.' })) return;
          eventEditor(ctx, act === 'event-edit' ? id : null); return;
        }
        if (act === 'see-rsvps') { e.preventDefault(); ui.respTab = 'rsvps'; ui.respEvent = id; ctx.navigate('portal/responses'); return; }
        if (act === 'resp-tab') { ui.respTab = b.dataset.k; draw(); return; }
        if (act === 'csv') { if (App.auth.require('portal.edit', { reason: 'Contact lists are for Executive Board members.' })) exportCsv(ctx); return; }
        if (act === 'settings-save') {
          if (!App.auth.require('portal.edit', { reason: 'Executive Board members change site settings.' })) return;
          const tagline = el.querySelector('#ps-tag').value.trim();
          if (!tagline) { ctx.toast('Add a tagline. It shows under your county’s name.', 'warn'); el.querySelector('#ps-tag').focus(); return; }
          const layoutIn = el.querySelector('input[name="ps-layout"]:checked');
          const next = { tagline, heroNote: el.querySelector('#ps-note').value.trim(), layout: layoutIn && layoutIn.value === 'newsroom' ? 'newsroom' : 'classic', updatedAt: new Date().toISOString() };
          Store.set('siteSettings', next);
          const st = el.querySelector('[data-status]'); if (st) st.textContent = 'Saved just now.';
          ctx.toast('', 'ok', { html: `Settings saved. ${esc(t.domain)} now uses the ${next.layout === 'newsroom' ? 'Newsroom' : 'Classic'} layout. <a href="${esc(siteUrl(ctx.tenantSlug, '', next.layout === 'newsroom' ? '&layout=newsroom' : ''))}" target="_blank" rel="noopener" style="color:inherit;font-weight:700">View on site</a>` });
          return;
        }
        if (act === 'slot-jump') {
          e.preventDefault();
          const card = el.querySelector(`#pt-ad-${b.dataset.slot}`);
          if (!card) return;
          const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
          card.classList.remove('is-flash'); void card.offsetWidth; card.classList.add('is-flash');
          const f = card.querySelector('input[name="title"]'); if (f && !f.disabled) setTimeout(() => f.focus({ preventScroll: true }), reduce ? 0 : 450);
          return;
        }
        if (act === 'hide' || act === 'pin') {
          if (!App.auth.require('portal.edit', { reason: 'Executive Board members choose what shows on the county site.' })) return;
          const p = prefs();
          const list = act === 'hide' ? p.hidden : p.pinned;
          const on = list.includes(id);
          if (on) list.splice(list.indexOf(id), 1); else list.push(id);
          if (act === 'hide' && !on) p.pinned = p.pinned.filter((x) => x !== id);
          Store.set('networkPrefs', { hidden: p.hidden, pinned: p.pinned });
          if (act === 'hide') ctx.toast(on ? `Back on ${t.domain}.` : `Hidden from ${t.domain}. Other counties keep their own choice.`, on ? 'info' : 'ok');
          else ctx.toast(on ? 'Unpinned.' : `Pinned to the top of ${t.domain}.`, on ? 'info' : 'ok');
          return;
        }
        if (act === 'chan') { ui.channel[ctx.tenantSlug] = id; draw(); return; }
        if (act === 'join') {
          if (!App.auth.require('portal.edit', { reason: 'Executive Board members join channels for the county.' })) return;
          const j = Store.get('joinedChannels', []) || [];
          if (!j.includes(id)) j.push(id);
          ui.channel[ctx.tenantSlug] = id;
          const ch = (ctx.network.channels || []).find((c) => c.id === id);
          Store.set('joinedChannels', j);
          ctx.toast(`${t.shortName} joined ${ch ? ch.name : 'the channel'}. Your messages now reach every county in it.`, 'ok');
          return;
        }
        if (act === 'file-copy') {
          if (!App.auth.require('portal.edit', { reason: 'Executive Board members copy files into the county library.' })) return;
          const a = (ctx.network.sharedAssets || []).find((x) => x.id === id);
          if (!a) return;
          if (!Store.list('fileLibrary').some((l) => l.assetId === id)) {
            Store.add('fileLibrary', { assetId: a.id, title: `Copied “${a.title}”`, kind: a.kind, fromCounty: a.fromCounty });
            Store.global.add('fileCopies', { assetId: a.id, county: ctx.tenantSlug, title: a.title });
          }
          ctx.toast(`Copied to ${t.shortName}’s library with your county name and QR code.`, 'ok');
          setTimeout(() => filePreview(ctx, a), 250);
          return;
        }
        if (act === 'file-view') { const a = (ctx.network.sharedAssets || []).find((x) => x.id === id); if (a) filePreview(ctx, a); return; }
      });
    },
  });
})();
