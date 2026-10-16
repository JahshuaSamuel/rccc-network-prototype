/* site.js: the standalone public county website (index.html?county=svgop|demo).
   Loads after data.js and store.js, before voter-guide.js and the site-*.js page files.
   - Provides a small window.App shim (util, toast, modal, ctx, auth) when the platform shell is absent.
   - Merges seed data (data.js, newsroom-data.js, voter-guide-data.js) with saved Store data.
   - Renders the site chrome (statewide alert, header, footer, menu sheet) and runs the hash router.
   Classic script, ES2020, no dependencies. Leaflet 1.9.4 is loaded on demand for the events map. */
(function () {
  'use strict';

  const D = window.DATA || { tenants: {}, network: {} };
  const Q = new URLSearchParams(location.search);
  const SLUG = D.tenants[Q.get('county')] ? Q.get('county') : 'svgop';
  const T = D.tenants[SLUG] || {};
  const ZONES_PARAM = Q.get('zones') === '1';
  const LAYOUT_PARAM = Q.get('layout') === 'newsroom' ? 'newsroom' : Q.get('layout') === 'classic' ? 'classic' : '';
  let FRAMED = false;
  try { FRAMED = window.top !== window.self; } catch (e) { FRAMED = true; }
  const REDUCED = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------------- util (same shape as App.util in core.js) ---------------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const num0 = new Intl.NumberFormat('en-US');
  const AVATAR_COLORS = ['#0B2A4A', '#C8102E', '#14532D', '#B7791F', '#5B3FA0', '#1F6F8B', '#8A3B12', '#3D5A80', '#6B2D5C', '#2F6B4F'];
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const util = {
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]); },
    fmtUsd(n) { return usd0.format(Number(n) || 0); },
    fmtNum(n) { return num0.format(Math.round(Number(n) || 0)); },
    initials(name) {
      const p = String(name || '').trim().split(/\s+/).filter(Boolean);
      if (!p.length) return '?';
      return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
    },
    avatar(name, size) {
      const s = Number(size) || 32;
      const c = AVATAR_COLORS[hash(String(name || '')) % AVATAR_COLORS.length];
      return `<svg class="avatar" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" role="img" aria-label="${util.esc(name)}">` +
        `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="${c}"/>` +
        `<text x="50%" y="50%" dy=".35em" text-anchor="middle" fill="#fff" font-family="Public Sans, system-ui, sans-serif" font-weight="700" font-size="${Math.round(s * 0.4)}">${util.esc(util.initials(name))}</text></svg>`;
    },
    candidatePhoto(c, size, opts) {
      const o = opts || {};
      if (!c || !c.photo) return util.avatar(c ? c.name : '', size);
      const w = Number(o.w || size) || 32, h = Number(o.h || size) || 32;
      const r = o.shape === 'square' ? '0' : o.shape === 'rounded' ? Math.round(Math.min(w, h) * 0.12) + 'px' : '50%';
      return `<img class="cand-photo" src="${util.esc(c.photo)}" alt="${util.esc(c.name)}" width="${w}" height="${h}" loading="lazy" ` +
        `style="width:${w}px;height:${h}px;max-width:100%;object-fit:cover;object-position:${util.esc(c.photoPos || '50% 25%')};border-radius:${r};display:inline-block;flex:none;background:#e5e7eb">`;
    },
    seeded(seed) {
      let a = (typeof seed === 'number' ? seed : hash(String(seed))) >>> 0;
      return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    timeAgo(minutes) {
      const m = Math.max(0, Math.round(Number(minutes) || 0));
      if (m < 1) return 'just now';
      if (m < 60) return `${m} min ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h} hr ago`;
      const d = Math.floor(h / 24);
      if (d < 7) return d === 1 ? '1 day ago' : `${d} days ago`;
      const w = Math.floor(d / 7);
      return w === 1 ? '1 week ago' : `${w} weeks ago`;
    },
    disclaimer(c) { c = c || {}; return c.disclaimer || `Paid for by ${c.committeeName}, FPPC #${c.fppcId}`; },
    sleep(ms) { return new Promise((r) => setTimeout(r, ms)); },
  };
  const esc = util.esc;

  /* ---------------- toast + modal (used when core.js is absent) ---------------- */
  function toast(msg, kind, opts) {
    const o = opts || {};
    let host = document.getElementById('toasts');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toasts';
      host.setAttribute('role', 'region');
      host.setAttribute('aria-label', 'Notifications');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    const t = document.createElement('div');
    t.className = 'toast toast-' + (kind || 'info');
    t.innerHTML = `<span class="toast-dot" aria-hidden="true"></span><span class="toast-msg">${o.html || esc(msg)}</span>`;
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    let gone = false;
    const kill = () => { if (gone) return; gone = true; t.classList.remove('in'); t.classList.add('out'); setTimeout(() => t.remove(), 260); };
    const dur = o.duration == null ? 4000 : o.duration;
    let timer = dur ? setTimeout(kill, dur) : 0;
    t.addEventListener('mouseenter', () => clearTimeout(timer));
    t.addEventListener('mouseleave', () => { if (dur) timer = setTimeout(kill, 1800); });
    t.addEventListener('click', kill);
    while (host.children.length > 3) host.firstElementChild.remove();
    return t;
  }

  let modalStack = [];
  function modal(opts) {
    opts = opts || {};
    const prevFocus = document.activeElement;
    const back = document.createElement('div');
    back.className = 'modal-backdrop s-modal' + (opts.wide ? ' is-wide' : '');
    const id = 'm-title-' + Date.now();
    back.innerHTML =
      `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="${id}">` +
      `<div class="modal-head"><h2 id="${id}">${esc(opts.title || '')}</h2>` +
      `<button class="s-icon-btn modal-x" aria-label="Close">${ICON.x}</button></div>` +
      `<div class="modal-body">${opts.html || ''}</div>` +
      (opts.actions === false ? '' : `<div class="modal-foot"></div>`) + `</div>`;
    const foot = back.querySelector('.modal-foot');
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      back.classList.remove('in');
      modalStack = modalStack.filter((m) => m !== api);
      if (!modalStack.length) document.documentElement.classList.remove('s-locked');
      setTimeout(() => back.remove(), 200);
      if (opts.onClose) try { opts.onClose(); } catch (e) { console.error(e); }
      if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    if (foot) {
      const actions = opts.actions && opts.actions.length ? opts.actions : [{ label: 'Close', primary: true }];
      actions.forEach((a) => {
        const b = document.createElement('button');
        b.className = 's-btn ' + (a.primary ? 's-btn-primary' : 's-btn-quiet');
        b.textContent = a.label;
        b.addEventListener('click', () => {
          let keep = false;
          try { keep = a.onClick ? a.onClick(api) === false : false; } catch (e) { console.error(e); }
          if (!keep) close();
        });
        foot.appendChild(b);
      });
    }
    back.querySelector('.modal-x').addEventListener('click', close);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    function focusables() {
      return Array.from(back.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,iframe,[tabindex]:not([tabindex="-1"])'))
        .filter((el) => el.offsetParent !== null);
    }
    function onKey(e) {
      if (modalStack[modalStack.length - 1] !== api) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    document.documentElement.classList.add('s-locked');
    const api = { el: back, body: back.querySelector('.modal-body'), foot, close };
    modalStack.push(api);
    requestAnimationFrame(() => {
      back.classList.add('in');
      const f = back.querySelector(opts.focus || '.modal-body input, .modal-foot .s-btn-primary') || focusables()[0];
      if (f) f.focus({ preventScroll: true });
    });
    return api;
  }

  /* ---------------- icons ---------------- */
  const I = (d, s, sw) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="${sw || 1.9}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  function starPts(x, y, r) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 ? r * 0.42 : r;
      pts.push((x + rr * Math.cos(a)).toFixed(1) + ',' + (y + rr * Math.sin(a)).toFixed(1));
    }
    return pts.join(' ');
  }
  const STAR = (s, fill) => `<svg width="${s}" height="${s}" viewBox="0 0 20 20" aria-hidden="true"><polygon points="${starPts(10, 10.6, 9.4)}" fill="${fill || 'currentColor'}"/></svg>`;
  const ICON = {
    x: I('<path d="M5 5l10 10M15 5L5 15"/>', 20),
    menu: I('<path d="M3 6h14M3 10h14M3 14h14"/>', 22, 2),
    arrow: I('<path d="M4 10h11M11 6l4 4-4 4"/>', 18),
    back: I('<path d="M16 10H5M9 6l-4 4 4 4"/>', 18),
    out: I('<path d="M11 4h5v5M16 4l-7 7M14 12v3.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5H8"/>', 15),
    lock: I('<rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>', 14, 2.1),
    net: I('<circle cx="10" cy="4.5" r="2"/><circle cx="4.5" cy="15" r="2"/><circle cx="15.5" cy="15" r="2"/><path d="M10 6.5v3M10 9.5L5.5 13.3M10 9.5l4.5 3.8"/>', 14),
    play: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4.8l8.4 5.2L7 15.2z" fill="currentColor"/></svg>',
    check: I('<path d="M4.5 10.5l3.5 3.5 7.5-8"/>', 18, 2.2),
    cal: I('<rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 2.5v4M13 2.5v4"/>', 18),
    pin: I('<path d="M10 17.5s5.5-4.9 5.5-9.3a5.5 5.5 0 0 0-11 0c0 4.4 5.5 9.3 5.5 9.3z"/><circle cx="10" cy="8.2" r="2"/>', 18),
    clock: I('<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2"/>', 18),
    people: I('<circle cx="7.5" cy="7" r="2.6"/><path d="M2.8 16c.6-2.6 2.5-4 4.7-4s4.1 1.4 4.7 4"/><circle cx="14" cy="7.8" r="2.1"/><path d="M13 12.2c1.9-.2 3.6.9 4.2 3.3"/>', 18),
    heart: I('<path d="M10 16.5s-6-3.7-6-8.4A3.4 3.4 0 0 1 10 6a3.4 3.4 0 0 1 6 2.1c0 4.7-6 8.4-6 8.4z"/>', 20),
    share: I('<path d="M10 12.5V3M6.5 6.5L10 3l3.5 3.5M4 10.5v5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-5"/>', 18),
    user: I('<circle cx="10" cy="7" r="3.2"/><path d="M3.8 17c.8-3.2 3.3-5 6.2-5s5.4 1.8 6.2 5"/>', 18),
    minus: I('<path d="M5 10h10"/>', 18, 2.2),
    plus: I('<path d="M10 5v10M5 10h10"/>', 18, 2.2),
  };

  /* ---------------- copy fixes for seed text shown publicly (copy audit, data.js rows) ---------------- */
  const TAGLINE = {
    svgop: 'Silicon Valley Republicans working for safe streets and a valley that families can afford.',
    demo: 'Demo County Republicans organizing precinct by precinct, from farm towns to main streets.',
  };
  const SLOGAN_FIX = {
    'Back to basics. Open books. Every child reading by third grade.': 'Open books, and every child reading by third grade.',
    'Safe streets, filled potholes, a city hall that answers the phone.': 'Safe streets and a city hall that answers the phone.',
    'Water for farms, families and the future.': 'Water our farms and families can count on.',
    'Every student ready for work, college or service.': 'Every student ready for a job or for college.',
    'Safe roads, steady budgets, open books.': 'Safe roads and county books anyone can read.',
  };
  const TEXT_FIX = {
    'Family-owned since 1987. Proud supporter of local volunteers.': 'Family-owned since 1987 and proud to back local volunteers.',
    'Feed, seed and fencing for Demo County ranches since 1964.': 'Selling feed and fencing to Demo County ranches since 1964.',
    'National Sponsor — Ironbridge Mutual Insurance (fictional company)': 'Ironbridge Mutual Insurance: coverage for California families',
    'Republican County Committee Network': 'RCCC Network',
  };
  function clean(s) {
    if (s == null) return '';
    const str = String(s);
    if (TEXT_FIX[str]) return TEXT_FIX[str];
    if (SLOGAN_FIX[str]) return SLOGAN_FIX[str];
    return str.replace(/\s+—\s+/g, ': ');
  }

  /* ---------------- shim ---------------- */
  if (!window.App) {
    window.App = {
      site: true,
      state: { tenant: SLUG, role: 'public' },
      util,
      toast,
      modal,
      go: (p) => Site.go(p),
      navigate: (p) => Site.go(p),
      get ctx() { return { tenant: T, tenantSlug: SLUG, network: D.network || {}, user: App.auth.user, state: App.state, toast, modal }; },
      auth: { user: null, role: 'public', can: () => true },
    };
  }
  window.App.state = window.App.state || {};
  window.App.state.tenant = SLUG;

  /* Optional signed-in context from the platform (same origin, same Store). */
  function readSession() {
    let user = null;
    try {
      const s = Store.global.get('session', null);
      if (s && s.userId) user = Store.global.list('accounts').find((a) => a && a.id === s.userId) || null;
    } catch (e) { user = null; }
    if (App.site) { App.auth.user = user; App.auth.role = user ? user.role : 'public'; }
    return user;
  }

  /* A per-browser id so a signed-out visitor sees their own RSVP or sign-up on the next visit. */
  function visitorId() {
    let v = Store.global.get('siteVisitor', null);
    if (!v || !v.id) { v = { id: Store.newId ? Store.newId('vis') : 'vis_' + Date.now().toString(36) }; Store.global.set('siteVisitor', v); }
    return v.id;
  }
  function isMine(doc) {
    if (!doc) return false;
    const u = App.auth && App.auth.user;
    if (u && doc.createdBy === u.id) return true;
    return !!doc.visitorId && doc.visitorId === visitorId();
  }

  /* ---------------- time ---------------- */
  const N = window.NEWSROOM || { stories: [], videos: [], channels: [] };
  const SEED_NOW = Date.parse((N && N.asOf) || '2026-10-14T15:00:00-07:00') || Date.now();
  function toMs(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const s = String(v);
    const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T12:00:00-07:00' : s);
    return isNaN(ms) ? null : ms;
  }
  function ago(ms) { return ms == null ? '' : util.timeAgo((Date.now() - ms) / 60000); }
  function todayIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dateParts(iso) {
    const dt = new Date(String(iso) + 'T12:00:00');
    if (isNaN(dt)) return { mon: '', day: '', dow: '', long: String(iso || ''), full: String(iso || '') };
    return {
      mon: dt.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      day: dt.getDate(),
      dow: dt.toLocaleDateString('en-US', { weekday: 'short' }),
      long: dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      full: dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    };
  }

  /* ---------------- content: merges seed data with saved Store data ---------------- */
  const C = {};

  C.settings = () => Object.assign({}, Store.get('siteSettings', {}) || {});
  C.tagline = () => clean(C.settings().tagline || TAGLINE[SLUG] || T.tagline || '');
  C.layout = () => LAYOUT_PARAM || (C.settings().layout === 'newsroom' ? 'newsroom' : 'classic');
  C.guide = () => (App.voterGuide && App.voterGuide.get(T)) || (window.VOTER_GUIDES || {})[SLUG] || null;
  C.paidFor = () => { const g = C.guide(); return (g && g.paidFor) || `Paid for by ${T.name}. Not authorized by any candidate or candidate’s committee.`; };
  C.donateUrl = () => `https://secure.winred.com/${SLUG === 'svgop' ? 'svgop' : 'demo-county-gop'}/donate`;

  /* Network pushes from the Master Network console addressed to this county. */
  C.pushes = () => Store.global.list('networkPushes')
    .filter((p) => p && p.title && (!Array.isArray(p.tenants) || !p.tenants.length || p.tenants.includes(SLUG)))
    .filter((p) => !p.status || p.status === 'published')
    .filter((p) => { const x = toMs(p.expiresAt); return x == null || x > Date.now(); });
  C.prefs = () => {
    const np = Store.get('networkPrefs', null) || {};
    const hidden = [].concat(np.hidden || [], Store.get('hiddenPushes', []) || []).map(String);
    const pinned = [].concat(np.pinned || [], Store.get('pinnedPushes', []) || []).map(String);
    return { hidden, pinned };
  };
  C.hidden = () => new Set(C.prefs().hidden);

  function pushItem(p) {
    return {
      id: String(p.id), tab: p.tab === 'national' ? 'national' : 'state', kind: 'push', title: p.title, summary: p.summary || '',
      body: p.body || '', source: p.source || 'Statewide news desk', url: p.url || '', tag: p.tag || (p.tab === 'national' ? 'National' : 'California'),
      at: toMs(p.createdAt) || Date.now(), locked: !!p.locked, priority: Number(p.priority) || 0, network: true,
    };
  }

  C.alert = () => {
    const live = C.pushes().filter((p) => p.locked && Number(p.priority) >= 100)
      .sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0))[0];
    if (live) return Object.assign(pushItem(live), { alert: true });
    const b = T.breaking;
    if (!b) return null;
    return {
      id: String(b.id), tab: 'state', kind: 'sample', title: clean(b.title), summary: b.summary, source: '', url: 'https://voterstatus.sos.ca.gov/',
      urlLabel: 'the California Secretary of State', tag: 'Statewide alert', at: SEED_NOW - (b.minutesAgo || 0) * 60000, locked: true, sample: true, network: true, alert: true,
    };
  };

  C.news = (tab) => {
    const hidden = C.hidden();
    const real = (N.stories || []).filter((s) => {
      if (tab === 'national') return s.category === 'national' || s.category === 'opinion';
      if (tab === 'state') return s.category === 'california';
      if (tab === 'county') return s.category === 'local' && SLUG === 'svgop';
      return false;
    }).map((s) => ({
      id: s.id, tab, kind: 'real', title: s.headline, summary: s.summary, source: s.source, url: s.url,
      tag: s.category === 'opinion' ? 'Opinion' : s.tag, at: toMs(s.published), network: tab !== 'county',
    }));
    let items = real;
    if (tab === 'national' || tab === 'state') {
      const pushes = C.pushes().filter((p) => (p.tab === 'national' ? 'national' : 'state') === tab && !(p.locked && Number(p.priority) >= 100)).map(pushItem);
      /* Seed network stories (data.js) are the items the Committee Portal lists for hide and pin; they show as samples. */
      const seedNet = ((T.news && T.news[tab]) || []).map((n) => Object.assign(sampleItem(n, tab), { network: true }));
      items = pushes.concat(real, seedNet);
    }
    if (tab === 'county') {
      const posts = Store.list('posts').filter((p) => p && p.title && (p.status || 'published') === 'published').map((p) => ({
        id: String(p.id), tab, kind: 'post', title: p.title, summary: p.summary || String(p.body || '').slice(0, 220), body: p.body || '',
        source: T.shortName, tag: p.tag || 'Committee news', at: toMs(p.publishedAt) || toMs(p.createdAt) || Date.now(),
      }));
      const sample = ((T.news && T.news.county) || []).map((n) => sampleItem(n, tab));
      items = posts.concat(real, sample);
    }
    if (tab === 'city') items = ((T.news && T.news.city) || []).map((n) => sampleItem(n, tab));
    items = items.filter((n) => !(hidden.has(n.id) && !n.locked));
    const pinned = C.prefs().pinned;
    const rank = (x) => { const i = pinned.indexOf(x.id); return i < 0 ? 1e6 : i; };
    return items.map((n) => (pinned.includes(n.id) ? Object.assign({ pinned: true }, n) : n)).sort((a, b) =>
      (rank(a) - rank(b)) || ((b.kind === 'post') - (a.kind === 'post')) || ((a.tag === 'Opinion') - (b.tag === 'Opinion')) || ((b.at || 0) - (a.at || 0)));
  };
  function sampleItem(n, tab) {
    return { id: String(n.id), tab, kind: 'sample', title: clean(n.title), summary: n.summary, source: n.source, tag: n.tag, at: SEED_NOW - (n.minutesAgo || 0) * 60000, sample: true };
  }
  C.allNews = () => ['national', 'state', 'county', 'city'].reduce((a, k) => a.concat(C.news(k)), []);
  C.findNews = (id) => {
    const a = C.alert();
    if (a && a.id === id) return a;
    return C.allNews().find((n) => n.id === id) || null;
  };

  /* Events: seed plus saved; a saved doc with a seed id overrides it. Coordinates for the map. */
  const PLACES = {
    svgop: [
      ['campbell', 37.2872, -121.9500], ['sunnyvale', 37.3688, -122.0363], ['san jose', 37.3382, -121.8863],
      ['milpitas', 37.4323, -121.8996], ['cupertino', 37.3230, -122.0322], ['morgan hill', 37.1305, -121.6544],
      ['gilroy', 37.0058, -121.5683], ['santa clara', 37.3541, -121.9552], ['mountain view', 37.3861, -122.0839], ['palo alto', 37.4419, -122.1430],
    ],
    /* Demo County is a sample county; its towns are placed in a real farm region around Visalia. */
    demo: [['cedar flats', 36.2961, -119.1421], ['riverbend', 36.3302, -119.2921], ['millbrook', 36.2077, -119.3473], ['oak hollow', 36.4161, -119.0968]],
  };
  const EVENT_SPOT = {
    'svgop-ev-1': [37.3249, -121.9208], 'svgop-ev-2': [37.2877, -121.9445], 'svgop-ev-3': [37.3790, -122.0262],
    'svgop-ev-4': [37.3330, -121.8889], 'svgop-ev-5': [37.3020, -121.7930],
    'demo-ev-1': [36.2961, -119.1421], 'demo-ev-2': [36.3302, -119.2921], 'demo-ev-3': [36.2077, -119.3473],
    'demo-ev-4': [36.4161, -119.0968], 'demo-ev-5': [36.3195, -119.3123],
  };
  C.center = () => (SLUG === 'demo' ? [36.31, -119.22] : [37.33, -121.93]);
  function coordsFor(ev) {
    if (ev.lat != null && ev.lng != null && !isNaN(+ev.lat) && !isNaN(+ev.lng)) return [+ev.lat, +ev.lng];
    if (EVENT_SPOT[ev.id]) return EVENT_SPOT[ev.id];
    const loc = String(ev.location || '').toLowerCase();
    const hit = (PLACES[SLUG] || []).find((p) => loc.includes(p[0]));
    if (hit) { const r = util.seeded(ev.id || ev.title); return [hit[1] + (r() - 0.5) * 0.01, hit[2] + (r() - 0.5) * 0.01]; }
    return C.center();
  }
  C.events = (opts) => {
    const o = opts || {};
    const saved = Store.list('events').filter((e) => e && e.title && e.date);
    const savedIds = new Set(saved.map((e) => String(e.id)));
    const seed = (T.events || []).filter((e) => !savedIds.has(String(e.id))).map((e) => Object.assign({ sample: true }, e));
    const rsvps = Store.list('rsvps');
    let list = seed.concat(saved.filter((e) => (e.status || 'published') === 'published')).map((e) => {
      const mine = rsvps.filter((r) => r && r.eventId === e.id);
      const extra = mine.reduce((a, r) => a + 1 + (Number(r.guests) || 0), 0);
      const going = (Number(e.rsvps) || 0) + extra;
      const ll = coordsFor(e);
      return Object.assign({}, e, {
        id: String(e.id), title: clean(e.title), going, lat: ll[0], lng: ll[1],
        full: e.capacity ? going >= Number(e.capacity) : false,
        myRsvp: mine.find(isMine) || null,
      });
    }).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)));
    if (!o.all) list = list.filter((e) => e.date >= todayIso());
    return list;
  };
  C.findEvent = (id) => C.events({ all: true }).find((e) => e.id === id) || null;
  C.city = (ev) => {
    const parts = String(ev.location || '').split(',').map((s) => s.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : (parts[0] || '');
  };
  C.venue = (ev) => {
    const parts = String(ev.location || '').split(',').map((s) => s.trim()).filter(Boolean);
    return parts.length > 1 ? parts.slice(0, -1).join(', ') : (parts[0] || '');
  };

  /* Ads: local slots (county) and network slots (Master Network). Saved docs override the seed. */
  const LOCAL_PL = ['SIDEBAR_TOP', 'IN_FEED', 'FOOTER_BANNER'];
  C.localAd = (pl) => {
    const saved = Store.list('localAds').filter((a) => a && a.placement === pl);
    if (saved.length) { const a = saved[saved.length - 1]; return a.active === false ? null : Object.assign({ kind: 'local' }, a); }
    const s = (T.localAds || []).find((a) => a.placement === pl);
    return s ? Object.assign({ kind: 'local', sample: true }, s, { title: clean(s.title) }) : null;
  };
  /* Newest active network ad that targets this county; paused ones are skipped, then the sample fills in. */
  C.networkAd = (pl) => {
    const stamp = (a) => toMs(a.updatedAt) || toMs(a.createdAt) || 0;
    const live = Store.global.list('networkAds')
      .filter((a) => a && a.placement === pl && a.active !== false && (!Array.isArray(a.tenants) || !a.tenants.length || a.tenants.includes(SLUG)))
      .sort((a, b) => stamp(b) - stamp(a))[0];
    if (live) return Object.assign({ kind: 'network' }, live);
    const s = ((D.network && D.network.masterAds) || []).find((a) => a.placement === pl);
    return s ? Object.assign({ kind: 'network', sample: true }, s, { title: clean(s.title), sponsor: clean(s.sponsor) }) : null;
  };

  /* Seed candidates plus new recruits (Store 'candidates'), with board status overrides (Store key 'candidateStatus').
     Listed when ENDORSED or ACTIVE_CAMPAIGN, unless their campaign site has endorsementPaused. */
  const kebab = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  C.campaignSiteFor = (c) => Store.list('campaignSites').find((x) => x && x.candidateId === c.id) || null;
  C.candidates = () => {
    const ov = Store.get('candidateStatus', {}) || {};
    const seedIds = new Set((T.candidates || []).map((c) => c.id));
    const extra = Store.list('candidates').filter((c) => c && c.name && !seedIds.has(c.id));
    return (T.candidates || []).map((c) => Object.assign({ sample: true }, c)).concat(extra)
      .map((c) => Object.assign({}, c, { status: ov[c.id] || c.status, slogan: clean(c.slogan) }))
      .filter((c) => c.status === 'ENDORSED' || c.status === 'ACTIVE_CAMPAIGN')
      .filter((c) => { const site = C.campaignSiteFor(c); return !(site && site.endorsementPaused); });
  };
  /* Public campaign site link when the candidate's site is live. */
  C.campaignSite = (c) => { const x = C.campaignSiteFor(c); return x && x.status === 'live' ? x : null; };
  C.campaignHref = (c) => { const x = C.campaignSite(c); return x ? `campaign.html?county=${SLUG}&c=${encodeURIComponent(x.slug || kebab(c.name))}` : ''; };
  C.videos = () => (N.videos || []).slice();

  /* ---------------- shared rendering helpers ---------------- */
  const H = {};
  H.sample = (label) => `<span class="s-sample" title="Invented example content">${esc(label || 'Sample')}</span>`;
  H.zone = (kind, inner, attrs, tagExtra) => `<div class="s-zone" data-zone="${kind}" ${attrs || ''}>${H.zoneTag(kind, tagExtra)}${inner}</div>`;
  H.zoneTag = (kind) => kind === 'network'
    ? `<span class="s-zone-tag" aria-hidden="true">${ICON.net}<span>Network zone · set by Master Network</span></span>`
    : `<span class="s-zone-tag" aria-hidden="true">${STAR(12)}<span>Local zone · set by ${esc(T.shortName)}</span></span>`;
  H.dateBlock = (iso, cls) => { const d = dateParts(iso); return `<span class="s-dateblock ${cls || ''}" aria-hidden="true"><b>${esc(d.mon)}</b><span>${esc(d.day)}</span></span>`; };

  /* Typographic art for stories without photos: county colors, a seeded pattern and the story's topic. */
  H.tile = (item, opts) => {
    const o = opts || {};
    const W = 640, H2 = 360;
    const r = util.seeded(String(item.id) + ':' + SLUG);
    const v = Number(o.index) || 0;
    const kind = (Math.floor(r() * 4) + v) % 4;
    const uid = 'g' + hash(String(item.id) + (o.uid || '') + v).toString(36);
    let pat = '';
    if (kind === 0) {
      const cx = W * (0.62 + r() * 0.3), cy = H2 * (0.15 + r() * 0.5);
      for (let i = 1; i <= 8; i++) pat += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(i * 46).toFixed(0)}" fill="none" stroke="#fff" stroke-opacity="${(0.15 - i * 0.014).toFixed(3)}" stroke-width="10"/>`;
    } else if (kind === 1) {
      const step = 46 + Math.floor(r() * 18);
      for (let x = -H2; x < W + H2; x += step) pat += `<path d="M${x} ${H2} L${x + H2} 0" stroke="#fff" stroke-opacity=".07" stroke-width="${(step * 0.4).toFixed(0)}"/>`;
    } else if (kind === 2) {
      const step = 44;
      for (let y = 22; y < H2; y += step) for (let x = 22; x < W; x += step) {
        const v = r();
        if (v > 0.42) pat += `<polygon points="${starPts(x, y, 5 + v * 7)}" fill="#fff" fill-opacity="${(0.04 + v * 0.09).toFixed(2)}"/>`;
      }
    } else {
      const n = 5 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const y = (H2 / n) * i;
        pat += `<rect x="0" y="${y.toFixed(0)}" width="${W}" height="${(H2 / n / 2).toFixed(0)}" fill="#fff" fill-opacity="${(0.025 + (i % 2) * 0.03).toFixed(3)}"/>`;
      }
    }
    const label = String(item.tag || item.kind || 'News').toUpperCase().slice(0, 18);
    const fs = Math.round((label.length > 12 ? 52 : label.length > 8 ? 64 : 84) * (o.feature ? 0.72 : 1));
    const SHADES = ['var(--brand)', 'color-mix(in srgb, var(--brand) 70%, black)', 'color-mix(in srgb, var(--brand) 80%, var(--accent))'];
    const dark = o.tone === 'accent' ? 'var(--accent)' : SHADES[v % 3];
    const top = v % 2 === 1;   /* alternate the type between the bottom and the top of the tile */
    const ty = top ? 56 + fs : H2 - 76, by = top ? 70 + fs : H2 - 56;
    const sx = top ? W - 70 : W - 70, sy = top ? H2 - 70 : 66;
    return `<svg class="s-tile-art" viewBox="0 0 ${W} ${H2}" preserveAspectRatio="xMinYMid slice" aria-hidden="true" focusable="false">
      <defs><linearGradient id="${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:${dark}"/><stop offset="1" style="stop-color:color-mix(in srgb, ${dark} 58%, black)"/></linearGradient></defs>
      <rect width="${W}" height="${H2}" fill="url(#${uid})"/>${pat}
      <polygon points="${starPts(sx, sy, 34)}" style="fill:${o.tone === 'accent' ? '#fff' : 'var(--accent)'}" fill-opacity=".9"/>
      <text x="36" y="${ty}" font-family="Archivo, 'Arial Narrow', sans-serif" font-weight="800" font-stretch="75%" font-size="${fs}" fill="#fff" letter-spacing="-1">${esc(label)}</text>
      <rect x="36" y="${by}" width="86" height="8" style="fill:${o.tone === 'accent' ? '#fff' : 'var(--accent)'}"/>
    </svg>`;
  };

  H.adSlot = (ad, cls) => {
    if (!ad) return '';
    const href = ad.url ? esc(ad.url) : '';
    const cta = ad.cta || 'Learn more';
    const action = href
      ? `<a class="s-btn s-btn-sm s-ad-cta" href="${href}" target="_blank" rel="noopener sponsored">${esc(cta)} ${ICON.out}</a>`
      : `<button class="s-btn s-btn-sm s-ad-cta" data-act="ad" data-sponsor="${esc(ad.sponsor || '')}" data-title="${esc(ad.title || '')}" data-kind="${ad.kind}">${esc(cta)}</button>`;
    return `<aside class="s-ad s-ad-${ad.kind} ${cls || ''}" aria-label="Sponsored message">
      <span class="s-ad-mark" aria-hidden="true">${ad.kind === 'network' ? ICON.net.replace('width="14" height="14"', 'width="20" height="20"') : STAR(20)}</span>
      <div class="s-ad-text"><span class="s-ad-eyebrow">Sponsored${ad.sample ? ' · ' + H.sample('Sample ad') : ''}</span>
        <span class="s-ad-title">${esc(ad.title)}</span><span class="s-ad-sponsor">${esc(ad.sponsor || '')}</span></div>
      ${action}
    </aside>`;
  };

  /* Form fields */
  H.field = (f) => `<div class="s-fld" data-fld="${esc(f.name)}">
      <label class="s-fld-label" for="f-${esc(f.name)}">${esc(f.label)}${f.optional ? ' <span class="s-opt">optional</span>' : ''}</label>
      <input class="s-input" id="f-${esc(f.name)}" name="${esc(f.name)}" type="${esc(f.type || 'text')}" ${f.autocomplete ? `autocomplete="${esc(f.autocomplete)}"` : ''} ${f.inputmode ? `inputmode="${esc(f.inputmode)}"` : ''} ${f.maxlength ? `maxlength="${f.maxlength}"` : ''} value="${esc(f.value || '')}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} aria-describedby="f-${esc(f.name)}-err${f.hint ? ` f-${esc(f.name)}-hint` : ''}">
      ${f.hint ? `<p class="s-fld-hint" id="f-${esc(f.name)}-hint">${esc(f.hint)}</p>` : ''}
      <p class="s-fld-err" id="f-${esc(f.name)}-err" aria-live="polite"></p>
    </div>`;
  const V = {
    name(v) { v = String(v || '').trim(); if (!v) return 'Enter your name.'; if (v.length < 2 || !/[a-z]/i.test(v)) return 'Enter your first and last name.'; return ''; },
    contact(v) {
      v = String(v || '').trim();
      if (!v) return 'Enter an email address or a phone number.';
      if (v.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Check the email address. It should look like name@example.com.';
      const d = v.replace(/\D/g, '');
      if (d.length === 10 || (d.length === 11 && d[0] === '1')) return '';
      return 'Enter a 10-digit phone number or an email address.';
    },
    zip(v) { v = String(v || '').trim(); if (!v) return 'Enter your ZIP code.'; return /^\d{5}$/.test(v) ? '' : 'Enter a 5-digit ZIP code.'; },
  };
  H.formatContact = (v) => {
    v = String(v || '').trim();
    if (v.includes('@')) return v.toLowerCase();
    const d = v.replace(/\D/g, '').slice(-10);
    return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : v;
  };
  /* Validate named fields inside a form; marks errors inline and focuses the first one. */
  H.validate = (form, rules) => {
    let first = null;
    Object.keys(rules).forEach((name) => {
      const input = form.querySelector(`[name="${name}"]`);
      if (!input) return;
      const msg = rules[name](input.value);
      const wrap = input.closest('.s-fld');
      if (wrap) wrap.classList.toggle('has-error', !!msg);
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      const err = form.querySelector(`#f-${name}-err`);
      if (err) err.textContent = msg;
      if (msg && !first) first = input;
    });
    if (first) first.focus();
    return !first;
  };
  /* Clear a field's error as soon as the person fixes it. */
  H.liveValidate = (form, rules) => {
    form.addEventListener('input', (e) => {
      const name = e.target.name;
      if (!rules[name]) return;
      const wrap = e.target.closest('.s-fld');
      if (!wrap || !wrap.classList.contains('has-error')) return;
      const msg = rules[name](e.target.value);
      if (!msg) { wrap.classList.remove('has-error'); e.target.setAttribute('aria-invalid', 'false'); const err = form.querySelector(`#f-${name}-err`); if (err) err.textContent = ''; }
    });
  };
  H.me = () => {
    const u = App.auth && App.auth.user;
    return u ? { name: u.name || '', contact: u.email || (u.phone ? H.formatContact(u.phone) : ''), zip: u.zip || '' } : { name: '', contact: '', zip: '' };
  };

  /* Calendar file (.ics) download. Times are Pacific. */
  H.ics = (ev) => {
    const d = String(ev.date || '').replace(/-/g, '');
    const m = String(ev.time || '').match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
    let hh = 18, mm = 0;
    if (m) { hh = (+m[1] % 12) + (/p/i.test(m[3]) ? 12 : 0); mm = +m[2]; }
    const start = `${d}T${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}00`;
    const endH = Math.min(23, hh + 2);
    const end = `${d}T${String(endH).padStart(2, '0')}${String(mm).padStart(2, '0')}00`;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const escI = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const url = location.origin + location.pathname + `?county=${SLUG}#/events/${encodeURIComponent(ev.id)}`;
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RCCC Network//County site//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', `UID:${ev.id}@${SLUG}.rccc`, `DTSTAMP:${stamp}`, `DTSTART;TZID=America/Los_Angeles:${start}`, `DTEND;TZID=America/Los_Angeles:${end}`,
      `SUMMARY:${escI(ev.title)}`, `LOCATION:${escI(ev.location)}`, `DESCRIPTION:${escI(`${T.name}. Event details: ${url}`)}`, `URL:${url}`,
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${SLUG}-${String(ev.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)}.ics`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  };

  H.copyLink = (url, msg) => {
    const done = () => toast(msg || 'Link copied. Paste it in a text or email.', 'ok');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
      else done();
    } catch (e) { done(); }
  };

  /* Reveal-on-scroll for elements with .s-reveal */
  let revealObs = null;
  H.reveal = (root) => {
    const els = Array.from((root || document).querySelectorAll('.s-reveal:not(.is-in)'));
    if (REDUCED() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
    if (!revealObs) {
      revealObs = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); revealObs.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });
    }
    els.forEach((e) => revealObs.observe(e));
  };

  /* Leaflet on demand */
  let leafletP = null;
  H.leaflet = () => {
    if (window.L) return Promise.resolve(window.L);
    if (leafletP) return leafletP;
    leafletP = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      css.crossOrigin = '';
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.crossOrigin = '';
      s.onload = () => resolve(window.L);
      s.onerror = () => { leafletP = null; reject(new Error('Map library did not load')); };
      document.head.appendChild(s);
    });
    return leafletP;
  };
  H.tiles = (L) => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  });
  H.pin = (L, ev, active) => L.divIcon({
    className: 's-pin-wrap',
    html: `<span class="s-pin${active ? ' is-active' : ''}"><b>${esc(dateParts(ev.date).mon)}</b><span>${esc(dateParts(ev.date).day)}</span></span>`,
    iconSize: [44, 52], iconAnchor: [22, 50], popupAnchor: [0, -46],
  });

  /* ---------------- site chrome ---------------- */
  const NAV = [
    { href: '#/guide', label: 'Voter Guide', match: 'guide' },
    { href: '#/news', label: 'News', match: 'news' },
    { href: '#/events', label: 'Events', match: 'events' },
    { href: '#/candidates', label: 'Candidates', match: 'candidates' },
    { href: '#/volunteer', label: 'Volunteer', match: 'volunteer' },
    { href: '#/join', label: 'Join', match: 'join' },
  ];
  const APP_URL = `app.html?tenant=${SLUG}`;
  const TOP = FRAMED ? ' target="_top"' : '';

  function brand(extra) {
    return `<a class="s-brand ${extra || ''}" href="#/" aria-label="${esc(T.shortName)} home">
      <span class="s-brand-mark">${STAR(26, 'var(--accent)')}</span>
      <span class="s-brand-text"><span class="s-brand-name">${esc(T.shortName)}</span><span class="s-brand-sub">${esc(T.name)}</span></span>
    </a>`;
  }

  function renderAlert() {
    const host = document.getElementById('s-alert');
    if (!host) return;
    const a = C.alert();
    if (!a) { host.innerHTML = ''; return; }
    host.innerHTML = H.zone('network', `<div class="s-alert" role="region" aria-label="Statewide alert">
      <div class="s-wrap s-alert-in">
        <span class="s-alert-pill">${ICON.lock}<span>Statewide alert</span></span>
        <a class="s-alert-text" href="#/news/${encodeURIComponent(a.id)}">${esc(a.title)} <span class="s-alert-go" aria-hidden="true">${ICON.arrow}</span></a>
        ${a.sample ? H.sample() : ''}
      </div></div>`);
  }

  function renderHeader() {
    const host = document.getElementById('s-header');
    if (!host) return;
    const u = App.auth && App.auth.user;
    const signin = u
      ? `<a class="s-util-link" href="${APP_URL}#/account"${TOP}>${ICON.user}<span>${esc(String(u.name || 'Your account').split(/\s+/)[0])}’s account</span></a>`
      : `<a class="s-util-link" href="${APP_URL}"${TOP}>${ICON.user}<span>Committee sign-in</span></a>`;
    host.innerHTML = `
      <div class="s-util">
        <div class="s-wrap s-util-in">
          <span class="s-util-note">${esc(T.name)}${T.domain ? ` · ${esc(T.domain)}` : ''}</span>
          <span class="s-util-links">
            <a class="s-util-link" href="https://voterstatus.sos.ca.gov/" target="_blank" rel="noopener">Check your registration ${ICON.out}</a>
            ${signin}
          </span>
        </div>
      </div>
      ${H.zone('local', `<header class="s-header" id="s-header-bar">
        <div class="s-wrap s-header-in">
          ${brand()}
          <nav class="s-nav" aria-label="Main">
            ${NAV.map((n) => `<a class="s-nav-link" href="${n.href}" data-match="${n.match}">${esc(n.label)}</a>`).join('')}
          </nav>
          <div class="s-header-cta">
            <a class="s-btn s-btn-accent s-donate-btn" href="#/donate" data-match="donate">${ICON.heart}<span>Donate</span></a>
            <button class="s-menu-btn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="s-menu">${ICON.menu}<span>Menu</span></button>
          </div>
        </div>
      </header>`, 'id="s-header-zone"')}`;
    markNav();
  }

  function renderMenu() {
    const host = document.getElementById('s-menu');
    if (!host) return;
    const u = App.auth && App.auth.user;
    host.innerHTML = `<div class="s-menu-sheet" role="dialog" aria-modal="true" aria-label="Menu">
        <div class="s-menu-head">${brand('is-small')}<button class="s-icon-btn s-menu-close" type="button" aria-label="Close menu">${ICON.x}</button></div>
        <nav class="s-menu-nav" aria-label="Main">
          <a href="#/" data-match="home">Home</a>
          ${NAV.map((n) => `<a href="${n.href}" data-match="${n.match}">${esc(n.label)}<span aria-hidden="true">${ICON.arrow}</span></a>`).join('')}
        </nav>
        <a class="s-btn s-btn-accent s-btn-block" href="#/donate">${ICON.heart}<span>Donate to ${esc(T.shortName)}</span></a>
        <div class="s-menu-foot">
          <a href="https://voterstatus.sos.ca.gov/" target="_blank" rel="noopener">Check your registration ${ICON.out}</a>
          <a href="${APP_URL}${u ? '#/account' : ''}"${TOP}>${u ? `${esc(String(u.name || '').split(/\s+/)[0] || 'Your')}’s account` : 'Committee sign-in'}</a>
        </div>
      </div>`;
  }

  let menuOpen = false;
  function setMenu(open) {
    menuOpen = open;
    const host = document.getElementById('s-menu');
    if (!host) return;
    host.classList.toggle('is-open', open);
    host.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.documentElement.classList.toggle('s-locked', open);
    document.querySelectorAll('.s-menu-btn').forEach((b) => b.setAttribute('aria-expanded', String(open)));
    if (open) {
      host.hidden = false;
      requestAnimationFrame(() => { const f = host.querySelector('.s-menu-nav a'); if (f) f.focus(); });
    } else {
      const b = document.querySelector('.s-menu-btn');
      if (b && host.contains(document.activeElement)) b.focus();
    }
  }

  function renderFooter() {
    const host = document.getElementById('s-footer');
    if (!host) return;
    const year = new Date().getFullYear();
    const g = C.guide();
    const foot = C.localAd('FOOTER_BANNER');
    host.innerHTML = `
      ${foot ? `<div class="s-wrap s-footer-ad">${H.zone('local', H.adSlot(foot, 's-ad-banner'))}</div>` : ''}
      ${H.zone('local', `<footer class="s-footer">
        <div class="s-wrap">
          <div class="s-footer-top">
            <div class="s-footer-about">
              ${brand('is-footer')}
              <p>${esc(C.tagline())}</p>
              <a class="s-btn s-btn-accent" href="#/donate">${ICON.heart}<span>Donate</span></a>
            </div>
            <nav class="s-footer-col" aria-label="Get involved"><h2>Get involved</h2>
              <a href="#/volunteer">Volunteer</a><a href="#/join">Become a member</a><a href="#/events">Events</a><a href="#/donate">Donate</a></nav>
            <nav class="s-footer-col" aria-label="Elections"><h2>Elections</h2>
              ${g ? '<a href="#/guide">Voter guide</a>' : ''}<a href="#/candidates">Endorsed candidates</a>
              <a href="https://voterstatus.sos.ca.gov/" target="_blank" rel="noopener">Check your registration ${ICON.out}</a>
              <a href="https://www.sos.ca.gov/elections/ballot-status/wheres-my-ballot" target="_blank" rel="noopener">Track your ballot ${ICON.out}</a></nav>
            <nav class="s-footer-col" aria-label="This site"><h2>${esc(T.shortName)}</h2>
              <a href="#/news">News</a><a href="#/">Home</a>
              <a href="${APP_URL}"${TOP}>Committee sign-in</a></nav>
          </div>
          <div class="s-footer-legal">
            <p class="s-paidfor">${esc(C.paidFor())}</p>
            <p class="s-legal-small">Contributions to ${esc(T.shortName)} are not tax deductible for federal income tax purposes. © ${year} ${esc(T.name)}. Items marked “Sample” are example content.</p>
          </div>
        </div>
      </footer>`)}`;
  }

  function markNav() {
    const r = Site.route ? Site.route.name : '';
    const key = r === 'event' ? 'events' : r === 'article' ? 'news' : r === 'actItem' ? 'act' : r;
    document.querySelectorAll('[data-match]').forEach((a) => {
      const on = a.dataset.match === key || (key === 'home' && a.dataset.match === 'home');
      a.classList.toggle('is-current', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  /* ---------------- router ---------------- */
  const pages = {};
  function parse() {
    const h = (location.hash || '').replace(/^#\/?/, '');
    const parts = h.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch (e) { return s; } });
    const [a, b] = parts;
    if (!a) return { name: 'home' };
    if (a === 'events' && b) return { name: 'event', id: b };
    if (a === 'news' && b) return { name: 'article', id: b };
    if (a === 'act' && b) return { name: 'actItem', id: b };
    if (pages[a]) return { name: a };
    return { name: 'notfound', path: h };
  }

  let renderSeq = 0;
  let currentCleanup = null;
  function render(opts) {
    const o = opts || {};
    const route = parse();
    const main = document.getElementById('main');
    if (!main) return;
    const prevName = Site.route && Site.route.name;
    Site.route = route;
    const seq = ++renderSeq;
    const page = pages[route.name] || pages.notfound;
    const draw = () => {
      if (seq !== renderSeq) return;
      if (currentCleanup) { try { currentCleanup(); } catch (e) { /* ignore */ } currentCleanup = null; }
      const view = document.createElement('div');
      view.className = 's-view s-view-' + route.name;
      let res = {};
      try { res = page(view, route) || {}; }
      catch (err) {
        console.error('[site] page error', err);
        view.innerHTML = `<section class="s-wrap s-empty-page"><h1>This page didn’t load</h1><p>Something went wrong on our end. The rest of the site still works.</p><a class="s-btn s-btn-primary" href="#/">Go to the home page</a></section>`;
      }
      main.innerHTML = '';
      main.appendChild(view);
      currentCleanup = res.cleanup || null;
      const title = res.title ? `${res.title} · ${T.shortName}` : `${T.shortName} · ${T.name}`;
      document.title = title;
      setMeta(res.description);
      markNav();
      Site.zones.count();
      H.reveal(view);
      if (!o.live) {
        if (!o.keepScroll) window.scrollTo(0, 0);
        if (!REDUCED()) { view.classList.add('is-entering'); requestAnimationFrame(() => requestAnimationFrame(() => view.classList.remove('is-entering'))); }
        if (o.focus !== false && prevName) {
          const h1 = view.querySelector('h1');
          if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
        }
      }
      if (res.after) try { res.after(); } catch (e) { console.error(e); }
    };
    const old = main.firstElementChild;
    if (old && !o.live && prevName && !REDUCED()) {
      old.classList.add('is-leaving');
      setTimeout(draw, 140);
    } else draw();
  }

  function setMeta(desc) {
    const d = desc || `${T.name}: ${C.tagline()}`;
    const m = document.querySelector('meta[name="description"]');
    if (m) m.setAttribute('content', d);
    const og = document.querySelector('meta[property="og:description"]');
    if (og) og.setAttribute('content', d);
    const ot = document.querySelector('meta[property="og:title"]');
    if (ot) ot.setAttribute('content', document.title);
  }

  /* ---------------- zones overlay ---------------- */
  const zones = {
    on: ZONES_PARAM,
    set(on) {
      zones.on = !!on;
      document.documentElement.classList.toggle('s-zones-on', zones.on);
      zones.count();
    },
    count() {
      const all = Array.from(document.querySelectorAll('.s-zone')).filter((z) => z.offsetParent !== null || z.getClientRects().length);
      const net = all.filter((z) => z.dataset.zone === 'network').length;
      const loc = all.length - net;
      if (FRAMED) try { window.parent.postMessage({ type: 'rccc-site', zones: zones.on, network: net, local: loc, route: (Site.route || {}).name, title: document.title }, location.origin); } catch (e) { /* ignore */ }
      return { network: net, local: loc };
    },
  };
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'rccc-preview') return;
    if ('zones' in e.data) zones.set(e.data.zones);
    if (e.data.ping) zones.count();
  });

  /* ---------------- live updates ---------------- */
  let liveTimer = 0;
  function liveRefresh(detail) {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      readSession();
      renderAlert();
      renderHeader();
      renderMenu();
      renderFooter();
      const r = Site.route || {};
      const formBusy = document.querySelector('#main form[data-dirty="1"]');
      if (formBusy) { Site.zones.count(); return; }
      const y = window.scrollY;
      render({ live: true, keepScroll: true, focus: false });
      window.scrollTo(0, y);
      if (detail && detail.announce) toast(detail.announce, 'info');
      void r;
    }, 120);
  }
  let ownWrite = 0;
  /* Writes made by this page re-render their own block; skip the live refresh they trigger. */
  function quietly(fn) { ownWrite++; try { return fn(); } finally { ownWrite--; } }
  function watch() {
    const guard = (k, fn) => (d) => { if (!ownWrite) fn(k, d); };
    const onScoped = (k, d) => {
      if (d && d.type === 'add' && k === 'posts' && d.doc && (d.doc.status || 'published') === 'published') liveRefresh({ announce: `New from ${T.shortName}: ${d.doc.title || ''}` });
      else liveRefresh();
    };
    ['posts', 'events', 'localAds', 'siteSettings', 'rsvps', 'volunteers', 'memberships', 'donations', 'campaignSites', 'candidates', 'candidateStatus', 'petitions', 'signatures', 'networkPrefs', 'hiddenPushes', 'pinnedPushes', 'reset']
      .forEach((k) => Store.on(k, guard(k, onScoped)));
    ['networkPushes', 'networkAds', 'session', 'accounts', 'reset'].forEach((k) => Store.global.on(k, guard(k, () => liveRefresh())));
  }

  /* ---------------- boot ---------------- */
  function applyTheme() {
    const c = T.colors || { brand: '#0B2A4A', brandInk: '#FFFFFF', accent: '#C8102E' };
    const root = document.documentElement;
    root.dataset.tenant = SLUG;
    root.style.setProperty('--brand', c.brand);
    root.style.setProperty('--brand-ink', c.brandInk || '#fff');
    root.style.setProperty('--accent', c.accent);
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', c.brand);
    const ogs = document.querySelector('meta[property="og:site_name"]');
    if (ogs) ogs.setAttribute('content', T.name || '');
    const ogu = document.querySelector('meta[property="og:url"]');
    if (ogu) ogu.setAttribute('content', `https://${T.domain || location.host}/`);
    if (FRAMED) root.classList.add('s-framed');
  }

  function boot() {
    applyTheme();
    readSession();
    zones.set(ZONES_PARAM);
    renderAlert();
    renderHeader();
    renderMenu();
    renderFooter();

    document.addEventListener('click', (e) => {
      const mb = e.target.closest('.s-menu-btn');
      if (mb) { setMenu(!menuOpen); return; }
      if (e.target.closest('.s-menu-close') || e.target.id === 's-menu') { setMenu(false); return; }
      const inMenuLink = e.target.closest('#s-menu a');
      if (inMenuLink) setMenu(false);
      const ad = e.target.closest('[data-act="ad"]');
      if (ad) {
        toast(ad.dataset.kind === 'network'
          ? `${ad.dataset.sponsor} sponsors this space on county sites across California. This is a sample ad.`
          : `${ad.dataset.sponsor} sponsors this space on the ${T.shortName} site. This is a sample ad.`, 'info');
        return;
      }
      /* Same-route links (for example Home while on home) still scroll to the top. */
      const a = e.target.closest('a[href^="#/"]');
      if (a && a.getAttribute('href') === location.hash && !e.metaKey && !e.ctrlKey) { e.preventDefault(); window.scrollTo({ top: 0, behavior: REDUCED() ? 'auto' : 'smooth' }); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) setMenu(false); });

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; document.documentElement.classList.toggle('s-scrolled', window.scrollY > 40); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    window.addEventListener('hashchange', () => { if (menuOpen) setMenu(false); render(); });
    watch();
    render({ focus: false });
  }

  window.Site = {
    slug: SLUG, t: T, framed: FRAMED, util, esc, icon: ICON, star: STAR, starPts, H, C, V, dateParts, ago, toMs, todayIso, clean,
    toast, modal, reduced: REDUCED, isMine, visitorId, zones, pages, quietly,
    register(name, fn) { pages[name] = fn; },
    go(path) { const p = '#/' + String(path || '').replace(/^#?\/?/, ''); if (location.hash === p) render(); else location.hash = p; },
    rerender: () => render({ live: true, keepScroll: true, focus: false }),
    route: null,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();
