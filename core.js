/* core.js — window.App: registry, hash router, tenant/role state, util, toast, modal.
   Classic script, ES2020, no dependencies. */
(function () {
  'use strict';

  const GROUPS = ['Overview', 'Public Site', 'Committee Portal', 'Candidate Tools',
    'Field & Governance', 'Master Network', 'AI Engine'];

  const ROLES = [
    { id: 'master', label: 'Master Network Admin' },
    { id: 'board', label: 'Executive Board' },
    { id: 'member', label: 'Committee Member' },
    { id: 'volunteer', label: 'Volunteer' },
    { id: 'public', label: 'Public visitor' },
  ];

  const FALLBACK_TENANTS = {
    svgop: { slug: 'svgop', name: 'Santa Clara County Republican Party', shortName: 'SVGOP',
      county: 'Santa Clara County', colors: { brand: '#0B2A4A', brandInk: '#FFFFFF', accent: '#C8102E' } },
    demo: { slug: 'demo', name: 'Demo County Republican Party', shortName: 'Demo County GOP',
      county: 'Demo County', colors: { brand: '#14532D', brandInk: '#FFFFFF', accent: '#B7791F' } },
  };
  const TENANT_LABEL = { svgop: 'SVGOP — Santa Clara County', demo: 'Demo County GOP' };

  /* ---------------- util ---------------- */
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
      const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return '?';
      const first = parts[0][0] || '';
      const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
      return (first + last).toUpperCase();
    },
    avatar(name, size) {
      const s = Number(size) || 32;
      const c = AVATAR_COLORS[hash(String(name || '')) % AVATAR_COLORS.length];
      const fs = Math.round(s * 0.4);
      return `<svg class="avatar" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" role="img" aria-label="${util.esc(name)}">` +
        `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="${c}"/>` +
        `<text x="50%" y="50%" dy=".35em" text-anchor="middle" fill="#fff" font-family="Public Sans, system-ui, sans-serif" font-weight="700" font-size="${fs}">${util.esc(util.initials(name))}</text></svg>`;
    },
    /* Round headshot for a candidate: their photo when they have one, else the initials avatar.
       opts: { shape: 'circle'|'rounded'|'square', w, h } (w/h override size for non-square crops) */
    candidatePhoto(c, size, opts) {
      const o = opts || {};
      if (!c || !c.photo) return util.avatar(c ? c.name : '', size);
      const w = Number(o.w || size) || 32, h = Number(o.h || size) || 32;
      const r = o.shape === 'square' ? '0' : o.shape === 'rounded' ? Math.round(Math.min(w, h) * 0.12) + 'px' : '50%';
      return `<img class="cand-photo" src="${util.esc(c.photo)}" alt="${util.esc(c.name)}" width="${w}" height="${h}" loading="lazy" ` +
        `style="width:${w}px;height:${h}px;max-width:100%;object-fit:cover;object-position:${util.esc(c.photoPos || '50% 25%')};border-radius:${r};display:inline-block;flex:none;background:#e5e7eb">`;
    },
    /* mulberry32 seeded PRNG; seed may be a number or string */
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
    sleep(ms) { return new Promise((r) => setTimeout(r, ms)); },
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
    disclaimer(c) {
      c = c || {};
      return c.disclaimer || `Paid for by ${c.committeeName}, FPPC #${c.fppcId}`;
    },
  };

  /* ---------------- state ---------------- */
  const registry = [];
  const state = { tenant: 'svgop', role: 'board' };
  let current = { id: '', sub: '' };
  let booted = false;

  function data() { return window.DATA || null; }
  function tenants() { return (data() && data().tenants) || FALLBACK_TENANTS; }
  function tenantObj() { return tenants()[state.tenant] || tenants().svgop || FALLBACK_TENANTS.svgop; }
  function roleLabel(id) { const r = ROLES.find((x) => x.id === id); return r ? r.label : id; }

  /* Which groups a role would normally lack in production (demo still opens them). */
  function isLocked(group, role) {
    if (group === 'Master Network') return role !== 'master';
    if (role === 'public' && (group === 'Committee Portal' || group === 'Field & Governance')) return true;
    return false;
  }

  /* ---------------- DOM helpers ---------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);

  const LOCK_SVG = '<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>';
  const DEFAULT_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="14" height="14" rx="3"/></svg>';

  /* ---------------- toast ---------------- */
  function toast(msg, kind) {
    let host = $('#toasts');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toasts';
      document.body.appendChild(host);
    }
    host.setAttribute('aria-live', 'polite');
    const t = document.createElement('div');
    t.className = 'toast toast-' + (kind || 'info');
    t.setAttribute('role', 'status');
    t.innerHTML = `<span class="toast-dot" aria-hidden="true"></span><span class="toast-msg">${util.esc(msg)}</span>`;
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    const kill = () => { t.classList.remove('in'); t.classList.add('out'); setTimeout(() => t.remove(), 250); };
    const timer = setTimeout(kill, 3500);
    t.addEventListener('click', () => { clearTimeout(timer); kill(); });
    while (host.children.length > 4) host.firstElementChild.remove();
    return t;
  }

  /* ---------------- modal ---------------- */
  let modalStack = [];
  function modal(opts) {
    opts = opts || {};
    const prevFocus = document.activeElement;
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    const id = 'modal-title-' + Date.now();
    back.innerHTML =
      `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="${id}">` +
      `<div class="modal-head"><h2 id="${id}">${util.esc(opts.title || '')}</h2>` +
      `<button class="btn btn-ghost btn-sm modal-x" aria-label="Close">` +
      `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg></button></div>` +
      `<div class="modal-body">${opts.html || ''}</div>` +
      `<div class="modal-foot"></div></div>`;
    const foot = $('.modal-foot', back);
    const actions = opts.actions && opts.actions.length ? opts.actions : [{ label: 'Close', primary: true }];
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      back.classList.remove('in');
      modalStack = modalStack.filter((m) => m !== api);
      setTimeout(() => back.remove(), 180);
      if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* ignore */ }
    }
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.primary ? 'btn-primary' : 'btn-ghost');
      b.textContent = a.label;
      b.addEventListener('click', () => {
        let keep = false;
        try { keep = a.onClick ? a.onClick(api) === false : false; } catch (e) { console.error(e); }
        if (!keep) close();
      });
      foot.appendChild(b);
    });
    $('.modal-x', back).addEventListener('click', close);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    function focusables() {
      return Array.from(back.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
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
        else if (!back.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    const api = { el: back, body: $('.modal-body', back), close };
    modalStack.push(api);
    requestAnimationFrame(() => {
      back.classList.add('in');
      const primary = $('.modal-foot .btn-primary', back) || focusables()[0];
      if (primary) primary.focus();
    });
    return api;
  }

  /* ---------------- tenant theming ---------------- */
  function applyTenant() {
    const t = tenantObj();
    const c = t.colors || FALLBACK_TENANTS[state.tenant].colors;
    const root = document.documentElement;
    root.dataset.tenant = state.tenant;
    root.dataset.role = state.role;
    root.style.setProperty('--brand', c.brand);
    root.style.setProperty('--brand-ink', c.brandInk || '#fff');
    root.style.setProperty('--accent', c.accent);
    const wm = $('#wordmark-name');
    if (wm) wm.textContent = t.shortName || t.name;
    const wmSub = $('#wordmark-sub');
    if (wmSub) wmSub.textContent = t.county || t.name || '';
    const sel = $('#tenant-select');
    if (sel) sel.value = state.tenant;
    const rs = $('#role-select');
    if (rs) rs.value = state.role;
    document.title = `${t.shortName || t.name} · RCCC (Republican County Central Committee) Network prototype`;
  }

  function syncQuery() {
    try {
      const u = new URL(location.href);
      u.searchParams.set('tenant', state.tenant);
      u.searchParams.set('role', state.role);
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) { /* ignore */ }
  }

  /* ---------------- nav ---------------- */
  function renderNav() {
    const nav = $('#nav-list');
    if (!nav) return;
    let html = '';
    GROUPS.forEach((g) => {
      const items = registry.filter((s) => (s.group || 'Overview') === g);
      if (!items.length) return;
      const locked = isLocked(g, state.role);
      html += `<div class="nav-group"><div class="nav-group-label">${util.esc(g)}</div>`;
      items.forEach((s) => {
        const active = s.id === current.id;
        html += `<a class="nav-item${active ? ' active' : ''}${locked ? ' is-locked' : ''}" href="#/${util.esc(s.id)}" data-id="${util.esc(s.id)}"${active ? ' aria-current="page"' : ''}>` +
          `<span class="nav-icon">${s.icon || DEFAULT_ICON}</span><span class="nav-text">${util.esc(s.title)}</span>` +
          (locked ? `<span class="lock" title="${util.esc(roleLabel(state.role))} would see this as locked">${LOCK_SVG}</span>` : '') +
          `</a>`;
      });
      html += `</div>`;
    });
    nav.innerHTML = html;
  }

  /* ---------------- router ---------------- */
  function parseHash() {
    const h = (location.hash || '').replace(/^#\/?/, '');
    const [id, ...rest] = h.split('/');
    return { id: decodeURIComponent(id || ''), sub: rest.map(decodeURIComponent).join('/') };
  }

  function findScreen(id) { return registry.find((s) => s.id === id); }

  function ctx() {
    return {
      tenant: tenantObj(),
      tenantSlug: state.tenant,
      network: data() ? data().network : {},
      role: state.role,
      sub: current.sub,
      navigate: go,
      toast,
      modal,
      state,
    };
  }

  function renderCurrent(opts) {
    const main = $('#main');
    if (!main) return;
    if (!data()) {
      main.innerHTML = `<div class="page"><div class="card loading-card"><div class="card-body">` +
        `<div class="spinner" aria-hidden="true"></div><h2>Loading sample data…</h2>` +
        `<p class="muted">The prototype is getting its sample committees ready.</p></div></div></div>`;
      return;
    }
    const screen = findScreen(current.id);
    const el = document.createElement('div');
    el.className = 'screen screen-' + (screen ? screen.id : 'none');
    main.innerHTML = '';
    main.appendChild(el);
    if (!screen) {
      el.innerHTML = `<div class="page"><div class="card"><div class="card-body"><h2>This screen is on its way</h2><p class="muted">Pick another area from the menu.</p></div></div></div>`;
      return;
    }
    try {
      screen.render(el, ctx());
    } catch (err) {
      console.error(`[App] render error in screen "${screen.id}":`, err);
      el.innerHTML = `<div class="page"><div class="card error-card"><div class="card-body">` +
        `<h2>${util.esc(screen.title)} hit a snag</h2>` +
        `<p class="muted">The rest of the prototype keeps working. Pick another area from the menu.</p>` +
        `<p class="small muted">${util.esc(err && err.message ? err.message : String(err))}</p></div></div></div>`;
    }
    if (opts && opts.scroll) window.scrollTo(0, 0);
  }

  function onRoute() {
    const p = parseHash();
    if (!p.id || !findScreen(p.id)) {
      // Unknown route -> overview (only once registrations have settled)
      if (booted && p.id !== 'overview' && findScreen('overview')) {
        history.replaceState(null, '', location.pathname + location.search + '#/overview');
        current = { id: 'overview', sub: '' };
      } else {
        current = { id: p.id || 'overview', sub: p.sub };
      }
    } else {
      current = p;
    }
    const screen = findScreen(current.id);
    if (screen && isLocked(screen.group, state.role) && booted) {
      toast(`Shown for demo — ${roleLabel(state.role)} would see this as locked.`, 'warn');
    }
    closeDrawer();
    renderNav();
    renderCurrent({ scroll: true });
  }

  function go(path) {
    const p = String(path || '').replace(/^#?\/?/, '');
    const target = '#/' + p;
    if (location.hash === target) onRoute();
    else location.hash = target;
  }

  function register(def) {
    if (!def || !def.id || typeof def.render !== 'function') {
      console.error('[App] register() needs {id, render}', def);
      return;
    }
    const i = registry.findIndex((s) => s.id === def.id);
    if (i >= 0) registry.splice(i, 1, def); else registry.push(def);
    if (booted) { renderNav(); if (def.id === current.id) renderCurrent(); }
  }

  /* ---------------- drawer ---------------- */
  function openDrawer() {
    document.body.classList.add('drawer-open');
    const b = $('#menu-btn'); if (b) b.setAttribute('aria-expanded', 'true');
  }
  function closeDrawer() {
    document.body.classList.remove('drawer-open');
    const b = $('#menu-btn'); if (b) b.setAttribute('aria-expanded', 'false');
  }

  /* ---------------- switching ---------------- */
  function setTenant(slug, silent) {
    if (!tenants()[slug] && !FALLBACK_TENANTS[slug]) return;
    state.tenant = slug;
    applyTenant();
    syncQuery();
    renderNav();
    renderCurrent();
    if (!silent) toast(`Now viewing ${tenantObj().name} — same platform, separate committee data.`, 'ok');
  }
  function setRole(role, silent) {
    if (!ROLES.find((r) => r.id === role)) return;
    state.role = role;
    applyTenant();
    syncQuery();
    renderNav();
    renderCurrent();
    if (!silent) toast(`Viewing as ${roleLabel(role)}.`, 'info');
  }

  /* ---------------- shell wiring ---------------- */
  function buildShellControls() {
    const ts = $('#tenant-select');
    if (ts) {
      ts.innerHTML = Object.keys(TENANT_LABEL).map((k) => `<option value="${k}">${util.esc(TENANT_LABEL[k])}</option>`).join('');
      ts.addEventListener('change', () => setTenant(ts.value));
    }
    const rs = $('#role-select');
    if (rs) {
      rs.innerHTML = ROLES.map((r) => `<option value="${r.id}">${util.esc(r.label)}</option>`).join('');
      rs.addEventListener('change', () => setRole(rs.value));
    }
    const tb = $('#start-tour');
    if (tb) tb.addEventListener('click', startTour);
    const mb = $('#menu-btn');
    if (mb) mb.addEventListener('click', () => document.body.classList.contains('drawer-open') ? closeDrawer() : openDrawer());
    const bd = $('#drawer-backdrop');
    if (bd) bd.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('drawer-open') && !modalStack.length) closeDrawer();
    });
    const nav = $('#nav-list');
    if (nav) nav.addEventListener('click', (e) => {
      const a = e.target.closest('.nav-item');
      if (!a) return;
      if (location.hash === '#/' + a.dataset.id) { e.preventDefault(); onRoute(); }
    });
  }

  function startTour() {
    if (window.Tour && typeof window.Tour.start === 'function') window.Tour.start();
    else toast('The guided tour is loading — explore freely in the meantime.', 'info');
  }

  function boot() {
    try {
      const q = new URLSearchParams(location.search);
      const t = q.get('tenant'); const r = q.get('role');
      if (t && (FALLBACK_TENANTS[t] || tenants()[t])) state.tenant = t;
      if (r && ROLES.find((x) => x.id === r)) state.role = r;
    } catch (e) { /* ignore */ }
    buildShellControls();
    applyTenant();
    booted = true;
    if (!location.hash) history.replaceState(null, '', location.pathname + location.search + '#/overview');
    window.addEventListener('hashchange', onRoute);
    onRoute();
    // If DATA arrives late (e.g. slow load), re-render once.
    if (!data()) {
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        if (data()) { clearInterval(iv); applyTenant(); renderNav(); renderCurrent(); }
        else if (tries > 40) clearInterval(iv);
      }, 250);
    }
  }

  window.App = {
    register,
    registry,
    state,
    go,
    navigate: go,
    toast,
    modal,
    util,
    roles: ROLES,
    groups: GROUPS,
    isLocked,
    roleLabel,
    setTenant,
    setRole,
    startTour,
    get ctx() { return ctx(); },
    get route() { return Object.assign({}, current); },
    rerender: () => renderCurrent(),
  };

  // Boot after all classic scripts (screens, tour) have executed.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();
