/* screens/field.js: Field Organizer.
   Sub-routes: '' turf map · 'list' walk lists · 'canvass' door-to-door view for a phone.
   Maps use Leaflet 1.9.4 (cdnjs) over CARTO light tiles. Turf polygons are hand-placed over real
   neighborhoods; households are generated from the seeded sample voter file in data.js.
   Saved state goes through Store: walkResults (per door), turfAssignments (key), fieldShift:<user> (key). */
(function () {
  'use strict';
  if (!window.App) return;

  const U = App.util;
  const esc = (s) => U.esc(s);
  const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
  const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
  const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  const I = (d, s) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = I('<path d="M10 17s5-4.4 5-8.5a5 5 0 0 0-10 0C5 12.6 10 17 10 17z"/><circle cx="10" cy="8.5" r="1.8"/>');
  const IC = {
    locate: '<circle cx="10" cy="10" r="3"/><path d="M10 2v3M10 15v3M2 10h3M15 10h3"/><circle cx="10" cy="10" r="6.2"/>',
    close: '<path d="M5 5l10 10M15 5L5 15"/>',
    back: '<path d="M12 4l-6 6 6 6"/>',
    walk: '<circle cx="11" cy="3.6" r="1.6"/><path d="M8 18l2-6 2.5 2.5V18M10 12l-.6-4 3.6 1.2 2 2.3M9.4 8L6 10v3"/>',
    list: '<path d="M7 5h10M7 10h10M7 15h10"/><circle cx="3.5" cy="5" r="1"/><circle cx="3.5" cy="10" r="1"/><circle cx="3.5" cy="15" r="1"/>',
    print: '<path d="M5 8V3h10v5"/><rect x="2.5" y="8" width="15" height="6.5" rx="1.5"/><path d="M5 12h10v5H5z"/>',
    csv: '<path d="M10 3v10M6 9l4 4 4-4"/><path d="M3 15v2h14v-2"/>',
    undo: '<path d="M7 5L3 9l4 4"/><path d="M3 9h9a5 5 0 0 1 0 10h-2"/>',
    skip: '<path d="M4 5l7 5-7 5zM14 5v10"/>',
    check: '<path d="M4 10.5l4 4 8-9"/>',
    talked: '<path d="M4 5h12v8H9l-4 3v-3H4z"/>',
    not_home: '<path d="M3 9.5L10 4l7 5.5V16H3z"/><path d="M8 11.5l4 4M12 11.5l-4 4"/>',
    refused: '<circle cx="10" cy="10" r="6.5"/><path d="M5.5 14.5l9-9"/>',
    moved: '<path d="M3 10h11M10 6l4 4-4 4"/><path d="M17 4v12"/>',
    yard_sign: '<rect x="3.5" y="3.5" width="13" height="8" rx="1"/><path d="M7 11.5V17M13 11.5V17"/>',
    offline: '<path d="M2 7.5a12 12 0 0 1 16 0M5 10.5a8 8 0 0 1 10 0M8 13.5a4 4 0 0 1 4 0M3 3l14 14"/>',
    plus: '<path d="M10 4v12M4 10h12"/>',
  };

  const RESULTS = [
    { id: 'talked', label: 'Talked', title: 'Talked with a voter at' },
    { id: 'yard_sign', label: 'Yard sign', title: 'Yard sign requested at' },
    { id: 'not_home', label: 'Not home', title: 'Nobody home at' },
    { id: 'refused', label: 'Refused', title: 'Declined to talk at' },
    { id: 'moved', label: 'Moved', title: 'Voter moved from' },
  ];
  const RESULT_LABEL = Object.fromEntries(RESULTS.map((r) => [r.id, r.label]));
  const SUPPORT = { 1: 'Strong no', 2: 'Leans no', 3: 'Undecided', 4: 'Leans yes', 5: 'Strong yes' };
  const PARTY = { REP: 'Republican', NPP: 'No party preference', DEM: 'Democrat', OTHER: 'Other party' };
  const PARTY_SHORT = { REP: 'REP', NPP: 'NPP', DEM: 'DEM', OTHER: 'Other' };

  /* ---------------- geography ----------------
     Hand-placed turf shapes: center [lat, lng], radii in meters at even angles, and a rotation.
     Each turf is roughly 0.6 to 1.2 km across. Order matches tenant.turfs in data.js. */
  const GEO = {
    svgop: {
      turfs: [
        { c: [37.4452, -121.8805], r: [520, 470, 560, 430, 500, 540, 450, 490, 530, 470], rot: 0.25 },   // Milpitas Hillside
        { c: [37.4002, -122.0050], r: [480, 520, 440, 500, 470, 530, 460, 510, 450, 490], rot: 0.05 },   // Sunnyvale Lakewood
        { c: [37.3214, -122.0638], r: [560, 500, 540, 460, 590, 520, 480, 560, 500, 530], rot: 0.4 },    // Cupertino Foothills
        { c: [37.3022, -121.9082], r: [430, 470, 400, 450, 480, 420, 460, 410, 470, 440], rot: -0.3 },   // Willow Glen West
        { c: [37.2873, -121.9450], r: [400, 440, 380, 430, 410, 450, 390, 420, 440, 400], rot: 0.15 },   // Campbell Downtown
        { c: [37.1305, -121.6540], r: [500, 460, 540, 480, 520, 470, 550, 490, 510, 470], rot: -0.15 },  // Morgan Hill Central
      ],
    },
    demo: {
      sample: 'Demo County is fictional. Its turfs are drawn over Visalia, Exeter, Farmersville and Tulare.',
      turfs: [
        { c: [36.3445, -119.3010], r: [540, 500, 580, 520, 560, 490, 570, 510, 550, 500], rot: 0 },      // Riverbend North
        { c: [36.3130, -119.2950], r: [500, 540, 480, 560, 510, 530, 470, 550, 500, 520], rot: 0.3 },    // Riverbend South
        { c: [36.2960, -119.1425], r: [460, 420, 500, 440, 480, 430, 490, 450, 470, 440], rot: -0.2 },   // Oak Hollow
        { c: [36.2990, -119.2065], r: [420, 460, 400, 450, 430, 470, 410, 440, 460, 420], rot: 0.1 },    // Cedar Flats
        { c: [36.2095, -119.3330], r: [520, 480, 550, 500, 530, 470, 540, 490, 520, 500], rot: 0.2 },    // Millbrook East
        { c: [36.2075, -119.3620], r: [480, 520, 460, 500, 540, 490, 470, 510, 480, 500], rot: -0.25 },  // Millbrook West
      ],
    },
  };
  /* The sample member account in each county starts with a turf near their ZIP. */
  const DEFAULT_MEMBER_TURF = { svgop: 2, demo: 4 };

  const M_PER_DEG = 111320;
  function toLL(c, x, y) { return [c[0] + y / M_PER_DEG, c[1] + x / (M_PER_DEG * Math.cos(c[0] * Math.PI / 180))]; }
  function inPoly(ring, p) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  /* ---------------- module lifetime ---------------- */
  const live = { maps: [], offs: [] };
  function teardown() {
    live.maps.forEach((m) => { try { m.remove(); } catch (e) { /* already gone */ } });
    live.offs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
    live.maps = []; live.offs = [];
  }
  function listen(target, type, fn) { target.addEventListener(type, fn); live.offs.push(() => target.removeEventListener(type, fn)); }
  function reduceMotion() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function isSheet() { return window.innerWidth < 768; }

  let leafletP = null;
  function loadLeaflet() {
    if (window.L && window.L.map && document.getElementById('leaflet-css')) return Promise.resolve(window.L);
    if (leafletP) return leafletP;
    const css = new Promise((resolve) => {
      let l = document.getElementById('leaflet-css');
      if (l) { resolve(); return; }
      l = document.createElement('link');
      l.id = 'leaflet-css'; l.rel = 'stylesheet'; l.href = LEAFLET_CSS; l.crossOrigin = 'anonymous';
      l.onload = () => resolve(); l.onerror = () => resolve();
      document.head.appendChild(l);
    });
    const js = new Promise((resolve, reject) => {
      if (window.L && window.L.map) { resolve(window.L); return; }
      const s = document.createElement('script');
      s.src = LEAFLET_JS; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = () => (window.L ? resolve(window.L) : reject(new Error('Map library missing')));
      s.onerror = () => { s.remove(); reject(new Error('Map library failed to load')); };
      document.head.appendChild(s);
    });
    leafletP = Promise.all([css, js]).then(([, L]) => L).catch((e) => { leafletP = null; throw e; });
    return leafletP;
  }
  function baseMap(L, node, opts) {
    const map = L.map(node, Object.assign({ zoomControl: false, scrollWheelZoom: false, zoomSnap: 0.25, attributionControl: true }, opts || {}));
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR, className: 'f-tiles' }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    // Wheel zoom only after the person clicks into the map, so page scrolling never gets trapped.
    map.on('click focus', () => map.scrollWheelZoom.enable());
    map.on('mouseout blur', () => map.scrollWheelZoom.disable());
    live.maps.push(map);
    return map;
  }
  function flyBounds(map, b, pad) {
    pad = pad || {};
    const o = { paddingTopLeft: pad.tl || [30, 30], paddingBottomRight: pad.br || [30, 30], maxZoom: pad.maxZoom || 16 };
    if (reduceMotion()) map.fitBounds(b, Object.assign(o, { animate: false }));
    else map.flyToBounds(b, Object.assign(o, { duration: 0.85, easeLinearity: 0.2 }));
  }

  /* ---------------- model ---------------- */
  const cache = {};
  function geoFor(slug, t) {
    if (GEO[slug]) return GEO[slug];
    // Unknown county: lay its turfs out on a small grid near Sacramento, marked as a sample area.
    return { sample: 'This county has no turf boundaries yet, so its turfs are drawn on a sample area.',
      turfs: t.turfs.map((x, i) => ({ c: [38.575 + Math.floor(i / 3) * 0.02, -121.49 + (i % 3) * 0.025], r: [450, 480, 430, 470, 460, 490, 440, 470], rot: 0 })) };
  }
  function model(ctx) {
    const t = ctx.tenant, slug = ctx.tenantSlug;
    if (cache[slug] && cache[slug].t === t) return cache[slug];
    const geo = geoFor(slug, t);
    const turfs = t.turfs.map((tf, i) => {
      const g = geo.turfs[i % geo.turfs.length];
      const n = g.r.length;
      const ring = g.r.map((r, k) => { const a = g.rot + (k / n) * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r]; });
      const R = g.r.reduce((s, x) => s + x, 0) / n;
      const voters = t.voters.filter((v) => v.turfId === tf.id);
      const byStreet = new Map();
      voters.forEach((v) => {
        const mm = /^(\d+)\s+(.+)$/.exec(v.address) || [0, '0', v.address];
        if (!byStreet.has(mm[2])) byStreet.set(mm[2], []);
        byStreet.get(mm[2]).push({ v, num: Number(mm[1]), street: mm[2] });
      });
      const households = [];
      Array.from(byStreet.values()).forEach((list, si, all) => {
        list.sort((a, b) => a.num - b.num);
        const th = g.rot + 0.35 + si * 0.07;
        const ux = Math.cos(th), uy = Math.sin(th), px = -uy, py = ux;
        const off = (si - (all.length - 1) / 2) * 0.42 * R;
        list.forEach((h, k) => {
          const pos = list.length === 1 ? 0 : (k / (list.length - 1) - 0.5) * 1.15 * R;
          const side = h.num % 2 ? 1 : -1;
          let x = ux * pos + px * (off + side * 13), y = uy * pos + py * (off + side * 13);
          for (let guard = 0; guard < 12 && !inPoly(ring, [x, y]); guard++) { x *= 0.88; y *= 0.88; }
          const r = U.seeded(h.v.id + ':hh');
          const knownSupport = r() < 0.55;
          const lean = { REP: 4, NPP: 3, OTHER: 3, DEM: 2 }[h.v.party] || 3;
          const support = knownSupport ? Math.max(1, Math.min(5, lean + Math.round(r() * 2 - 1))) : null;
          const size = 1 + Math.floor(r() * 3.4);
          const ll = toLL(g.c, x, y);
          households.push({
            id: h.v.id, name: h.v.first + ' ' + h.v.last, first: h.v.first, last: h.v.last,
            address: h.v.address, num: h.num, street: h.street, city: h.v.city, precinct: h.v.precinct,
            party: h.v.party, turnout: h.v.propensity, support, size, turfId: tf.id,
            x, y, lat: ll[0], lng: ll[1],
          });
        });
      });
      return Object.assign({}, tf, {
        color: tf.color || '#2563EB', center: g.c, poly: ring.map(([x, y]) => toLL(g.c, x, y)), households,
      });
    });
    const byId = {}; turfs.forEach((x) => { byId[x.id] = x; });
    const hh = {}; turfs.forEach((x) => x.households.forEach((h) => { hh[h.id] = h; }));
    cache[slug] = { t, slug, geo, turfs, byId, hh };
    return cache[slug];
  }

  /* ---------------- saved data ---------------- */
  function resultsIndex() {
    const list = (window.Store ? Store.list('walkResults') : []).filter((r) => r && r.turfId);
    const byVoter = {};
    list.forEach((r) => {
      if (!r.voterId) return;
      const p = byVoter[r.voterId];
      if (!p || String(r.createdAt || '') >= String(p.createdAt || '')) byVoter[r.voterId] = r;
    });
    return { list, byVoter };
  }
  function turfNumbers(tf, idx) {
    const rs = idx.list.filter((r) => r.turfId === tf.id);
    const uniq = new Set(rs.map((r) => r.voterId || r.id)).size;
    const knocked = Math.min(tf.doors, tf.done + uniq);
    return {
      knocked, doors: tf.doors, left: tf.doors - knocked, pct: tf.doors ? knocked / tf.doors : 0,
      saved: rs.length,
      talked: rs.filter((r) => r.result === 'talked' || r.result === 'yard_sign').length,
      signs: rs.filter((r) => r.result === 'yard_sign').length,
    };
  }
  function supportOf(h, idx) { const l = idx.byVoter[h.id]; return (l && l.support) || h.support; }
  function knockedNow(h, idx) { const l = idx.byVoter[h.id]; return !!(l && l.result !== 'not_home'); }

  function walkers(ctx) {
    const t = ctx.tenant, out = [], seen = new Set();
    (t.volunteers || []).forEach((v) => { out.push({ id: v.id, name: v.name, kind: 'team', seed: v.doors || 0 }); seen.add(v.name.toLowerCase()); });
    (window.Store ? Store.list('volunteers') : []).forEach((d) => {
      if (!d || !d.name) return;
      const k = String(d.name).toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ id: d.id, name: d.name, kind: 'signup', seed: 0, userId: d.createdBy || null });
    });
    (t.members || []).filter((m) => m.role !== 'VOLUNTEER').forEach((m) => {
      const k = m.name.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ id: m.id, name: m.name, kind: 'member', seed: 0 });
    });
    return out;
  }
  function defaultAssignments(ctx, m) {
    const a = {};
    m.turfs.forEach((tf) => { a[tf.id] = tf.volunteerId ? [tf.volunteerId] : []; });
    const acct = ((window.DATA && DATA.sampleAccounts) || []).find((x) => x.tenant === ctx.tenantSlug && x.role === 'member');
    const ti = DEFAULT_MEMBER_TURF[ctx.tenantSlug];
    if (acct && acct.memberId && ti != null && m.turfs[ti]) a[m.turfs[ti].id].push(acct.memberId);
    return a;
  }
  function assignments(ctx, m) {
    const saved = window.Store ? Store.get('turfAssignments', null) : null;
    const base = defaultAssignments(ctx, m);
    if (!saved || typeof saved !== 'object') return base;
    const out = {};
    m.turfs.forEach((tf) => { out[tf.id] = Array.isArray(saved[tf.id]) ? saved[tf.id].slice() : base[tf.id]; });
    return out;
  }
  function myWalkerIds(ctx) {
    const u = ctx.user;
    if (!u) return [];
    const ids = [u.memberId, u.id].filter(Boolean);
    (window.Store ? Store.list('volunteers') : []).forEach((d) => { if (d && d.createdBy === u.id) ids.push(d.id); });
    return ids;
  }
  function myTurfs(ctx, m, asg) {
    const mine = new Set(myWalkerIds(ctx));
    return m.turfs.filter((tf) => (asg[tf.id] || []).some((id) => mine.has(id)));
  }
  function walkerDoors(w, idx) {
    return w.seed + idx.list.filter((r) => r.walkerId === w.id || (w.userId && r.createdBy === w.userId)).length;
  }

  /* ---------------- routing ---------------- */
  function routeOrder(hhs) {
    if (hhs.length < 2) return hhs.slice();
    const pts = hhs.slice().sort((a, b) => a.x - b.x || a.y - b.y || (a.id < b.id ? -1 : 1));
    const route = [pts[0]];
    const rest = new Set(pts.slice(1));
    while (rest.size) {
      const cur = route[route.length - 1];
      let best = null, bd = Infinity;
      rest.forEach((p) => { const d = dist(cur, p); if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && p.id < best.id)) { bd = d; best = p; } });
      route.push(best); rest.delete(best);
    }
    // 2-opt pass to remove crossings (open path, deterministic).
    let improved = true, pass = 0;
    while (improved && pass++ < 30) {
      improved = false;
      for (let i = 0; i < route.length - 2; i++) {
        for (let k = i + 1; k < route.length - 1; k++) {
          const a = route[i], b = route[i + 1], c = route[k], d = route[k + 1];
          if (dist(a, c) + dist(b, d) < dist(a, b) + dist(c, d) - 0.5) {
            const seg = route.slice(i + 1, k + 1).reverse();
            route.splice(i + 1, seg.length, ...seg);
            improved = true;
          }
        }
      }
    }
    return route;
  }
  function routeMeters(route) { let s = 0; for (let i = 1; i < route.length; i++) s += dist(route[i - 1], route[i]); return s; }
  function routeSummary(route) {
    const miles = routeMeters(route) / 1609.34;
    const mins = Math.round(route.length * 3 + routeMeters(route) / 75);
    return { miles, mins, text: `About ${miles < 0.95 ? miles.toFixed(1) : miles.toFixed(1)} miles and ${mins} minutes on foot` };
  }

  /* ---------------- UI state (not saved) ---------------- */
  function S() {
    const st = App.state;
    st.field_sel = st.field_sel || {};
    st.field_panel = st.field_panel || 'turfs';
    st.field_wl = st.field_wl || {};
    return st;
  }
  function wlState(ctx, m, mine) {
    const st = S();
    const cur = st.field_wl[ctx.tenantSlug] || {};
    const sel = st.field_sel[ctx.tenantSlug];
    const def = (mine[0] && mine[0].id) || sel || m.turfs[0].id;
    const out = Object.assign({ turfId: def, turnout: 0, support: 'any', skip: true }, cur);
    if (!m.byId[out.turfId]) out.turfId = m.turfs[0].id;
    st.field_wl[ctx.tenantSlug] = out;
    return out;
  }
  function filterHouseholds(tf, f, idx) {
    return tf.households.filter((h) => {
      if (h.turnout < f.turnout) return false;
      const sup = supportOf(h, idx);
      if (f.support === 'unknown' && sup) return false;
      if ((f.support === '3' || f.support === '4') && !(sup && sup >= Number(f.support))) return false;
      if (f.skip && knockedNow(h, idx)) return false;
      return true;
    });
  }

  /* ---------------- shifts (canvassing) ---------------- */
  function shiftKey(ctx) { return 'fieldShift:' + (ctx.user ? ctx.user.id : 'guest'); }
  function getShift(ctx, m) {
    const s = window.Store ? Store.get(shiftKey(ctx), null) : null;
    return s && s.turfId && m.byId[s.turfId] && Array.isArray(s.order) ? s : null;
  }
  function freshOrder(tf, idx) {
    const pool = tf.households.filter((h) => !knockedNow(h, idx));
    return routeOrder(pool.length ? pool : tf.households).map((h) => h.id);
  }
  function startShift(ctx, tf, order) {
    const s = { id: 'shift_' + Date.now().toString(36), turfId: tf.id, order, startedAt: new Date().toISOString() };
    Store.set(shiftKey(ctx), s);
    return s;
  }
  function shiftProgress(shift, idx) {
    const done = idx.list.filter((r) => r.shiftId === shift.id);
    const ids = new Set(done.map((r) => r.voterId));
    const remaining = shift.order.filter((id) => !ids.has(id));
    return { done, remaining, total: shift.order.length };
  }

  /* ---------------- small renderers ---------------- */
  function ring(pct, o) {
    o = o || {};
    const s = o.size || 56, w = o.stroke || 6, r = (s - w) / 2, c = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(1, pct || 0));
    const fs = Math.round(s * (p >= 1 ? 0.22 : 0.26));
    return `<svg class="f-ring${o.cls ? ' ' + o.cls : ''}" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" role="img" aria-label="${esc(o.label || Math.round(p * 100) + '% done')}" style="--c:${c.toFixed(2)}">
      <circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="${o.track || 'var(--line)'}" stroke-width="${w}"/>
      <circle class="f-ring-v" cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="${o.color || 'var(--brand)'}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - p)).toFixed(2)}" transform="rotate(-90 ${s / 2} ${s / 2})"/>
      <text x="50%" y="50%" dy=".36em" text-anchor="middle" font-family="var(--font-head)" font-weight="800" font-size="${fs}" fill="${o.ink || 'var(--ink)'}">${Math.round(p * 100)}%</text></svg>`;
  }
  const turnoutMeter = (n) => `<span class="f-meter" title="Turnout score ${n} of 100"><i><u style="width:${n}%"></u></i><b>${n}</b></span>`;
  const supportPill = (s) => s ? `<span class="f-sup f-sup-${s}" title="Support score ${s} of 5: ${esc(SUPPORT[s])}">${s}<span class="sr-only"> of 5, ${esc(SUPPORT[s])}</span></span>` : '<span class="f-sup f-sup-0" title="Support not known yet">?<span class="sr-only">Support not known yet</span></span>';
  const partyTag = (p) => `<span class="f-party f-party-${esc(p)}" title="${esc(PARTY[p] || p)}">${esc(PARTY_SHORT[p] || p)}</span>`;
  const sampleTag = (txt, title) => `<span class="sample-tag f-sample"${title ? ` title="${esc(title)}"` : ''}>${esc(txt || 'Sample voters')}</span>`;
  function countyName(t) { const c = t.county || t.name || ''; return /county/i.test(c) ? c : c + ' County'; }
  function shortName(t) { return t.shortName || t.name; }
  function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function fmtWhen(iso) { const t = Date.parse(iso || ''); return isNaN(t) ? '' : U.timeAgo(Math.max(0, (Date.now() - t) / 60000)); }
  function firstName(n) { return String(n || '').split(' ')[0]; }
  function walkerNames(ids, pool) {
    const by = Object.fromEntries(pool.map((w) => [w.id, w]));
    return ids.map((id) => by[id]).filter(Boolean);
  }

  function pageHead(ctx, extraCls) {
    const tabs = [['', 'Turf map'], ['list', 'Walk lists'], ['canvass', 'Canvass']];
    return `<div class="page-head${extraCls ? ' ' + extraCls : ''}">
        <div>
          <h1>Field Organizer</h1>
          <p>Cut precinct turf and send walk lists to volunteers’ phones, then watch results come in from across ${esc(countyName(ctx.tenant))}.</p>
        </div>
      </div>
      <nav class="tabs f-tabs" aria-label="Field Organizer sections">
        ${tabs.map(([s, l]) => `<a class="tab${ctx.sub === s ? ' active' : ''}" href="#/field${s ? '/' + s : ''}"${ctx.sub === s ? ' aria-current="page"' : ''}>${l}</a>`).join('')}
      </nav>`;
  }

  /* ---------------- CSV + print ---------------- */
  function csvCell(v) { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function walkListCSV(ctx, tf, route, idx) {
    const rows = [['Stop', 'Name', 'Voters in household', 'Address', 'City', 'Precinct', 'Party', 'Turnout score', 'Support score', 'Last result', 'Last result date']];
    route.forEach((h, i) => {
      const l = idx.byVoter[h.id];
      rows.push([i + 1, h.name, h.size, h.address, h.city, h.precinct, PARTY[h.party] || h.party, h.turnout, supportOf(h, idx) || '', l ? RESULT_LABEL[l.result] || l.result : '', l && l.createdAt ? l.createdAt.slice(0, 10) : '']);
    });
    const head = `# ${shortName(ctx.tenant)} walk list: ${tf.name}. Sample voters: names and addresses are invented.`;
    return head + '\n' + rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
  }
  function downloadCSV(name, text) {
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function exportTurf(ctx, m, tf, route) {
    const idx = resultsIndex();
    const r = route || routeOrder(tf.households);
    downloadCSV(`${ctx.tenantSlug}-${slugify(tf.name)}-walk-list.csv`, walkListCSV(ctx, tf, r, idx));
    ctx.toast(`Downloaded the ${tf.name} walk list (${r.length} doors).`, 'ok');
  }

  /* ---------------- style ---------------- */
  function injectStyle() {
    if (document.getElementById('scr-field-style')) return;
    const st = document.createElement('style');
    st.id = 'scr-field-style';
    st.textContent = `
.scr-field .f-tabs { margin-bottom: 16px; }
.scr-field .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.scr-field .f-sample { font-size: 12px; }
.scr-field .leaflet-container { font: inherit; background: #EEF0EC; }
.scr-field .f-tiles { filter: saturate(.55) brightness(1.04); }
.scr-field .leaflet-control-attribution { font-size: 11px; }
.scr-field .leaflet-bar a { width: 34px; height: 34px; line-height: 34px; color: var(--ink); }
.scr-field .leaflet-touch .leaflet-bar a { width: 40px; height: 40px; line-height: 40px; }

/* ring */
.scr-field .f-ring { flex: none; display: block; }
.scr-field .f-ring .f-ring-v { transition: stroke-dashoffset .7s cubic-bezier(.2,.8,.2,1); animation: fRing .9s cubic-bezier(.2,.8,.2,1) both; }
@keyframes fRing { from { stroke-dashoffset: var(--c); } }

/* ===== turf map stage ===== */
.scr-field .f-stage { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 360px; height: clamp(520px, calc(100vh - var(--topbar-h) - 190px), 860px); border: 1px solid var(--line); border-radius: var(--r-lg); overflow: hidden; overflow: clip; background: var(--surface); box-shadow: var(--shadow-1); }
.scr-field .f-mapbox { position: relative; min-width: 0; height: 100%; isolation: isolate; z-index: 0; }
.scr-field .f-map { position: absolute; inset: 0; }
.scr-field .f-mapnote { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; padding: 24px; color: var(--ink-2); background: repeating-linear-gradient(135deg, #F1F3EF 0 14px, #ECEFE9 14px 28px); }
.scr-field .f-mapnote .spinner { margin: 0 auto 10px; }
.scr-field .f-overlay { position: absolute; z-index: 500; top: 12px; left: 12px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; max-width: calc(100% - 80px); pointer-events: none; }
.scr-field .f-overlay > * { pointer-events: auto; }
.scr-field .f-legend { background: color-mix(in srgb, var(--surface) 94%, transparent); backdrop-filter: blur(6px); border: 1px solid var(--line); border-radius: var(--r); box-shadow: var(--shadow-2); font-size: 13px; color: var(--ink-2); max-width: 240px; }
.scr-field .f-legend summary { cursor: pointer; list-style: none; padding: 7px 12px; font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 8px; min-height: 36px; }
.scr-field .f-legend summary::-webkit-details-marker { display: none; }
.scr-field .f-legend summary::after { content: ''; width: 7px; height: 7px; border-right: 2px solid var(--ink-3); border-bottom: 2px solid var(--ink-3); transform: rotate(45deg); margin-left: auto; transition: transform .2s ease; }
.scr-field .f-legend[open] summary::after { transform: rotate(-135deg); }
.scr-field .f-legend ul { list-style: none; margin: 0; padding: 0 12px 10px; display: grid; gap: 5px; }
.scr-field .f-legend li { display: flex; align-items: center; gap: 8px; min-width: 0; }
.scr-field .f-legend li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scr-field .f-sw { width: 14px; height: 14px; border-radius: 4px; flex: none; border: 2px solid; }
.scr-field .f-dotk { width: 10px; height: 10px; border-radius: 50%; flex: none; margin: 0 2px; }
.scr-field .f-locate { display: flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px; border: 0; border-radius: 6px; background: var(--surface); color: var(--ink); font: 600 13.5px var(--font-body); cursor: pointer; }
.scr-field .leaflet-touch .f-locate { height: 44px; }
.scr-field .f-locate:hover { background: var(--surface-2); }
.scr-field .f-locate.is-busy svg { animation: fSpin 1s linear infinite; }
@keyframes fSpin { to { transform: rotate(360deg); } }
.scr-field .f-me { width: 18px; height: 18px; border-radius: 50%; background: var(--info); border: 3px solid #fff; box-shadow: 0 0 0 6px color-mix(in srgb, var(--info) 25%, transparent); }
.scr-field .f-tlabel { background: none; border: 0; }
.scr-field .f-tlabel span { display: inline-block; transform: translate(-50%, -50%); white-space: nowrap; font: 800 13px var(--font-head); font-stretch: 85%; letter-spacing: .01em; padding: 3px 8px; border-radius: 99px; background: color-mix(in srgb, #fff 88%, transparent); border: 1.5px solid currentColor; box-shadow: 0 2px 6px rgba(21,32,46,.12); transition: transform .2s ease, opacity .2s ease; }
.scr-field .f-tlabel.is-dim span { opacity: .45; }
.scr-field .f-tip.leaflet-tooltip { padding: 0; border: 0; border-radius: var(--r); box-shadow: var(--shadow-2); background: var(--surface); color: var(--ink); font: 400 13.5px/1.4 var(--font-body); }
.scr-field .f-tip .f-tipin { padding: 10px 12px; min-width: 200px; border-top: 4px solid var(--tc); border-radius: var(--r); }
.scr-field .f-tip b { font-family: var(--font-head); font-size: 15px; display: block; margin-bottom: 4px; }
.scr-field .f-tip .f-tipbar { height: 6px; border-radius: 99px; background: var(--line); overflow: hidden; margin: 6px 0; }
.scr-field .f-tip .f-tipbar i { display: block; height: 100%; background: var(--tc); }
.scr-field .f-tip .muted { color: var(--ink-3); }

/* panel / bottom sheet */
.scr-field .f-panel { position: relative; display: flex; flex-direction: column; min-height: 0; border-left: 1px solid var(--line); background: var(--surface); z-index: 2; }
.scr-field .f-grab { display: none; }
.scr-field .f-phead { display: flex; align-items: center; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--line); }
.scr-field .f-phead h2 { font-size: 1.2rem; margin: 0; }
.scr-field .f-phead p { margin: 2px 0 0; font-size: 13.5px; color: var(--ink-2); }
.scr-field .f-phead .f-x { margin-left: auto; }
.scr-field .f-pbody { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 14px 18px 22px; display: flex; flex-direction: column; gap: 14px; }
.scr-field .f-iconbtn { display: inline-grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--line); background: var(--surface); color: var(--ink-2); cursor: pointer; flex: none; }
.scr-field .f-iconbtn:hover { background: var(--surface-2); color: var(--ink); }
.scr-field .f-seg { display: flex; padding: 3px; gap: 3px; border-radius: 99px; background: var(--surface-2); border: 1px solid var(--line); }
.scr-field .f-seg button { flex: 1; min-height: 36px; border: 0; border-radius: 99px; background: none; font: 600 14px var(--font-body); color: var(--ink-2); cursor: pointer; }
.scr-field .f-seg button[aria-selected="true"] { background: var(--surface); color: var(--brand); box-shadow: 0 1px 3px rgba(21,32,46,.14); }
.scr-field .f-mine { border-radius: var(--r); padding: 14px; background: color-mix(in srgb, var(--brand) 6%, var(--surface)); border: 1px solid color-mix(in srgb, var(--brand) 22%, var(--surface)); display: flex; flex-direction: column; gap: 10px; }
.scr-field .f-mine .f-eyebrow { font: 700 12.5px var(--font-body); letter-spacing: .04em; text-transform: uppercase; color: var(--brand); }
.scr-field .f-mine h3 { margin: 0; font-size: 1.15rem; }
.scr-field .f-mine p { margin: 0; font-size: 14px; color: var(--ink-2); }
.scr-field .f-rowx { display: flex; align-items: center; gap: 12px; }
.scr-field .f-btns { display: flex; flex-wrap: wrap; gap: 8px; }
.scr-field .f-btns .btn { flex: 1 1 auto; }
.scr-field .f-tlist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.scr-field .f-trow { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; gap: 2px 10px; align-items: center; width: 100%; padding: 10px; border-radius: var(--r); border: 1px solid transparent; background: none; text-align: left; font: inherit; color: inherit; cursor: pointer; transition: background-color .15s ease, border-color .15s ease, transform .15s ease; }
.scr-field .f-trow:hover { background: var(--surface-2); border-color: var(--line); }
.scr-field .f-trow.is-hot { background: var(--surface-2); border-color: var(--line-strong); }
.scr-field .f-trow .f-tname { font-weight: 700; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scr-field .f-trow .f-tpct { font: 800 15px var(--font-head); font-variant-numeric: tabular-nums; }
.scr-field .f-trow .f-tsub { grid-column: 2 / 4; font-size: 13px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scr-field .f-trow .f-bar { grid-column: 2 / 4; }
.scr-field .f-bar { height: 6px; border-radius: 99px; background: var(--line); overflow: hidden; }
.scr-field .f-bar > i { display: block; height: 100%; border-radius: 99px; transition: width .6s cubic-bezier(.2,.8,.2,1); }
.scr-field .f-facts { margin: 0; font-size: 14.5px; color: var(--ink-2); }
.scr-field .f-facts b { font: 800 1.1rem var(--font-head); color: var(--ink); font-variant-numeric: tabular-nums; }
.scr-field .f-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 16px; text-align: left; }
.scr-field .f-stat { border-top: 2px solid var(--line); padding: 8px 0 2px; min-width: 0; }
.scr-field .f-stat b { display: block; font: 800 1.35rem/1.1 var(--font-head); font-stretch: 85%; font-variant-numeric: tabular-nums; }
.scr-field .f-stat span { font-size: 13px; color: var(--ink-3); }
.scr-field .f-sub { font: 700 13px var(--font-body); color: var(--ink-2); margin: 2px 0 6px; }
.scr-field .f-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.scr-field .f-wchip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 4px 3px 4px; border-radius: 99px; background: var(--surface-2); border: 1px solid var(--line); font-size: 13.5px; font-weight: 600; max-width: 100%; }
.scr-field .f-wchip > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 6px; }
.scr-field .f-wchip button { width: 28px; height: 28px; border-radius: 50%; border: 0; background: none; color: var(--ink-3); cursor: pointer; display: grid; place-items: center; margin-right: -2px; }
.scr-field .f-wchip button:hover { background: var(--danger-soft); color: var(--danger); }
.scr-field .f-assign { display: flex; gap: 8px; }
.scr-field .f-assign .select { flex: 1; min-width: 0; }
.scr-field .f-wlist { list-style: none; margin: 0; padding: 0; }
.scr-field .f-wlist li { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 0 10px; align-items: center; padding: 9px 2px; border-bottom: 1px solid var(--line); }
.scr-field .f-wlist li:last-child { border-bottom: 0; }
.scr-field .f-wlist .f-wn { font-weight: 700; font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scr-field .f-wlist .f-ws { font-size: 13px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scr-field .f-wlist .f-wd { text-align: right; font: 800 1.05rem var(--font-head); font-variant-numeric: tabular-nums; }
.scr-field .f-wlist .f-wd small { display: block; font: 600 12px var(--font-body); color: var(--ok); }
.scr-field .f-kind { font-size: 12px; font-weight: 600; color: var(--ink-3); }
.scr-field .f-in { animation: fIn .38s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(min(var(--i, 0), 14) * 28ms); }
@keyframes fIn { from { opacity: 0; transform: translateY(8px); } }
.scr-field .f-fade { animation: fFade .25s ease both; }
@keyframes fFade { from { opacity: 0; } }
.scr-field .f-note-muted { font-size: 13.5px; color: var(--ink-3); margin: 0; }

/* access */
.scr-field .f-roles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.scr-field .f-role { border: 1px solid var(--line); border-radius: var(--r); padding: 14px; display: flex; flex-direction: column; gap: 6px; background: var(--surface); }
.scr-field .f-role.is-me { border: 2px solid var(--brand); background: color-mix(in srgb, var(--brand) 5%, var(--surface)); }
.scr-field .f-role h4 { margin: 0; font-size: 1.02rem; }
.scr-field .f-role p { font-size: 14px; color: var(--ink-2); margin: 0; }

/* ===== walk lists ===== */
.scr-field .f-wl { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 20px; align-items: start; }
.scr-field .f-wl-side { position: sticky; top: calc(var(--topbar-h) + 16px); display: flex; flex-direction: column; gap: 16px; }
.scr-field .f-field { display: flex; flex-direction: column; gap: 6px; }
.scr-field .f-field > label, .scr-field .f-flabel { font-weight: 700; font-size: 14px; color: var(--ink-2); }
.scr-field .f-hint { font-size: 13px; color: var(--ink-3); margin: 0; }
.scr-field .f-count { display: flex; align-items: baseline; gap: 8px; font-size: 14px; color: var(--ink-2); }
.scr-field .f-count b { font: 800 1.7rem/1 var(--font-head); color: var(--brand); font-variant-numeric: tabular-nums; }
.scr-field .f-wlmap { position: relative; height: 340px; border-bottom: 1px solid var(--line); isolation: isolate; z-index: 0; }
.scr-field .f-stopicon { background: none; border: 0; }
.scr-field .f-stopicon span { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--brand); color: var(--brand-ink); font: 700 12px var(--font-body); border: 2px solid #fff; box-shadow: 0 2px 6px rgba(21,32,46,.3); transition: transform .18s ease, background-color .18s ease; }
.scr-field .f-stopicon.is-start span { background: var(--accent); }
.scr-field .f-stopicon.is-done span { background: #8A94A3; }
.scr-field .f-stopicon.is-hot span { transform: scale(1.3); background: var(--accent); }
.scr-field .f-stopicon.is-cur span { background: var(--accent); width: 32px; height: 32px; margin: -3px; animation: fPulse 1.8s ease-out infinite; }
@keyframes fPulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 55%, transparent); } 100% { box-shadow: 0 0 0 14px transparent; } }
.scr-field .f-stops { list-style: none; margin: 0; padding: 0; }
.scr-field .f-stop { display: grid; grid-template-columns: 34px minmax(0, 1fr) 64px 100px 72px; gap: 8px 12px; align-items: center; padding: 11px 18px; border-bottom: 1px solid var(--line); transition: background-color .2s ease; }
.scr-field .f-stop:last-child { border-bottom: 0; }
.scr-field .f-stop:hover, .scr-field .f-stop.is-hot { background: var(--surface-2); }
.scr-field .f-stop.is-flash { background: color-mix(in srgb, var(--accent) 10%, var(--surface)); }
.scr-field .f-stophead { font-size: 12.5px; font-weight: 700; color: var(--ink-3); text-transform: uppercase; letter-spacing: .04em; padding-top: 9px; padding-bottom: 9px; background: var(--surface-2); }
.scr-field .f-num { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--brand); color: var(--brand-ink); font-weight: 700; font-size: 13px; }
.scr-field .f-stop .f-who { font-weight: 700; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.scr-field .f-plus { font-weight: 600; font-size: 13px; color: var(--ink-3); }
.scr-field .f-stop .f-who small, .scr-field .f-stop .f-addr small { display: block; font-weight: 400; font-size: 13px; color: var(--ink-3); }
.scr-field .f-stop .f-addr { min-width: 0; }
.scr-field .f-party { display: inline-block; font: 700 12px var(--font-body); padding: 2px 7px; border-radius: 99px; border: 1px solid var(--line-strong); color: var(--ink-2); background: var(--surface); }
.scr-field .f-party-REP { color: #A3161C; border-color: #E8B4B6; background: #FDF1F1; }
.scr-field .f-party-DEM { color: #1D4AA8; border-color: #B8C8EC; background: #F0F4FC; }
.scr-field .f-meter { display: inline-flex; align-items: center; gap: 8px; }
.scr-field .f-meter i { display: block; width: 56px; height: 6px; border-radius: 99px; background: var(--line); overflow: hidden; }
.scr-field .f-meter u { display: block; height: 100%; background: var(--brand); }
.scr-field .f-meter b { font-size: 13.5px; font-variant-numeric: tabular-nums; }
.scr-field .f-sup { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; font: 800 14px var(--font-head); border: 1px solid var(--line); background: var(--surface-2); color: var(--ink-3); }
.scr-field .f-sup-4, .scr-field .f-sup-5 { background: var(--ok-soft); color: var(--ok); border-color: color-mix(in srgb, var(--ok) 30%, white); }
.scr-field .f-sup-3 { background: var(--warn-soft); color: var(--warn); border-color: color-mix(in srgb, var(--warn) 30%, white); }
.scr-field .f-sup-1, .scr-field .f-sup-2 { background: var(--danger-soft); color: var(--danger); border-color: color-mix(in srgb, var(--danger) 25%, white); }
.scr-field .f-last { font-size: 12.5px; color: var(--ink-3); grid-column: 2 / -1; margin-top: -4px; }
.scr-field .f-empty { text-align: center; padding: 40px 20px; color: var(--ink-3); }
.scr-field .f-empty h3 { color: var(--ink-2); }
.scr-field .f-printsheet { display: none; }

/* ===== canvass ===== */
.scr-field .f-cv { display: grid; grid-template-columns: minmax(0, 470px) minmax(260px, 1fr); gap: 24px; align-items: start; }
.scr-field .f-cvmain { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.scr-field .f-cvside { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.scr-field .f-cvhead { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: var(--r-lg); background: var(--brand); color: var(--brand-ink); }
.scr-field .f-cvhead h2 { color: inherit; margin: 0; font-size: 1.15rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scr-field .f-cvhead .f-cvsub { font-size: 13.5px; opacity: .9; }
.scr-field .f-cvhead .f-cvtitle { min-width: 0; flex: 1; }
.scr-field .f-cvhead .f-undo-btn { background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.3); color: inherit; min-height: 44px; }
.scr-field .f-cvhead .f-undo-btn:hover { background: rgba(255,255,255,.2); color: inherit; }
.scr-field .f-status { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; color: var(--ok); padding: 0 4px; }
.scr-field .f-status::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 20%, transparent); flex: none; }
.scr-field .f-status.is-off { color: var(--warn); padding: 10px 12px; border-radius: var(--r); background: var(--warn-soft); }
.scr-field .f-door, .scr-field .f-door * { scroll-margin-bottom: calc(240px + env(safe-area-inset-bottom, 0px)); }
.scr-field .f-door { margin-bottom: 4px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--shadow-1); padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.scr-field .f-door.is-out { animation: fOut .2s ease forwards; }
.scr-field .f-door.is-in { animation: fSlide .34s cubic-bezier(.2,.8,.2,1) both; }
.scr-field .f-door.is-back { animation: fSlideBack .34s cubic-bezier(.2,.8,.2,1) both; }
@keyframes fOut { to { opacity: 0; transform: translateX(-36px) scale(.98); } }
@keyframes fSlide { from { opacity: 0; transform: translateX(42px); } }
@keyframes fSlideBack { from { opacity: 0; transform: translateX(-42px); } }
.scr-field .f-door-top { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--ink-3); font-weight: 600; }
.scr-field .f-door h3 { font-size: 1.5rem; margin: 0; line-height: 1.1; }
.scr-field .f-door .f-city { color: var(--ink-2); font-size: 14.5px; }
.scr-field .f-hh { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 12px; border-radius: var(--r); background: var(--surface-2); font-size: 14px; }
.scr-field .f-hh b { font-size: 15px; }
.scr-field .f-prev { font-size: 13.5px; color: var(--warn); font-weight: 600; margin: 0; }
.scr-field .f-script { border-left: 3px solid var(--accent); padding: 2px 0 2px 12px; font-size: 15px; color: var(--ink-2); margin: 0; }
.scr-field .f-script b { color: var(--ink); }
.scr-field .f-supq { display: flex; flex-direction: column; gap: 6px; }
.scr-field .f-supq legend { font-weight: 700; font-size: 14px; color: var(--ink-2); padding: 0; margin-bottom: 6px; }
.scr-field .f-supq fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.scr-field .f-supbtns { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.scr-field .f-supbtns button { min-height: 48px; border-radius: 10px; border: 1px solid var(--line-strong); background: var(--surface); font: 800 17px var(--font-head); color: var(--ink); cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; gap: 3px; transition: background-color .15s ease, transform .1s ease; }
.scr-field .f-supbtns button small { font: 600 10.5px var(--font-body); color: var(--ink-3); }
.scr-field .f-supbtns button[aria-pressed="true"] { background: var(--brand); border-color: var(--brand); color: var(--brand-ink); }
.scr-field .f-supbtns button[aria-pressed="true"] small { color: inherit; opacity: .85; }
.scr-field .f-notebox summary { cursor: pointer; font-weight: 600; font-size: 14.5px; color: var(--brand); min-height: 44px; display: flex; align-items: center; gap: 6px; list-style: none; }
.scr-field .f-notebox summary::-webkit-details-marker { display: none; }
.scr-field .f-notebox textarea { min-height: 76px; }
.scr-field .f-actions { position: sticky; bottom: 0; z-index: 5; margin: 0 -4px; padding: 10px 4px calc(10px + env(safe-area-inset-bottom, 0px)); background: linear-gradient(to top, var(--bg) 78%, color-mix(in srgb, var(--bg) 0%, transparent)); display: flex; flex-direction: column; gap: 8px; }
.scr-field .f-results { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
.scr-field .f-res { grid-column: span 2; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 64px; padding: 8px 6px; border-radius: 12px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); font: 700 15px var(--font-body); cursor: pointer; box-shadow: 0 1px 0 rgba(21,32,46,.06); transition: background-color .15s ease, transform .1s ease, border-color .15s ease; touch-action: manipulation; }
.scr-field .f-res:active { transform: scale(.97); }
.scr-field .f-res:hover { border-color: var(--ink-3); }
.scr-field .f-res.is-big { grid-column: span 3; min-height: 68px; font-size: 16px; }
.scr-field .f-res.r-talked { background: var(--brand); border-color: var(--brand); color: var(--brand-ink); }
.scr-field .f-res.r-yard_sign { background: color-mix(in srgb, var(--accent) 10%, var(--surface)); border-color: color-mix(in srgb, var(--accent) 45%, var(--surface)); color: color-mix(in srgb, var(--accent) 80%, black); }
.scr-field .f-res.is-hit { animation: fHit .3s ease; }
@keyframes fHit { 50% { transform: scale(.94); } }
.scr-field .f-skip { align-self: center; }
.scr-field .f-undo { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 14px; border-radius: var(--r); background: var(--ink); color: #fff; font-size: 14px; box-shadow: var(--shadow-2); animation: fIn .25s ease both; }
.scr-field .f-undo span { flex: 1; min-width: 0; }
.scr-field .f-undo button { min-height: 40px; background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.4); }
.scr-field .f-undo button:hover { background: rgba(255,255,255,.12); color: #fff; }
.scr-field .f-done { text-align: center; padding: 26px 18px; display: flex; flex-direction: column; gap: 14px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); }
.scr-field .f-done .f-stats { width: 100%; }
.scr-field .f-done .btn { width: 100%; }
.scr-field .f-pick { display: flex; flex-direction: column; gap: 8px; }
.scr-field .f-cvmap { height: 230px; position: relative; isolation: isolate; z-index: 0; border-radius: 0 0 var(--r-lg) var(--r-lg); overflow: hidden; }
.scr-field .f-feed { list-style: none; margin: 0; padding: 0; }
.scr-field .f-feed li { display: flex; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 14px; align-items: flex-start; }
.scr-field .f-feed li:last-child { border-bottom: 0; }
.scr-field .f-feed .f-fw { flex: 1; min-width: 0; }
.scr-field .f-feed .muted { white-space: nowrap; font-size: 13px; }

@media (max-width: 1100px) {
  .scr-field .f-stage { grid-template-columns: minmax(0, 1fr) 320px; }
  .scr-field .f-stop { grid-template-columns: 34px minmax(0, 1fr) 56px 100px 72px; }
}
@media (max-width: 1000px) {
  .scr-field .f-wl { grid-template-columns: minmax(0, 1fr); }
  .scr-field .f-wl-side { position: static; }
  .scr-field .f-cv { grid-template-columns: minmax(0, 1fr); }
  .scr-field .f-cvmain { max-width: 560px; width: 100%; margin: 0 auto; }
  .scr-field .f-roles { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 767px) {
  .scr-field .f-stage { display: block; height: calc(100svh - var(--topbar-h) - 228px); min-height: 430px; max-height: 760px; margin: 0 -16px; border-radius: 0; border-left: 0; border-right: 0; }
  .scr-field .f-mapbox { position: absolute; inset: 0; }
  .scr-field .f-panel { position: absolute; left: 0; right: 0; bottom: 0; height: 74%; border-left: 0; border-radius: 18px 18px 0 0; box-shadow: 0 -12px 30px -12px rgba(21,32,46,.35); transform: translateY(calc(100% - var(--peek, 136px))); transition: transform .32s cubic-bezier(.2,.8,.2,1); z-index: 600; }
  .scr-field .f-panel[data-sheet="open"] { transform: translateY(0); }
  .scr-field .f-panel[data-sheet="half"] { transform: translateY(calc(100% - var(--half, 260px))); }
  .scr-field .f-grab { display: flex; justify-content: center; align-items: center; width: 100%; height: 22px; border: 0; background: none; cursor: grab; padding: 0; touch-action: none; flex: none; }
  .scr-field .f-grab i { width: 40px; height: 5px; border-radius: 99px; background: var(--line-strong); }
  .scr-field .f-phead { padding: 2px 16px 12px; cursor: pointer; }
  .scr-field .f-pbody { padding: 12px 16px 24px; }
  .scr-field .f-overlay { max-width: calc(100% - 70px); }
  .scr-field .f-stop { grid-template-columns: 30px minmax(0, 1fr) auto; padding: 12px 14px; gap: 4px 10px; }
  .scr-field .f-stop .f-c-turn, .scr-field .f-stophead { display: none; }
  .scr-field .f-stop .f-who { grid-column: 2; grid-row: 1; }
  .scr-field .f-stop .f-c-party { grid-column: 3; grid-row: 1; justify-self: end; align-self: start; }
  .scr-field .f-stop .f-c-sup { display: none; }
  .scr-field .f-stop .f-num { align-self: start; }
  .scr-field .f-wlmap { height: 280px; }
  .scr-field .f-cvpage .page-head { display: none; }
  .scr-field .f-cvpage .f-tabs { margin-bottom: 12px; }
}
@media (max-width: 400px) {
  .scr-field .f-res { min-height: 58px; font-size: 14px; }
  .scr-field .f-res.is-big { min-height: 62px; }
  .scr-field .f-door h3 { font-size: 1.35rem; }
  .scr-field .f-supbtns button small { font-size: 9.5px; }
}
@media (prefers-reduced-motion: reduce) {
  .scr-field *, .scr-field *::before, .scr-field *::after { animation: none !important; transition: none !important; }
}
@media print {
  body:has(.scr-field .f-printsheet) .topbar, body:has(.scr-field .f-printsheet) .sidebar,
  body:has(.scr-field .f-printsheet) #toasts, body:has(.scr-field .f-printsheet) .skip-link,
  body:has(.scr-field .f-printsheet) .drawer-backdrop { display: none !important; }
  body:has(.scr-field .f-printsheet) { background: #fff !important; }
  body:has(.scr-field .f-printsheet) .shell { display: block; min-height: 0; }
  .scr-field .page > :not(.f-printsheet) { display: none !important; }
  .scr-field .page { padding: 0; max-width: none; }
  .scr-field .f-printsheet { display: block; color: #000; font: 11pt/1.35 var(--font-body); }
  .scr-field .f-printsheet h1 { font-size: 18pt; margin: 0 0 2pt; }
  .scr-field .f-printsheet .ps-meta { display: flex; flex-wrap: wrap; gap: 4pt 16pt; margin: 0 0 8pt; font-size: 10pt; }
  .scr-field .f-printsheet .ps-script { border: 1px solid #999; padding: 6pt 8pt; margin: 0 0 8pt; font-size: 10pt; }
  .scr-field .f-printsheet table { width: 100%; border-collapse: collapse; }
  .scr-field .f-printsheet th, .scr-field .f-printsheet td { border: 1px solid #888; padding: 4pt 5pt; vertical-align: top; text-align: left; font-size: 9.5pt; }
  .scr-field .f-printsheet th { background: #eee; }
  .scr-field .f-printsheet tr { break-inside: avoid; }
  .scr-field .f-printsheet .ps-box { display: inline-block; width: 9pt; height: 9pt; border: 1px solid #333; margin-right: 2pt; vertical-align: -1pt; }
  .scr-field .f-printsheet .ps-codes { white-space: nowrap; font-size: 8.5pt; }
  .scr-field .f-printsheet .ps-notes { width: 22%; }
  .scr-field .f-printsheet .ps-foot { margin-top: 8pt; font-size: 9pt; color: #444; }
  @page { margin: 12mm; }
}`;
    document.head.appendChild(st);
  }

  /* =========================================================
     TURF MAP
     ========================================================= */
  function tipHTML(tf, n, names) {
    return `<div class="f-tipin" style="--tc:${tf.color}"><b>${esc(tf.name)}</b>
      <div>${U.fmtNum(n.doors)} doors · <strong>${Math.round(n.pct * 100)}%</strong> knocked</div>
      <div class="f-tipbar"><i style="width:${Math.round(n.pct * 100)}%"></i></div>
      <div>${names.length ? 'Walkers: ' + esc(names.map((w) => w.name).join(', ')) : '<span class="muted">No walker assigned yet</span>'}</div>
      <div class="muted">Precincts ${esc(tf.precincts.join(', '))}</div></div>`;
  }

  function accessPanel(ctx) {
    const roles = [
      { id: 'board', title: 'Executive Board', text: 'Sees the whole county voter file and assigns turf to walkers.' },
      { id: 'member', title: 'Committee member', text: 'Sees the turf map and walk lists, and records doors from their own phone.' },
      { id: 'master', title: 'Master Network admin', text: 'Sees county totals, such as doors knocked. Names and addresses stay with the county.' },
    ];
    return `<section class="card" data-tour="field-privacy" style="margin-top:20px">
      <div class="card-head"><h3>Who sees what</h3><span class="spacer"></span><span class="small muted">Access follows each person’s account</span></div>
      <div class="card-body stack">
        <div class="f-roles">
          ${roles.map((r) => `<div class="f-role${ctx.role === r.id ? ' is-me' : ''}">
            <div class="row" style="gap:6px"><h4>${r.title}</h4>${ctx.role === r.id ? '<span class="badge badge-local">Your access</span>' : ''}</div>
            <p>${r.text}</p></div>`).join('')}
        </div>
        <p class="small muted" style="margin:0">Supporters and visitors to the public site see none of the voter file.</p>
      </div>
    </section>`;
  }

  function renderMap(el, ctx) {
    const m = model(ctx);
    const st = S();
    const slug = ctx.tenantSlug;
    const manage = ctx.can('field.manage');
    if (st.field_sel[slug] && !m.byId[st.field_sel[slug]]) st.field_sel[slug] = null;
    if (!manage) st.field_panel = 'turfs';

    el.innerHTML = `<div class="page">
      ${pageHead(ctx)}
      <section class="f-stage" data-tour="field-map" aria-label="Turf map">
        <div class="f-mapbox">
          <div class="f-map" data-map aria-label="Map of ${esc(countyName(ctx.tenant))} turfs"></div>
          <div class="f-mapnote" data-mapnote><div><div class="spinner" aria-hidden="true"></div>Loading the map</div></div>
          <div class="f-overlay">
            ${m.geo.sample ? sampleTag('Sample area', m.geo.sample) : ''}
            <details class="f-legend" data-tour="field-filters">
              <summary>Map key</summary>
              <ul>
                ${m.turfs.map((tf) => `<li><i class="f-sw" style="border-color:${tf.color};background:${tf.color}33"></i><span>${esc(tf.name)}</span></li>`).join('')}
                <li><i class="f-dotk" style="background:#fff;border:2px solid var(--brand)"></i><span>Sample household, not knocked</span></li>
                <li><i class="f-dotk" style="background:#8A94A3"></i><span>Knocked</span></li>
              </ul>
            </details>
          </div>
        </div>
        <aside class="f-panel" data-panel data-sheet="peek" aria-label="Turf details">
          <button class="f-grab" type="button" data-act="sheet" aria-label="Show more turf details" aria-expanded="false"><i></i></button>
          <div data-pin></div>
        </aside>
      </section>
      ${accessPanel(ctx)}
    </div>`;

    const panel = el.querySelector('[data-panel]');
    const pin = el.querySelector('[data-pin]');
    // Focus inside the sheet must never scroll the clipped stage itself.
    const stage = el.querySelector('.f-stage');
    stage.addEventListener('scroll', () => { if (stage.scrollTop || stage.scrollLeft) { stage.scrollTop = 0; stage.scrollLeft = 0; } });
    let map = null, L = null;
    const layers = {}; // turfId -> { poly, label }
    let hhLayer = null, meMarker = null;

    function sel() { return st.field_sel[slug] || null; }
    function setSheet(open) {
      panel.dataset.sheet = open === 'half' ? 'half' : open ? 'open' : 'peek';
      const g = panel.querySelector('[data-act="sheet"]');
      if (g) { const o = panel.dataset.sheet === 'open'; g.setAttribute('aria-expanded', String(o)); g.setAttribute('aria-label', o ? 'Show less' : 'Show more turf details'); }
    }

    function panelHTML() {
      const idx = resultsIndex();
      const asg = assignments(ctx, m);
      const pool = walkers(ctx);
      const s = sel();
      const tf = s && m.byId[s];
      let tot = 0, doors = 0;
      m.turfs.forEach((x) => { const n = turfNumbers(x, idx); tot += n.knocked; doors += n.doors; });

      if (tf) {
        const n = turfNumbers(tf, idx);
        const names = walkerNames(asg[tf.id] || [], pool);
        const free = pool.filter((w) => !(asg[tf.id] || []).includes(w.id));
        const groups = [['team', 'Volunteer team'], ['signup', 'Signed up on the website'], ['member', 'Committee members']];
        const head = `<div class="f-phead" data-act="sheet-head">
          ${ring(n.pct, { size: 56, color: tf.color, label: `${Math.round(n.pct * 100)}% of ${tf.name} knocked` })}
          <div style="min-width:0"><h2>${esc(tf.name)}</h2><p>${U.fmtNum(n.knocked)} of ${U.fmtNum(n.doors)} doors knocked</p></div>
          <button class="f-iconbtn f-x" type="button" data-act="clear" aria-label="Back to all turfs">${I(IC.close, 18)}</button></div>`;
        const body = `<div class="f-pbody f-fade">
          <p class="f-facts"><b>${U.fmtNum(n.left)}</b> doors left · Precincts ${esc(tf.precincts.join(', '))}</p>
          <div class="f-btns">
            <button class="btn btn-primary" type="button" data-act="walklist" data-turf="${esc(tf.id)}">${I(IC.list, 18)}Open walk list</button>
            <button class="btn" type="button" data-act="canvass" data-turf="${esc(tf.id)}">${I(IC.walk, 18)}Canvass this turf</button>
          </div>
          <div>
            <p class="f-sub">Walkers</p>
            ${names.length ? `<div class="f-chips">${names.map((w) => `<span class="f-wchip">${U.avatar(w.name, 26)}<span>${esc(w.name)}</span>${manage ? `<button type="button" data-act="unassign" data-walker="${esc(w.id)}" aria-label="Take ${esc(w.name)} off ${esc(tf.name)}">${I(IC.close, 14)}</button>` : ''}</span>`).join('')}</div>`
              : `<p class="f-note-muted">Nobody walks this turf yet.${manage ? ' Add a walker below.' : ''}</p>`}
          </div>
          ${manage ? `<div class="f-field"><label for="f-addw">Assign a walker</label>
            <div class="f-assign"><select class="select" id="f-addw" data-addw>
              <option value="">Choose a person</option>
              ${groups.map(([k, label]) => { const g = free.filter((w) => w.kind === k); return g.length ? `<optgroup label="${esc(label)}">${g.map((w) => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</optgroup>` : ''; }).join('')}
            </select><button class="btn" type="button" data-act="assign">Assign</button></div>
            <p class="f-hint">Their walk list opens on the Canvass tab when they sign in.</p></div>
            <button class="btn btn-ghost" type="button" data-act="csv" data-turf="${esc(tf.id)}" style="align-self:flex-start">${I(IC.csv, 18)}Export walk list as CSV</button>` : ''}
        </div>`;
        return { head, body };
      }

      const pct = doors ? tot / doors : 0;
      const head = `<div class="f-phead" data-act="sheet-head">
        ${ring(pct, { size: 56, label: `${Math.round(pct * 100)}% of county turf knocked` })}
        <div style="min-width:0"><h2>${esc(shortName(ctx.tenant))} turf</h2><p>${U.fmtNum(tot)} of ${U.fmtNum(doors)} doors knocked across ${m.turfs.length} turfs</p></div></div>`;
      const mine = myTurfs(ctx, m, asg);
      const shift = getShift(ctx, m);
      let mineHTML = '';
      if (!manage || mine.length) {
        if (mine.length) {
          const tf0 = mine[0];
          const n0 = turfNumbers(tf0, idx);
          const sp = shift && shift.turfId === tf0.id ? shiftProgress(shift, idx) : null;
          mineHTML = `<div class="f-mine f-in">
            <span class="f-eyebrow">My turf</span>
            <div class="f-rowx">${ring(n0.pct, { size: 48, stroke: 5, color: tf0.color })}
              <div style="min-width:0"><h3>${esc(tf0.name)}</h3><p>${sp && sp.remaining.length ? `${sp.remaining.length} doors left in your current shift.` : `${U.fmtNum(n0.left)} doors left in this turf.`}</p></div></div>
            <div class="f-btns"><button class="btn btn-primary" type="button" data-act="canvass" data-turf="${esc(tf0.id)}">${I(IC.walk, 18)}${sp && sp.remaining.length ? 'Keep canvassing' : 'Start canvassing'}</button>
            <button class="btn" type="button" data-act="select" data-turf="${esc(tf0.id)}">Show on map</button></div>
            ${mine.length > 1 ? `<p class="f-hint">You also walk ${esc(mine.slice(1).map((x) => x.name).join(' and '))}.</p>` : ''}
          </div>`;
        } else {
          mineHTML = `<div class="f-mine f-in"><span class="f-eyebrow">My turf</span>
            <p>You don’t have a turf yet. Your field chair assigns turf, and you can walk any turf below in the meantime.</p></div>`;
        }
      }
      const tabs = manage ? `<div class="f-seg" role="tablist" aria-label="Panel view">
          <button type="button" role="tab" data-act="tab" data-tab="turfs" aria-selected="${st.field_panel === 'turfs'}">Turfs</button>
          <button type="button" role="tab" data-act="tab" data-tab="walkers" aria-selected="${st.field_panel === 'walkers'}">Walkers</button></div>` : '';
      let list;
      if (manage && st.field_panel === 'walkers') {
        const today = new Date().toISOString().slice(0, 10);
        const rows = pool.map((w) => {
          const ts = m.turfs.filter((x) => (asg[x.id] || []).includes(w.id));
          const d = walkerDoors(w, idx);
          const td = idx.list.filter((r) => (r.walkerId === w.id || (w.userId && r.createdBy === w.userId)) && String(r.createdAt || '').slice(0, 10) === today).length;
          return { w, ts, d, td };
        }).filter((r) => r.ts.length || r.d || r.w.kind !== 'member').sort((a, b) => b.td - a.td || b.d - a.d || a.w.name.localeCompare(b.w.name));
        list = `<ul class="f-wlist">${rows.map((r, i) => `<li class="f-in" style="--i:${i}">${U.avatar(r.w.name, 30)}
            <div style="min-width:0"><div class="f-wn">${esc(r.w.name)}</div><div class="f-ws">${r.ts.length ? esc(r.ts.map((x) => x.name).join(', ')) : 'No turf yet'} · <span class="f-kind">${r.w.kind === 'signup' ? 'Website sign-up' : r.w.kind === 'member' ? 'Committee member' : 'Volunteer team'}</span></div></div>
            <div class="f-wd">${U.fmtNum(r.d)}${r.td ? `<small>+${r.td} today</small>` : ''}</div></li>`).join('')}</ul>
          <p class="f-hint">Doors knocked this cycle. Sign-ups from the public volunteer form appear here as soon as they come in.</p>`;
      } else {
        list = `<ul class="f-tlist">${m.turfs.map((x, i) => {
          const n = turfNumbers(x, idx);
          const names = walkerNames(asg[x.id] || [], pool);
          return `<li class="f-in" style="--i:${i}"><button type="button" class="f-trow" data-act="select" data-turf="${esc(x.id)}">
            <i class="f-sw" style="border-color:${x.color};background:${x.color}33"></i>
            <span class="f-tname">${esc(x.name)}</span><span class="f-tpct">${Math.round(n.pct * 100)}%</span>
            <span class="f-bar"><i style="width:${(n.pct * 100).toFixed(1)}%;background:${x.color}"></i></span>
            <span class="f-tsub">${U.fmtNum(n.left)} doors left · ${names.length ? esc(names.map((w) => firstName(w.name)).join(', ')) : 'No walker yet'}</span>
          </button></li>`;
        }).join('')}</ul>`;
      }
      const body = `<div class="f-pbody f-fade">${mineHTML}${tabs}${list}</div>`;
      return { head, body };
    }

    function paintPanel() {
      const keep = pin.querySelector('.f-pbody');
      const top = keep ? keep.scrollTop : 0;
      const sameView = pin.dataset.view === String(sel() || '') + ':' + st.field_panel;
      const p = panelHTML();
      pin.style.display = 'contents';
      pin.innerHTML = p.head + p.body;
      pin.dataset.view = String(sel() || '') + ':' + st.field_panel;
      const b = pin.querySelector('.f-pbody');
      if (sameView && b) { b.scrollTop = top; b.classList.remove('f-fade'); b.querySelectorAll('.f-in').forEach((x) => x.classList.remove('f-in')); pin.querySelectorAll('.f-ring-v').forEach((r) => { r.style.animation = 'none'; }); }
      const head = pin.querySelector('.f-phead');
      if (head) panel.style.setProperty('--peek', (22 + head.offsetHeight) + 'px');
      const btns = pin.querySelector('.f-pbody > .f-btns');
      if (btns) panel.style.setProperty('--half', Math.round(btns.getBoundingClientRect().bottom - panel.getBoundingClientRect().top + 14) + 'px');
    }

    function styleTurfs() {
      if (!map) return;
      const s = sel();
      const idx = resultsIndex();
      const asg = assignments(ctx, m);
      const pool = walkers(ctx);
      m.turfs.forEach((tf) => {
        const l = layers[tf.id];
        if (!l) return;
        const on = s === tf.id;
        l.poly.setStyle({ weight: on ? 4 : 2.5, fillOpacity: on ? 0.3 : s ? 0.07 : 0.18, opacity: s && !on ? 0.5 : 1, dashArray: on ? null : '6 5' });
        const tip = tipHTML(tf, turfNumbers(tf, idx), walkerNames(asg[tf.id] || [], pool));
        l.poly.setTooltipContent(tip); l.pin.setTooltipContent(tip);
        l.pin.setStyle({ radius: on ? 12 : 9, fillOpacity: s && !on ? 0.5 : 1 });
        const le = l.label.getElement();
        if (le) le.classList.toggle('is-dim', !!s && !on);
      });
      paintHouseholds(idx);
    }
    function paintHouseholds(idx) {
      if (!map || !L) return;
      if (hhLayer) { hhLayer.remove(); hhLayer = null; }
      const s = sel();
      if (map.getZoom() < 14 && !s) return;
      idx = idx || resultsIndex();
      hhLayer = L.layerGroup();
      m.turfs.forEach((tf) => {
        if (s && tf.id !== s) return;
        tf.households.forEach((h) => {
          const last = idx.byVoter[h.id];
          const done = last && last.result !== 'not_home';
          L.circleMarker([h.lat, h.lng], { radius: 6, weight: 2, color: done ? '#ffffff' : tf.color, fillColor: done ? '#8A94A3' : '#ffffff', fillOpacity: 1, bubblingMouseEvents: false })
            .bindTooltip(`<div class="f-tipin" style="--tc:${tf.color}"><b>${esc(h.address)}</b>${last ? esc(RESULT_LABEL[last.result] || last.result) + ' · ' + esc(fmtWhen(last.createdAt)) : 'Not knocked yet'}<div class="muted">Sample voter household</div></div>`, { className: 'f-tip', direction: 'top', offset: [0, -6] })
            .on('click', (e) => { L.DomEvent.stopPropagation(e); if (sel() !== tf.id) select(tf.id); })
            .addTo(hhLayer);
        });
      });
      hhLayer.addTo(map);
    }
    /* Far out, a 1 km turf is a few pixels wide: show it as a colored pin and hide the name labels. */
    function zoomMode() {
      if (!map) return;
      const far = map.getZoom() < 12.5;
      m.turfs.forEach((tf) => {
        const l = layers[tf.id];
        if (!l) return;
        if (far && !map.hasLayer(l.pin)) l.pin.addTo(map);
        if (!far && map.hasLayer(l.pin)) l.pin.remove();
        const le = l.label.getElement();
        if (le) le.style.display = far ? 'none' : '';
      });
    }
    function sheetPad() {
      if (!isSheet()) return { tl: [40, 40], br: [40, 40] };
      const peek = parseFloat(panel.style.getPropertyValue('--peek')) || 136;
      const half = parseFloat(panel.style.getPropertyValue('--half')) || 260;
      const shown = panel.dataset.sheet === 'open' ? panel.offsetHeight : panel.dataset.sheet === 'half' ? half : peek;
      return { tl: [20, 56], br: [56, shown + 12] };
    }
    function focusTurf(id) {
      if (!map) return;
      if (id && layers[id]) flyBounds(map, layers[id].poly.getBounds(), Object.assign(sheetPad(), { maxZoom: 17 }));
      else flyBounds(map, L.latLngBounds(m.turfs.map((x) => x.poly).flat()), Object.assign(sheetPad(), { maxZoom: 13 }));
    }
    function select(id) {
      st.field_sel[slug] = id;
      paintPanel(); styleTurfs();
      if (isSheet()) setSheet('half');
      focusTurf(id);
    }
    function clearSel() {
      st.field_sel[slug] = null;
      paintPanel(); styleTurfs(); focusTurf(null);
    }

    paintPanel();

    loadLeaflet().then((Lx) => {
      if (!el.isConnected) return;
      L = Lx;
      const node = el.querySelector('[data-map]');
      map = baseMap(L, node, { zoomSnap: 0.25 });
      const all = L.latLngBounds(m.turfs.map((x) => x.poly).flat());
      map.fitBounds(all, Object.assign({ animate: false, maxZoom: 13 }, { paddingTopLeft: sheetPad().tl, paddingBottomRight: sheetPad().br }));
      const idx = resultsIndex();
      const asg = assignments(ctx, m);
      const pool = walkers(ctx);
      m.turfs.forEach((tf) => {
        const poly = L.polygon(tf.poly, { color: tf.color, weight: 2.5, fillColor: tf.color, fillOpacity: 0.18, dashArray: '6 5', className: 'f-poly' })
          .bindTooltip(tipHTML(tf, turfNumbers(tf, idx), walkerNames(asg[tf.id] || [], pool)), { sticky: true, className: 'f-tip', direction: 'top', offset: [0, -14], opacity: 1 })
          .addTo(map);
        poly.on('mouseover', () => { if (sel() !== tf.id) poly.setStyle({ weight: 4, fillOpacity: 0.3 }); poly.bringToFront(); highlightRow(tf.id, true); });
        poly.on('mouseout', () => { styleTurfs(); highlightRow(tf.id, false); });
        poly.on('click', (e) => { L.DomEvent.stopPropagation(e); select(tf.id); });
        const top = tf.poly.reduce((a, p) => (p[0] > a[0] ? p : a), tf.poly[0]);
        const label = L.marker([top[0] + 0.0012, tf.center[1]], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'f-tlabel', html: `<span style="color:${tf.color}">${esc(tf.name)}</span>`, iconSize: [0, 0] }) }).addTo(map);
        const pin = L.circleMarker(tf.center, { radius: 9, weight: 3, color: '#fff', fillColor: tf.color, fillOpacity: 1, className: 'f-tpin' })
          .bindTooltip(tipHTML(tf, turfNumbers(tf, idx), walkerNames(asg[tf.id] || [], pool)), { className: 'f-tip', direction: 'top', offset: [0, -10], opacity: 1 });
        pin.on('click', (e) => { L.DomEvent.stopPropagation(e); select(tf.id); });
        pin.on('mouseover', () => highlightRow(tf.id, true));
        pin.on('mouseout', () => highlightRow(tf.id, false));
        layers[tf.id] = { poly, label, pin };
      });
      const Loc = L.Control.extend({
        options: { position: 'topright' },
        onAdd() {
          const b = L.DomUtil.create('button', 'f-locate leaflet-bar');
          b.type = 'button';
          b.innerHTML = I(IC.locate, 18) + '<span>Locate me</span>';
          b.setAttribute('aria-label', 'Show my location on the map');
          L.DomEvent.disableClickPropagation(b);
          L.DomEvent.on(b, 'click', () => locate(b));
          return b;
        },
      });
      new Loc().addTo(map);
      map.on('zoomend', () => { zoomMode(); paintHouseholds(); });
      zoomMode();
      map.on('click', () => { if (sel()) clearSel(); });
      el.querySelector('[data-mapnote]').remove();
      styleTurfs();
      if (sel()) setTimeout(() => focusTurf(sel()), 60);
    }).catch(() => {
      const note = el.querySelector('[data-mapnote]');
      if (note) note.innerHTML = `<div><p style="font-weight:700;margin:0 0 4px">The map didn’t load.</p><p class="small" style="margin:0 0 10px">Check your connection. Turf progress and walk lists still work.</p><button class="btn btn-sm" type="button" data-act="retry">Try again</button></div>`;
    });

    function locate(btn) {
      if (!('geolocation' in navigator)) { ctx.toast('This browser can’t share your location. Pick your turf from the list instead.', 'warn'); return; }
      btn.classList.add('is-busy'); btn.disabled = true;
      navigator.geolocation.getCurrentPosition((pos) => {
        btn.classList.remove('is-busy'); btn.disabled = false;
        if (!map) return;
        const ll = [pos.coords.latitude, pos.coords.longitude];
        if (meMarker) meMarker.remove();
        meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="f-me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), keyboard: false, title: 'You are here' }).addTo(map);
        let best = null, bd = Infinity;
        m.turfs.forEach((tf) => { const d = map.distance(ll, tf.center); if (d < bd) { bd = d; best = tf; } });
        if (reduceMotion()) map.setView(ll, 15, { animate: false }); else map.flyTo(ll, 15, { duration: 0.85 });
        if (best) ctx.toast(bd < 800 ? `You’re in ${best.name}.` : `You’re ${(bd / 1609.34).toFixed(1)} miles from ${best.name}, the closest turf.`, 'info');
      }, (err) => {
        btn.classList.remove('is-busy'); btn.disabled = false;
        ctx.toast(err && err.code === 1 ? 'Location is turned off for this site. Allow it in your browser settings, or pick your turf from the list.' : 'We couldn’t find your location just now. Try again outside, or pick your turf from the list.', 'warn');
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    }

    function highlightRow(id, on) {
      const r = pin.querySelector(`.f-trow[data-turf="${CSS.escape(id)}"]`);
      if (r) r.classList.toggle('is-hot', on);
    }

    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      const tid = a.dataset.turf;
      if (act === 'select') { select(tid); return; }
      if (act === 'clear') { e.stopPropagation(); clearSel(); return; }
      if (act === 'sheet' || (act === 'sheet-head' && isSheet())) { if (dragged) { dragged = false; return; } setSheet(panel.dataset.sheet !== 'open'); if (sel()) focusTurf(sel()); return; }
      if (act === 'tab') { st.field_panel = a.dataset.tab; paintPanel(); return; }
      if (act === 'walklist') { const w = wlState(ctx, m, []); w.turfId = tid; ctx.navigate('field/list'); return; }
      if (act === 'canvass') { openCanvass(ctx, m, tid); return; }
      if (act === 'csv') { exportTurf(ctx, m, m.byId[tid]); return; }
      if (act === 'retry') { renderMap(el, ctx); return; }
      if (act === 'assign' || act === 'unassign') {
        if (!ctx.can('field.manage')) return;
        const tf = m.byId[sel()];
        if (!tf) return;
        const asg = assignments(ctx, m);
        const pool = walkers(ctx);
        const cur = asg[tf.id] || [];
        if (act === 'assign') {
          const s = pin.querySelector('[data-addw]');
          const id = s && s.value;
          if (!id) { ctx.toast('Choose a person to assign first.', 'warn'); if (s) s.focus(); return; }
          asg[tf.id] = cur.concat(id);
          Store.set('turfAssignments', asg);
          const w = pool.find((x) => x.id === id);
          ctx.toast(`${w ? w.name : 'That walker'} now walks ${tf.name}.`, 'ok');
        } else {
          const id = a.dataset.walker;
          asg[tf.id] = cur.filter((x) => x !== id);
          Store.set('turfAssignments', asg);
          const w = pool.find((x) => x.id === id);
          ctx.toast(`${w ? w.name : 'That walker'} is off ${tf.name}.`, 'info');
        }
      }
    });

    // Sheet drag on phones: a short swipe on the handle or header opens or closes it.
    let y0 = null, dragged = false;
    panel.addEventListener('pointerdown', (e) => { dragged = false; if (isSheet() && e.target.closest('.f-grab, .f-phead') && !e.target.closest('button.f-iconbtn')) y0 = e.clientY; });
    panel.addEventListener('pointerup', (e) => {
      if (y0 == null) return;
      const dy = e.clientY - y0; y0 = null;
      if (Math.abs(dy) > 30) { dragged = true; setSheet(dy < 0); setTimeout(() => { dragged = false; }, 350); }
    });

    const off = Store.on('*', (d) => {
      if (!el.isConnected) { teardown(); return; }
      if (['walkResults', 'turfAssignments', 'volunteers', 'reset'].includes(d.name) || d.type === 'reset') { paintPanel(); styleTurfs(); }
    });
    live.offs.push(off);
  }

  function openCanvass(ctx, m, turfId) {
    const tf = m.byId[turfId];
    if (!tf) return;
    const idx = resultsIndex();
    const cur = getShift(ctx, m);
    if (!(cur && cur.turfId === tf.id && shiftProgress(cur, idx).remaining.length)) startShift(ctx, tf, freshOrder(tf, idx));
    ctx.navigate('field/canvass');
  }

  /* =========================================================
     WALK LISTS
     ========================================================= */
  function printSheet(ctx, tf, route, f, names, idx) {
    const cand = candidate(ctx.tenant);
    const sum = routeSummary(route);
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return `<h1>${esc(shortName(ctx.tenant))} walk sheet: ${esc(tf.name)}</h1>
      <div class="ps-meta"><span>${esc(today)}</span><span>Walker: ${names.length ? esc(names.map((w) => w.name).join(', ')) : '________________'}</span><span>${route.length} doors · ${esc(sum.text)}</span><span>Precincts ${esc(tf.precincts.join(', '))}</span><span>${esc(filterText(f))}</span></div>
      <p class="ps-script"><b>At the door:</b> ${esc(scriptText(ctx, cand, null))}</p>
      <table><thead><tr><th>#</th><th>Household</th><th>Address</th><th>Party</th><th>Turnout</th><th>Support 1 to 5</th><th>Result</th><th class="ps-notes">Notes</th></tr></thead>
      <tbody>${route.map((h, i) => `<tr><td>${i + 1}</td><td>${esc(h.name)}${h.size > 1 ? ` +${h.size - 1}` : ''}</td><td>${esc(h.address)}<br>${esc(h.city)} · Pct ${esc(h.precinct)}</td><td>${esc(PARTY_SHORT[h.party])}</td><td>${h.turnout}</td>
        <td class="ps-codes">${[1, 2, 3, 4, 5].map((n) => `<span class="ps-box"></span>${n} `).join('')}</td>
        <td class="ps-codes"><span class="ps-box"></span>Talked <span class="ps-box"></span>Not home<br><span class="ps-box"></span>Refused <span class="ps-box"></span>Moved <span class="ps-box"></span>Sign</td><td></td></tr>`).join('')}</tbody></table>
      <p class="ps-foot">Sample voters: names and addresses are invented. Enter results on the Canvass tab, or hand this sheet to your field chair.</p>`;
  }
  function filterText(f) {
    const parts = [];
    parts.push(f.turnout ? `Turnout score ${f.turnout} or higher` : 'Any turnout score');
    parts.push(f.support === 'unknown' ? 'support not known yet' : f.support === 'any' ? 'any support score' : `support ${f.support} or higher`);
    if (f.skip) parts.push('skips doors already knocked');
    return parts.join(', ');
  }

  function renderList(el, ctx) {
    const m = model(ctx);
    const manage = ctx.can('field.manage');
    const asg = assignments(ctx, m);
    const mine = myTurfs(ctx, m, asg);
    const f = wlState(ctx, m, mine);
    const mineIds = new Set(mine.map((x) => x.id));

    el.innerHTML = `<div class="page">
      ${pageHead(ctx)}
      <div class="f-wl">
        <div class="f-wl-side">
          <div class="card">
            <div class="card-head"><h3>Build a walk list</h3><span class="spacer"></span>${sampleTag()}</div>
            <div class="card-body stack" data-tour="field-build">
              <div class="f-field"><label for="f-turf">Turf</label>
                <select class="select" id="f-turf" data-f="turfId">${m.turfs.slice().sort((a, b) => (mineIds.has(b.id) ? 1 : 0) - (mineIds.has(a.id) ? 1 : 0)).map((x) => `<option value="${esc(x.id)}"${x.id === f.turfId ? ' selected' : ''}>${esc(x.name)}${mineIds.has(x.id) ? ' (my turf)' : ''}</option>`).join('')}</select></div>
              <div class="f-field"><label for="f-turn">Turnout score</label>
                <select class="select" id="f-turn" data-f="turnout">${[[0, 'Any score'], [30, '30 or higher'], [50, '50 or higher'], [70, '70 or higher']].map(([v, l]) => `<option value="${v}"${f.turnout === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
                <p class="f-hint">How often they vote, 0 to 100.</p></div>
              <div class="f-field"><label for="f-sup">Support score</label>
                <select class="select" id="f-sup" data-f="support">${[['any', 'Any support'], ['unknown', 'Not known yet'], ['3', '3 or higher'], ['4', '4 or higher']].map(([v, l]) => `<option value="${v}"${f.support === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
                <p class="f-hint">From earlier conversations, 1 (strong no) to 5 (strong yes).</p></div>
              <label class="toggle"><input type="checkbox" data-f="skip"${f.skip ? ' checked' : ''}> Skip doors already knocked</label>
              <div class="f-count" aria-live="polite" data-count></div>
              <button class="btn btn-primary btn-block" type="button" data-act="start">${I(IC.walk, 18)}Start canvassing</button>
              <div class="f-btns">
                <button class="btn" type="button" data-act="print">${I(IC.print, 18)}Print walk sheet</button>
                ${manage ? `<button class="btn" type="button" data-act="csv">${I(IC.csv, 18)}Export CSV</button>` : ''}
              </div>
            </div>
          </div>
        </div>
        <div class="card" style="overflow:hidden" data-out></div>
      </div>
      <section class="f-printsheet" data-print aria-hidden="true"></section>
    </div>`;

    const out = el.querySelector('[data-out]');
    let map = null, L = null, routeLayer = null, markers = {};
    let route = [];

    function compute() {
      const idx = resultsIndex();
      const tf = m.byId[f.turfId];
      const pool = filterHouseholds(tf, f, idx);
      route = routeOrder(pool);
      return { idx, tf };
    }

    function paint(animate) {
      const { idx, tf } = compute();
      const names = walkerNames(asg[tf.id] || [], walkers(ctx));
      const sum = routeSummary(route);
      el.querySelector('[data-count]').innerHTML = `<b>${route.length}</b><span>of ${tf.households.length} sample households match</span>`;
      el.querySelector('[data-act="start"]').disabled = !route.length;
      el.querySelector('[data-act="print"]').disabled = !route.length;
      const csvB = el.querySelector('[data-act="csv"]'); if (csvB) csvB.disabled = !route.length;
      const keepMap = out.querySelector('[data-wlmap]');
      const head = `<div class="card-head"><div style="min-width:0"><h3>${esc(tf.name)}</h3><div class="small muted">${route.length ? `${route.length} doors in walking order · ${esc(sum.text)}` : 'No doors match these filters'}</div></div><span class="spacer"></span>
        <span class="small muted">${names.length ? 'Walkers: ' + esc(names.map((w) => w.name).join(', ')) : 'No walker assigned'}</span></div>`;
      const list = route.length ? `<ol class="f-stops" aria-label="Doors in walking order">
          <li class="f-stop f-stophead" aria-hidden="true"><span>#</span><span>Household and address</span><span>Party</span><span class="f-c-turn">Turnout</span><span>Support</span></li>
          ${route.map((h, i) => { const l = idx.byVoter[h.id]; return `<li class="f-stop${animate ? ' f-in' : ''}" style="--i:${i}" data-stop="${esc(h.id)}">
            <span class="f-num">${i + 1}</span>
            <span class="f-who">${esc(h.name)}${h.size > 1 ? ` <span class="f-plus">+${h.size - 1}</span>` : ''}<small>${esc(h.address)}, ${esc(h.city)} · Precinct ${esc(h.precinct)}</small></span>
            <span class="f-c-party">${partyTag(h.party)}</span>
            <span class="f-c-turn">${turnoutMeter(h.turnout)}</span>
            <span class="f-c-sup">${supportPill(supportOf(h, idx))}</span>
            ${l ? `<span class="f-last">Last visit: ${esc(RESULT_LABEL[l.result] || l.result)}, ${esc(fmtWhen(l.createdAt))}</span>` : ''}
          </li>`; }).join('')}</ol>`
        : `<div class="f-empty"><h3>No doors match</h3><p>Loosen the turnout or support filter, or include doors already knocked.</p></div>`;
      if (keepMap) {
        out.querySelector('.card-head').outerHTML = head;
        const ol = out.querySelector('.f-stops, .f-empty');
        if (ol) ol.outerHTML = list;
      } else {
        out.innerHTML = head + `<div class="f-wlmap" data-wlmap><div class="f-mapnote" data-mapnote><div><div class="spinner" aria-hidden="true"></div>Loading the map</div></div></div>` + list;
      }
      // Print-only walk sheet; it stays a direct child of .page for the print stylesheet.
      el.querySelector('[data-print]').innerHTML = route.length ? printSheet(ctx, tf, route, f, names, idx) : '';
      drawRoute(tf);
    }

    function drawRoute(tf) {
      if (!map || !L) return;
      if (routeLayer) routeLayer.remove();
      routeLayer = L.layerGroup().addTo(map);
      markers = {};
      L.polygon(tf.poly, { color: tf.color, weight: 2, fillColor: tf.color, fillOpacity: 0.08, dashArray: '6 5', interactive: false }).addTo(routeLayer);
      if (route.length > 1) {
        const pts = route.map((h) => [h.lat, h.lng]);
        L.polyline(pts, { color: tf.color, weight: 6, opacity: 0.85, lineJoin: 'round', interactive: false }).addTo(routeLayer);
        L.polyline(pts, { color: '#ffffff', weight: 1.6, opacity: 0.95, dashArray: '3 7', interactive: false }).addTo(routeLayer);
      }
      route.forEach((h, i) => {
        const mk = L.marker([h.lat, h.lng], { title: `Stop ${i + 1}: ${h.address}`, icon: L.divIcon({ className: 'f-stopicon' + (i === 0 ? ' is-start' : ''), html: `<span>${i + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(routeLayer);
        mk.on('click', () => {
          const row = out.querySelector(`[data-stop="${CSS.escape(h.id)}"]`);
          if (row) { row.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' }); row.classList.add('is-flash'); setTimeout(() => row.classList.remove('is-flash'), 1200); }
        });
        markers[h.id] = mk;
      });
      const b = route.length ? L.latLngBounds(route.map((h) => [h.lat, h.lng])) : L.latLngBounds(tf.poly);
      flyBounds(map, b, { tl: [30, 30], br: [30, 30], maxZoom: 17 });
    }

    paint(true);

    loadLeaflet().then((Lx) => {
      if (!el.isConnected) return;
      L = Lx;
      const node = out.querySelector('[data-wlmap]');
      const tf = m.byId[f.turfId];
      map = baseMap(L, node, {});
      map.fitBounds(L.latLngBounds(tf.poly), { animate: false });
      const n = node.querySelector('[data-mapnote]'); if (n) n.remove();
      drawRoute(tf);
    }).catch(() => {
      const n = out.querySelector('[data-mapnote]');
      if (n) n.innerHTML = '<div><p style="font-weight:700;margin:0 0 4px">The map didn’t load.</p><p class="small" style="margin:0">Your walk list below is complete and ready to print.</p></div>';
    });

    el.addEventListener('change', (e) => {
      const k = e.target.dataset.f;
      if (!k) return;
      if (k === 'turfId') f.turfId = e.target.value;
      else if (k === 'turnout') f.turnout = Number(e.target.value);
      else if (k === 'support') f.support = e.target.value;
      else if (k === 'skip') f.skip = e.target.checked;
      paint(true);
    });
    out.addEventListener('mouseover', (e) => {
      const r = e.target.closest('[data-stop]');
      Object.entries(markers).forEach(([id, mk]) => { const ie = mk.getElement(); if (ie) ie.classList.toggle('is-hot', !!r && r.dataset.stop === id); });
    });
    out.addEventListener('mouseleave', () => Object.values(markers).forEach((mk) => { const ie = mk.getElement(); if (ie) ie.classList.remove('is-hot'); }));
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const tf = m.byId[f.turfId];
      if (a.dataset.act === 'start') {
        if (!route.length) return;
        startShift(ctx, tf, route.map((h) => h.id));
        ctx.toast(`Your ${route.length}-door walk list for ${tf.name} is ready.`, 'ok');
        ctx.navigate('field/canvass');
      } else if (a.dataset.act === 'print') {
        if (route.length) window.print();
      } else if (a.dataset.act === 'csv') {
        if (manage && route.length) exportTurf(ctx, m, tf, route);
      }
    });
    const off = Store.on('*', (d) => {
      if (!el.isConnected) { teardown(); return; }
      if (d.name === 'walkResults' || d.type === 'reset') paint(false);
    });
    live.offs.push(off);
  }

  /* =========================================================
     CANVASS (phone first)
     ========================================================= */
  function candidate(t) {
    const c = t.candidates || [];
    return c.find((x) => x.status === 'ENDORSED') || c.find((x) => x.status === 'ACTIVE_CAMPAIGN') || c[0] || null;
  }
  function scriptText(ctx, cand, h) {
    const me = ctx.user ? firstName(ctx.user.name) : 'a neighbor';
    const who = h ? `Hi, is ${h.first} home? ` : 'Hi there. ';
    const c = cand ? `We’re asking neighbors to back ${cand.name} for ${cand.office} on November 3.` : 'We’re talking with neighbors before the November 3 election.';
    return `${who}I’m ${me}, a neighbor volunteering with ${shortName(ctx.tenant)}. ${c} Can we count on your vote?`;
  }

  function renderCanvass(el, ctx) {
    const m = model(ctx);
    const t = ctx.tenant;
    const cand = candidate(t);
    const asg = assignments(ctx, m);
    const mine = myTurfs(ctx, m, asg);
    const user = ctx.user || { id: 'guest', name: 'Walker' };
    const walkerId = user.memberId || user.id;
    let shift = getShift(ctx, m);
    let draft = { support: null };
    let undoDoc = null, undoTimer = null, selfWrite = false, busy = false;
    let cvMap = null, L = null, cvLayer = null;

    el.innerHTML = `<div class="page f-cvpage">
      ${pageHead(ctx)}
      <div class="f-cv">
        <section class="f-cvmain" data-tour="field-phone" aria-label="Canvass" data-main></section>
        <aside class="f-cvside">
          <div class="card" data-routecard hidden>
            <div class="card-head"><h3>Your route</h3><span class="spacer"></span>${sampleTag()}</div>
            <div class="f-cvmap" data-cvmap><div class="f-mapnote" data-mapnote><div><div class="spinner" aria-hidden="true"></div>Loading the map</div></div></div>
          </div>
          <div class="card" data-tonight></div>
          <div class="card">
            <div class="card-head"><h3>Talking points</h3></div>
            <div class="card-body">
              <ul style="margin:0;padding-left:20px;display:grid;gap:6px">
                <li>Introduce yourself as a neighbor volunteering with ${esc(shortName(t))}.</li>
                ${cand ? `<li>${esc(cand.name)} is running for ${esc(cand.office)}${cand.slogan ? `: “${esc(cand.slogan)}”` : '.'}</li>` : ''}
                ${cand ? (cand.issues || []).slice(0, 2).map((x) => `<li>${esc(x)}</li>`).join('') : ''}
                <li>Ask about their support, and leave a door hanger whether or not they answer.</li>
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>`;

    const main = el.querySelector('[data-main]');
    const tonight = el.querySelector('[data-tonight]');
    const routeCard = el.querySelector('[data-routecard]');

    function online() { return navigator.onLine !== false; }
    function statusHTML() {
      return online()
        ? `<div class="f-status" data-tour="field-offline" role="status">Each door saves the moment you tap a result.</div>`
        : `<div class="f-status is-off" data-tour="field-offline" role="status">You’re offline. Results save on this phone and send when you’re back online.</div>`;
    }

    function pickerHTML(idx) {
      const order = mine.concat(m.turfs.filter((x) => !mine.includes(x)));
      return `<div class="f-cvhead"><div class="f-cvtitle"><h2>Pick a turf to walk</h2><div class="f-cvsub">${mine.length ? 'Your turf is first.' : 'You don’t have an assigned turf yet, so any turf works.'}</div></div></div>
        ${statusHTML()}
        <div class="f-pick">${order.map((tf, i) => { const n = turfNumbers(tf, idx); return `<button type="button" class="f-trow f-in" style="--i:${i};background:var(--surface);border-color:var(--line)" data-act="pick" data-turf="${esc(tf.id)}">
          <i class="f-sw" style="border-color:${tf.color};background:${tf.color}33"></i><span class="f-tname">${esc(tf.name)}${mine.includes(tf) ? ' · my turf' : ''}</span><span class="f-tpct">${Math.round(n.pct * 100)}%</span>
          <span class="f-bar"><i style="width:${(n.pct * 100).toFixed(1)}%;background:${tf.color}"></i></span>
          <span class="f-tsub">${U.fmtNum(n.left)} doors left · precincts ${esc(tf.precincts.join(', '))}</span></button>`; }).join('')}</div>`;
    }

    function headHTML(tf, prog) {
      const done = prog.total - prog.remaining.length;
      const pct = prog.total ? done / prog.total : 0;
      return `<div class="f-cvhead" data-head>
        ${ring(pct, { size: 58, stroke: 6, track: 'rgba(255,255,255,.25)', color: 'var(--brand-ink)', ink: 'var(--brand-ink)', label: `${done} of ${prog.total} doors done`, cls: 'f-cvring' })}
        <div class="f-cvtitle"><h2>${esc(tf.name)}</h2><div class="f-cvsub" data-headsub>${prog.remaining.length ? `Door ${done + 1} of ${prog.total} · ${prog.remaining.length} left` : `All ${prog.total} doors done`}</div></div>
        ${prog.done.length ? `<button class="btn btn-sm f-undo-btn" type="button" data-act="undo" aria-label="Undo the last saved door">${I(IC.undo, 16)}Undo</button>` : ''}
      </div>`;
    }

    function doorHTML(h, tf, idx, prog, anim) {
      const last = idx.byVoter[h.id];
      const sup = supportOf(h, idx);
      return `<article class="f-door${anim ? ' ' + anim : ''}" data-door="${esc(h.id)}" aria-label="Door ${prog.total - prog.remaining.length + 1}: ${esc(h.address)}">
        <div class="f-door-top"><span class="f-num">${prog.total - prog.remaining.length + 1}</span><span>Next door</span><span class="spacer"></span>${sampleTag()}</div>
        <div><h3>${esc(h.address)}</h3><div class="f-city">${esc(h.city)} · Precinct ${esc(h.precinct)}</div></div>
        <div class="f-hh"><span><b>${esc(h.name)}</b>${h.size > 1 ? ` and ${h.size - 1} other voter${h.size > 2 ? 's' : ''}` : ''}</span>${partyTag(h.party)}<span>Turnout ${h.turnout}</span><span class="row" style="gap:6px">Support ${supportPill(sup)}</span></div>
        ${last ? `<p class="f-prev">Last visit: ${esc(RESULT_LABEL[last.result] || last.result)}, ${esc(fmtWhen(last.createdAt))}${last.notes ? `. Note: “${esc(last.notes)}”` : ''}</p>` : ''}
        <p class="f-script">${esc(scriptText(ctx, cand, h))}</p>
        <div class="f-supq"><fieldset><legend>Support, if you talked (optional)</legend>
          <div class="f-supbtns">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-act="support" data-v="${n}" aria-pressed="${draft.support === n}" aria-label="${n}: ${SUPPORT[n]}">${n}<small>${n === 1 ? 'No' : n === 3 ? 'Unsure' : n === 5 ? 'Yes' : '&nbsp;'}</small></button>`).join('')}</div></fieldset></div>
        <details class="f-notebox"${draft.note ? ' open' : ''}><summary>${I(IC.plus, 16)}Add a note</summary>
          <label class="sr-only" for="f-note">Note about this door</label>
          <textarea class="textarea" id="f-note" data-note maxlength="300" placeholder="Dog in yard, come back after 6, wants a call">${esc(draft.note || '')}</textarea></details>
      </article>`;
    }

    function actionsHTML() {
      return `<div class="f-actions" data-actions>
        <div data-undobar></div>
        <div class="f-results" role="group" aria-label="How did this door go?">
          ${RESULTS.map((r, i) => `<button type="button" class="f-res r-${r.id}${i < 2 ? ' is-big' : ''}" data-act="result" data-r="${r.id}">${I(IC[r.id], 22)}${r.label}</button>`).join('')}
        </div>
        <button class="btn btn-ghost btn-sm f-skip" type="button" data-act="skip">${I(IC.skip, 16)}Skip for now</button>
      </div>`;
    }

    function doneHTML(tf, prog) {
      const rs = prog.done;
      const talked = rs.filter((r) => r.result === 'talked' || r.result === 'yard_sign').length;
      const signs = rs.filter((r) => r.result === 'yard_sign').length;
      const sups = rs.filter((r) => r.support).map((r) => r.support);
      const avg = sups.length ? (sups.reduce((s, x) => s + x, 0) / sups.length).toFixed(1) : '–';
      return `<div class="f-done f-in">
        <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="var(--ok-soft)"/><path d="M20 33l8 8 16-17" fill="none" stroke="var(--ok)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <h3 style="margin:0">Your shift is done. Thank you, ${esc(firstName(user.name))}!</h3>
        <p class="f-note-muted">Every door you recorded is saved and already counts toward ${esc(tf.name)} on the turf map.</p>
        <div class="f-stats">
          <div class="f-stat"><b>${rs.length}</b><span>Doors knocked</span></div>
          <div class="f-stat"><b>${talked}</b><span>Conversations</span></div>
          <div class="f-stat"><b>${signs}</b><span>Yard signs requested</span></div>
          <div class="f-stat"><b>${avg}</b><span>Average support</span></div>
        </div>
        <button class="btn btn-primary" type="button" data-act="again">Start another shift here</button>
        <button class="btn" type="button" data-act="newturf">Pick a different turf</button>
        <a class="btn btn-ghost" href="#/field">Back to the turf map</a>
      </div>`;
    }

    function tonightHTML(idx) {
      const today = new Date().toISOString().slice(0, 10);
      const rs = idx.list.filter((r) => String(r.createdAt || '').slice(0, 10) === today).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const talked = rs.filter((r) => r.result === 'talked' || r.result === 'yard_sign').length;
      const signs = rs.filter((r) => r.result === 'yard_sign').length;
      return `<div class="card-head"><h3>Tonight’s results</h3><span class="spacer"></span><span class="small muted">${esc(shortName(t))}, all walkers</span></div>
        <div class="card-body stack" style="gap:12px">
          <div class="f-stats" style="grid-template-columns:repeat(3,minmax(0,1fr))">
            <div class="f-stat"><b>${rs.length}</b><span>Doors</span></div>
            <div class="f-stat"><b>${talked}</b><span>Talked</span></div>
            <div class="f-stat"><b>${signs}</b><span>Yard signs</span></div>
          </div>
          ${rs.length ? `<ul class="f-feed">${rs.slice(0, 6).map((r) => `<li>${U.avatar(r.walkerName || 'Walker', 26)}<div class="f-fw"><b>${esc(firstName(r.walkerName || 'A walker'))}</b> · ${esc(String(r.address || '').split(',')[0])}<br><span class="small">${esc(RESULT_LABEL[r.result] || r.result)}${r.support ? `, support ${r.support}` : ''}</span></div><span class="muted">${esc(fmtWhen(r.createdAt))}</span></li>`).join('')}</ul>`
            : '<p class="f-note-muted">No doors recorded today yet. Results show up here the moment a walker saves one.</p>'}
        </div>`;
    }

    function drawCvMap(tf, shiftNow, prog) {
      if (!cvMap || !L) return;
      if (cvLayer) cvLayer.remove();
      cvLayer = L.layerGroup().addTo(cvMap);
      L.polygon(tf.poly, { color: tf.color, weight: 2, fillColor: tf.color, fillOpacity: 0.08, dashArray: '6 5', interactive: false }).addTo(cvLayer);
      const hs = shiftNow.order.map((id) => m.hh[id]).filter(Boolean);
      if (hs.length > 1) L.polyline(hs.map((h) => [h.lat, h.lng]), { color: tf.color, weight: 5, opacity: 0.75, interactive: false }).addTo(cvLayer);
      const doneIds = new Set(prog.done.map((r) => r.voterId));
      const cur = prog.remaining[0];
      hs.forEach((h, i) => {
        const cls = h.id === cur ? ' is-cur' : doneIds.has(h.id) ? ' is-done' : '';
        L.marker([h.lat, h.lng], { keyboard: false, interactive: false, zIndexOffset: h.id === cur ? 1000 : 0, icon: L.divIcon({ className: 'f-stopicon' + cls, html: `<span>${i + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(cvLayer);
      });
      const ch = m.hh[cur];
      if (ch) {
        if (reduceMotion()) cvMap.setView([ch.lat, ch.lng], 17, { animate: false });
        else cvMap.flyTo([ch.lat, ch.lng], 17, { duration: 0.6 });
      } else if (hs.length) cvMap.fitBounds(L.latLngBounds(hs.map((h) => [h.lat, h.lng])), { padding: [24, 24] });
    }
    function ensureCvMap(tf, shiftNow, prog) {
      routeCard.hidden = false;
      if (cvMap) { drawCvMap(tf, shiftNow, prog); return; }
      loadLeaflet().then((Lx) => {
        if (!el.isConnected || cvMap) return;
        L = Lx;
        const node = el.querySelector('[data-cvmap]');
        cvMap = baseMap(L, node, { dragging: !L.Browser.mobile, tap: false });
        cvMap.fitBounds(L.latLngBounds(tf.poly), { animate: false });
        const n = node.querySelector('[data-mapnote]'); if (n) n.remove();
        const s = getShift(ctx, m);
        if (s) drawCvMap(m.byId[s.turfId], s, shiftProgress(s, resultsIndex()));
      }).catch(() => {
        const n = el.querySelector('[data-cvmap] [data-mapnote]');
        if (n) n.innerHTML = '<p class="small" style="margin:0">The route map didn’t load. Your doors are listed in order on the left.</p>';
      });
    }

    function paint(anim) {
      const idx = resultsIndex();
      tonight.innerHTML = tonightHTML(idx);
      shift = getShift(ctx, m);
      if (!shift) {
        routeCard.hidden = true;
        main.innerHTML = pickerHTML(idx);
        return;
      }
      const tf = m.byId[shift.turfId];
      const prog = shiftProgress(shift, idx);
      if (!prog.remaining.length) {
        main.innerHTML = headHTML(tf, prog) + statusHTML() + doneHTML(tf, prog);
        ensureCvMap(tf, shift, prog);
        return;
      }
      const h = m.hh[prog.remaining[0]];
      if (!h) { Store.set(shiftKey(ctx), Object.assign({}, shift, { order: shift.order.filter((id) => m.hh[id]) })); paint(); return; }
      const head = main.querySelector('[data-head]');
      if (anim && head && main.querySelector('[data-door]')) {
        // Update in place so the ring animates from where it was.
        const done = prog.total - prog.remaining.length;
        const ringEl = head.querySelector('.f-ring');
        const c = parseFloat(ringEl.style.getPropertyValue('--c'));
        const v = ringEl.querySelector('.f-ring-v');
        v.style.animation = 'none';
        v.setAttribute('stroke-dashoffset', (c * (1 - done / prog.total)).toFixed(2));
        ringEl.querySelector('text').textContent = Math.round(done / prog.total * 100) + '%';
        ringEl.setAttribute('aria-label', `${done} of ${prog.total} doors done`);
        head.querySelector('[data-headsub]').textContent = `Door ${done + 1} of ${prog.total} · ${prog.remaining.length} left`;
        const ub = head.querySelector('[data-act="undo"]');
        if (prog.done.length && !ub) head.insertAdjacentHTML('beforeend', `<button class="btn btn-sm f-undo-btn" type="button" data-act="undo" aria-label="Undo the last saved door">${I(IC.undo, 16)}Undo</button>`);
        if (!prog.done.length && ub) ub.remove();
        const st = main.querySelector('.f-status'); if (st) st.outerHTML = statusHTML();
        main.querySelector('[data-door]').outerHTML = doorHTML(h, tf, idx, prog, anim);
      } else {
        main.innerHTML = headHTML(tf, prog) + statusHTML() + doorHTML(h, tf, idx, prog, anim || 'is-in') + actionsHTML();
      }
      paintUndo();
      ensureCvMap(tf, shift, prog);
    }

    /* Bring the new door's address back into view after advancing, below the sticky top bar. */
    function revealDoor() {
      const head = main.querySelector('[data-head]');
      if (!head) return;
      const bar = document.querySelector('.topbar');
      const top = head.getBoundingClientRect().top - (bar ? bar.offsetHeight : 0) - 8;
      if (top < 0) window.scrollTo({ top: window.scrollY + top, behavior: reduceMotion() ? 'auto' : 'smooth' });
    }
    function paintUndo() {
      const bar = main.querySelector('[data-undobar]');
      if (!bar) return;
      bar.innerHTML = undoDoc ? `<div class="f-undo" role="status"><span>Saved: ${esc(RESULT_LABEL[undoDoc.result])} at ${esc(String(undoDoc.address).split(',')[0])}.</span><button class="btn btn-sm" type="button" data-act="undo">Undo</button></div>` : '';
    }

    function save(result) {
      if (busy) return;
      shift = getShift(ctx, m);
      if (!shift) return;
      const idx = resultsIndex();
      const prog = shiftProgress(shift, idx);
      const h = m.hh[prog.remaining[0]];
      if (!h) return;
      const tf = m.byId[shift.turfId];
      const noteEl = main.querySelector('[data-note]');
      const note = noteEl ? noteEl.value.trim() : '';
      const keepSupport = result === 'talked' || result === 'yard_sign' || result === 'refused';
      const meta = RESULTS.find((r) => r.id === result);
      busy = true;
      selfWrite = true;
      const doc = Store.add('walkResults', {
        title: `${meta.title} ${h.address}, ${tf.name}`,
        turfId: tf.id, turfName: tf.name, address: `${h.address}, ${h.city}`,
        result, support: keepSupport && draft.support ? draft.support : null, notes: note, doors: 1,
        voterId: h.id, shiftId: shift.id, walkerId, walkerName: user.name,
      });
      selfWrite = false;
      undoDoc = doc;
      draft = { support: null };
      try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* not supported */ }
      clearTimeout(undoTimer);
      undoTimer = setTimeout(() => { undoDoc = null; if (el.isConnected) paintUndo(); }, 9000);
      const card = main.querySelector('[data-door]');
      const btn = main.querySelector(`[data-r="${result}"]`);
      if (btn) btn.classList.add('is-hit');
      const next = () => {
        busy = false;
        const after = shiftProgress(shift, resultsIndex());
        if (!after.remaining.length) { paint(); ctx.toast(`Saved ${after.done.length} doors in ${tf.name}.`, 'ok'); return; }
        paint('is-in');
        const nb = main.querySelector('.f-res.is-hit'); if (nb) nb.classList.remove('is-hit');
        revealDoor();
      };
      if (card && !reduceMotion()) { card.classList.add('is-out'); setTimeout(next, 190); } else next();
    }

    function undo() {
      const idx = resultsIndex();
      shift = getShift(ctx, m);
      if (!shift) return;
      const mineInShift = idx.list.filter((r) => r.shiftId === shift.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const target = (undoDoc && mineInShift.find((r) => r.id === undoDoc.id)) || mineInShift[0];
      if (!target) return;
      selfWrite = true;
      Store.remove('walkResults', target.id);
      selfWrite = false;
      // Put the undone door back at the front of the remaining doors.
      const order = shift.order.filter((id) => id !== target.voterId);
      const doneIds = new Set(mineInShift.filter((r) => r.id !== target.id).map((r) => r.voterId));
      const firstLeft = order.findIndex((id) => !doneIds.has(id));
      order.splice(firstLeft < 0 ? order.length : firstLeft, 0, target.voterId);
      Store.set(shiftKey(ctx), Object.assign({}, shift, { order }));
      draft = { support: target.support || null, note: target.notes || '' };
      undoDoc = null; clearTimeout(undoTimer);
      const hadDone = !!main.querySelector('.f-done');
      if (hadDone) main.innerHTML = '';
      paint('is-back');
      revealDoor();
      ctx.toast(`Undone. ${String(target.address).split(',')[0]} is your next door again.`, 'info');
    }

    main.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'result') { save(a.dataset.r); return; }
      if (act === 'support') {
        const v = Number(a.dataset.v);
        draft.support = draft.support === v ? null : v;
        main.querySelectorAll('[data-act="support"]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === draft.support)));
        return;
      }
      if (act === 'undo') { undo(); return; }
      if (act === 'skip') {
        shift = getShift(ctx, m);
        const prog = shiftProgress(shift, resultsIndex());
        if (prog.remaining.length < 2) { ctx.toast('This is the last door on your list.', 'info'); return; }
        const id = prog.remaining[0];
        Store.set(shiftKey(ctx), Object.assign({}, shift, { order: shift.order.filter((x) => x !== id).concat(id) }));
        draft = { support: null };
        paint('is-in');
        return;
      }
      if (act === 'pick') {
        const tf = m.byId[a.dataset.turf];
        startShift(ctx, tf, freshOrder(tf, resultsIndex()));
        main.innerHTML = '';
        paint('is-in');
        return;
      }
      if (act === 'again') {
        const tf = m.byId[shift.turfId];
        startShift(ctx, tf, freshOrder(tf, resultsIndex()));
        main.innerHTML = '';
        paint('is-in');
        return;
      }
      if (act === 'newturf') { Store.set(shiftKey(ctx), null); main.innerHTML = ''; paint(); }
    });
    main.addEventListener('input', (e) => { if (e.target.matches('[data-note]')) draft.note = e.target.value; });

    listen(window, 'online', () => { const s = main.querySelector('.f-status'); if (s) s.outerHTML = statusHTML(); ctx.toast('You’re back online.', 'ok'); });
    listen(window, 'offline', () => { const s = main.querySelector('.f-status'); if (s) s.outerHTML = statusHTML(); });
    const off = Store.on('*', (d) => {
      if (!el.isConnected) { teardown(); return; }
      if (selfWrite || busy) return;
      if (d.name === 'walkResults' || d.type === 'reset' || d.type === 'external') { main.innerHTML = ''; paint(); }
      else if (d.name === 'turfAssignments') tonight.innerHTML = tonightHTML(resultsIndex());
    });
    live.offs.push(off);

    paint('is-in');
  }

  /* ---------------- register ---------------- */
  App.register({
    id: 'field',
    title: 'Field Organizer',
    group: 'Field & Governance',
    icon: ICON,
    blurb: 'Cut precinct turf and send walk lists to volunteers’ phones.',
    render(el, ctx) {
      teardown();
      injectStyle();
      el.classList.add('scr-field');
      const t = ctx.tenant;
      if (!t || !t.turfs || !t.turfs.length || !t.voters) {
        el.innerHTML = '<div class="page"><div class="card"><div class="card-body"><h2>No turf yet</h2><p class="muted">This county hasn’t drawn any turf. Turf appears here once the field chair sets it up.</p></div></div></div>';
        return;
      }
      if (ctx.sub === 'list') renderList(el, ctx);
      else if (ctx.sub === 'canvass') renderCanvass(el, ctx);
      else renderMap(el, Object.assign({}, ctx, { sub: '' }));
    },
  });
})();
